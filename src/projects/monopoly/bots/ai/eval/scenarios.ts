import { mortgageValueAt } from "../../../logic";
import type { GameState } from "../../../types";
import {
  AI,
  atTurn,
  auctioning,
  built,
  FOURTH,
  inDebt,
  jailed,
  landed,
  logged,
  mortgaging,
  offered,
  OTHER,
  owning,
  planned,
  RIVAL,
  said,
  SQ,
  table,
  turnStart,
  turnedDown,
  withCash,
  withPlayer,
} from "./board";
import {
  after,
  cashAfter,
  cashIn,
  claimsMovement,
  describeTerms,
  describeTurnStart,
  did,
  gives,
  housesAdded,
  nameOf,
  pitchCreditsMissingSet,
  proposedTerms,
  takes,
  termsContradictMessage,
  type Outcome,
  type Scenario,
} from "./scenario";

// The scenario suite: hand-made positions, grouped by phase of the game. Read
// scenario.ts first: an `error` scenario names an objective mistake and is
// gated; a `judgment` scenario only records what the seat chose. Error
// scenarios come in families (the original and disguised variants) so a fix
// that only learned one position shows up. Every real error found in a game or
// slice should become a scenario here, so the suite only grows.

const ORANGES = [SQ.stJames, SQ.tennessee, SQ.newYork];
const REDS = [SQ.kentucky, SQ.indiana, SQ.illinois];
const DARK_BLUES = [SQ.park, SQ.boardwalk];
const LIGHT_BLUES = [SQ.oriental, SQ.vermont, SQ.connecticut];

const hotels = (positions: readonly number[]): Record<number, number> =>
  Object.fromEntries(positions.map((pos) => [pos, 5]));

/** A late board: one rival with hotels on the oranges, another on the reds. */
function dangerousBoard(state: GameState): GameState {
  return built(owning(state, { [RIVAL]: ORANGES, [OTHER]: REDS }), { ...hotels(ORANGES), ...hotels(REDS) });
}

// --- Choice labels ----------------------------------------------------------

const buyChoice = (o: Outcome): string => (did(o, "buy") ? "buy" : did(o, "decline-buy") ? "auction" : "neither");

const maxChoice = (o: Outcome): string => {
  const max = o.resolution?.auctionMax;
  return max === null || max === undefined ? "no maximum" : `max $${String(max)}`;
};

const voteChoice = (o: Outcome): string => {
  if (did(o, "counter-trade")) return `counter: ${describeTerms(o)}`;
  if (did(o, "accept-trade")) return "accept";
  if (did(o, "decline-trade")) return "decline";
  return "no vote";
};

const jailChoice = (o: Outcome): string =>
  did(o, "use-jail-card") ? "card" : did(o, "pay-to-leave-jail") ? "pay" : "roll";

function debtChoice(o: Outcome): string {
  const state = after(o);
  if (!state) return "nothing";
  const mine = Object.entries(o.asked.ownership).filter(([, owner]) => owner === o.seat).map(([pos]) => Number(pos));
  const mortgaged = mine.filter((pos) => !o.asked.mortgaged[pos] && state.mortgaged[pos]).map(nameOf);
  const sold = -housesAdded(o, mine);
  const raised = cashAfter(o) - (o.asked.players.find((p) => p.id === o.seat)?.cash ?? 0);
  return [
    mortgaged.length > 0 ? `mortgages ${mortgaged.join(" + ")}` : null,
    sold > 0 ? `sells ${String(sold)} house(s)` : null,
    `raises $${String(raised)}`,
  ]
    .filter((p): p is string => p !== null)
    .join(", ");
}

// --- Error families -----------------------------------------------------------

/** A buy that completes the seat's own set with cash to spare. Sending it to
 *  auction instead is objective: every rival can then bid for the lot that
 *  finishes the seat's monopoly, and the seat can at best pay the same. */
function completesSet(id: string, phase: Scenario["phase"], turn: number, owned: readonly number[], lot: number, cash: number): Scenario {
  return {
    id,
    kind: "error",
    phase,
    decision: "buy",
    tests: `Owns ${owned.map(nameOf).join(" and ")}, lands on ${nameOf(lot)} with $${String(cash)}: the lot completes its set.`,
    build: (s) => landed(withCash(owning(atTurn(table(s), turn), { [AI]: owned }), { [AI]: cash }), lot),
    choose: buyChoice,
    error: (o) => (did(o, "buy") ? null : "sent the lot that completes its own set to auction"),
  };
}

/** A lowball offer for a lot. Selling it for less than its mortgage value is
 *  objective: mortgaging it would raise more and keep the lot. */
function belowMortgage(id: string, phase: Scenario["phase"], turn: number, lot: number, buyer: string, price: number, cash: number): Scenario {
  const floor = mortgageValueAt(lot) ?? 0;
  const soldBelow = (o: Outcome): boolean =>
    (did(o, "accept-trade") && price < floor) || (did(o, "counter-trade") && gives(o, lot) && cashIn(o) < floor);
  return {
    id,
    kind: "error",
    phase,
    decision: "trade-vote",
    tests: `Offered $${String(price)} for its lone ${nameOf(lot)}, whose mortgage pays $${String(floor)}.`,
    build: (s) =>
      offered(withCash(owning(atTurn(table(s), turn), { [AI]: [lot] }), { [AI]: cash }), buyer, {
        propertyTo: { [lot]: buyer },
        cashDelta: { [AI]: price, [buyer]: -price },
      }),
    choose: voteChoice,
    error: (o) => (soldBelow(o) ? `sold ${nameOf(lot)} for under its $${String(floor)} mortgage value` : null),
  };
}

/** A short seat holding a lone mortgaged lot, offered a little for it. Whatever
 *  it votes, a counter that gives the lot away must bring cash in: terms whose
 *  cash runs the other way are incoherent (game 0a0e5y). */
function counterDirection(id: string, turn: number, lot: number, buyer: string, price: number, cash: number): Scenario {
  return {
    id,
    kind: "error",
    phase: "mid",
    decision: "trade-vote",
    tests: `Short at $${String(cash)} with a lone mortgaged ${nameOf(lot)}; offered $${String(price)} for it. A counter giving it away must bring cash in.`,
    build: (s) =>
      offered(mortgaging(withCash(owning(atTurn(table(s), turn), { [AI]: [lot] }), { [AI]: cash }), [lot]), buyer, {
        propertyTo: { [lot]: buyer },
        cashDelta: { [AI]: price, [buyer]: -price },
      }),
    choose: voteChoice,
    error: (o) => (did(o, "counter-trade") && gives(o, lot) && cashIn(o) <= 0 ? `countered giving ${nameOf(lot)} away and ${cashIn(o) < 0 ? "paying" : "getting nothing"}` : null),
  };
}

/** A lowball offer for a lot, from a player who holds little or nothing the
 *  seat could want, while the lots it might want sit with the bank or a third
 *  player. llm-v4 countered asking Kyle for St. James Place, which nobody
 *  owned, and the answer could only be written as giving Kentucky away for
 *  nothing. Whatever it votes, a counter that hands the lot over with no lot
 *  back must bring in at least its mortgage value; anything less is the
 *  below-mortgage sale, or a giveaway. */
function counterHoldings(
  id: string,
  turn: number,
  owned: Readonly<Record<string, readonly number[]>>,
  lot: number,
  buyer: string,
  price: number,
  cash: number,
): Scenario {
  const floor = mortgageValueAt(lot) ?? 0;
  const lotBack = (o: Outcome): boolean => Object.values(proposedTerms(o)?.propertyTo ?? {}).some((to) => to === o.seat);
  return {
    id,
    kind: "error",
    phase: "late",
    decision: "trade-vote",
    tests: `Offered $${String(price)} for its ${nameOf(lot)} (mortgage $${String(floor)}) by a player holding ${
      (owned[buyer] ?? []).map(nameOf).join(", ") || "no lots"
    }; the lots it might want are the bank's or a third player's.`,
    build: (s) =>
      offered(withCash(owning(atTurn(table(s), turn), owned), { [AI]: cash }), buyer, {
        propertyTo: { [lot]: buyer },
        cashDelta: { [AI]: price, [buyer]: -price },
      }),
    choose: voteChoice,
    error: (o) => {
      if (did(o, "accept-trade") && price < floor) return `sold ${nameOf(lot)} for under its $${String(floor)} mortgage value`;
      if (did(o, "counter-trade") && gives(o, lot) && !lotBack(o) && cashIn(o) < floor) {
        return `countered handing ${nameOf(lot)} over for $${String(Math.max(0, cashIn(o)))} and no lot back`;
      }
      return null;
    },
  };
}

/** A rival holding two of a set offers a fair-looking price for the seat's
 *  third. Whether to sell, counter or decline is a judgment; this family exists
 *  because counters are likely here and the rival holds lots the terms could
 *  name, which is where Gemma 4 12B's counters went out contradicting their
 *  message ("I'd like $600 for New York" written as New York for the rival's
 *  two oranges and $0). Its only error is that contradiction, which every
 *  scenario checks; here it is gated. */
function counterMessage(id: string, turn: number, rivalLots: readonly number[], lot: number, buyer: string, price: number, cash: number): Scenario {
  return {
    id,
    kind: "error",
    phase: "mid",
    decision: "trade-vote",
    tests: `${rivalLots.map(nameOf).join(" and ")} with a rival who offers $${String(price)} for the seat's ${nameOf(lot)}, completing the set. A counter's terms must be the ones its message states.`,
    build: (s) =>
      offered(withCash(owning(atTurn(table(s), turn), { [buyer]: rivalLots, [AI]: [lot] }), { [AI]: cash }), buyer, {
        propertyTo: { [lot]: buyer },
        cashDelta: { [AI]: price, [buyer]: -price },
      }),
    choose: voteChoice,
    error: termsContradictMessage,
  };
}

/** Owns two of a set, the third with a cash-poor player. Whether to propose is
 *  a judgment; a proposal that takes the lot AND asks to be paid has its cash
 *  running backwards, which is an error. */
function proposeDirection(id: string, turn: number, owned: readonly number[], holder: string, lot: number, cash: number): Scenario {
  return {
    id,
    kind: "error",
    phase: "mid",
    decision: "turn-start",
    tests: `Owns ${owned.map(nameOf).join(" and ")} with $${String(cash)}; ${nameOf(lot)} sits with a cash-poor player. If it proposes taking the lot, its cash must go out.`,
    build: (s) =>
      turnStart(withCash(owning(atTurn(table(s), turn), { [AI]: owned, [holder]: [lot, SQ.reading] }), { [AI]: cash, [holder]: 200 })),
    choose: describeTurnStart,
    error: (o) => (takes(o, lot) && cashIn(o) > 0 ? `proposed taking ${nameOf(lot)} and being paid $${String(cashIn(o))}` : null),
  };
}

/** In debt, with houses on one set and spare unbuilt lots whose mortgages cover
 *  the debt. Selling houses (half their cost, gone for good) when a mortgage
 *  (10% to lift) would do is objective. */
function keepsHouses(id: string, turn: number, set: readonly number[], level: number, spare: readonly number[], debt: number): Scenario {
  return {
    id,
    kind: "error",
    phase: "late",
    decision: "settle-debt",
    tests: `$${String(debt)} short, ${String(level)} house(s) on each of ${set.map(nameOf).join(", ")}, and ${spare.map(nameOf).join(" + ")} to mortgage, which covers it.`,
    build: (s) =>
      inDebt(built(owning(atTurn(table(s), turn), { [AI]: [...set, ...spare] }), Object.fromEntries(set.map((p) => [p, level]))), -debt),
    choose: debtChoice,
    error: (o) => {
      const sold = -housesAdded(o, set);
      return sold > 0 ? `sold ${String(sold)} house(s) when mortgaging spare lots covered the debt` : null;
    },
  };
}

/** In debt beyond what the spare lots' mortgages raise, so houses must be sold
 *  too. llm-v3 wrote "selling three houses" in its note and an empty sale list
 *  in its answer; a plan that sells nothing leaves the debt unpaid (unusable).
 *  Selling a house while a spare lot stays unmortgaged is objective, for the
 *  same reason as `keepsHouses`. */
function mustSellHouses(id: string, turn: number, set: readonly number[], level: number, spare: readonly number[], debt: number): Scenario {
  return {
    id,
    kind: "error",
    phase: "late",
    decision: "settle-debt",
    tests: `$${String(debt)} short, ${String(level)} house(s) on each of ${set.map(nameOf).join(", ")}, and ${spare.map(nameOf).join(" + ")} to mortgage, which falls short: it must sell houses as well.`,
    build: (s) =>
      inDebt(built(owning(atTurn(table(s), turn), { [AI]: [...set, ...spare] }), Object.fromEntries(set.map((p) => [p, level]))), -debt),
    choose: debtChoice,
    error: (o) => {
      const state = after(o);
      const kept = spare.filter((pos) => !state?.mortgaged[pos]);
      return -housesAdded(o, set) > 0 && kept.length > 0 ? `sold houses while ${kept.map(nameOf).join(" + ")} stayed unmortgaged` : null;
    },
  };
}

/** A trade proposal that sets up a pitch about the other side's position: the
 *  seat owns two of a set, the third with a cash-poor player. What it offers
 *  is a judgment; a pitch crediting that player with a full set or building
 *  they don't have is an error (game 5x1c6j: "$620 for Tennessee... funds your
 *  builds elsewhere", to a player with no full set). The contrast variant gives
 *  the holder a full set, so the same pitch is true and must pass. */
function proposePitch(
  id: string,
  turn: number,
  lots: Readonly<Record<string, readonly number[]>>,
  cash: Readonly<Record<string, number>>,
  history: (state: GameState) => GameState = (state) => state,
): Scenario {
  const [mine, holder] = [lots[AI] ?? [], Object.entries(lots).find(([seat]) => seat !== AI)?.[1] ?? []];
  return {
    id,
    kind: "error",
    phase: "mid",
    decision: "turn-start",
    tests: `Owns ${mine.map(nameOf).join(", ")} with $${String(cash[AI] ?? 0)}; the rest of its set sits with a cash-poor player holding ${holder.map(nameOf).join(", ")}. A pitch must not credit that player with sets or building they don't have.`,
    build: (s) => turnStart(history(withCash(owning(atTurn(table(s), turn), lots), cash))),
    choose: describeTurnStart,
    error: pitchCreditsMissingSet,
  };
}

/** The 5x1c6j table at turn 40, with the seat's earlier offer for Tennessee
 *  declined: the seat (Frank there) holds St. James, New York and a railroad;
 *  Sam (Dev) holds Tennessee among five lots and two railroads, no full set. */
const PITCH_ORANGE_LOTS = {
  [AI]: [SQ.stJames, SQ.newYork, SQ.bAndO],
  [RIVAL]: [SQ.baltic, SQ.tennessee, SQ.illinois, SQ.atlantic, SQ.ventnor, SQ.pennRR, SQ.shortLine],
  [OTHER]: [...LIGHT_BLUES, SQ.stCharles, SQ.virginia, SQ.kentucky, SQ.electric],
  [FOURTH]: [SQ.mediterranean, SQ.marvin, SQ.pacific, SQ.northCarolina, SQ.pennsylvaniaAve],
};

function pitchOrangeHistory(state: GameState): GameState {
  const offer = { propertyTo: { [SQ.tennessee]: AI }, cashDelta: { [AI]: -430, [RIVAL]: 430 } };
  return built(
    logged(
      state,
      [
        said(AI, "Sam, $430 for Tennessee is over double its price, easy cash for a lot you can't build on alone."),
        turnedDown(state, AI, RIVAL, offer, false),
      ],
      36,
    ),
    { [SQ.pacific]: 1 },
  );
}

/** A plan or note that claims control over where the seat lands, on a board
 *  that tempts it: a rival's built set the seat must pass. Movement is the
 *  dice (game 46181f: "avoid Väinö's reds" entered the seat's plan and was
 *  repeated in 12 of its next 13). Whatever the seat decides, a note or plan
 *  telling it to avoid, stay off or dodge a board place is the error. */
function movementScenario(id: string, phase: Scenario["phase"], decision: Scenario["decision"], tests: string, build: (s: string) => GameState): Scenario {
  return {
    id,
    kind: "error",
    phase,
    decision,
    tests,
    build,
    choose: decision === "settle-debt" ? debtChoice : describeTurnStart,
    error: claimsMovement,
  };
}

/** The holder of the third lot offers cash and a railroad for the seat's
 *  pair. Selling a stuck pair for enough is a judgment (game 46181f: the seat
 *  took $640 and Reading for both reds, the rival built them and won, and a
 *  human flagged it). Records the vote and a counter's terms. */
function sellPairToBlocker(
  id: string,
  turn: number,
  lots: Readonly<Record<string, readonly number[]>>,
  cash: Readonly<Record<string, number>>,
  offer: { propertyTo: Readonly<Record<number, string>>; cashDelta: Readonly<Record<string, number>> },
  negotiation: (state: GameState) => GameState,
): Scenario {
  const pair = Object.entries(offer.propertyTo).filter(([, to]) => to === RIVAL).map(([pos]) => nameOf(Number(pos)));
  return {
    id,
    kind: "judgment",
    phase: "mid",
    decision: "trade-vote",
    tests: `The rival holding the third lot offers $${String(offer.cashDelta[AI] ?? 0)} and a railroad for ${pair.join(" and ")}, completing the set for them.`,
    build: (s) => offered(negotiation(withCash(owning(atTurn(table(s), turn), lots), cash)), RIVAL, offer),
    choose: voteChoice,
  };
}

/** A cash-poor player offers the two lots that complete the seat's set, for
 *  most of its cash and two of its lots, on a board with a rival's built set.
 *  Paying all its cash for a set it can't then build is a judgment (game
 *  46181f: the seat accepted, fell to $275 and was stripped by a $700 rent);
 *  records the vote and the cash it leaves. */
function overpayForSet(
  id: string,
  turn: number,
  board: (state: GameState) => GameState,
  seller: string,
  offer: { propertyTo: Readonly<Record<number, string>>; cashDelta: Readonly<Record<string, number>> },
): Scenario {
  return {
    id,
    kind: "judgment",
    phase: "mid",
    decision: "trade-vote",
    tests: `A cash-poor player offers the two lots that complete the seat's set for $${String(-(offer.cashDelta[AI] ?? 0))} and two of its lots, on a board with a rival's built set.`,
    build: (s) => offered(board(atTurn(table(s), turn)), seller, offer),
    choose: (o) => `${voteChoice(o)}; keeps $${String(cashAfter(o))}`,
  };
}

// --- The suite -----------------------------------------------------------------

export const SCENARIOS: readonly Scenario[] = [
  // Buying
  completesSet("buy-completes-set", "early", 6, [SQ.oriental, SQ.vermont], SQ.connecticut, 1100),
  completesSet("buy-completes-set-dark-blue", "mid", 22, [SQ.park], SQ.boardwalk, 900),
  completesSet("buy-completes-set-pink", "mid", 30, [SQ.stCharles, SQ.states], SQ.virginia, 500),
  {
    id: "buy-first-of-set",
    kind: "judgment",
    phase: "early",
    decision: "buy",
    tests: "Second turn, full cash, lands on an orange nobody owns.",
    build: (s) => landed(atTurn(table(s), 2), SQ.stJames),
    choose: buyChoice,
  },
  {
    id: "buy-third-railroad",
    kind: "judgment",
    phase: "early",
    decision: "buy",
    tests: "Owns two railroads, lands on a third with $900.",
    build: (s) => landed(withCash(owning(atTurn(table(s), 8), { [AI]: [SQ.reading, SQ.pennRR] }), { [AI]: 900 }), SQ.bAndO),
    choose: buyChoice,
  },
  {
    id: "buy-blocks-rival",
    kind: "judgment",
    phase: "mid",
    decision: "buy",
    tests: "A rival owns two reds; the AI lands on the third with $800.",
    build: (s) => landed(withCash(owning(atTurn(table(s), 14), { [RIVAL]: [SQ.kentucky, SQ.indiana] }), { [AI]: 800 }), SQ.illinois),
    choose: buyChoice,
  },
  {
    id: "buy-leaves-little-for-rent",
    kind: "judgment",
    phase: "late",
    decision: "buy",
    tests: "Hotels on the oranges and reds; the AI has $330 and lands on Pacific ($300), which would leave it $30.",
    build: (s) => landed(withCash(dangerousBoard(atTurn(table(s), 60)), { [AI]: 330 }), SQ.pacific),
    choose: buyChoice,
  },

  // Auctions
  {
    id: "auction-boardwalk",
    kind: "judgment",
    phase: "early",
    decision: "auction",
    tests: "Boardwalk ($400) at auction early; nobody owns Park Place; the AI has $1,500. Game 0a0e5y sold it for $1,410.",
    build: (s) => auctioning(atTurn(table(s), 4), SQ.boardwalk),
    choose: maxChoice,
  },
  {
    id: "auction-cheap-lot",
    kind: "judgment",
    phase: "early",
    decision: "auction",
    tests: "Mediterranean ($60) at auction; nobody owns Baltic.",
    build: (s) => auctioning(atTurn(table(s), 3), SQ.mediterranean),
    choose: maxChoice,
  },
  {
    id: "auction-completes-own-set",
    kind: "judgment",
    phase: "mid",
    decision: "auction",
    tests: "Owns two reds with $900; the third is at auction.",
    build: (s) => auctioning(withCash(owning(atTurn(table(s), 16), { [AI]: [SQ.kentucky, SQ.indiana] }), { [AI]: 900 }), SQ.illinois),
    choose: maxChoice,
  },
  {
    id: "auction-blocks-rival-set",
    kind: "judgment",
    phase: "mid",
    decision: "auction",
    tests: "A rival owns two oranges; New York ($200) is at auction; the AI has $800.",
    build: (s) => auctioning(withCash(owning(atTurn(table(s), 16), { [RIVAL]: [SQ.stJames, SQ.tennessee] }), { [AI]: 800 }), SQ.newYork),
    choose: maxChoice,
  },
  {
    id: "auction-complete-into-illiquidity",
    kind: "judgment",
    phase: "late",
    decision: "auction",
    tests:
      "Ported from adversary.ts (auction-illiquidity): two light blues and $300; the completer is at auction at $100, bid by a rival with a hotel on New York ($1,000 rent). The rule bots' reserve line is $50.",
    build: (s) => {
      const board = built(
        withCash(owning(atTurn(table(s), 40), { [AI]: [SQ.oriental, SQ.vermont], [FOURTH]: ORANGES }), { [AI]: 300 }),
        { [SQ.newYork]: 5 },
      );
      return auctioning(board, SQ.connecticut, { active: [AI, FOURTH], highBid: 100, leaderId: FOURTH, bids: { [FOURTH]: 100 } });
    },
    choose: maxChoice,
  },

  // Trade votes
  belowMortgage("vote-below-mortgage-railroad", "mid", 12, SQ.reading, RIVAL, 50, 900),
  belowMortgage("vote-below-mortgage-utility", "mid", 18, SQ.water, OTHER, 40, 600),
  belowMortgage("vote-below-mortgage-red", "late", 40, SQ.kentucky, FOURTH, 80, 300),
  counterHoldings("vote-counter-holdings-railroad", 36, { [AI]: [SQ.pennRR], [OTHER]: [SQ.reading, SQ.bAndO] }, SQ.pennRR, RIVAL, 70, 250),
  counterHoldings("vote-counter-holdings-green", 44, { [AI]: [SQ.pacific], [RIVAL]: [SQ.northCarolina] }, SQ.pacific, OTHER, 120, 350),
  counterHoldings(
    "vote-counter-holdings-light-blue",
    30,
    { [AI]: [SQ.vermont], [FOURTH]: [SQ.mediterranean], [OTHER]: [SQ.oriental, SQ.connecticut] },
    SQ.vermont,
    FOURTH,
    30,
    200,
  ),
  counterMessage("vote-counter-message-red", 20, [SQ.kentucky, SQ.indiana], SQ.illinois, RIVAL, 350, 700),
  counterMessage("vote-counter-message-yellow", 26, [SQ.atlantic, SQ.ventnor], SQ.marvin, OTHER, 380, 600),
  counterMessage("vote-counter-message-light-blue", 14, [SQ.oriental, SQ.vermont], SQ.connecticut, FOURTH, 180, 500),
  counterDirection("vote-counter-direction", 18, SQ.stJames, RIVAL, 40, 84),
  counterDirection("vote-counter-direction-yellow", 26, SQ.ventnor, OTHER, 50, 60),
  counterDirection("vote-counter-direction-railroad", 34, SQ.shortLine, FOURTH, 20, 30),
  {
    id: "vote-arms-rival-monopoly",
    kind: "judgment",
    phase: "mid",
    decision: "trade-vote",
    tests: "A rival with two oranges offers $400 for the AI's New York (price $200). The AI has $700 and no sets.",
    build: (s) =>
      offered(withCash(owning(atTurn(table(s), 18), { [RIVAL]: [SQ.stJames, SQ.tennessee], [AI]: [SQ.newYork] }), { [AI]: 700 }), RIVAL, {
        propertyTo: { [SQ.newYork]: RIVAL },
        cashDelta: { [AI]: 400, [RIVAL]: -400 },
      }),
    choose: voteChoice,
  },
  {
    id: "vote-mutual-completion-swap",
    kind: "judgment",
    phase: "mid",
    decision: "trade-vote",
    tests: "Two reds and Atlantic vs a rival's Illinois and two yellows; the rival offers Illinois for Atlantic, completing a set for each.",
    build: (s) =>
      offered(
        owning(atTurn(table(s), 20), { [AI]: [SQ.kentucky, SQ.indiana, SQ.atlantic], [RIVAL]: [SQ.illinois, SQ.ventnor, SQ.marvin] }),
        RIVAL,
        { propertyTo: { [SQ.illinois]: AI, [SQ.atlantic]: RIVAL }, cashDelta: {} },
      ),
    choose: voteChoice,
  },
  {
    id: "vote-generous-offer",
    kind: "judgment",
    phase: "early",
    decision: "trade-vote",
    tests: "A rival with no browns offers $250 for the AI's lone Mediterranean (price $60).",
    build: (s) =>
      offered(owning(atTurn(table(s), 8), { [AI]: [SQ.mediterranean] }), RIVAL, {
        propertyTo: { [SQ.mediterranean]: RIVAL },
        cashDelta: { [AI]: 250, [RIVAL]: -250 },
      }),
    choose: voteChoice,
  },
  {
    id: "vote-distress-fire-sale",
    kind: "judgment",
    phase: "late",
    decision: "trade-vote",
    tests:
      "Ported from adversary.ts (distress-firesale): $90 cash, the leader has hotels on the reds and two greens and offers $250 for the AI's Pennsylvania Avenue (price $320), the green completer.",
    build: (s) => {
      const board = built(
        mortgaging(
          withCash(owning(atTurn(table(s), 50), { [AI]: [SQ.pennsylvaniaAve, SQ.boardwalk], [OTHER]: [SQ.pacific, SQ.northCarolina, ...REDS] }), {
            [AI]: 90,
            [OTHER]: 300,
            [FOURTH]: 100,
            [RIVAL]: 100,
          }),
          [SQ.boardwalk],
        ),
        hotels(REDS),
      );
      return offered(board, OTHER, { propertyTo: { [SQ.pennsylvaniaAve]: OTHER }, cashDelta: { [AI]: 250, [OTHER]: -250 } });
    },
    choose: voteChoice,
  },
  {
    id: "vote-whole-set-handover",
    kind: "judgment",
    phase: "late",
    decision: "trade-vote",
    tests: "Ported from adversary.ts (set-handover, game 53400q): the whole yellow set (two lots mortgaged) and $700; another player offers $550 for all three.",
    build: (s) =>
      offered(
        mortgaging(
          withCash(owning(atTurn(table(s), 48), { [AI]: [SQ.atlantic, SQ.ventnor, SQ.marvin, SQ.stJames], [FOURTH]: [SQ.oriental] }), {
            [AI]: 700,
            [FOURTH]: 1200,
          }),
          [SQ.atlantic, SQ.ventnor],
        ),
        FOURTH,
        {
          propertyTo: { [SQ.atlantic]: FOURTH, [SQ.ventnor]: FOURTH, [SQ.marvin]: FOURTH },
          cashDelta: { [AI]: 550, [FOURTH]: -550 },
        },
      ),
    choose: voteChoice,
  },

  sellPairToBlocker(
    "vote-sell-pair-to-blocker",
    33,
    {
      [AI]: [SQ.kentucky, SQ.illinois, SQ.vermont, SQ.electric, SQ.pacific],
      [RIVAL]: [SQ.indiana, SQ.reading, SQ.pennRR, SQ.bAndO, SQ.shortLine, SQ.newYork, SQ.atlantic],
      [OTHER]: [SQ.states],
      [FOURTH]: [SQ.mediterranean, SQ.connecticut, SQ.tennessee, SQ.northCarolina, SQ.pennsylvaniaAve],
    },
    { [AI]: 560, [RIVAL]: 982, [OTHER]: 1485, [FOURTH]: 128 },
    { propertyTo: { [SQ.kentucky]: RIVAL, [SQ.illinois]: RIVAL, [SQ.reading]: AI }, cashDelta: { [AI]: 640, [RIVAL]: -640 } },
    (state) => {
      const first = { propertyTo: { [SQ.kentucky]: RIVAL, [SQ.illinois]: RIVAL }, cashDelta: { [AI]: 640, [RIVAL]: -640 } };
      const counter = {
        propertyTo: { [SQ.kentucky]: RIVAL, [SQ.illinois]: RIVAL, [SQ.reading]: AI, [SQ.shortLine]: AI },
        cashDelta: { [AI]: 640, [RIVAL]: -640 },
      };
      return logged(state, [
        said(RIVAL, "Alex, $640 cash for two reds that cost you $460, a big profit for you."),
        said(AI, "Sam, I'll hand over both reds for your $640 plus Short Line and Reading Railroad; that makes it fair for the red set."),
        turnedDown(state, RIVAL, AI, first, true),
        said(RIVAL, "Alex, two railroads plus $640 is too much; I'll give you $640 and Reading Railroad for both reds."),
        turnedDown(state, AI, RIVAL, counter, true),
      ]);
    },
  ),
  sellPairToBlocker(
    "vote-sell-pair-to-blocker-orange",
    30,
    {
      [AI]: [SQ.stJames, SQ.tennessee, SQ.oriental],
      [RIVAL]: [SQ.newYork, SQ.reading, SQ.pennRR, SQ.bAndO],
      [OTHER]: [SQ.atlantic, SQ.ventnor],
    },
    { [AI]: 400, [RIVAL]: 900 },
    { propertyTo: { [SQ.stJames]: RIVAL, [SQ.tennessee]: RIVAL, [SQ.bAndO]: AI }, cashDelta: { [AI]: 520, [RIVAL]: -520 } },
    (state) => logged(state, [said(RIVAL, "Alex, $520 and B. & O. Railroad for your two oranges is well over what they cost you.")]),
  ),
  overpayForSet(
    "vote-overpay-for-set",
    42,
    (state) => {
      const board = built(
        mortgaging(
          withCash(
            owning(state, {
              [AI]: [SQ.pacific, SQ.reading, SQ.vermont, SQ.electric],
              [FOURTH]: [SQ.mediterranean, SQ.connecticut, SQ.tennessee, SQ.northCarolina, SQ.pennsylvaniaAve],
              [RIVAL]: [...REDS, SQ.bAndO, SQ.shortLine, SQ.pennRR, SQ.newYork, SQ.atlantic],
              [OTHER]: [SQ.oriental, SQ.states, SQ.virginia],
            }),
            { [AI]: 1275, [FOURTH]: 192, [RIVAL]: 83, [OTHER]: 1185 },
          ),
          [SQ.atlantic],
        ),
        { [SQ.kentucky]: 2, [SQ.indiana]: 2, [SQ.illinois]: 1 },
      );
      const greens = { [SQ.northCarolina]: AI, [SQ.pennsylvaniaAve]: AI };
      return logged(
        logged(
          board,
          [
            said(AI, "Kyle, $900 cash for two greens that cost $620 gets you out of jail trouble and well clear of Sam's reds."),
            turnedDown(board, AI, FOURTH, { propertyTo: greens, cashDelta: { [AI]: -900, [FOURTH]: 900 } }, false),
          ],
          38,
        ),
        [
          said(AI, "Kyle, $1,000 cash now for two greens you can't build on with Sam's reds bearing down; it keeps you safe."),
          turnedDown(board, AI, FOURTH, { propertyTo: greens, cashDelta: { [AI]: -1000, [FOURTH]: 1000 } }, true),
        ],
      );
    },
    FOURTH,
    {
      propertyTo: { [SQ.northCarolina]: AI, [SQ.pennsylvaniaAve]: AI, [SQ.reading]: FOURTH, [SQ.vermont]: FOURTH },
      cashDelta: { [AI]: -1000, [FOURTH]: 1000 },
    },
  ),
  overpayForSet(
    "vote-overpay-for-set-yellow",
    36,
    (state) =>
      built(
        withCash(
          owning(state, {
            [AI]: [SQ.atlantic, SQ.reading, SQ.pennRR, SQ.oriental],
            [OTHER]: [SQ.ventnor, SQ.marvin],
            [RIVAL]: [...ORANGES, SQ.shortLine],
          }),
          { [AI]: 1100, [OTHER]: 150, [RIVAL]: 700 },
        ),
        { [SQ.stJames]: 3, [SQ.tennessee]: 3, [SQ.newYork]: 3 },
      ),
    OTHER,
    {
      propertyTo: { [SQ.ventnor]: AI, [SQ.marvin]: AI, [SQ.reading]: OTHER, [SQ.pennRR]: OTHER },
      cashDelta: { [AI]: -900, [OTHER]: 900 },
    },
  ),

  // Turn start: building, mortgages, proposals
  proposeDirection("turn-start-propose-direction", 20, [SQ.kentucky, SQ.indiana], OTHER, SQ.illinois, 1300),
  proposeDirection("turn-start-propose-direction-dark-blue", 28, [SQ.park], RIVAL, SQ.boardwalk, 1600),
  proposeDirection("turn-start-propose-direction-pink", 24, [SQ.stCharles, SQ.virginia], FOURTH, SQ.states, 900),
  {
    id: "turn-start-fresh-monopoly",
    kind: "judgment",
    phase: "mid",
    decision: "turn-start",
    tests: "A fresh orange monopoly, $1,000 cash, no rival monopolies.",
    build: (s) => turnStart(withCash(owning(atTurn(table(s), 15), { [AI]: ORANGES }), { [AI]: 1000 })),
    choose: describeTurnStart,
  },
  {
    id: "turn-start-thin-cash-dangerous-board",
    kind: "judgment",
    phase: "late",
    decision: "turn-start",
    tests: "The dark blues (houses $200) with $450, on a board with hotels on the oranges and reds.",
    build: (s) => turnStart(withCash(owning(dangerousBoard(atTurn(table(s), 55)), { [AI]: DARK_BLUES }), { [AI]: 450 })),
    choose: describeTurnStart,
  },
  {
    id: "turn-start-mortgaged-monopoly",
    kind: "judgment",
    phase: "mid",
    decision: "turn-start",
    tests: "The whole red set, all mortgaged, with $1,500 on a quiet board.",
    build: (s) => turnStart(mortgaging(owning(atTurn(table(s), 25), { [AI]: REDS }), REDS)),
    choose: describeTurnStart,
  },
  {
    id: "turn-start-holds-rival-completer",
    kind: "judgment",
    phase: "mid",
    decision: "turn-start",
    tests: "Ported from adversary.ts (wallet-xray): holds New York, cash-poor ($120); a player with $1,200 holds the other two oranges.",
    build: (s) =>
      turnStart(
        mortgaging(
          withCash(owning(atTurn(table(s), 22), { [AI]: [SQ.newYork, SQ.mediterranean], [FOURTH]: [SQ.stJames, SQ.tennessee] }), {
            [AI]: 120,
            [FOURTH]: 1200,
          }),
          [SQ.mediterranean],
        ),
      ),
    choose: describeTurnStart,
  },

  proposePitch("turn-start-propose-pitch-orange", 40, PITCH_ORANGE_LOTS, { [AI]: 1399, [RIVAL]: 191, [OTHER]: 92, [FOURTH]: 468 }, pitchOrangeHistory),
  proposePitch(
    "turn-start-propose-pitch-red",
    26,
    { [AI]: [SQ.kentucky, SQ.illinois, SQ.reading], [OTHER]: [SQ.indiana, SQ.stCharles, SQ.virginia] },
    { [AI]: 1100, [OTHER]: 150 },
  ),
  proposePitch(
    "turn-start-propose-pitch-dark-blue",
    30,
    { [AI]: [SQ.park, SQ.water], [RIVAL]: [SQ.boardwalk, SQ.oriental, SQ.vermont] },
    { [AI]: 1300, [RIVAL]: 220 },
  ),
  proposePitch(
    "turn-start-propose-pitch-full-set",
    28,
    { [AI]: [SQ.stJames, SQ.newYork], [RIVAL]: [SQ.tennessee, ...LIGHT_BLUES] },
    { [AI]: 1200, [RIVAL]: 200 },
  ),
  movementScenario(
    "turn-start-movement-railroads",
    "mid",
    "turn-start",
    "All four railroads with one rival; the seat holds the light blues, unbuilt, with $180. A note or plan must not claim it can avoid a place.",
    (s) => turnStart(withCash(owning(atTurn(table(s), 34), { [AI]: LIGHT_BLUES, [RIVAL]: [SQ.reading, SQ.pennRR, SQ.bAndO, SQ.shortLine] }), { [AI]: 180 })),
  ),
  movementScenario(
    "turn-start-movement-dark-blue",
    "late",
    "turn-start",
    "Hotels on a rival's dark blues; the seat holds the light blues at two houses each with $300. A note or plan must not claim it can avoid a place.",
    (s) =>
      turnStart(
        built(withCash(owning(atTurn(table(s), 50), { [AI]: LIGHT_BLUES, [RIVAL]: DARK_BLUES }), { [AI]: 300 }), {
          ...hotels(DARK_BLUES),
          [SQ.oriental]: 2,
          [SQ.vermont]: 2,
          [SQ.connecticut]: 2,
        }),
      ),
  ),

  // Debt
  movementScenario(
    "debt-after-built-rival-set",
    "late",
    "settle-debt",
    "Game 46181f, turn 62: $530 short after $700 rent on a rival's reds at three houses; the seat's greens have two houses and its plan says \"avoid reds\". A note or plan must not claim it can avoid a place.",
    (s) => {
      const board = built(
        mortgaging(
          withCash(
            owning(atTurn(table(s), 62), {
              [AI]: [SQ.pacific, SQ.northCarolina, SQ.pennsylvaniaAve, SQ.electric],
              [RIVAL]: [...REDS, SQ.atlantic, SQ.bAndO, SQ.shortLine],
              [OTHER]: [SQ.oriental, SQ.states, SQ.virginia, SQ.pennRR],
              [FOURTH]: [SQ.mediterranean, SQ.vermont, SQ.connecticut, SQ.tennessee, SQ.newYork, SQ.reading, SQ.water],
            }),
            { [RIVAL]: 1145, [OTHER]: 893, [FOURTH]: 882 },
          ),
          [SQ.electric, SQ.atlantic, SQ.newYork],
        ),
        { [SQ.kentucky]: 3, [SQ.indiana]: 3, [SQ.illinois]: 3, [SQ.pacific]: 1, [SQ.northCarolina]: 1 },
      );
      const charged = logged(withPlayer(board, AI, { position: SQ.indiana }), [
        { kind: "roll", dice: [5, 5], doublesStreak: 1, toPosition: SQ.indiana, passedGo: false },
        { kind: "rent", ownerId: RIVAL, position: SQ.indiana, amount: 700 },
      ]);
      return planned(inDebt(charged, -530), "Build greens when cash reaches $200+ above a buffer; avoid reds.");
    },
  ),
  movementScenario(
    "debt-after-built-rival-set-orange",
    "late",
    "settle-debt",
    "$700 short after $950 rent on a rival's St. James hotel; the seat's yellows have three houses each and Reading is unmortgaged. A note or plan must not claim it can avoid a place.",
    (s) => {
      const board = built(owning(atTurn(table(s), 54), { [AI]: [SQ.atlantic, SQ.ventnor, SQ.marvin, SQ.reading], [RIVAL]: ORANGES }), {
        ...hotels(ORANGES),
        [SQ.atlantic]: 3,
        [SQ.ventnor]: 3,
        [SQ.marvin]: 3,
      });
      const charged = logged(withPlayer(board, AI, { position: SQ.stJames }), [
        { kind: "roll", dice: [4, 2], doublesStreak: 0, toPosition: SQ.stJames, passedGo: false },
        { kind: "rent", ownerId: RIVAL, position: SQ.stJames, amount: 950 },
      ]);
      return inDebt(charged, -700);
    },
  ),
  keepsHouses("debt-keeps-houses", 45, ORANGES, 3, [SQ.reading, SQ.water], 150),
  keepsHouses("debt-keeps-houses-light-blue", 38, LIGHT_BLUES, 2, [SQ.electric, SQ.shortLine], 100),
  keepsHouses("debt-keeps-houses-red", 52, REDS, 1, [SQ.reading, SQ.pennRR], 180),
  mustSellHouses("debt-must-sell-houses", 47, ORANGES, 3, [SQ.reading, SQ.water], 275),
  mustSellHouses("debt-must-sell-houses-light-blue", 41, LIGHT_BLUES, 2, [SQ.electric, SQ.shortLine], 225),
  mustSellHouses("debt-must-sell-houses-red", 56, REDS, 2, [SQ.reading, SQ.pennRR], 320),
  {
    id: "debt-small-shortfall",
    kind: "judgment",
    phase: "mid",
    decision: "settle-debt",
    tests: "$40 short with two railroads and Boardwalk.",
    build: (s) => inDebt(owning(atTurn(table(s), 30), { [AI]: [SQ.reading, SQ.pennRR, SQ.boardwalk] }), -40),
    choose: debtChoice,
  },

  // Jail
  {
    id: "jail-early",
    kind: "judgment",
    phase: "early",
    decision: "jail",
    tests: "Turn 3, almost nothing owned or built.",
    build: (s) => jailed(atTurn(table(s), 3), 0),
    choose: jailChoice,
  },
  {
    id: "jail-early-with-card",
    kind: "judgment",
    phase: "early",
    decision: "jail",
    tests: "Early, holding a Get Out of Jail Free card.",
    build: (s) => jailed({ ...atTurn(table(s), 5), jailFreeCards: { chance: AI } }, 0),
    choose: jailChoice,
  },
  {
    id: "jail-hotel-board",
    kind: "judgment",
    phase: "late",
    decision: "jail",
    tests: "Late game, hotels on the oranges and reds, nothing of its own to build.",
    build: (s) => jailed(withPlayer(dangerousBoard(atTurn(table(s), 70)), AI, { cash: 400 }), 0),
    choose: jailChoice,
  },
];
