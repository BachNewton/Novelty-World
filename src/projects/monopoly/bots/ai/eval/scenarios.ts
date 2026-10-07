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
  mortgaging,
  offered,
  OTHER,
  owning,
  RIVAL,
  SQ,
  table,
  turnStart,
  withCash,
  withPlayer,
} from "./board";
import {
  after,
  cashAfter,
  cashIn,
  describeTerms,
  describeTurnStart,
  did,
  gives,
  housesAdded,
  nameOf,
  takes,
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

  // Debt
  keepsHouses("debt-keeps-houses", 45, ORANGES, 3, [SQ.reading, SQ.water], 150),
  keepsHouses("debt-keeps-houses-light-blue", 38, LIGHT_BLUES, 2, [SQ.electric, SQ.shortLine], 100),
  keepsHouses("debt-keeps-houses-red", 52, REDS, 1, [SQ.reading, SQ.pennRR], 180),
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
