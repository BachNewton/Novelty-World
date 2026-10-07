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
  cashOf,
  did,
  fail,
  housesAdded,
  pass,
  proposedTerms,
  settledOr,
  type Outcome,
  type Scenario,
  type Verdict,
} from "./scenario";

// The scenario suite: hand-made positions, each testing one judgement, grouped
// by phase of the game. A scenario's line is a defensible floor for a strong
// player, not the best move; its `tests` says why the line is where it is.
// Every real failure found in a game or slice should become a scenario here, so
// the suite only grows.

const ORANGES = [SQ.stJames, SQ.tennessee, SQ.newYork];
const REDS = [SQ.kentucky, SQ.indiana, SQ.illinois];
const DARK_BLUES = [SQ.park, SQ.boardwalk];

const hotels = (positions: readonly number[]): Record<number, number> =>
  Object.fromEntries(positions.map((pos) => [pos, 5]));

/** A late board: one rival with hotels on the oranges, another on the reds. */
function dangerousBoard(state: GameState): GameState {
  return built(owning(state, { [RIVAL]: ORANGES, [OTHER]: REDS }), { ...hotels(ORANGES), ...hotels(REDS) });
}

const auctionMax = (o: Outcome): number | null => o.resolution?.auctionMax ?? null;

function bought(o: Outcome, verdict: (didBuy: boolean) => Verdict): Verdict {
  return settledOr(o, () => {
    if (did(o, "buy")) return verdict(true);
    if (did(o, "decline-buy")) return verdict(false);
    return fail("neither bought nor sent it to auction");
  });
}

const mustBuy = (o: Outcome): Verdict =>
  bought(o, (yes) => (yes ? pass("bought") : fail("sent it to auction")));

function maxWithin(o: Outcome, low: number, high: number): Verdict {
  return settledOr(o, () => {
    const max = auctionMax(o);
    if (max === null) return fail("no maximum recorded");
    if (max < low) return fail(`maximum $${String(max)} is under $${String(low)}`);
    if (max > high) return fail(`maximum $${String(max)} is over $${String(high)}`);
    return pass(`maximum $${String(max)}`);
  });
}

type Vote = "accept" | "decline" | "counter";

function voteOf(o: Outcome): Vote | null {
  if (did(o, "counter-trade")) return "counter";
  if (did(o, "accept-trade")) return "accept";
  if (did(o, "decline-trade")) return "decline";
  return null;
}

/** A vote check: `ok` judges the vote, and a counter's terms when it countered. */
function voted(o: Outcome, ok: (vote: Vote) => Verdict): Verdict {
  return settledOr(o, () => {
    const vote = voteOf(o);
    return vote === null ? fail("cast no vote") : ok(vote);
  });
}

/** Cash the AI receives under the terms it put on the table (negative = pays). */
function aiCashIn(o: Outcome): number {
  return proposedTerms(o)?.cashDelta[AI] ?? 0;
}

function aiGives(o: Outcome, position: number): boolean {
  const terms = proposedTerms(o);
  return terms !== null && position in terms.propertyTo && terms.propertyTo[position] !== AI;
}

export const SCENARIOS: readonly Scenario[] = [
  // --- Buying ---------------------------------------------------------------
  {
    id: "buy-completes-set",
    phase: "early",
    decision: "buy",
    tests: "Owns two light blues, lands on the third with plenty of cash. Completing a set is the strongest buy there is.",
    build: (s) => landed(withCash(owning(atTurn(table(s), 6), { [AI]: [SQ.oriental, SQ.vermont] }), { [AI]: 1100 }), SQ.connecticut),
    check: mustBuy,
  },
  {
    id: "buy-first-of-set",
    phase: "early",
    decision: "buy",
    tests: "Second turn, full cash, lands on an orange nobody owns. Early-game lots are bought, not auctioned: an auction only lets a rival have it cheap.",
    build: (s) => landed(atTurn(table(s), 2), SQ.stJames),
    check: mustBuy,
  },
  {
    id: "buy-third-railroad",
    phase: "early",
    decision: "buy",
    tests: "Owns two railroads, lands on a third with $900. Railroad rent doubles with each one owned.",
    build: (s) => landed(withCash(owning(atTurn(table(s), 8), { [AI]: [SQ.reading, SQ.pennRR] }), { [AI]: 900 }), SQ.bAndO),
    check: mustBuy,
  },
  {
    id: "buy-blocks-rival",
    phase: "mid",
    decision: "buy",
    tests: "A rival owns two reds; the AI lands on the third with $800. Buying blocks the rival's monopoly.",
    build: (s) => landed(withCash(owning(atTurn(table(s), 14), { [RIVAL]: [SQ.kentucky, SQ.indiana] }), { [AI]: 800 }), SQ.illinois),
    check: mustBuy,
  },
  {
    id: "buy-leaves-nothing-for-rent",
    phase: "late",
    decision: "buy",
    tests:
      "Late board with hotels on the oranges and reds; the AI has $330 and lands on Pacific ($300). Buying leaves $30 against four-figure rents for a lone lot that earns $26, so it should let it go to auction.",
    build: (s) => landed(withCash(dangerousBoard(atTurn(table(s), 60)), { [AI]: 330 }), SQ.pacific),
    check: (o) => bought(o, (yes) => (yes ? fail("bought, leaving $30 against hotel rents") : pass("sent it to auction"))),
  },

  // --- Auctions -------------------------------------------------------------
  {
    id: "auction-boardwalk-trap",
    phase: "early",
    decision: "auction",
    tests:
      "Boardwalk ($400) at auction early, nobody owns Park Place, the AI has $1,500. A lone Boardwalk earns $50 rent; paying more than 1.5x its price is the overbid that sank a seat in game 0a0e5y.",
    build: (s) => auctioning(atTurn(table(s), 4), SQ.boardwalk),
    check: (o) => maxWithin(o, 0, 600),
  },
  {
    id: "auction-cheap-lot",
    phase: "early",
    decision: "auction",
    tests: "Mediterranean ($60) at auction, nobody owns Baltic. Worth a little over face at most.",
    build: (s) => auctioning(atTurn(table(s), 3), SQ.mediterranean),
    check: (o) => maxWithin(o, 0, 150),
  },
  {
    id: "auction-completes-own-set",
    phase: "mid",
    decision: "auction",
    tests: "Owns two reds with $900; the third is at auction. Should bid at least its price, but keep $100 back.",
    build: (s) => auctioning(withCash(owning(atTurn(table(s), 16), { [AI]: [SQ.kentucky, SQ.indiana] }), { [AI]: 900 }), SQ.illinois),
    check: (o) => maxWithin(o, 240, 800),
  },
  {
    id: "auction-blocks-rival-set",
    phase: "mid",
    decision: "auction",
    tests: "A rival owns two oranges; New York ($200) is at auction and the AI has $800. Letting it go cheap hands the rival the best set on the board, so bid at least its price.",
    build: (s) => auctioning(withCash(owning(atTurn(table(s), 16), { [RIVAL]: [SQ.stJames, SQ.tennessee] }), { [AI]: 800 }), SQ.newYork),
    check: (o) => maxWithin(o, 200, 700),
  },
  {
    id: "auction-complete-into-illiquidity",
    phase: "late",
    decision: "auction",
    tests:
      "Ported from the rule bots' probe instrument (adversary.ts, auction-illiquidity). The AI has two light blues and $300; the completer is at auction at $100, bid by a rival who has a hotel on New York ($1,000 rent). Its reserve line is cash minus a quarter of the worst hit: $50. Winning only by stripping its cash is the winner's curse a human baits.",
    build: (s) => {
      const board = built(
        withCash(owning(atTurn(table(s), 40), { [AI]: [SQ.oriental, SQ.vermont], [FOURTH]: ORANGES }), { [AI]: 300 }),
        { [SQ.newYork]: 5 },
      );
      return auctioning(board, SQ.connecticut, { active: [AI, FOURTH], highBid: 100, leaderId: FOURTH, bids: { [FOURTH]: 100 } });
    },
    check: (o) => maxWithin(o, 0, 100),
  },

  // --- Trade votes ----------------------------------------------------------
  {
    id: "vote-arms-rival-monopoly",
    phase: "mid",
    decision: "trade-vote",
    tests:
      "A rival with two oranges offers $400 for the AI's New York (price $200). The AI has $700 and no sets. Handing over the board's strongest monopoly for double its price is a classic giveaway: decline, or counter for far more.",
    build: (s) =>
      offered(withCash(owning(atTurn(table(s), 18), { [RIVAL]: [SQ.stJames, SQ.tennessee], [AI]: [SQ.newYork] }), { [AI]: 700 }), RIVAL, {
        propertyTo: { [SQ.newYork]: RIVAL },
        cashDelta: { [AI]: 400, [RIVAL]: -400 },
      }),
    check: (o) =>
      voted(o, (vote) => {
        if (vote === "accept") return fail("sold the orange completer for $400");
        if (vote === "counter" && aiGives(o, SQ.newYork) && aiCashIn(o) < 900) {
          return fail(`countered by selling New York for $${String(aiCashIn(o))}`);
        }
        return pass(vote);
      }),
  },
  {
    id: "vote-fair-mutual-swap",
    phase: "mid",
    decision: "trade-vote",
    tests:
      "The AI has two reds and Atlantic; a rival has Illinois and two yellows. The rival offers Illinois for Atlantic: each completes a set, and the AI's (red) is the stronger. Accept.",
    build: (s) =>
      offered(
        owning(atTurn(table(s), 20), { [AI]: [SQ.kentucky, SQ.indiana, SQ.atlantic], [RIVAL]: [SQ.illinois, SQ.ventnor, SQ.marvin] }),
        RIVAL,
        { propertyTo: { [SQ.illinois]: AI, [SQ.atlantic]: RIVAL }, cashDelta: {} },
      ),
    check: (o) =>
      voted(o, (vote) => {
        if (vote === "accept") return pass("accepted");
        if (vote === "counter" && proposedTerms(o)?.propertyTo[SQ.illinois] === AI) return pass("countered, still taking Illinois");
        return fail(vote === "decline" ? "declined a swap that completes its stronger set" : "countered without Illinois");
      }),
  },
  {
    id: "vote-lowball-railroad",
    phase: "mid",
    decision: "trade-vote",
    tests: "A rival offers $50 for the AI's only railroad (price $200). Never accept; a counter must ask at least the price.",
    build: (s) =>
      offered(withCash(owning(atTurn(table(s), 12), { [AI]: [SQ.reading] }), { [AI]: 900 }), RIVAL, {
        propertyTo: { [SQ.reading]: RIVAL },
        cashDelta: { [AI]: 50, [RIVAL]: -50 },
      }),
    check: (o) =>
      voted(o, (vote) => {
        if (vote === "accept") return fail("sold a $200 railroad for $50");
        if (vote === "counter" && aiGives(o, SQ.reading) && aiCashIn(o) < 200) {
          return fail(`countered by selling it for $${String(aiCashIn(o))}`);
        }
        return pass(vote);
      }),
  },
  {
    id: "vote-counter-cash-direction",
    phase: "mid",
    decision: "trade-vote",
    tests:
      "The AI is short ($84) and holds a lone mortgaged St. James Place; a rival offers $40 for it. From game 0a0e5y, where a seat countered by giving the lot away and paying on top. A counter that gives the lot away must bring cash in.",
    build: (s) =>
      offered(mortgaging(withCash(owning(atTurn(table(s), 18), { [AI]: [SQ.stJames] }), { [AI]: 84 }), [SQ.stJames]), RIVAL, {
        propertyTo: { [SQ.stJames]: RIVAL },
        cashDelta: { [AI]: 40, [RIVAL]: -40 },
      }),
    check: (o) =>
      voted(o, (vote) => {
        if (vote === "counter" && aiGives(o, SQ.stJames) && aiCashIn(o) <= 40) {
          return fail(`countered giving the lot away for $${String(aiCashIn(o))}`);
        }
        return pass(vote === "counter" ? `countered for $${String(aiCashIn(o))}` : vote);
      }),
  },
  {
    id: "vote-good-offer",
    phase: "early",
    decision: "trade-vote",
    tests: "A rival with no browns offers $250 for the AI's lone Mediterranean (price $60). Nothing about a set changes; take the money.",
    build: (s) =>
      offered(owning(atTurn(table(s), 8), { [AI]: [SQ.mediterranean] }), RIVAL, {
        propertyTo: { [SQ.mediterranean]: RIVAL },
        cashDelta: { [AI]: 250, [RIVAL]: -250 },
      }),
    check: (o) =>
      voted(o, (vote) => {
        if (vote === "accept") return pass("accepted");
        if (vote === "counter" && aiCashIn(o) >= 250) return pass(`countered for $${String(aiCashIn(o))}`);
        return fail(vote === "decline" ? "declined $250 for a $60 lot" : `countered for less ($${String(aiCashIn(o))})`);
      }),
  },
  {
    id: "vote-distress-fire-sale",
    phase: "late",
    decision: "trade-vote",
    tests:
      "Ported from adversary.ts (distress-firesale). The AI is thin on cash ($90) facing a leader with hotels on the reds and two greens; the leader offers $250 for the AI's Pennsylvania Avenue (price $320), the green completer. Arming the leader below book is the fire-sale a human exploits.",
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
    check: (o) =>
      voted(o, (vote) => {
        if (vote === "accept") return fail("sold the leader its green completer for $250");
        if (vote === "counter" && aiGives(o, SQ.pennsylvaniaAve) && aiCashIn(o) < 700) {
          return fail(`countered by selling it for $${String(aiCashIn(o))}`);
        }
        return pass(vote);
      }),
  },
  {
    id: "vote-whole-set-handover",
    phase: "late",
    decision: "trade-vote",
    tests:
      "Ported from adversary.ts (set-handover, game 53400q). The AI holds the whole yellow set (two lots mortgaged) and $700; another player offers $550 for all three. Selling a finished monopoly for under its lots' price lost a rule bot the game.",
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
    check: (o) =>
      voted(o, (vote) => {
        if (vote === "accept") return fail("sold the yellow monopoly for $550");
        if (vote === "counter" && aiGives(o, SQ.marvin) && aiCashIn(o) < 1200) {
          return fail(`countered by selling the set for $${String(aiCashIn(o))}`);
        }
        return pass(vote);
      }),
  },

  // --- Turn start: building, mortgages, proposals ----------------------------
  {
    id: "turn-start-build-fresh-monopoly",
    phase: "mid",
    decision: "turn-start",
    tests: "A fresh orange monopoly, $1,000 cash, no rival monopolies. Build now (at least three houses), keeping $100 back.",
    build: (s) => turnStart(withCash(owning(atTurn(table(s), 15), { [AI]: ORANGES }), { [AI]: 1000 })),
    check: (o) =>
      settledOr(o, () => {
        const added = housesAdded(o, ORANGES);
        const state = after(o);
        const cash = state ? cashOf(state, AI) : 0;
        if (added < 3) return fail(`built ${String(added)} houses`);
        if (cash < 100) return fail(`built ${String(added)} houses, leaving $${String(cash)}`);
        return pass(`built ${String(added)}, kept $${String(cash)}`);
      }),
  },
  {
    id: "turn-start-no-build-into-insolvency",
    phase: "late",
    decision: "turn-start",
    tests:
      "Owns the dark blues (houses $200) with $450, on a board with hotels on the oranges and reds ($1,000+ rents). Building two houses leaves $50. Keep at least $150.",
    build: (s) => turnStart(withCash(owning(dangerousBoard(atTurn(table(s), 55)), { [AI]: DARK_BLUES }), { [AI]: 450 })),
    check: (o) =>
      settledOr(o, () => {
        const state = after(o);
        const cash = state ? cashOf(state, AI) : 0;
        return cash >= 150 ? pass(`kept $${String(cash)}`) : fail(`left itself $${String(cash)}`);
      }),
  },
  {
    id: "turn-start-lift-dead-monopoly",
    phase: "mid",
    decision: "turn-start",
    tests: "Owns the whole red set, all mortgaged, with $1,500 on a quiet board. A mortgaged monopoly earns nothing; lifting all three costs about $375.",
    build: (s) => turnStart(mortgaging(owning(atTurn(table(s), 25), { [AI]: REDS }), REDS)),
    check: (o) =>
      settledOr(o, () => {
        const state = after(o);
        const still = state ? REDS.filter((pos) => state.mortgaged[pos]) : REDS;
        return still.length === 0 ? pass("lifted all three") : fail(`${String(still.length)} red lot(s) still mortgaged`);
      }),
  },
  {
    id: "turn-start-propose-completion",
    phase: "mid",
    decision: "turn-start",
    tests:
      "Owns two reds and $1,300; Illinois sits with a cash-poor player ($300) who has no use for it. Propose buying it, with coherent terms: Illinois comes to the AI, cash goes out, and $150 stays back.",
    build: (s) =>
      turnStart(withCash(owning(atTurn(table(s), 20), { [AI]: [SQ.kentucky, SQ.indiana], [OTHER]: [SQ.illinois, SQ.reading] }), { [AI]: 1300, [OTHER]: 300 })),
    check: (o) =>
      settledOr(o, () => {
        const terms = proposedTerms(o);
        if (!terms) return fail("proposed nothing");
        if (terms.propertyTo[SQ.illinois] !== AI) return fail("proposed a trade that doesn't bring Illinois");
        const paid = -(terms.cashDelta[AI] ?? 0);
        if (paid < 0) return fail(`asked to be paid $${String(-paid)} while taking Illinois`);
        if (1300 - paid < 150) return fail(`offered $${String(paid)}, leaving under $150`);
        return pass(`offered $${String(paid)} for Illinois`);
      }),
  },
  {
    id: "turn-start-wallet-xray",
    phase: "mid",
    decision: "turn-start",
    tests:
      "Ported from adversary.ts (wallet-xray). The AI holds New York and is cash-poor ($120); another player with $1,200 holds the other two oranges. Selling the completer for under $600 arms the strongest set cheaply, and asking for exactly the buyer's whole wallet is the tell the probes caught.",
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
    check: (o) =>
      settledOr(o, () => {
        if (!aiGives(o, SQ.newYork)) return pass("didn't offer New York");
        const ask = aiCashIn(o);
        if (ask < 600) return fail(`offered New York for $${String(ask)}`);
        if (ask === 1200) return fail("asked for the buyer's exact wallet");
        return pass(`offered New York for $${String(ask)}`);
      }),
  },

  // --- Debt -----------------------------------------------------------------
  {
    id: "debt-keeps-the-houses",
    phase: "late",
    decision: "settle-debt",
    tests:
      "The AI is $150 short, with three houses on each orange plus Reading Railroad and Water Works. Mortgaging those two raises $175: the houses (its rent engine) stay.",
    build: (s) =>
      inDebt(built(owning(atTurn(table(s), 45), { [AI]: [...ORANGES, SQ.reading, SQ.water] }), { [SQ.stJames]: 3, [SQ.tennessee]: 3, [SQ.newYork]: 3 }), -150),
    check: (o) =>
      settledOr(o, () => {
        const sold = -housesAdded(o, ORANGES);
        return sold === 0 ? pass("kept every house") : fail(`sold ${String(sold)} orange house(s)`);
      }),
  },
  {
    id: "debt-raises-only-what-it-needs",
    phase: "mid",
    decision: "settle-debt",
    tests: "The AI is $40 short and owns two railroads and Boardwalk. One mortgage covers it; mortgaging more costs 10% to lift later. Raise no more than $200.",
    build: (s) => inDebt(owning(atTurn(table(s), 30), { [AI]: [SQ.reading, SQ.pennRR, SQ.boardwalk] }), -40),
    check: (o) =>
      settledOr(o, () => {
        const state = after(o);
        const raised = state ? cashOf(state, AI) + 40 : 0;
        return raised <= 200 ? pass(`raised $${String(raised)}`) : fail(`raised $${String(raised)}`);
      }),
  },

  // --- Jail -----------------------------------------------------------------
  {
    id: "jail-leave-early",
    phase: "early",
    decision: "jail",
    tests: "Turn 3, almost nothing owned or built. Jail costs turns of buying; pay to leave.",
    build: (s) => jailed(atTurn(table(s), 3), 0),
    check: (o) => settledOr(o, () => (did(o, "pay-to-leave-jail") || did(o, "use-jail-card") ? pass("left") : fail("stayed to roll"))),
  },
  {
    id: "jail-use-card-early",
    phase: "early",
    decision: "jail",
    tests: "Early, holding a Get Out of Jail Free card. Leave, by card or by paying.",
    build: (s) => jailed({ ...atTurn(table(s), 5), jailFreeCards: { chance: AI } }, 0),
    check: (o) => settledOr(o, () => (did(o, "pay-to-leave-jail") || did(o, "use-jail-card") ? pass("left") : fail("stayed to roll"))),
  },
  {
    id: "jail-stay-on-hotel-board",
    phase: "late",
    decision: "jail",
    tests: "Late game, hotels on the oranges and reds, nothing of the AI's own to build. Jail is a haven from the rents: roll and stay.",
    build: (s) => jailed(withPlayer(dangerousBoard(atTurn(table(s), 70)), AI, { cash: 400 }), 0),
    check: (o) => settledOr(o, () => (did(o, "pay-to-leave-jail") || did(o, "use-jail-card") ? fail("paid to walk back into the hotels") : pass("stayed"))),
  },
];
