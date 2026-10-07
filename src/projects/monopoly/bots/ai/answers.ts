import { auctionBidCap, isLegal, JAIL_FEE, projectTrade, tradeMortgageFees } from "../../engine";
import { buildingRefundAt, developmentLevel } from "../../development";
import { heldJailCard, mortgageValueAt, ownablePrice } from "../../logic";
import type { AiDecision, GameState, Intent } from "../../types";
import { mortgageablePositions } from "../fallback";
import type { JsonSchema } from "./model/adapter";
import { money, playerById, squareLabel } from "./prompt";

/** What one answer amounts to once read: the intents to submit (in order), and
 *  the seat's own bookkeeping. `roll` asks the route to run the mechanical roll
 *  straight after, for a jailed seat that chose to roll for doubles. */
export interface AiResolution {
  intents: Intent[];
  roll: boolean;
  auctionMax: number | null;
  publicNote: string;
  privateNote: string;
  plan: string;
}

export type Resolved = { ok: true; resolution: AiResolution } | { ok: false; reason: string };

/** One decision kind: what the model is asked, the shape its answer must take,
 *  and how that answer becomes intents. `think` gives the model room to reason
 *  before answering, for decisions worth the wait. `verify` checks the state
 *  after the intents apply, for a decision whose answer can be legal yet not
 *  finish the job. */
export interface DecisionSpec {
  think: boolean;
  question: (state: GameState, seat: string) => string;
  schema: (state: GameState, seat: string) => JsonSchema;
  resolve: (state: GameState, seat: string, answer: Record<string, unknown>) => Resolved;
  verify?: (after: GameState, seat: string) => string | null;
}

const NOTE_FIELDS = {
  privateNote: { type: "string", maxLength: 800 },
  publicNote: { type: "string", maxLength: 200 },
  plan: { type: "string", maxLength: 300 },
} as const;

/** An answer schema: the private note first, so the model reasons before it
 *  commits, then the decision's own fields, then the public note and the plan. */
function answerSchema(fields: Readonly<Record<string, JsonSchema>>): JsonSchema {
  return {
    type: "object",
    properties: {
      privateNote: NOTE_FIELDS.privateNote,
      ...fields,
      publicNote: NOTE_FIELDS.publicNote,
      plan: NOTE_FIELDS.plan,
    },
    required: ["privateNote", ...Object.keys(fields), "publicNote", "plan"],
    additionalProperties: false,
  };
}

/** A list of positions drawn from `allowed`, or an empty list when none are. */
function positionList(allowed: readonly number[]): JsonSchema {
  return allowed.length > 0
    ? { type: "array", items: { type: "integer", enum: allowed } }
    : { type: "array", maxItems: 0 };
}

function resolved(
  answer: Record<string, unknown>,
  fields: Pick<AiResolution, "intents"> & Partial<Pick<AiResolution, "roll" | "auctionMax">>,
): Resolved {
  const { privateNote, publicNote, plan } = answer;
  if (typeof privateNote !== "string" || typeof publicNote !== "string" || typeof plan !== "string") {
    return { ok: false, reason: "the answer is missing its notes or plan" };
  }
  return {
    ok: true,
    resolution: {
      intents: fields.intents,
      roll: fields.roll ?? false,
      auctionMax: fields.auctionMax ?? null,
      publicNote: publicNote.trim(),
      privateNote: privateNote.trim(),
      plan: plan.trim(),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readPositions(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const positions: number[] = [];
  for (const v of value) {
    if (typeof v !== "number" || !Number.isInteger(v)) return null;
    positions.push(v);
  }
  return positions;
}

function mortgageLines(state: GameState, seat: string): string {
  const lots = mortgageablePositions(state, seat);
  if (lots.length === 0) return "You have nothing you could mortgage.";
  return `Lots you could mortgage:\n${lots
    .map((pos) => `  - ${squareLabel(pos)}: mortgage pays ${money(mortgageValueAt(pos) ?? 0)}`)
    .join("\n")}`;
}

function cashOf(state: GameState, seat: string): number {
  return playerById(state, seat).cash;
}

const buy: DecisionSpec = {
  think: false,
  question: (state, seat) => {
    const position = state.turn.pendingBuy ?? -1;
    const price = ownablePrice(position) ?? 0;
    const cash = cashOf(state, seat);
    const lines = [
      `You landed on ${squareLabel(position)}, unowned, price ${money(price)}. You have ${money(cash)}.`,
      `Answer "buy" to buy it, or "auction" to put it up for auction (you may bid there too).`,
    ];
    if (cash < price) {
      lines.push(
        `You are ${money(price - cash)} short. To buy, list in "mortgage" the lots to mortgage first; they must raise enough.`,
        mortgageLines(state, seat),
      );
    } else {
      lines.push(`You can afford it, so leave "mortgage" empty.`);
    }
    return lines.join("\n");
  },
  schema: (state, seat) =>
    answerSchema({
      choice: { type: "string", enum: ["buy", "auction"] },
      mortgage: positionList(
        cashOf(state, seat) < (ownablePrice(state.turn.pendingBuy ?? -1) ?? 0)
          ? mortgageablePositions(state, seat)
          : [],
      ),
    }),
  resolve: (state, seat, answer) => {
    if (answer.choice === "auction") {
      return resolved(answer, { intents: [{ kind: "decline-buy", playerId: seat }] });
    }
    if (answer.choice !== "buy") return { ok: false, reason: "choice must be buy or auction" };
    const price = ownablePrice(state.turn.pendingBuy ?? -1) ?? 0;
    if (cashOf(state, seat) >= price) {
      return resolved(answer, { intents: [{ kind: "buy", playerId: seat }] });
    }
    const mortgage = readPositions(answer.mortgage);
    if (!mortgage || mortgage.length === 0) {
      return { ok: false, reason: `chose to buy while ${money(price - cashOf(state, seat))} short, mortgaging nothing` };
    }
    return resolved(answer, {
      intents: [
        { kind: "raise-cash", playerId: seat },
        {
          kind: "update-manage-staging",
          playerId: seat,
          staged: { build: {}, mortgage: Object.fromEntries(mortgage.map((pos) => [pos, true])) },
        },
        { kind: "buy", playerId: seat },
      ],
    });
  },
};

const auction: DecisionSpec = {
  think: false,
  question: (state, seat) => {
    const a = state.turn.auction;
    if (!a) throw new Error("no auction");
    const leader = a.leaderId === null ? "no bids yet" : `high bid ${money(a.highBid)} by ${playerById(state, a.leaderId).name}`;
    return [
      `${squareLabel(a.position)} (price ${money(ownablePrice(a.position) ?? 0)}) is up for auction: ${leader}.`,
      `You have ${money(cashOf(state, seat))} in cash and could pay at most ${money(auctionBidCap(state, seat))} (by mortgaging and selling if needed).`,
      `Answer "maxBid": the most you will pay for it. You'll bid for it in $10 steps up to that amount as others bid. Answer 0 to drop out now.`,
    ].join("\n");
  },
  schema: (state, seat) =>
    answerSchema({ maxBid: { type: "integer", minimum: 0, maximum: auctionBidCap(state, seat) } }),
  resolve: (_state, _seat, answer) => {
    const { maxBid } = answer;
    if (typeof maxBid !== "number" || !Number.isInteger(maxBid) || maxBid < 0) {
      return { ok: false, reason: "maxBid must be a whole number of dollars" };
    }
    return resolved(answer, { intents: [], auctionMax: maxBid });
  },
};

/** The seat's lots that have buildings on them. */
function builtLots(state: GameState, seat: string): number[] {
  return Object.entries(state.ownership)
    .filter(([pos, owner]) => owner === seat && developmentLevel(state, Number(pos)) > 0)
    .map(([pos]) => Number(pos));
}

function ownedUnmortgaged(state: GameState, seat: string): number[] {
  return Object.entries(state.ownership)
    .filter(([pos, owner]) => owner === seat && !state.mortgaged[Number(pos)])
    .map(([pos]) => Number(pos));
}

const settleDebt: DecisionSpec = {
  think: false,
  question: (state, seat) => {
    const debt = -cashOf(state, seat);
    const built = builtLots(state, seat);
    const lines = [
      `You are ${money(debt)} in debt. Raise at least ${money(debt)} now, in one plan: sell buildings and/or mortgage lots.`,
      `Buildings sell first, so you may mortgage a lot whose set you sell down to bare in the same plan.`,
      mortgageLines(state, seat),
    ];
    if (built.length > 0) {
      lines.push(
        `Your buildings (sets must stay even as you sell):\n${built
          .map((pos) => `  - ${squareLabel(pos)}: level ${String(developmentLevel(state, pos))} (5 is a hotel), each sale returns ${money(buildingRefundAt(pos) ?? 0)}`)
          .join("\n")}`,
        `In "sellBuildings", give each lot you sell down and the level it ends at (0 to 4).`,
      );
    } else {
      lines.push(`You have no buildings, so leave "sellBuildings" empty.`);
    }
    return lines.join("\n");
  },
  schema: (state, seat) => {
    const built = builtLots(state, seat);
    return answerSchema({
      mortgage: positionList(ownedUnmortgaged(state, seat)),
      sellBuildings:
        built.length > 0
          ? {
              type: "array",
              items: {
                type: "object",
                properties: {
                  position: { type: "integer", enum: built },
                  level: { type: "integer", minimum: 0, maximum: 4 },
                },
                required: ["position", "level"],
                additionalProperties: false,
              },
            }
          : { type: "array", maxItems: 0 },
    });
  },
  resolve: (_state, seat, answer) => {
    const mortgage = readPositions(answer.mortgage);
    if (!mortgage) return { ok: false, reason: "mortgage must be a list of squares" };
    const sells = Array.isArray(answer.sellBuildings) ? answer.sellBuildings : null;
    if (!sells) return { ok: false, reason: "sellBuildings must be a list" };
    const build: Record<number, number> = {};
    for (const sell of sells) {
      if (!isRecord(sell)) {
        return { ok: false, reason: "each sale needs a position and a level" };
      }
      const { position, level } = sell;
      if (typeof position !== "number" || typeof level !== "number") {
        return { ok: false, reason: "each sale needs a position and a level" };
      }
      build[position] = level;
    }
    return resolved(answer, {
      intents: [
        {
          kind: "manage",
          playerId: seat,
          build,
          mortgage: Object.fromEntries(mortgage.map((pos) => [pos, true])),
        },
      ],
    });
  },
  verify: (after, seat) => {
    const cash = cashOf(after, seat);
    return cash < 0 ? `the plan left the seat still ${money(-cash)} in debt` : null;
  },
};

type JailChoice = "pay" | "card" | "roll";

function jailChoices(state: GameState, seat: string): JailChoice[] {
  const choices: JailChoice[] = [];
  if (isLegal(state, { kind: "pay-to-leave-jail", playerId: seat })) choices.push("pay");
  if (heldJailCard(state, seat) !== null) choices.push("card");
  choices.push("roll");
  return choices;
}

const jail: DecisionSpec = {
  think: false,
  question: (state, seat) => {
    const me = playerById(state, seat);
    const lines = [
      `You are in jail, on turn ${String(me.jailTurns)} of 3. Choose how to start your turn:`,
      `- "roll": roll for doubles; doubles free you and move you, otherwise you stay${me.jailTurns >= 3 ? " (this is your last try: failing it costs $50 and frees you)" : ""}.`,
    ];
    const choices = jailChoices(state, seat);
    if (choices.includes("pay")) lines.push(`- "pay": pay ${money(JAIL_FEE)} and roll to move normally.`);
    if (choices.includes("card")) lines.push(`- "card": play your Get Out of Jail Free card and roll to move normally.`);
    lines.push(`Staying in jail still collects your rents, and keeps you off the board.`);
    return lines.join("\n");
  },
  schema: (state, seat) => answerSchema({ choice: { type: "string", enum: jailChoices(state, seat) } }),
  resolve: (_state, seat, answer) => {
    switch (answer.choice) {
      case "pay":
        return resolved(answer, { intents: [{ kind: "pay-to-leave-jail", playerId: seat }] });
      case "card":
        return resolved(answer, { intents: [{ kind: "use-jail-card", playerId: seat }] });
      case "roll":
        return resolved(answer, { intents: [], roll: true });
      default:
        return { ok: false, reason: "choice must be pay, card or roll" };
    }
  },
};

const tradeVote: DecisionSpec = {
  think: true,
  question: (state, seat) => {
    const trade = state.turn.pendingTrade;
    if (!trade) throw new Error("no pending trade");
    const name = (id: string): string => (id === seat ? "you" : playerById(state, id).name);
    const moves: string[] = [];
    for (const [pos, to] of Object.entries(trade.propertyTo)) {
      const from = state.ownership[Number(pos)];
      const mortgaged = state.mortgaged[Number(pos)] ? " (mortgaged)" : "";
      moves.push(`  - ${squareLabel(Number(pos))}${mortgaged}: ${name(from)} -> ${name(to)}`);
    }
    for (const source of ["chance", "communityChest"] as const) {
      const to = trade.gojfTo[source];
      if (to === undefined) continue;
      const from = state.jailFreeCards[source];
      moves.push(`  - a Get Out of Jail Free card: ${from === undefined ? "?" : name(from)} -> ${name(to)}`);
    }
    for (const [id, delta] of Object.entries(trade.cashDelta)) {
      if (delta !== 0) moves.push(`  - ${name(id)} ${delta > 0 ? "receives" : "pays"} ${money(Math.abs(delta))}`);
    }
    const fee = tradeMortgageFees(state, trade)[seat] ?? 0;
    const after = projectTrade(state, trade).cashById[seat] ?? cashOf(state, seat);
    const lines = [
      `${name(trade.proposerId)} proposes a trade:`,
      ...moves,
    ];
    if (fee > 0) lines.push(`You would owe the bank ${money(fee)} interest on the mortgaged lots you receive.`);
    lines.push(
      `Your cash would go from ${money(cashOf(state, seat))} to ${money(after)}.`,
      `Answer "accept" or "decline". Everyone named must accept for it to happen.`,
    );
    return lines.join("\n");
  },
  schema: () => answerSchema({ vote: { type: "string", enum: ["accept", "decline"] } }),
  resolve: (state, seat, answer) => {
    const trade = state.turn.pendingTrade;
    if (!trade) return { ok: false, reason: "no pending trade" };
    if (answer.vote === "accept") {
      return resolved(answer, { intents: [{ kind: "accept-trade", playerId: seat, tradeId: trade.id }] });
    }
    if (answer.vote === "decline") {
      return resolved(answer, { intents: [{ kind: "decline-trade", playerId: seat, tradeId: trade.id }] });
    }
    return { ok: false, reason: "vote must be accept or decline" };
  },
};

/** The decisions an AI seat can make so far. A decision missing here fails
 *  loudly when the seat reaches it. */
export const DECISION_SPECS: Readonly<Partial<Record<AiDecision, DecisionSpec>>> = {
  buy,
  auction,
  "settle-debt": settleDebt,
  jail,
  "trade-vote": tradeVote,
};
