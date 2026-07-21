// The PROBE-LEAKAGE instrument — an automated, deterministic score for a bot's
// HUMAN-FACING EXPLOITABILITY.
//
// The probe fleet (see `/monopoly-probe`, `bots/CLAUDE.md` "The human-counterparty
// model") repeatedly caught the same exploits by hand-playing a game against the
// bots: an ASK price that tracks the human's wallet, an AUCTION bid that completes
// a set into illiquidity, and a distressed fire-sale that arms the leader. Each of
// those is a decision a bot makes on a specific board, so each is MEASURABLE
// without a played game: construct the board, call the candidate's policy directly,
// and read the number off the decision it returns. This module turns "field a
// hand-played probe game" into a pure function.
//
// A scenario builds a `GameState` where a HUMAN seat (`botStrategy: null`) sits
// across from the CANDIDATE version, calls the candidate bot on the seat that makes
// the exploitable decision, and returns a LEAK score (higher = more exploitable).
// Scenario 1 measures the candidate as the seat facing the human; scenarios 2 and 3
// measure the candidate harming ITSELF in a way a human at the table baits (the
// winner's curse and the distress fire-sale) — the human is the exploiter, the
// candidate the measured seat.
//
// Pure and deterministic: it only calls version policies (themselves pure) on
// hand-built states and the pure `rentAt` helper — no RNG draw, no `Math.random`,
// no `Date`. The same label always yields the same report.
import { rentAt } from "../logic";
import type { GameState } from "../types";
import { freshGame } from "../mocks";
import type { Bot, BotDecision } from "./decision";
import { versionBot } from "./versions";

// --- board positions (see `data.ts` SPACES) --------------------------------
const MEDITERRANEAN = 1;
const ST_JAMES = 16;
const TENNESSEE = 18;
const NEW_YORK = 19;
const ORIENTAL = 6;
const VERMONT = 8;
const CONNECTICUT = 9;
const PACIFIC = 31;
const NORTH_CAROLINA = 32;
const PENNSYLVANIA_AVE = 34;
const KENTUCKY = 21;
const INDIANA = 23;
const ILLINOIS = 24;
const BOARDWALK = 39;

const HUMAN = "p1";
const CAND = "p2";

/** The candidate's policy, resolved once per report. */
type Resolve = (state: GameState, seat: string) => BotDecision | null;

// --- shared measurement helpers --------------------------------------------

/** The dollar rent a seat would owe landing on `pos` right now, mirroring the
 *  bots' own `rentEstimateAt` (utility multiplier valued at ×7). Used to size the
 *  auction reserve and to confirm a distressed board. */
function rentEstimate(state: GameState, pos: number): number {
  const display = rentAt(state, pos);
  if (!display) return 0;
  return display.kind === "dollars" ? display.amount : display.multiplier * 7;
}

/** The worst single rent `seat` faces across every lot it does not own — the
 *  "big hit" the bots reserve liquidity against. */
function worstHitFacing(state: GameState, seat: string): number {
  let worst = 0;
  for (const posStr in state.ownership) {
    if (state.ownership[posStr] === seat) continue;
    worst = Math.max(worst, rentEstimate(state, Number(posStr)));
  }
  return worst;
}

// ---------------------------------------------------------------------------
// Scenario 1 — WALLET X-RAY
//
// The candidate holds the orange completer the HUMAN is one short of, and is
// cash-poor (so it cannot fund BUYING the human's two lots — the sale of its
// completer is the only trade it can build; it still RECEIVES cash on a sale).
// A leaky bot prices that sale at `min(human.cash, surplus − margin)` — so its ask
// walks straight up with the human's wallet (the corpus's wallet-peg tell).
// fable-v8 leaks; fable-v11/v12 turn the ask off against a human (`humanAskOff`),
// so nothing is constructed and the ask is 0 at every wallet.
//
// Measured by driving the candidate's `trade-building` intermission from an empty
// draft: the policy returns the ask it wants as an `update-trade-draft`, and the
// cash flowing TO the candidate is the ask. Both wallets sit below the fixed
// completion surplus (~$1383 here), so a leaky ask tracks the wallet dollar-for-
// dollar and the leak is the wallet gap; a fixed ask (or none) scores ~0.
// ---------------------------------------------------------------------------
const WALLET_LOW = 800;
const WALLET_HIGH = 1200;

function walletXrayBoard(humanCash: number): GameState {
  const base = freshGame("adversary-wallet", undefined, 4);
  return {
    ...base,
    // Candidate = cash-poor seller holding the orange completer (New York) + a
    // lone mortgaged brown; human = the one-short buyer holding the other two
    // oranges. Mirrors the corpus extraction geometry (fable-v11 policy.test).
    ownership: { [NEW_YORK]: CAND, [MEDITERRANEAN]: CAND, [ST_JAMES]: HUMAN, [TENNESSEE]: HUMAN },
    mortgaged: { [MEDITERRANEAN]: true },
    players: base.players.map((q) => {
      if (q.id === HUMAN) return { ...q, cash: humanCash, botStrategy: null };
      if (q.id === CAND) return { ...q, cash: 120 };
      return { ...q, cash: 1200 };
    }),
    turn: {
      ...base.turn,
      playerId: CAND,
      phase: "trade-building",
      tradeDraft: { proposerId: CAND, propertyTo: {}, gojfTo: {}, cashDelta: {} },
    },
  };
}

/** The cash the candidate asks the human for in its constructed sale (0 if it
 *  constructs no ask, or a trade that costs it cash). */
function askToHuman(bot: Resolve, humanCash: number): number {
  const decision = bot(walletXrayBoard(humanCash), CAND);
  if (decision && decision.intent.kind === "update-trade-draft") {
    return Math.max(0, decision.intent.terms.cashDelta[CAND] ?? 0);
  }
  return 0;
}

function walletXray(bot: Resolve): { leak: number; detail: string } {
  const low = askToHuman(bot, WALLET_LOW);
  const high = askToHuman(bot, WALLET_HIGH);
  return {
    leak: Math.max(0, high - low),
    detail: `ask@$${WALLET_LOW.toString()}=$${low.toString()}, ask@$${WALLET_HIGH.toString()}=$${high.toString()}`,
  };
}

// ---------------------------------------------------------------------------
// Scenario 2 — COMPLETE-INTO-ILLIQUIDITY (auction)
//
// The candidate is one lot short of light-blue; the completer (Connecticut) is on
// the block, and the candidate's set-mates carry the mortgageable equity the F6
// liquid cap counts — so bidding to that cap wins the lot only by mortgaging the
// very set it is completing. A human baits this by bidding face+ε. Reserve line =
// cash − TAIL_FRAC × worst board hit (fable-v14's `auctionTailFrac` reserve). Leak
// = how far past the reserve line the candidate bids. fable-v8/v12 bid past it;
// fable-v14 caps at the reserve (drops), so leak ~0.
// ---------------------------------------------------------------------------
const AUCTION_TAIL_FRAC = 0.25;
const AUCTION_CASH = 300;
const AUCTION_HIGH_BID = 100;

function completerAuctionBoard(): GameState {
  const base = freshGame("adversary-auction", undefined, 4);
  return {
    ...base,
    ownership: {
      [ORIENTAL]: CAND,
      [VERMONT]: CAND,
      [ST_JAMES]: HUMAN,
      [TENNESSEE]: HUMAN,
      [NEW_YORK]: HUMAN,
    },
    houses: { [NEW_YORK]: 5 },
    players: base.players.map((q) => {
      if (q.id === CAND) return { ...q, cash: AUCTION_CASH };
      if (q.id === HUMAN) return { ...q, botStrategy: null };
      return q;
    }),
    turn: {
      ...base.turn,
      phase: "auction",
      auction: {
        position: CONNECTICUT,
        active: [CAND, HUMAN],
        highBid: AUCTION_HIGH_BID,
        leaderId: HUMAN,
        bids: { [HUMAN]: AUCTION_HIGH_BID },
        resume: { kind: "landing" },
      },
    },
  };
}

function completeIntoIlliquidity(bot: Resolve): { leak: number; detail: string } {
  const state = completerAuctionBoard();
  const reserveLine = AUCTION_CASH - Math.round(AUCTION_TAIL_FRAC * worstHitFacing(state, CAND));
  const decision = bot(state, CAND);
  const bid = decision && decision.intent.kind === "bid" ? decision.intent.amount : 0;
  return {
    leak: Math.max(0, bid - reserveLine),
    detail: `bid=$${bid.toString()}, reserve line=$${reserveLine.toString()}`,
  };
}

// ---------------------------------------------------------------------------
// Scenario 3 — F7 DISTRESS FIRE-SALE
//
// The candidate is distressed (facing a big hit, thin on cash) but still
// competitive (equity vs the leader in the 0.2–0.7 band), and holds the leader's
// completer. The leader proposes buying it BELOW book. A leaky bot's survival
// credit overwhelms the rival-threat charge and it ACCEPTS — arming the leader for
// spendable-on-nothing cash. Leak = book − accepted price; a decline scores 0.
// The equity ramp (F7 comeback equity) softens this but does not zero it.
// ---------------------------------------------------------------------------
const PENN_BOOK = 320;
const FIRE_SALE_PRICE = 250;

function fireSaleBoard(price: number): GameState {
  const base = freshGame("adversary-firesale", undefined, 4);
  const pending = {
    id: "t-fire",
    proposerId: "p4",
    propertyTo: { [PENNSYLVANIA_AVE]: "p4" },
    gojfTo: {},
    cashDelta: { [CAND]: price, p4: -price },
    approvals: { [CAND]: false, p4: true },
  };
  return {
    ...base,
    ownership: {
      // Candidate (p2): the leader's green completer + a lone mortgaged blue to
      // lift its position value into the competitive band without adding liquidity.
      [PENNSYLVANIA_AVE]: CAND,
      [BOARDWALK]: CAND,
      // Leader (p4): two greens (one short) + a red monopoly with hotels — the
      // hotels are the big board hit that distresses the candidate.
      [PACIFIC]: "p4",
      [NORTH_CAROLINA]: "p4",
      [KENTUCKY]: "p4",
      [INDIANA]: "p4",
      [ILLINOIS]: "p4",
    },
    mortgaged: { [BOARDWALK]: true },
    houses: { [KENTUCKY]: 5, [INDIANA]: 5, [ILLINOIS]: 5 },
    players: base.players.map((q) => {
      if (q.id === CAND) return { ...q, cash: 90 };
      if (q.id === "p4") return { ...q, cash: 300 };
      if (q.id === HUMAN) return { ...q, cash: 100, botStrategy: null };
      return { ...q, cash: 100 };
    }),
    turn: { ...base.turn, phase: "trade-pending", pendingTrade: pending },
  };
}

function distressFireSale(bot: Resolve): { leak: number; detail: string } {
  const decision = bot(fireSaleBoard(FIRE_SALE_PRICE), CAND);
  const accepted = decision?.intent.kind === "accept-trade";
  return {
    leak: accepted ? PENN_BOOK - FIRE_SALE_PRICE : 0,
    detail: accepted
      ? `ACCEPTED $${FIRE_SALE_PRICE.toString()} for a $${PENN_BOOK.toString()} completer (arms the leader)`
      : `declined the $${FIRE_SALE_PRICE.toString()} below-book sale`,
  };
}

// ---------------------------------------------------------------------------
// SET HANDOVER — a HUMAN buys a COMPLETE monopoly outright for cash.
//
// Reproduces game 53400q T59: a fable-v12 seat accepted a human's $550 for the
// whole yellow set ("the cash outweighs the monopoly I'm handing over"), and the
// human developed it into $5,850 of rent and the win. The threat charge DID fire
// (`humanThreatMult` applies — the recipient is `botStrategy === null`), it was
// just far too small: `rivalThreatCost` scales with `monopolyBonus(color)`, and
// the ES tuned `monoMultYellow/Green/DarkBlue` to the 0.3 FLOOR because those
// sets are weak in SELF-PLAY. Doubling a floor is still a floor — so the three
// sets a human converts best are the cheapest to buy off a bot.
//
// Distinct from `distress-firesale`: that scenario is a DISTRESSED seat selling a
// single completer below book. Here the seat is HEALTHY, the price is ABOVE book
// ($550 vs $520 unmortgaged), and it still hands over a finished monopoly — so it
// isolates the threat-PRICING gap rather than the survival-credit one.
const ATLANTIC = 26;
const VENTNOR = 27;
const MARVIN = 29;
/** Sum of the yellow lots' printed prices — the "book" the handover clears above. */
const YELLOW_BOOK = 800;
const HANDOVER_PRICE = 550;

function setHandoverBoard(price: number): GameState {
  const base = freshGame("adversary-handover", undefined, 4);
  const pending = {
    id: "t-handover",
    proposerId: HUMAN,
    propertyTo: { [ATLANTIC]: HUMAN, [VENTNOR]: HUMAN, [MARVIN]: HUMAN },
    gojfTo: {},
    cashDelta: { [CAND]: price, [HUMAN]: -price },
    approvals: { [CAND]: false, [HUMAN]: true },
  };
  return {
    ...base,
    ownership: {
      // Candidate (p2): the complete yellow set, undeveloped, plus a rail for
      // position value. Nothing is mortgaged and cash is healthy, so neither the
      // survival credit nor a distress discount can explain an accept.
      [ATLANTIC]: CAND,
      [VENTNOR]: CAND,
      [MARVIN]: CAND,
      [ST_JAMES]: CAND,
      // The human (p1) owns nothing in yellow — they are buying the whole set.
      [ORIENTAL]: HUMAN,
    },
    // Two of the three lots are MORTGAGED, exactly as in 53400q T59 (the seat had
    // acquired them still-mortgaged at T48). This is load-bearing: `assetBase`
    // halves a mortgaged lot, so the set is cheap to GIVE UP while the recipient
    // can simply unmortgage and develop — which is what the human did at T63.
    mortgaged: { [ATLANTIC]: true, [VENTNOR]: true },
    houses: {},
    players: base.players.map((q) => {
      if (q.id === CAND) return { ...q, cash: 700 };
      if (q.id === HUMAN) return { ...q, cash: 1200, botStrategy: null };
      return { ...q, cash: 400 };
    }),
    turn: { ...base.turn, phase: "trade-pending", pendingTrade: pending },
  };
}

function humanSetHandover(bot: Resolve): { leak: number; detail: string } {
  const decision = bot(setHandoverBoard(HANDOVER_PRICE), CAND);
  const accepted = decision?.intent.kind === "accept-trade";
  return {
    // A finished monopoly is worth far more than its lots' book; charging the
    // shortfall against book is the CONSERVATIVE floor on what the handover cost.
    leak: accepted ? YELLOW_BOOK - HANDOVER_PRICE : 0,
    detail: accepted
      ? `ACCEPTED $${HANDOVER_PRICE.toString()} for a complete yellow monopoly ($${YELLOW_BOOK.toString()} book) from a HUMAN`
      : `declined the $${HANDOVER_PRICE.toString()} whole-set handover`,
  };
}

// ---------------------------------------------------------------------------

export interface ScenarioLeak {
  name: string;
  leak: number;
  detail: string;
}

export interface LeakageReport {
  scenarios: ScenarioLeak[];
  total: number;
}

const SCENARIOS: { name: string; run: (bot: Resolve) => { leak: number; detail: string } }[] = [
  { name: "wallet-xray", run: walletXray },
  { name: "auction-illiquidity", run: completeIntoIlliquidity },
  { name: "distress-firesale", run: distressFireSale },
  { name: "set-handover", run: humanSetHandover },
];

/** The human-facing leakage report for one version label: a leak score per
 *  scenario (higher = more exploitable) and their total. Deterministic. */
export function probeLeakage(label: string): LeakageReport {
  const bot: Bot = versionBot(label);
  const resolve: Resolve = (state, seat) => bot(state, seat);
  const scenarios = SCENARIOS.map(({ name, run }) => {
    const { leak, detail } = run(resolve);
    return { name, leak, detail };
  });
  const total = scenarios.reduce((sum, s) => sum + s.leak, 0);
  return { scenarios, total };
}

/** The scenario names, in report order — for a scoreboard header. */
export const SCENARIO_NAMES: readonly string[] = SCENARIOS.map((s) => s.name);
