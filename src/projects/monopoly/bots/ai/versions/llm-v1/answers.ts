import { auctionBidCap, isLegal, JAIL_FEE } from "../../../../engine";
import { buildingRefundAt, colorAt, developmentLevel, houseCostAt } from "../../../../development";
import { hasMonopoly, heldJailCard, mortgageValueAt, ownablePrice, unmortgageCostAt } from "../../../../logic";
import type { AiDecision, GameState, Intent } from "../../../../types";
import { mortgageablePositions } from "../../../fallback";
import type { JsonSchema } from "../../model/adapter";
import { isRecord, readPositions, type AiOp, type DecisionSpec, type Resolved } from "../../spec";
import { money, playerById, squareLabel } from "./prompt";
import {
  describeTerms,
  negotiationLines,
  readTrade,
  recentOfferLines,
  tradeFormat,
  tradeSchema,
} from "./trade-terms";

const NOTE_FIELDS = {
  privateNote: { type: "string", maxLength: 800 },
  publicNote: {
    type: "string",
    maxLength: 200,
    description:
      "One sentence the whole table sees in the log. On a trade you propose or counter, it is your message to the other side.",
  },
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
  fields: { intents?: Intent[]; ops?: AiOp[]; auctionMax?: number },
): Resolved {
  const { privateNote, publicNote, plan } = answer;
  if (typeof privateNote !== "string" || typeof publicNote !== "string" || typeof plan !== "string") {
    return { ok: false, reason: "the answer is missing its notes or plan" };
  }
  return {
    ok: true,
    resolution: {
      ops: fields.ops ?? (fields.intents ?? []).map((intent) => ({ kind: "intent", intent })),
      auctionMax: fields.auctionMax ?? null,
      publicNote: publicNote.trim(),
      privateNote: privateNote.trim(),
      plan: plan.trim(),
    },
  };
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
        return resolved(answer, { ops: [{ kind: "step" }] });
      default:
        return { ok: false, reason: "choice must be pay, card or roll" };
    }
  },
};

const NEGOTIATE = [
  `Negotiate toward a deal both sides can live with. If you counter, move toward their last offer rather than repeating your own; if the gap can't close, decline and end it.`,
  `Your publicNote is your message to the other side: say what you want and why.`,
];

const tradeVote: DecisionSpec = {
  think: true,
  question: (state, seat) => {
    const trade = state.turn.pendingTrade;
    if (!trade) throw new Error("no pending trade");
    const proposer = trade.proposerId === seat ? "You" : playerById(state, trade.proposerId).name;
    const history = negotiationLines(state);
    return [
      `${proposer} proposes a trade:`,
      ...describeTerms(state, seat, trade),
      `Negotiation so far this turn, oldest first:\n${history.join("\n") || "(this is the opening offer)"}`,
      `Answer "accept", "decline", or "counter". To counter, put in "counter" the full trade you would accept instead; it replaces theirs, and they then vote on it. Leave "counter" empty otherwise.`,
      tradeFormat(state, seat),
      ...NEGOTIATE,
    ].join("\n");
  },
  schema: (state) =>
    answerSchema({
      vote: { type: "string", enum: ["accept", "decline", "counter"] },
      counter: tradeSchema(state),
    }),
  resolve: (state, seat, answer) => {
    const trade = state.turn.pendingTrade;
    if (!trade) return { ok: false, reason: "no pending trade" };
    const tradeId = trade.id;
    switch (answer.vote) {
      case "accept":
        return resolved(answer, { intents: [{ kind: "accept-trade", playerId: seat, tradeId }] });
      case "decline":
        return resolved(answer, { intents: [{ kind: "decline-trade", playerId: seat, tradeId }] });
      case "counter": {
        const counter = readTrade(answer.counter);
        if (!counter.ok) return counter;
        return resolved(answer, {
          intents: [
            { kind: "counter-trade", playerId: seat, tradeId },
            { kind: "update-trade-draft", playerId: seat, terms: counter.terms },
            { kind: "propose-trade", playerId: seat },
          ],
        });
      }
      default:
        return { ok: false, reason: "vote must be accept, decline or counter" };
    }
  },
};

/** The lots in the seat's complete color sets, which it may build on or sell. */
function setLots(state: GameState, seat: string): number[] {
  return Object.entries(state.ownership)
    .filter(([pos, owner]) => {
      const color = colorAt(Number(pos));
      return owner === seat && color !== null && hasMonopoly(state, color, seat);
    })
    .map(([pos]) => Number(pos))
    .sort((a, b) => a - b);
}

function ownedMortgaged(state: GameState, seat: string): number[] {
  return Object.entries(state.ownership)
    .filter(([pos, owner]) => owner === seat && state.mortgaged[Number(pos)])
    .map(([pos]) => Number(pos));
}

const turnStart: DecisionSpec = {
  think: true,
  question: (state, seat) => {
    const me = playerById(state, seat);
    const sets = setLots(state, seat);
    const mortgaged = ownedMortgaged(state, seat);
    const lines = [
      me.inJail
        ? `It is the start of your turn, in jail, before you choose how to leave it.`
        : `It is the start of your turn, before you roll.`,
      `First you may manage your properties, then you may propose one trade. Both are optional; doing neither is often right. You'll then roll${me.inJail ? " (or choose how to leave jail)" : ""}.`,
      `Managing (one plan, applied all at once, sales and mortgages first):`,
      `- "build": each lot in your complete color sets and the level it should end at (0-4 houses, 5 a hotel). Sets must stay even, can't have a mortgaged lot, and a level below today's sells buildings.`,
      `- "mortgage": lots to mortgage. "unmortgage": mortgaged lots to lift.`,
      sets.length > 0
        ? `Your complete color sets:\n${sets
            .map((pos) => `  - ${squareLabel(pos)}: level ${String(developmentLevel(state, pos))}, each house ${money(houseCostAt(pos) ?? 0)}`)
            .join("\n")}`
        : `You have no complete color set, so leave "build" empty.`,
      mortgaged.length > 0
        ? `Your mortgaged lots:\n${mortgaged
            .map((pos) => `  - ${squareLabel(pos)}: lifting costs ${money(unmortgageCostAt(pos) ?? 0)}`)
            .join("\n")}`
        : `You have no mortgaged lots.`,
      `Trading: set "proposeTrade" true and fill "trade" to propose one; otherwise false, with "trade" empty. Look for deals that complete a color set for you; the other side must want it too.`,
      tradeFormat(state, seat),
      `Recent trade offers in this game, oldest first:\n${recentOfferLines(state, 8).join("\n") || "(none yet)"}`,
      `Your publicNote is shown to the table; if you propose a trade, it is your message to the other side: pitch it.`,
    ];
    return lines.join("\n");
  },
  schema: (state, seat) => {
    const sets = setLots(state, seat);
    return answerSchema({
      build: sets.length > 0
        ? {
            type: "array",
            items: {
              type: "object",
              properties: {
                position: { type: "integer", enum: sets },
                level: { type: "integer", minimum: 0, maximum: 5 },
              },
              required: ["position", "level"],
              additionalProperties: false,
            },
          }
        : { type: "array", maxItems: 0 },
      mortgage: positionList(ownedUnmortgaged(state, seat)),
      unmortgage: positionList(ownedMortgaged(state, seat)),
      proposeTrade: { type: "boolean" },
      trade: tradeSchema(state),
    });
  },
  resolve: (state, seat, answer) => {
    const mortgage = readPositions(answer.mortgage);
    const unmortgage = readPositions(answer.unmortgage);
    if (!mortgage || !unmortgage || !Array.isArray(answer.build)) {
      return { ok: false, reason: "build, mortgage and unmortgage must be lists" };
    }
    const build: Record<number, number> = {};
    for (const entry of answer.build) {
      if (!isRecord(entry) || typeof entry.position !== "number" || typeof entry.level !== "number") {
        return { ok: false, reason: "each build entry needs a position and a level" };
      }
      if (entry.level !== developmentLevel(state, entry.position)) build[entry.position] = entry.level;
    }
    const mortgageFlags: Record<number, boolean> = {};
    for (const pos of mortgage) if (!state.mortgaged[pos]) mortgageFlags[pos] = true;
    for (const pos of unmortgage) if (state.mortgaged[pos]) mortgageFlags[pos] = false;

    const ops: AiOp[] = [];
    const intent = (i: Intent): AiOp => ({ kind: "intent", intent: i });
    if (Object.keys(build).length > 0 || Object.keys(mortgageFlags).length > 0) {
      ops.push(
        intent({ kind: "set-queue", playerId: seat, queue: "manage", armed: true }),
        { kind: "step" },
        intent({ kind: "manage", playerId: seat, build, mortgage: mortgageFlags }),
      );
    }
    if (answer.proposeTrade === true) {
      const trade = readTrade(answer.trade);
      if (!trade.ok) return trade;
      ops.push(
        intent({ kind: "set-queue", playerId: seat, queue: "trade", armed: true }),
        { kind: "step" },
        intent({ kind: "update-trade-draft", playerId: seat, terms: trade.terms }),
        intent({ kind: "propose-trade", playerId: seat }),
      );
    } else if (answer.proposeTrade !== false) {
      return { ok: false, reason: "proposeTrade must be true or false" };
    }
    return resolved(answer, { ops });
  },
};

/** The decisions an AI seat can make so far. A decision missing here fails
 *  loudly when the seat reaches it. */
export const DECISION_SPECS: Readonly<Partial<Record<AiDecision, DecisionSpec>>> = {
  "turn-start": turnStart,
  buy,
  auction,
  "settle-debt": settleDebt,
  jail,
  "trade-vote": tradeVote,
};
