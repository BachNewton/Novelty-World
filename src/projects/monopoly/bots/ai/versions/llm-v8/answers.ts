import { auctionBidCap, isLegal, JAIL_FEE, tradePitch } from "../../../../engine";
import { buildingRefundAt, colorAt, developmentLevel, groupPositions, houseCostAt } from "../../../../development";
import { hasMonopoly, heldJailCard, mortgageValueAt, ownablePrice, unmortgageCostAt } from "../../../../logic";
import type { AiDecision, GameState, Intent, PropertyColor } from "../../../../types";
import { mortgageablePositions } from "../../../fallback";
import type { JsonSchema } from "../../model/adapter";
import { isRecord, readPositions, type AiOp, type DecisionSpec, type Resolved } from "../../spec";
import { COLOR_LABEL, COLORS, money, playerById, squareLabel, squareName } from "./format";
import { auctionCause, debtCause, jailCause } from "./causes";
import { acquisitionLines } from "./prompt";
import {
  counterQuestion,
  counterSchema,
  describeTerms,
  holdingsLines,
  largestRentLine,
  mortgageAlternative,
  negotiationLines,
  readCounter,
  readTrade,
  tradeFormat,
  tradeSchema,
} from "./trade-terms";

// The length limits are a backstop well above the asked-for length: a grammar
// limit cuts the text off mid-word rather than making the model write less, so
// brevity is asked for in words.
const NOTE_FIELDS = {
  privateNote: {
    type: "string",
    maxLength: 1500,
    description: "Your reasoning, at most three short sentences.",
  },
  publicNote: {
    type: "string",
    maxLength: 400,
    description:
      "One short sentence the whole table sees in the log. On a trade you propose or counter, it is your message to the other side.",
  },
  plan: {
    type: "string",
    maxLength: 400,
    description: "One short sentence to your future self about the next few turns, made of your choices.",
  },
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

/** An answer schema whose own fields come before the notes, for a quick
 *  decision whose plan is arithmetic: the model works the plan out in the
 *  fields, step by step, and only then explains it. */
function planFirstSchema(fields: Readonly<Record<string, JsonSchema>>): JsonSchema {
  return {
    type: "object",
    properties: {
      ...fields,
      privateNote: NOTE_FIELDS.privateNote,
      publicNote: NOTE_FIELDS.publicNote,
      plan: NOTE_FIELDS.plan,
    },
    required: [...Object.keys(fields), "privateNote", "publicNote", "plan"],
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

/** A sentence to follow another, with its space; nothing for no sentence. */
function prefixed(sentence: string | null): string {
  return sentence === null ? "" : ` ${sentence}`;
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
      ...acquisitionLines(state, seat, position),
      `Answer "buy" to buy it at ${money(price)}, or "auction" to put it up for auction (everyone may bid, you included).`,
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
    const cash = cashOf(state, seat);
    return [
      `${squareLabel(a.position)} (price ${money(ownablePrice(a.position) ?? 0)}) is up for auction: ${leader}.${prefixed(auctionCause(state, a.position))}`,
      ...acquisitionLines(state, seat, a.position),
      `You have ${money(cash)} in cash. Winning at a bid of B leaves you ${money(cash)} minus B; below $0 you would have to mortgage or sell to pay.`,
      `Rule of thumb: a lot is rarely worth much more than its printed price unless winning it completes a color set for you or stops a rival from completing one. Keep enough cash afterwards to pay a typical rent.`,
      `Answer "maxBid": the most you will pay for it. You'll bid for it in $10 steps up to that amount as others bid. Answer 0 to drop out now. Your publicNote is shown only after the auction closes.`,
    ].join("\n");
  },
  // The schema still caps the answer at what the seat could pay, so a bid can
  // never strand it; the question just doesn't offer that number as a target.
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

/** The color sets the seat has buildings on, with each lot's level. */
function builtSets(state: GameState, seat: string): { color: PropertyColor; lots: number[] }[] {
  const colors: PropertyColor[] = [];
  for (const pos of builtLots(state, seat)) {
    const color = colorAt(pos);
    if (color !== null && !colors.includes(color)) colors.push(color);
  }
  return colors.map((color) => ({ color, lots: [...groupPositions(color)] }));
}

function setLevels(state: GameState, lots: readonly number[]): number {
  return lots.reduce((sum, pos) => sum + developmentLevel(state, pos), 0);
}

/** How many more houses a set can take before every lot has a hotel. */
function buildRoom(state: GameState, lots: readonly number[]): number {
  return 5 * lots.length - setLevels(state, lots);
}

function levelLabel(level: number): string {
  if (level === 5) return "a hotel";
  return `${String(level)} house${level === 1 ? "" : "s"}`;
}

/** The levels a set ends at after selling `houses` of its buildings evenly:
 *  each sale comes off the most-built lot, so the set stays even. */
export function sellEvenly(state: GameState, lots: readonly number[], houses: number): Record<number, number> {
  const levels = new Map(lots.map((pos) => [pos, developmentLevel(state, pos)]));
  for (let i = 0; i < houses; i++) {
    let top = lots[0];
    for (const pos of lots) if ((levels.get(pos) ?? 0) > (levels.get(top) ?? 0)) top = pos;
    levels.set(top, Math.max(0, (levels.get(top) ?? 0) - 1));
  }
  return Object.fromEntries(lots.filter((pos) => levels.get(pos) !== developmentLevel(state, pos)).map((pos) => [pos, levels.get(pos) ?? 0]));
}

/** What a built set's lots would raise once its houses are gone: they can be
 *  mortgaged in the same plan, after the sales. Without it, a seat whose only
 *  spare lots sit in its built set read "Mortgages: none" and sold the houses
 *  alone, leaving the debt unpaid (Sonnet, game 46181f's turn 62 position). */
function afterSale(state: GameState, lots: readonly number[]): string {
  const open = lots.filter((pos) => !state.mortgaged[pos]);
  if (open.length === 0) return "Its lots are all mortgaged already.";
  const houses = setLevels(state, lots);
  const raises = open.map((pos) => `${squareName(pos)} +${money(mortgageValueAt(pos) ?? 0)}`).join(", ");
  return `Its lots can be mortgaged only once all its houses are sold: a plan that mortgages any of them must also sell all ${String(houses)} of its houses, for +${money((buildingRefundAt(lots[0]) ?? 0) * houses)}. Then mortgaging raises ${raises}.`;
}

// llm-v2 asked for each lot's end level and the model read it as "houses to
// sell", one per lot. Here the model answers in its own terms, how many houses
// to sell from each set and which lots to mortgage, with every option's cash
// listed, and the code works out the levels.
const settleDebt: DecisionSpec = {
  think: false,
  question: (state, seat) => {
    const debt = -cashOf(state, seat);
    const lines = [
      [debtCause(state, seat), `You are ${money(debt)} in debt. Raise at least ${money(debt)} now, in one plan. Your ways to raise cash:`].filter((s) => s !== null).join(" "),
    ];
    const mortgageable = mortgageablePositions(state, seat);
    if (mortgageable.length > 0) {
      lines.push(
        `Mortgages (a mortgaged lot collects no rent until you lift it, which costs its mortgage plus 10%):`,
        ...mortgageable.map((pos) => {
          const value = mortgageValueAt(pos) ?? 0;
          const lift = unmortgageCostAt(pos) ?? 0;
          return `  - ${squareLabel(pos)}: +${money(value)}. You keep the lot; lifting the mortgage later costs ${money(lift)}, so mortgaging loses you ${money(lift - value)} in all, plus its rent while it stays mortgaged.`;
        }),
      );
      // Without this total the model judged each option alone ("mortgaging
      // Reading yields only $100, which is insufficient") and sold houses
      // instead, never adding the mortgages together or to a few sales.
      const all = mortgageable.reduce((sum, pos) => sum + (mortgageValueAt(pos) ?? 0), 0);
      lines.push(
        all >= debt
          ? `  Mortgaging all of them raises ${money(all)}, enough on its own.`
          : `  Mortgaging all of them raises ${money(all)}, ${money(debt - all)} short of the debt; house sales can make up the rest.`,
      );
    } else {
      lines.push(`Mortgages: none before selling houses (no unbuilt, unmortgaged lots).`);
    }
    const sets = builtSets(state, seat);
    if (sets.length > 0) {
      lines.push(`House sales (a house sells back for half what it cost; a hotel counts as 5 houses, and selling one leaves 4):`);
      for (const { color, lots } of sets) {
        const refund = buildingRefundAt(lots[0]) ?? 0;
        const cost = houseCostAt(lots[0]) ?? 0;
        const total = setLevels(state, lots);
        const where = lots.map((pos) => `${squareName(pos)} ${levelLabel(developmentLevel(state, pos))}`).join(", ");
        lines.push(
          `  - ${COLOR_LABEL[color]} set (${where}): +${money(refund)} per house sold, up to ${String(total)} houses for +${money(refund * total)}. Each house cost ${money(cost)}, so each one sold loses ${money(cost - refund)} for good: building it again costs the full ${money(cost)}. ${afterSale(state, lots)}`,
        );
      }
      lines.push(`Answer "sellHouses": for each of your built sets, how many houses to sell from it (0 keeps them all); houses come off evenly.`);
    } else {
      lines.push(`You have no houses, so "sellHouses" is empty.`);
    }
    lines.push(
      `Answer "mortgage": the lots to mortgage. Mortgages and house sales add up: the plan must raise at least ${money(debt)} in total.`,
      `Answer in this order: "mortgage" first; then "stillOwed", what remains of the debt after those mortgages ($0 if they cover it); then "sellHouses" to cover what remains; then your notes.`,
    );
    return lines.join("\n");
  },
  // llm-v5 asked for the private note first. Gemma 4 12B's note then reached
  // for whichever single option covered the debt ("Selling 5 houses from the
  // Red set provides $375, which covers the debt") with the railroads left
  // unmortgaged; replayed with the mortgages asked first, then what they leave
  // owed, then the sales, every plan mortgaged first and sold only the rest.
  schema: (state, seat) =>
    planFirstSchema({
      mortgage: positionList(ownedUnmortgaged(state, seat)),
      stillOwed: { type: "integer", minimum: 0 },
      sellHouses: housesPerSet(builtSets(state, seat).map(({ color, lots }) => ({ color, max: setLevels(state, lots) }))),
    }),
  resolve: (state, seat, answer) => {
    const mortgage = readPositions(answer.mortgage);
    if (!mortgage) return { ok: false, reason: "mortgage must be a list of squares" };
    const sales = readHouseCounts(answer.sellHouses, "sellHouses", builtSets(state, seat), (lots) => setLevels(state, lots));
    if (!sales.ok) return sales;
    const build: Record<number, number> = {};
    for (const { lots, houses } of sales.counts) Object.assign(build, sellEvenly(state, lots, houses));
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
      [jailCause(state, seat), `You are in jail, on turn ${String(me.jailTurns)} of 3. Choose how to start your turn:`].filter((s) => s !== null).join(" "),
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

// The vote is asked alone, beside what each side holds; a counter's terms are
// a follow-up, asked only once "counter" is chosen (see trade-terms.ts).
const tradeVote: DecisionSpec = {
  think: true,
  question: (state, seat) => {
    const trade = state.turn.pendingTrade;
    if (!trade) throw new Error("no pending trade");
    const proposer = playerById(state, trade.proposerId).name;
    const history = negotiationLines(state);
    // The proposer's public note, the pitch the table sees in the trade
    // panel; never its private reasoning or plan.
    const pitch = tradePitch(state);
    return [
      `${proposer} proposes a trade:`,
      ...describeTerms(state, seat, trade),
      pitch ? `${proposer}'s message with this offer: "${pitch.text}"` : `${proposer} sent no message with this offer.`,
      largestRentLine(state, seat) ?? "No lot on the board charges a fixed rent yet.",
      `Negotiation so far this turn, oldest first:\n${history.join("\n") || "(this is the opening offer)"}`,
      holdingsLines(state, seat, trade.proposerId),
      mortgageAlternative(state, seat),
      `Answer "vote": "accept", "decline", or "counter". A counter turns their offer down and puts a different trade to ${proposer}: what you would hand over and what you want back, from what each side holds above. ${proposer} then votes on it. If you counter, you'll write its terms next.`,
      ...NEGOTIATE,
    ].join("\n");
  },
  schema: () => answerSchema({ vote: { type: "string", enum: ["accept", "decline", "counter"] } }),
  followUp: (state, seat, answer) => {
    const trade = state.turn.pendingTrade;
    if (!trade || answer.vote !== "counter") return null;
    const { privateNote, publicNote } = answer;
    if (typeof privateNote !== "string" || typeof publicNote !== "string") return null;
    return {
      key: "counter",
      question: counterQuestion(state, seat, trade.proposerId, trade, { privateNote, publicNote }),
      schema: counterSchema(state, seat, trade.proposerId),
    };
  },
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
        const counter = readCounter(state, seat, trade.proposerId, answer.counter);
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

/** The seat's complete color sets, which it may build on or sell from. */
function completeSets(state: GameState, seat: string): { color: PropertyColor; lots: number[] }[] {
  return COLORS.filter((color) => hasMonopoly(state, color, seat)).map((color) => ({
    color,
    lots: [...groupPositions(color)],
  }));
}

/** One complete set as the model sees it: each lot's buildings, what a house
 *  costs, and what building it up would cost. */
function setLine(state: GameState, color: PropertyColor, lots: readonly number[]): string {
  const cost = houseCostAt(lots[0]) ?? 0;
  const where = lots
    .map((pos) => `${squareName(pos)} ${levelLabel(developmentLevel(state, pos))}${state.mortgaged[pos] ? " (mortgaged)" : ""}`)
    .join(", ");
  const room = buildRoom(state, lots);
  return `  - ${COLOR_LABEL[color]} (${where}): ${money(cost)} per house, so building K houses costs ${money(cost)} x K; room for ${String(room)} more.`;
}

/** The levels a set ends at after adding `houses` evenly: each goes on the
 *  least-built lot, up to a hotel. */
export function buildEvenly(state: GameState, lots: readonly number[], houses: number): Record<number, number> {
  const levels = new Map(lots.map((pos) => [pos, developmentLevel(state, pos)]));
  for (let i = 0; i < houses; i++) {
    let low = lots[0];
    for (const pos of lots) if ((levels.get(pos) ?? 0) < (levels.get(low) ?? 0)) low = pos;
    levels.set(low, Math.min(5, (levels.get(low) ?? 0) + 1));
  }
  return Object.fromEntries(lots.filter((pos) => levels.get(pos) !== developmentLevel(state, pos)).map((pos) => [pos, levels.get(pos) ?? 0]));
}

// llm-v3 asked for a list of (set, houses) entries. The model often opened
// that list and closed it empty while its note said to sell, and once listed
// one set three times with a count per lot. One count per set, every set
// named, has the model write a number for each set, 0 included.

/** One house count per set, every set required, each up to its own limit. */
function housesPerSet(sets: readonly { color: PropertyColor; max: number }[]): JsonSchema {
  return {
    type: "object",
    properties: Object.fromEntries(sets.map(({ color, max }) => [color, { type: "integer", minimum: 0, maximum: max }])),
    required: sets.map(({ color }) => color),
    additionalProperties: false,
  };
}

type HouseCounts =
  | { ok: true; counts: { lots: readonly number[]; houses: number }[] }
  | { ok: false; reason: string };

/** The per-set counts in an answer, each checked against its set's room. */
function readHouseCounts(
  value: unknown,
  field: string,
  sets: readonly { color: PropertyColor; lots: readonly number[] }[],
  room: (lots: readonly number[]) => number,
): HouseCounts {
  if (!isRecord(value)) return { ok: false, reason: `${field} must give a number of houses per set` };
  const counts: { lots: readonly number[]; houses: number }[] = [];
  for (const [color, houses] of Object.entries(value)) {
    const set = sets.find((candidate) => candidate.color === color);
    if (!set) return { ok: false, reason: `${field} names ${color}, which isn't one of the seat's sets here` };
    if (typeof houses !== "number" || !Number.isInteger(houses) || houses < 0) {
      return { ok: false, reason: `${field} needs a whole number of houses for ${COLOR_LABEL[set.color]}` };
    }
    if (houses > room(set.lots)) {
      return { ok: false, reason: `${field} asks for ${String(houses)} on ${COLOR_LABEL[set.color]}, which has room for ${String(room(set.lots))}` };
    }
    if (houses > 0) counts.push({ lots: set.lots, houses });
  }
  return { ok: true, counts };
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
    const fullSets = completeSets(state, seat);
    const mortgaged = ownedMortgaged(state, seat);
    const lines = [
      me.inJail
        ? `It is the start of your turn, in jail, before you choose how to leave it.`
        : `It is the start of your turn, before you roll.`,
      `First you may manage your properties, then you may propose one trade. Both are optional; doing neither is often right. You'll then roll${me.inJail ? " (or choose how to leave jail)" : ""}.`,
      `Managing (one plan, applied all at once, sales and mortgages first):`,
      `- "buildHouses": for each complete color set, how many houses to add across it (0 for none); they go on evenly, and a lot's fifth is its hotel. A set with a mortgaged lot can't be built on until you lift that mortgage (you may lift it in the same plan).`,
      `- "sellHouses": for each complete color set, how many houses to sell back (0 for none); each sells for half what it cost, so the other half is lost for good. They come off evenly.`,
      `- "mortgage": lots to mortgage. "unmortgage": mortgaged lots to lift.`,
      fullSets.length > 0
        ? `Your complete color sets:\n${fullSets.map(({ color, lots }) => setLine(state, color, lots)).join("\n")}`
        : `You have no complete color set, so "buildHouses" and "sellHouses" are empty.`,
      `You have ${money(me.cash)}.`,
      mortgaged.length > 0
        ? `Your mortgaged lots:\n${mortgaged
            .map((pos) => `  - ${squareLabel(pos)}: lifting costs ${money(unmortgageCostAt(pos) ?? 0)}`)
            .join("\n")}`
        : `You have no mortgaged lots.`,
      `Trading: set "proposeTrade" true and write "trade" to propose one; with false, "trade" is ignored. Look for deals that complete a color set for you; the other side must want it too.`,
      tradeFormat(state, seat),
      `Your publicNote is shown to the table; if you propose a trade, it is your message to the other side: pitch it.`,
    ];
    return lines.join("\n");
  },
  schema: (state, seat) => {
    const sets = completeSets(state, seat);
    return answerSchema({
      buildHouses: housesPerSet(sets.map(({ color, lots }) => ({ color, max: buildRoom(state, lots) }))),
      sellHouses: housesPerSet(sets.map(({ color, lots }) => ({ color, max: setLevels(state, lots) }))),
      mortgage: positionList(ownedUnmortgaged(state, seat)),
      unmortgage: positionList(ownedMortgaged(state, seat)),
      proposeTrade: { type: "boolean" },
      trade: tradeSchema(state, seat),
    });
  },
  resolve: (state, seat, answer) => {
    const mortgage = readPositions(answer.mortgage);
    const unmortgage = readPositions(answer.unmortgage);
    if (!mortgage || !unmortgage) return { ok: false, reason: "mortgage and unmortgage must be lists" };
    const sets = completeSets(state, seat);
    const builds = readHouseCounts(answer.buildHouses, "buildHouses", sets, (lots) => buildRoom(state, lots));
    if (!builds.ok) return builds;
    const sales = readHouseCounts(answer.sellHouses, "sellHouses", sets, (lots) => setLevels(state, lots));
    if (!sales.ok) return sales;
    const build: Record<number, number> = {};
    for (const { lots, houses } of builds.counts) Object.assign(build, buildEvenly(state, lots, houses));
    for (const { lots, houses } of sales.counts) Object.assign(build, sellEvenly(state, lots, houses));
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
      const trade = readTrade(state, seat, answer.trade);
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
    // A turn start that does nothing puts nothing on the table: its note and
    // plan are still kept, but no public line says it is rolling.
    const read = resolved(answer, { ops });
    if (read.ok && ops.length === 0) read.resolution.publicNote = "";
    return read;
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
