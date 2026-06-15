import { shuffleArray } from "@/shared/lib/utils";
import { CHANCE, COMMUNITY_CHEST, deckFor, SPACES } from "./data";
import {
  buildingsBlockingMortgage,
  developmentLevel,
  maxBuildingSaleValue,
  planDevelopment,
} from "./development";
import {
  heldJailCard,
  mortgageInterestAt,
  mortgageValueAt,
  ownablePrice,
  rentAt,
  rentDue,
  unmortgageCostAt,
} from "./logic";
import type {
  ApplyResult,
  AuctionResume,
  AuctionState,
  Card,
  CardSource,
  GameEvent,
  GameState,
  Intent,
  PendingTrade,
  Player,
  RaiseCashResume,
  TradeTerms,
  TurnGroup,
  TurnState,
} from "./types";

/** Salary paid to a player whose move passes (or lands on) GO. */
const PASS_GO_SALARY = 200;

/** Fixed fee to buy out of jail (official $50). Charged to the bank on a
 *  voluntary `pay-to-leave-jail` and on the forced exit after a failed third
 *  jail roll. Exported so the bot policy and the jail prompt share the value. */
export const JAIL_FEE = 50;

/** The Jail cell a jailed token sits on, derived from the static board so the
 *  jail logic never hardcodes the index. */
const JAIL_POSITION = SPACES.findIndex((s) => s.kind === "jail");

/** Random number source for the engine. Every roll, deck shuffle, and
 *  card draw goes through this; `Math.random` may not be called directly
 *  from engine code. See `monopoly/CLAUDE.md` "RNG: always injected."
 *
 *  `getState()` returns the current internal state — a value that can be
 *  passed back to `createRng` to resume the same stream. This is how the
 *  RNG round-trips through `GameState.rngState`, which is what makes a
 *  serialized game state alone sufficient to keep play deterministic
 *  across reloads, devices, or host hand-offs. */
export interface Rng {
  /** Next uniform value in [0, 1). */
  next(): number;
  /** Current internal state; passing this back to `createRng` resumes
   *  the same stream of values. */
  getState(): number;
}

/** Construct an RNG from either a string seed (for new games) or a
 *  numeric state (to resume a stream). String seeds are hashed with xmur3
 *  into a 32-bit mulberry32 state; numeric input is used directly so
 *  `createRng(prev.getState())` continues exactly where `prev` left off.
 *
 *  Implementation references:
 *  - xmur3 + mulberry32 from https://stackoverflow.com/a/47593316
 *  - Both are tiny, deterministic, dependency-free. JavaScript intentionally
 *    does not let you seed `Math.random`, so any engine that needs
 *    reproducibility brings its own. */
export function createRng(seedOrState: string | number): Rng {
  let state: number;
  if (typeof seedOrState === "number") {
    state = seedOrState >>> 0;
  } else {
    let h = 1779033703 ^ seedOrState.length;
    for (let i = 0; i < seedOrState.length; i++) {
      h = Math.imul(h ^ seedOrState.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    state = (h ^ (h >>> 16)) >>> 0;
  }
  return {
    next: () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    getState: () => state >>> 0,
  };
}

/** Freshly shuffled draw piles for both decks, advancing `rng`. Called once
 *  when a game is seeded so each game gets a deterministic, seed-dependent
 *  order. The piles are index lists into the static decks; the shared
 *  Fisher–Yates shuffle is fed the injected RNG so it stays reproducible.
 *  Exported for the seeds (`freshGame`, `createLobby`). */
export function initialDecks(rng: Rng): {
  chance: number[];
  communityChest: number[];
} {
  const next = () => rng.next();
  return {
    chance: shuffleArray(CHANCE.map((_, i) => i), next),
    communityChest: shuffleArray(COMMUNITY_CHEST.map((_, i) => i), next),
  };
}

/** Apply a single external intent. On success the caller should then run
 *  `autoStep` to drain mechanics until the next decision point.
 *
 *  Wired so far: `buy`, `decline-buy`, the `bid` / `pass-bid` auction sub-game,
 *  `manage`, `mortgage`, the trade sub-game, `set-queue`, `cancel-manage`,
 *  the jail decisions (`pay-to-leave-jail`, `use-jail-card`), `end-turn`. The
 *  surface deliberately stays small per `monopoly/CLAUDE.md`. No RNG argument —
 *  these are deterministic; engine functions that need randomness read it out of
 *  `state.rngState` themselves. */
export function apply(state: GameState, intent: Intent): ApplyResult {
  if (intent.kind === "buy") return applyBuy(state, intent);
  if (intent.kind === "decline-buy") return applyDeclineBuy(state, intent);
  if (intent.kind === "bid") return applyBid(state, intent);
  if (intent.kind === "pass-bid") return applyPassBid(state, intent);
  if (intent.kind === "manage") return applyManage(state, intent);
  if (intent.kind === "mortgage") return applyMortgage(state, intent);
  if (intent.kind === "set-queue") return applySetQueue(state, intent);
  if (intent.kind === "cancel-manage") return applyCancelManage(state, intent);
  if (intent.kind === "update-manage-staging") {
    return applyUpdateManageStaging(state, intent);
  }
  if (intent.kind === "update-trade-draft") {
    return applyUpdateTradeDraft(state, intent);
  }
  if (intent.kind === "cancel-trade") return applyCancelTrade(state, intent);
  if (intent.kind === "propose-trade") return applyProposeTrade(state, intent);
  if (intent.kind === "accept-trade") return applyAcceptTrade(state, intent);
  if (intent.kind === "decline-trade") return applyDeclineTrade(state, intent);
  if (intent.kind === "pay-to-leave-jail") {
    return applyPayToLeaveJail(state, intent);
  }
  if (intent.kind === "use-jail-card") return applyUseJailCard(state, intent);
  // `end-turn` is the only kind left; an unconditional return keeps the dispatch
  // exhaustive — a new Intent kind makes this `applyEndTurn` call fail to type.
  return applyEndTurn(state, intent);
}

/** The next turn block when control passes to `nextPlayerId` at a fresh
 *  pre-roll. Centralized so every path into pre-roll (end-turn today; future
 *  three-doubles bust-out, jail-release, etc.) builds it identically. */
function enterPreRoll(nextPlayerId: string): TurnState {
  return {
    playerId: nextPlayerId,
    phase: "pre-roll",
    doublesStreak: 0,
  };
}

/** The next turn block for the active player landing at post-roll. Also clears
 *  any `pendingBuy` from a just-resolved buy-decision so the post-roll state
 *  doesn't carry stale data.
 *
 *  Centralized so every path into post-roll (`autoStep` after a no-op landing,
 *  `applyBuy`, `applyDeclineBuy`, future rent/tax/card paths) is identical. */
function enterPostRoll(state: GameState): TurnState {
  return {
    ...state.turn,
    phase: "post-roll",
    pendingBuy: undefined,
    raiseCash: undefined,
  };
}

/** Decide where the active player goes once a landing is fully resolved.
 *  Rolling doubles grants another roll (back to pre-roll, same player, streak
 *  kept) — but only up to two: a third consecutive double would jail the
 *  player, which isn't built yet, so the turn ends normally through post-roll
 *  rather than granting a fourth roll. A non-double settles into post-roll.
 *  Centralized so every resolution path (autoStep's default landing,
 *  applyBuy, applyDeclineBuy) handles doubles identically. */
function afterLanding(state: GameState): GameState {
  const streak = state.turn.doublesStreak;
  if (streak === 1 || streak === 2) {
    // Rolled doubles: same player rolls again. Keep the streak.
    const turn: TurnState = {
      ...state.turn,
      phase: "pre-roll",
      pendingBuy: undefined,
    };
    return { ...state, turn };
  }
  return { ...state, turn: enterPostRoll(state) };
}

/** Hand control to the next non-bankrupt player in seating order: open a
 *  new TurnGroup for them and route through `enterPreRoll`. Used by
 *  `applyEndTurn` and by `autoStep` when a player busts mid-turn. Assumes at
 *  least one non-bankrupt player exists — the winner check in `goBankrupt`
 *  flips the phase to `game-over` before this can be reached otherwise. */
function advanceToNextPlayer(
  state: GameState,
  currentPlayerId: string,
): GameState {
  const currentIdx = state.players.findIndex((p) => p.id === currentPlayerId);
  for (let offset = 1; offset <= state.players.length; offset++) {
    const idx = (currentIdx + offset) % state.players.length;
    const candidate = state.players[idx];
    if (candidate.bankrupt) continue;
    const lastTurn = state.turns[state.turns.length - 1];
    const nextTurnGroup: TurnGroup = {
      turn: lastTurn.turn + 1,
      playerId: candidate.id,
      events: [],
    };
    return {
      ...state,
      turns: [...state.turns, nextTurnGroup],
      turn: enterPreRoll(candidate.id),
    };
  }
  return state;
}

/** Maximum cash a player could raise right now by liquidating everything:
 *  selling every building back at half price AND mortgaging every un-mortgaged
 *  ownable. Used to decide between the must-raise-cash path (player CAN cover
 *  the debt) and immediate bankruptcy (they couldn't even after liquidating).
 *
 *  A built property counts its mortgage value too — buildings block mortgaging,
 *  but they'd be sold first, so the bare lot is still mortgageable. The two
 *  sources are additive: half the buildings (`maxBuildingSaleValue`) plus half
 *  the printed price of every unmortgaged ownable. */
function maxRaisableCash(state: GameState, ownerId: string): number {
  let total = maxBuildingSaleValue(state, ownerId);
  for (const [posStr, oid] of Object.entries(state.ownership)) {
    if (oid !== ownerId) continue;
    const pos = Number(posStr);
    if (state.mortgaged[pos]) continue;
    const value = mortgageValueAt(pos);
    if (value !== null) total += value;
  }
  return total;
}

/** The first player (in seat order) whose cash is below zero, or null if
 *  everyone is in the black. This IS the current debtor during
 *  `must-raise-cash`: a charge is applied immediately — cash can go negative —
 *  and whoever is most-negative-in-seat-order must climb back to ≥ 0 before
 *  the next debtor (or play) continues. Seat order makes multi-debtor trade
 *  settlements deterministic. */
export function firstNegativePlayer(state: GameState): string | null {
  for (const p of state.players) {
    if (p.cash < 0) return p.id;
  }
  return null;
}

/** After a charge has moved cash (and possibly pushed someone below zero),
 *  decide what happens next:
 *
 *  - Someone is in the red → park in `must-raise-cash`, remembering where to
 *    `resume` once everyone is back to ≥ 0. The debtor(s) settle by
 *    mortgaging (later: selling buildings) through `applyMortgage`.
 *  - Nobody is in the red → resume immediately: `after-landing` continues the
 *    active player's landing (doubles re-roll / post-roll); `pre-roll` returns
 *    to the boundary, where the next `autoStep` re-checks the trade queue.
 *
 *  The same helper serves rent (`after-landing`) and trade settlement
 *  (`pre-roll`), which is the whole point of unifying the debt model. */
function settleOrRaise(state: GameState, resume: RaiseCashResume): GameState {
  if (firstNegativePlayer(state) !== null) {
    return {
      ...state,
      turn: {
        ...state.turn,
        phase: "must-raise-cash",
        raiseCash: resume,
        pendingBuy: undefined,
        // Seed empty staging fresh on every (re-)entry so a prior debtor's
        // staged maps never leak into the next debtor's broadcast view.
        manageStaged: { build: {}, mortgage: {} },
        tradeDraft: undefined,
        pendingTrade: undefined,
      },
    };
  }
  const cleared: GameState = {
    ...state,
    turn: { ...state.turn, raiseCash: undefined, manageStaged: undefined },
  };
  if (resume === "after-landing") return afterLanding(cleared);
  return {
    ...cleared,
    turn: {
      ...cleared.turn,
      phase: "pre-roll",
      managerId: undefined,
      pendingBuy: undefined,
      tradeDraft: undefined,
      pendingTrade: undefined,
    },
  };
}

/** Charge `payerId` an `amount` owed to `creditorId` — a **player** (rent) or
 *  the **bank** (`creditorId === null`, e.g. tax). `event` is the already-built
 *  log entry for the charge (`rent` / `tax`). Two branches:
 *
 *  1. Cash + raisable < amount: they can't cover it even after mortgaging
 *     everything. Transfer whatever cash they have (to a player creditor; the
 *     bank keeps nothing), log the FULL debt (so the log reads "owed $1100 →
 *     bust → estate to Jordan"), bust to the creditor, and hand control onward
 *     (or end at game-over).
 *  2. Otherwise: deduct the amount immediately — cash may go negative — log it,
 *     then `settleOrRaise`. If they had the cash, play continues at once; if
 *     not, they drop into `must-raise-cash` and mortgage back to ≥ 0. The log
 *     reads "rent −$500 (now in the red), mortgage A, mortgage B".
 *
 *  This is the unified debt path: a debtor who CAN recover always does so by
 *  going negative then raising, never by deferring the payment. */
function chargeToCreditor(
  state: GameState,
  payerId: string,
  creditorId: string | null,
  amount: number,
  event: GameEvent,
): { state: GameState; newEvents: readonly GameEvent[] } {
  const payerIdx = state.players.findIndex((p) => p.id === payerId);
  const payer = state.players[payerIdx];

  // Can't cover even after mortgaging everything: partial transfer + bust.
  if (payer.cash + maxRaisableCash(state, payerId) < amount) {
    const players = state.players.map((p, i) => {
      if (i === payerIdx) return { ...p, cash: 0 };
      if (creditorId !== null && p.id === creditorId) {
        return { ...p, cash: p.cash + payer.cash };
      }
      return p;
    });
    const turns = appendEventToActiveTurn(state.turns, event);
    const bust = goBankrupt({ ...state, players, turns }, payerId, creditorId);
    // Hand control onward unless the bust already sequenced what's next (the
    // game ended, or a bank estate auction is now under way). The debtor's turn
    // is over, so advance — then settle, since inheriting a mortgaged lot can
    // leave the (off-turn) creditor owing 10% interest they must raise.
    const resolved = bustSequenced(bust.state)
      ? bust.state
      : settleOrRaise(advanceToNextPlayer(bust.state, payerId), "pre-roll");
    return { state: resolved, newEvents: [event, ...bust.newEvents] };
  }

  // Pay now (cash may dip below zero), log it, then settle or raise.
  const players = state.players.map((p, i) => {
    if (i === payerIdx) return { ...p, cash: p.cash - amount };
    if (creditorId !== null && p.id === creditorId) {
      return { ...p, cash: p.cash + amount };
    }
    return p;
  });
  const turns = appendEventToActiveTurn(state.turns, event);
  const charged: GameState = { ...state, players, turns };
  return {
    state: settleOrRaise(charged, "after-landing"),
    newEvents: [event],
  };
}

/** Charge the active player rent for landing on `position`, paid to its owner. */
function chargeRent(
  state: GameState,
  payerId: string,
  recipientId: string,
  position: number,
  rentAmount: number,
): { state: GameState; newEvents: readonly GameEvent[] } {
  const rentEvent: GameEvent = {
    kind: "rent",
    ownerId: recipientId,
    position,
    amount: rentAmount,
  };
  return chargeToCreditor(state, payerId, recipientId, rentAmount, rentEvent);
}

/** Settle a player's estate when they go bankrupt. Two creditors:
 *
 *  - A **player** creditor (`creditorId` set, the usual rent / fee bust): the
 *    debtor's bare lots and Get-Out-of-Jail-Free cards flow to that creditor.
 *    Per official rules, buildings are first sold back to the bank at half price
 *    and that cash goes to the creditor, and the creditor owes the bank 10%
 *    interest on each still-mortgaged lot they inherit (same as a trade) — which
 *    can, rarely, push the creditor into the red, so the caller settles.
 *  - The **bank** (`creditorId === null`, e.g. an unpayable tax / jail fine):
 *    buildings go back to the bank and each bare lot is auctioned to the highest
 *    bidder (official rule). Held GOJF cards return to their decks.
 *
 *  The debtor's remaining cash already moved in the charge path, so this just
 *  zeroes whatever remains. Emits a `bankrupt` event, and a `winner` event +
 *  game-over phase transition if exactly one non-bankrupt player remains (in
 *  which case the estate is moot and simply freed — no auction).
 *
 *  When a bank estate IS auctioned, this returns a state already in the
 *  `auction` phase: the caller must NOT advance the turn over it (see
 *  `bustSequenced`). The per-lot auctions resolve through `resumeEstate`, which
 *  hands control onward once the estate is exhausted. */
function goBankrupt(
  state: GameState,
  debtorId: string,
  creditorId: string | null,
): { state: GameState; newEvents: readonly GameEvent[] } {
  const debtorIdx = state.players.findIndex((p) => p.id === debtorId);
  const debtorLots = Object.entries(state.ownership)
    .filter(([, ownerId]) => ownerId === debtorId)
    .map(([posStr]) => Number(posStr));

  // A player creditor inherits bare lots: every building is sold back to the
  // bank at half price with that cash going to the creditor, and the creditor
  // owes the bank 10% interest on each still-mortgaged lot (official rule, same
  // as a trade). The debtor's remaining cash already moved in the charge path.
  const buildingRefund =
    creditorId !== null ? maxBuildingSaleValue(state, debtorId) : 0;
  const inheritedInterest =
    creditorId !== null
      ? debtorLots.reduce(
          (sum, pos) =>
            sum + (state.mortgaged[pos] ? (mortgageInterestAt(pos) ?? 0) : 0),
          0,
        )
      : 0;
  const creditorNet = buildingRefund - inheritedInterest;
  const players = state.players.map((p, i) => {
    if (i === debtorIdx) return { ...p, cash: 0, bankrupt: true };
    if (creditorId !== null && p.id === creditorId && creditorNet !== 0) {
      return { ...p, cash: p.cash + creditorNet };
    }
    return p;
  });

  const gameOver = players.filter((p) => !p.bankrupt).length === 1;
  // Auction the estate only when it's a bank bust, the game continues, and
  // there's actually something to sell. Otherwise the estate is freed clean.
  const willAuction = creditorId === null && !gameOver && debtorLots.length > 0;

  const ownership: Record<number, string> = {};
  const houses = { ...state.houses };
  const mortgaged = { ...state.mortgaged };
  for (const [posStr, ownerId] of Object.entries(state.ownership)) {
    const pos = Number(posStr);
    if (ownerId !== debtorId) {
      ownership[pos] = ownerId;
    } else if (creditorId !== null) {
      // To a player creditor: the bare lot transfers (buildings sold back above)
      // keeping its mortgage status; the 10% interest was charged above.
      ownership[pos] = creditorId;
      delete houses[pos];
    } else {
      // To the bank: buildings always go back. A lot bound for auction stays
      // unowned for now (the auction assigns it) and keeps its mortgage flag so
      // the winner owes the 10% interest; an un-auctioned lot reverts clean.
      delete houses[pos];
      if (!willAuction) delete mortgaged[pos];
    }
  }

  // A held GOJF flows to a player creditor, or returns to its deck bottom when
  // the estate reverts to the bank.
  const jailFreeCards = { ...state.jailFreeCards };
  const decks = {
    chance: [...state.decks.chance],
    communityChest: [...state.decks.communityChest],
  };
  for (const src of ["chance", "communityChest"] as const) {
    if (jailFreeCards[src] !== debtorId) continue;
    if (creditorId !== null) {
      jailFreeCards[src] = creditorId;
    } else {
      delete jailFreeCards[src];
      decks[src] = [...decks[src], gojfIndex(src)];
    }
  }

  const bankruptEvent: GameEvent = { kind: "bankrupt", creditorId };
  let turns = appendEventToActiveTurn(state.turns, bankruptEvent);
  const newEvents: GameEvent[] = [bankruptEvent];
  let next: GameState = {
    ...state,
    players,
    ownership,
    houses,
    mortgaged,
    jailFreeCards,
    decks,
    turns,
  };

  // Winner check: exactly one survivor means the game is over.
  if (gameOver) {
    const winnerId = players.find((p) => !p.bankrupt)?.id;
    if (winnerId !== undefined) {
      const winnerEvent: GameEvent = { kind: "winner", winnerId };
      turns = appendEventToActiveTurn(next.turns, winnerEvent);
      newEvents.push(winnerEvent);
      next = {
        ...next,
        status: "finished",
        turns,
        turn: { ...next.turn, phase: "game-over" },
      };
    }
  } else if (willAuction) {
    const [first, ...rest] = debtorLots.sort((a, b) => a - b);
    next = enterAuction(next, first, {
      kind: "bank-estate",
      debtorId,
      remaining: rest,
    });
  }

  return { state: next, newEvents };
}

/** True once a bust has already sequenced what comes next on its own — the game
 *  ended, or a bank-estate auction is now in progress — so the caller must not
 *  advance the turn over the top of it. */
function bustSequenced(state: GameState): boolean {
  return state.turn.phase === "game-over" || state.turn.phase === "auction";
}

function applyBuy(
  state: GameState,
  intent: Extract<Intent, { kind: "buy" }>,
): ApplyResult {
  if (intent.playerId !== state.turn.playerId) {
    return { ok: false, reason: "not your turn" };
  }
  if (state.turn.phase !== "buy-decision") {
    return { ok: false, reason: `cannot buy in phase ${state.turn.phase}` };
  }
  const position = state.turn.pendingBuy;
  if (position === undefined) {
    return { ok: false, reason: "no pending buy" };
  }
  const price = ownablePrice(position);
  if (price === null) {
    return { ok: false, reason: "not an ownable space" };
  }
  const playerIdx = state.players.findIndex((p) => p.id === intent.playerId);
  const player = state.players[playerIdx];
  if (player.cash < price) {
    return { ok: false, reason: "insufficient cash" };
  }

  const updatedPlayer: Player = { ...player, cash: player.cash - price };
  const players = state.players.map((p, i) =>
    i === playerIdx ? updatedPlayer : p,
  );
  const ownership = { ...state.ownership, [position]: intent.playerId };
  const buyEvent: GameEvent = { kind: "buy", position, price };
  const turns = appendEventToActiveTurn(state.turns, buyEvent);
  const afterPurchase: GameState = {
    ...state,
    players,
    ownership,
    turns,
  };
  return {
    ok: true,
    state: afterLanding(afterPurchase),
    newEvents: [buyEvent],
  };
}

function applyDeclineBuy(
  state: GameState,
  intent: Extract<Intent, { kind: "decline-buy" }>,
): ApplyResult {
  if (intent.playerId !== state.turn.playerId) {
    return { ok: false, reason: "not your turn" };
  }
  if (state.turn.phase !== "buy-decision") {
    return {
      ok: false,
      reason: `cannot decline-buy in phase ${state.turn.phase}`,
    };
  }
  const position = state.turn.pendingBuy;
  if (position === undefined) {
    return { ok: false, reason: "no pending buy" };
  }
  // Declining sends the property to auction (official rule). The decliner is
  // still eligible to bid. The auction resumes the active player's landing when
  // it resolves (`landing`).
  return {
    ok: true,
    state: enterAuction(state, position, { kind: "landing" }),
    newEvents: [],
  };
}

// ---------------------------------------------------------------------------
// Auctions. One shared sub-game, entered from two triggers: a landed-on
// property the active player declined (`applyDeclineBuy`), and each lot of a
// player's estate when they go bankrupt to the bank (`goBankrupt`). Open-outcry,
// no turn order: any still-in player may `bid` (raise the high by one +$10
// increment, computed at apply time) at any moment — including the standing
// leader, to jam the price up — or `pass-bid` to drop out for good. The leader
// can't drop (no retracting a winning bid). The auction resolves once every
// non-leader has dropped (the leader wins), or everyone drops without a bid (the
// lot reverts to the bank). The `AuctionResume` continuation says where play
// picks up. See `monopoly/CLAUDE.md` "Auctions".
// ---------------------------------------------------------------------------

/** The fixed step every bid raises the high by. A bid carries no amount — the
 *  engine adds this to the current `highBid` at apply time, so a tap is always
 *  coherent against the latest authoritative high. */
export const BID_INCREMENT = 10;

/** Non-bankrupt players in seat order from the active player — the seating for
 *  the auction's `active` list (display only; there's no rotation). A bankrupt
 *  estate debtor is naturally excluded. */
function biddingOrder(state: GameState): string[] {
  const startIdx = state.players.findIndex((p) => p.id === state.turn.playerId);
  const order: string[] = [];
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[(startIdx + i) % state.players.length];
    if (!p.bankrupt) order.push(p.id);
  }
  return order;
}

/** Open an auction over `position`, resuming via `resume` once it resolves.
 *  Seats every non-bankrupt player as a bidder, with no bid yet. */
function enterAuction(
  state: GameState,
  position: number,
  resume: AuctionResume,
): GameState {
  const auction: AuctionState = {
    position,
    active: biddingOrder(state),
    highBid: 0,
    leaderId: null,
    bids: {},
    resume,
  };
  return {
    ...state,
    turn: { ...state.turn, phase: "auction", pendingBuy: undefined, auction },
  };
}

/** The most a bidder may offer. Decline-buy bids are capped at **net worth**
 *  (cash + everything they could liquidate) — the binding-bid rule, with the
 *  winner settling any shortfall through `must-raise-cash`. Estate-liquidation
 *  bids are capped at **cash on hand** less the 10% interest owed if the lot is
 *  mortgaged, so the winner pays immediately and never goes negative (a v1
 *  simplification that keeps the multi-lot loop free of nested settlement —
 *  see `monopoly/CLAUDE.md`). */
function maxBid(
  state: GameState,
  auction: AuctionState,
  playerId: string,
): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;
  if (auction.resume.kind === "landing") {
    return player.cash + maxRaisableCash(state, playerId);
  }
  const interest = state.mortgaged[auction.position]
    ? (mortgageInterestAt(auction.position) ?? 0)
    : 0;
  return player.cash - interest;
}

/** The most `playerId` may bid in the current auction, or 0 if none is open.
 *  Exposed so the auction panel can offer and disable the next +$10 bid against
 *  the same cap the engine enforces (net worth for a declined lot, cash on hand
 *  for an estate lot). */
export function auctionBidCap(state: GameState, playerId: string): number {
  const auction = state.turn.auction;
  return auction ? maxBid(state, auction, playerId) : 0;
}

/** Whether the auction is decided and should resolve now: the leader has won
 *  once no non-leader is still in, or — with no bid at all — everyone has
 *  dropped (unsold). */
function auctionDecided(auction: AuctionState): boolean {
  if (auction.leaderId === null) return auction.active.length === 0;
  return auction.active.every((id) => id === auction.leaderId);
}

function applyBid(
  state: GameState,
  intent: Extract<Intent, { kind: "bid" }>,
): ApplyResult {
  const auction = state.turn.auction;
  if (state.turn.phase !== "auction" || !auction) {
    return { ok: false, reason: `cannot bid in phase ${state.turn.phase}` };
  }
  if (!auction.active.includes(intent.playerId)) {
    return { ok: false, reason: "not in the auction" };
  }
  // Bids carry an absolute amount (what the bidder saw + one increment). The
  // amount is always RECORDED on the bidder's bar, so a tap is never lost — even
  // one that arrives already out-high counts as that player's standing bid. It
  // only takes the lead when it strictly tops the current high; an out-high bid
  // is kept for the chart but leaves the leader untouched. Recording is therefore
  // idempotent, which is what lets the client safely rebase a bid across a lost
  // version race without snapping the bar back or auto-escalating the price.
  const amount = intent.amount;
  if (amount < BID_INCREMENT) {
    return { ok: false, reason: "bid below the minimum" };
  }
  if (amount > maxBid(state, auction, intent.playerId)) {
    return { ok: false, reason: "bid exceeds what you can pay" };
  }

  const leads = amount > auction.highBid;
  const bidAuction: AuctionState = {
    ...auction,
    highBid: leads ? amount : auction.highBid,
    leaderId: leads ? intent.playerId : auction.leaderId,
    bids: { ...auction.bids, [intent.playerId]: amount },
  };
  const bidState = withAuction(state, bidAuction);
  // The bidder is the sole survivor (everyone else already dropped): they win.
  if (auctionDecided(bidAuction)) return finalize(resolveAuction(bidState));
  return { ok: true, state: bidState, newEvents: [] };
}

function applyPassBid(
  state: GameState,
  intent: Extract<Intent, { kind: "pass-bid" }>,
): ApplyResult {
  const auction = state.turn.auction;
  if (state.turn.phase !== "auction" || !auction) {
    return { ok: false, reason: `cannot pass-bid in phase ${state.turn.phase}` };
  }
  if (!auction.active.includes(intent.playerId)) {
    return { ok: false, reason: "not in the auction" };
  }
  if (intent.playerId === auction.leaderId) {
    return { ok: false, reason: "the leader can't drop their winning bid" };
  }

  const dropped: AuctionState = {
    ...auction,
    active: auction.active.filter((id) => id !== intent.playerId),
  };
  const droppedState = withAuction(state, dropped);
  // Last non-leader out → the leader wins; everyone out with no bid → unsold.
  if (auctionDecided(dropped)) return finalize(resolveAuction(droppedState));
  return { ok: true, state: droppedState, newEvents: [] };
}

/** Replace the in-flight auction on the turn block. */
function withAuction(state: GameState, auction: AuctionState): GameState {
  return { ...state, turn: { ...state.turn, auction } };
}

/** Wrap a `{ state, newEvents }` step (the shape `resolveAuction` and the
 *  charge helpers return) as a successful `ApplyResult`. */
function finalize(step: {
  state: GameState;
  newEvents: readonly GameEvent[];
}): ApplyResult {
  return { ok: true, state: step.state, newEvents: step.newEvents };
}

/** Settle a decided auction: log it, hand the lot to the leader (paid to the
 *  bank), and continue per the `resume` continuation. An unsold lot (no bid)
 *  logs with a null winner and transfers nothing. */
function resolveAuction(state: GameState): {
  state: GameState;
  newEvents: readonly GameEvent[];
} {
  const auction = state.turn.auction;
  if (!auction) return { state, newEvents: [] };
  const { position, leaderId, highBid, resume } = auction;

  const event: GameEvent = {
    kind: "auction",
    position,
    winnerId: leaderId,
    price: leaderId !== null ? highBid : 0,
  };
  const turns = appendEventToActiveTurn(state.turns, event);

  // Hand the lot over and take the winner's payment. A still-mortgaged estate
  // lot also charges the receiver the official 10% interest, exactly as a trade
  // does. Unsold: nothing moves — and an unsold estate lot reverts to the bank
  // clean, so any lingering mortgage flag is cleared.
  let players = state.players;
  let ownership = state.ownership;
  let mortgaged = state.mortgaged;
  if (leaderId !== null) {
    const isMortgaged = resume.kind === "bank-estate" && state.mortgaged[position];
    const interest = isMortgaged ? (mortgageInterestAt(position) ?? 0) : 0;
    players = state.players.map((p) =>
      p.id === leaderId ? { ...p, cash: p.cash - highBid - interest } : p,
    );
    ownership = { ...state.ownership, [position]: leaderId };
  } else if (resume.kind === "bank-estate" && state.mortgaged[position]) {
    const cleared = { ...state.mortgaged };
    delete cleared[position];
    mortgaged = cleared;
  }

  const settled: GameState = {
    ...state,
    players,
    ownership,
    mortgaged,
    turns,
    turn: { ...state.turn, auction: undefined },
  };

  if (resume.kind === "landing") {
    // The decliner's landing resumes; a winner who went negative (bid above
    // cash, within net worth) settles first via must-raise-cash.
    return { state: settleOrRaise(settled, "after-landing"), newEvents: [event] };
  }
  return { state: resumeEstate(settled, resume), newEvents: [event] };
}

/** Continue liquidating a bank-bankruptcy estate: auction the next lot, or —
 *  when the estate is exhausted — finish the bust by handing control to the
 *  next player (the bust already confirmed ≥2 survivors, so there's no winner
 *  to crown here). */
function resumeEstate(
  state: GameState,
  resume: Extract<AuctionResume, { kind: "bank-estate" }>,
): GameState {
  if (resume.remaining.length > 0) {
    const [next, ...rest] = resume.remaining;
    return enterAuction(state, next, {
      kind: "bank-estate",
      debtorId: resume.debtorId,
      remaining: rest,
    });
  }
  return advanceToNextPlayer(state, resume.debtorId);
}

/** Apply a "manage my properties" commit — the atomic unified output of the
 *  manage intermission, carrying both a build target and mortgage flags. The
 *  engine validates and applies the whole thing at once, in cash-flow order
 *  (raise first, spend second), so it's all-or-nothing and never leaves the
 *  board uneven or half-applied. The build side runs through `planDevelopment`
 *  (even-build, supply, the hotel-shortage liquidation escape); the mortgage
 *  side flips the per-property flags. Combining them is what lets one commit
 *  sell a property's houses and then mortgage the bare lot, or mortgage one
 *  property to fund building another.
 *
 *  Two entry contexts share the reducer:
 *  - Voluntary: the manager during their own open manage intermission
 *    (`phase === "managing"`, `intent.playerId === managerId`). The manager may
 *    be off-turn (the queue resolves before the active player rolls). Any net
 *    cash they can afford. On success, returns to pre-roll re-checking the
 *    queue (mirrors the trade exit).
 *  - Forced: the current debtor during `must-raise-cash`. Raising only — no
 *    builds, no un-mortgages — then re-runs `settleOrRaise` so play resumes
 *    once they're back to ≥ 0. */
function applyManage(
  state: GameState,
  intent: Extract<Intent, { kind: "manage" }>,
): ApplyResult {
  const inRaiseCash = state.turn.phase === "must-raise-cash";
  if (inRaiseCash) {
    // The forced settler is whoever is in the red, which need not be the
    // active player (a trade can put an off-turn player there).
    if (intent.playerId !== firstNegativePlayer(state)) {
      return { ok: false, reason: "not the current debtor" };
    }
  } else {
    if (state.turn.phase !== "managing") {
      return { ok: false, reason: `cannot manage in phase ${state.turn.phase}` };
    }
    if (intent.playerId !== state.turn.managerId) {
      return { ok: false, reason: "not the manager" };
    }
  }

  const playerIdx = state.players.findIndex((p) => p.id === intent.playerId);
  const player = state.players[playerIdx];

  // --- Resolve the mortgage flips (only entries that change the flag). The
  //     build's final levels gate whether a property can be mortgaged. ---
  const finalLevel = (pos: number): number =>
    intent.build[pos] ?? developmentLevel(state, pos);
  const finalMortgaged: Record<number, boolean> = {};
  for (const [posStr, flag] of Object.entries(state.mortgaged)) {
    finalMortgaged[Number(posStr)] = flag;
  }
  const mortgageEvents: GameEvent[] = [];
  let mortgageNet = 0;
  for (const [posStr, want] of Object.entries(intent.mortgage)) {
    const pos = Number(posStr);
    if (want === (state.mortgaged[pos] === true)) continue;
    if (state.ownership[pos] !== intent.playerId) {
      return { ok: false, reason: "you don't own that property" };
    }
    if (want) {
      // Mortgaging raises cash; the lot's whole color set must be building-free
      // once the build side runs (official rule — so "sell the set's houses then
      // mortgage one of them" works in one commit). Checked against the build's
      // final levels, not just this lot.
      if (buildingsBlockingMortgage(pos, finalLevel).length > 0) {
        return { ok: false, reason: "sell the set's buildings before mortgaging" };
      }
      const value = mortgageValueAt(pos);
      if (value === null) return { ok: false, reason: "not an ownable space" };
      finalMortgaged[pos] = true;
      mortgageNet += value;
      mortgageEvents.push({ kind: "mortgage", position: pos, received: value });
    } else {
      // Un-mortgaging spends cash — not allowed while settling a debt.
      if (inRaiseCash) {
        return { ok: false, reason: "can only raise cash now" };
      }
      const cost = unmortgageCostAt(pos);
      if (cost === null) return { ok: false, reason: "not an ownable space" };
      delete finalMortgaged[pos];
      mortgageNet -= cost;
      mortgageEvents.push({ kind: "unmortgage", position: pos, cost });
    }
  }

  // --- Plan the build against the POST-unmortgage mortgage state, so a set
  //     being unmortgaged in this same commit is buildable. ---
  const plan = planDevelopment(
    { ...state, mortgaged: finalMortgaged },
    intent.playerId,
    intent.build,
  );
  if (!plan.ok) return { ok: false, reason: plan.reason };
  if (inRaiseCash && plan.steps.some((s) => s.kind === "build")) {
    return { ok: false, reason: "can only sell to raise cash" };
  }
  if (plan.steps.length === 0 && mortgageEvents.length === 0) {
    return { ok: false, reason: "nothing to change" };
  }

  // Cash check: with raise-first ordering the low-water mark is the final
  // balance, so a non-negative end state is sufficient (forced settlers are
  // already negative and only raising, so they skip this).
  const totalNet = plan.netCash + mortgageNet;
  if (!inRaiseCash && player.cash + totalNet < 0) {
    return { ok: false, reason: "insufficient cash" };
  }

  // --- Apply. Houses from the build plan, mortgage flags from finalMortgaged,
  //     cash by the combined net. ---
  const houses = { ...state.houses };
  const sellEvents: GameEvent[] = [];
  const buildEvents: GameEvent[] = [];
  for (const step of plan.steps) {
    if (step.kind === "build") {
      houses[step.position] = step.toLevel;
      buildEvents.push({
        kind: "build",
        position: step.position,
        toLevel: step.toLevel,
        cost: step.cost,
      });
    } else {
      // `sell` (one tier) and `liquidate` (whole hotel -> bare lot) both log as
      // a sell-building event at the resulting level; a bare lot clears the key.
      const toLevel = step.kind === "liquidate" ? 0 : step.toLevel;
      if (toLevel === 0) delete houses[step.position];
      else houses[step.position] = toLevel;
      sellEvents.push({
        kind: "sell-building",
        position: step.position,
        toLevel,
        refund: step.refund,
      });
    }
  }
  // Order the log in cash-flow order: raises (sells, mortgages) then spends
  // (un-mortgages, builds).
  const mortgageRaises = mortgageEvents.filter((e) => e.kind === "mortgage");
  const mortgageSpends = mortgageEvents.filter((e) => e.kind === "unmortgage");
  const events = [
    ...sellEvents,
    ...mortgageRaises,
    ...mortgageSpends,
    ...buildEvents,
  ];

  const players = state.players.map((p, i) =>
    i === playerIdx ? { ...p, cash: p.cash + totalNet } : p,
  );
  let turns = state.turns;
  for (const ev of events) turns = appendEventToActiveTurn(turns, ev);
  const after: GameState = {
    ...state,
    houses,
    mortgaged: finalMortgaged,
    players,
    turns,
  };

  if (inRaiseCash) {
    const resume = state.turn.raiseCash ?? "after-landing";
    return { ok: true, state: settleOrRaise(after, resume), newEvents: events };
  }
  // Voluntary commit: close the intermission and return to the boundary, where
  // the next autoStep re-checks the queue (mirrors the trade exit).
  return { ok: true, state: returnToPreRoll(after), newEvents: events };
}

/** Mortgage a single property — the forced-debtor / bot raise-cash path only.
 *  Voluntary mortgaging goes through `manage`; this is the lone single-property
 *  entry point left, valid only while settling a debt in `must-raise-cash`. */
function applyMortgage(
  state: GameState,
  intent: Extract<Intent, { kind: "mortgage" }>,
): ApplyResult {
  if (state.turn.phase !== "must-raise-cash") {
    return { ok: false, reason: `cannot mortgage in phase ${state.turn.phase}` };
  }
  // The forced settler is whoever is currently in the red, which need not be
  // the active player (a trade can put an off-turn player there).
  if (intent.playerId !== firstNegativePlayer(state)) {
    return { ok: false, reason: "not the current debtor" };
  }
  if (state.ownership[intent.position] !== intent.playerId) {
    return { ok: false, reason: "you don't own that square" };
  }
  if (state.mortgaged[intent.position]) {
    return { ok: false, reason: "already mortgaged" };
  }
  // Official rule: the whole color set must be building-free to mortgage any
  // member, not just this lot.
  const levelAt = (pos: number): number => developmentLevel(state, pos);
  if (buildingsBlockingMortgage(intent.position, levelAt).length > 0) {
    return { ok: false, reason: "must sell the set's buildings first" };
  }
  const value = mortgageValueAt(intent.position);
  if (value === null) {
    return { ok: false, reason: "not an ownable space" };
  }

  const payerIdx = state.players.findIndex((p) => p.id === intent.playerId);
  const players = state.players.map((p, i) =>
    i === payerIdx ? { ...p, cash: p.cash + value } : p,
  );
  const mortgaged = { ...state.mortgaged, [intent.position]: true };
  const mortgageEvent: GameEvent = {
    kind: "mortgage",
    position: intent.position,
    received: value,
  };
  const turns = appendEventToActiveTurn(state.turns, mortgageEvent);
  const afterMortgage: GameState = { ...state, players, mortgaged, turns };

  // Re-evaluate after every mortgage: once this debtor (and everyone else) is
  // back to ≥ 0, `settleOrRaise` resumes play; if someone is still negative it
  // stays in must-raise-cash for the next debtor.
  const resume = state.turn.raiseCash ?? "after-landing";
  return {
    ok: true,
    state: settleOrRaise(afterMortgage, resume),
    newEvents: [mortgageEvent],
  };
}

function applyEndTurn(
  state: GameState,
  intent: Extract<Intent, { kind: "end-turn" }>,
): ApplyResult {
  if (intent.playerId !== state.turn.playerId) {
    return { ok: false, reason: "not your turn" };
  }
  if (state.turn.phase !== "post-roll") {
    return { ok: false, reason: `cannot end turn in phase ${state.turn.phase}` };
  }
  return {
    ok: true,
    state: advanceToNextPlayer(state, intent.playerId),
    newEvents: [],
  };
}

// ---------------------------------------------------------------------------
// Trades. The whole sub-game is permissive by design: a proposer (who needn't
// be a party) reassigns any owned properties / GOJF cards between any players
// and sets per-player cash deltas that must net to zero. The draft lives in
// `turn.tradeDraft` (visible to everyone in real time) and is finalized into
// `turn.pendingTrade`, which every named participant must approve. Mortgaged
// properties transfer still-mortgaged; the receiver owes the bank 10% interest
// on each, settled through the unified must-raise-cash path. See
// `monopoly/CLAUDE.md` "Trades".
// ---------------------------------------------------------------------------

/** A player who exists and isn't bankrupt — eligible to own assets / hold cash. */
function isActivePlayer(state: GameState, id: string): boolean {
  const p = state.players.find((pl) => pl.id === id);
  return p !== undefined && !p.bankrupt;
}

/** Everyone NAMED by a set of trade terms: the giver and receiver of each
 *  property and card, plus anyone with a non-zero cash delta. These are the
 *  players whose approval a proposal needs. Exported so the trade UI shows the
 *  same party set the engine validates against. */
export function tradeParticipants(
  state: GameState,
  terms: TradeTerms,
): Set<string> {
  const ids = new Set<string>();
  for (const [posStr, newOwner] of Object.entries(terms.propertyTo)) {
    const current = state.ownership[Number(posStr)];
    if (current) ids.add(current);
    ids.add(newOwner);
  }
  for (const [src, newHolder] of Object.entries(terms.gojfTo)) {
    const current = state.jailFreeCards[src as CardSource];
    if (current) ids.add(current);
    ids.add(newHolder);
  }
  for (const [pid, delta] of Object.entries(terms.cashDelta)) {
    if (delta !== 0) ids.add(pid);
  }
  return ids;
}

/** 10% bank interest each player owes for receiving a still-mortgaged property
 *  in the trade, keyed by receiver. Empty when no mortgaged property changes
 *  hands. Exported so the trade panel can attribute the fee in the UI. */
export function tradeMortgageFees(
  state: GameState,
  terms: TradeTerms,
): Record<string, number> {
  const fees: Record<string, number> = {};
  for (const [posStr, newOwner] of Object.entries(terms.propertyTo)) {
    const pos = Number(posStr);
    if (!state.mortgaged[pos]) continue;
    const interest = mortgageInterestAt(pos) ?? 0;
    fees[newOwner] = (fees[newOwner] ?? 0) + interest;
  }
  return fees;
}

/** Apply a set of trade terms to the board: move property ownership and GOJF
 *  cards (mortgage flags ride along untouched), apply per-player cash deltas,
 *  and charge each receiver the 10% interest on mortgaged properties. Pure and
 *  phase-agnostic — used both to simulate a proposal for the affordability
 *  gate and to execute the real thing. Players' cash may go negative; the
 *  caller routes that through `settleOrRaise`. */
function applyTradeTerms(state: GameState, terms: TradeTerms): GameState {
  const ownership = { ...state.ownership };
  for (const [posStr, newOwner] of Object.entries(terms.propertyTo)) {
    ownership[Number(posStr)] = newOwner;
  }
  const jailFreeCards = { ...state.jailFreeCards };
  for (const [src, newHolder] of Object.entries(terms.gojfTo)) {
    jailFreeCards[src as CardSource] = newHolder;
  }
  const fees = tradeMortgageFees(state, terms);
  const players = state.players.map((p) => {
    const change = (terms.cashDelta[p.id] ?? 0) - (fees[p.id] ?? 0);
    return change === 0 ? p : { ...p, cash: p.cash + change };
  });
  return { ...state, ownership, jailFreeCards, players };
}

/** The board as it would look after a trade, surfaced for the trade panel's
 *  after-view. Runs the same pure transform the engine executes
 *  (`applyTradeTerms`) without mutating anything, plus the per-receiver
 *  mortgage-interest fees broken out so the UI can attribute the cash drop. */
export interface TradeProjection {
  ownership: GameState["ownership"];
  jailFreeCards: GameState["jailFreeCards"];
  /** Each player's cash after the trade (negotiated delta minus any mortgage
   *  interest), keyed by id. */
  cashById: Readonly<Record<string, number>>;
  /** 10% bank interest each receiver owes for a still-mortgaged property,
   *  keyed by receiver. Absent / 0 for everyone else. */
  feesById: Readonly<Record<string, number>>;
}

export function projectTrade(
  state: GameState,
  terms: TradeTerms,
): TradeProjection {
  const post = applyTradeTerms(state, terms);
  const cashById: Record<string, number> = {};
  for (const p of post.players) cashById[p.id] = p.cash;
  return {
    ownership: post.ownership,
    jailFreeCards: post.jailFreeCards,
    cashById,
    feesById: tradeMortgageFees(state, terms),
  };
}

/** Structural validity of trade terms, independent of balance: every property
 *  is owned (and building-free) and reassigned to a real player who isn't its
 *  current owner; every card is held and moved to a different real player;
 *  every cash party is real. Shared by the draft path (this only) and the
 *  propose path (this plus balance / participants / affordability). Returns an
 *  error reason or null. */
function validateTradeAssets(state: GameState, terms: TradeTerms): string | null {
  for (const [posStr, newOwner] of Object.entries(terms.propertyTo)) {
    const pos = Number(posStr);
    const current = state.ownership[pos];
    if (!current) return "can't trade an unowned property";
    if (current === newOwner) return "property assigned to its current owner";
    if (state.houses[pos]) return "can't trade a property with buildings";
    if (!isActivePlayer(state, newOwner)) return "unknown recipient";
  }
  for (const [src, newHolder] of Object.entries(terms.gojfTo)) {
    const current = state.jailFreeCards[src as CardSource];
    if (!current) return "card not held by anyone";
    if (current === newHolder) return "card assigned to its current holder";
    if (!isActivePlayer(state, newHolder)) return "unknown card recipient";
  }
  for (const [pid, delta] of Object.entries(terms.cashDelta)) {
    if (delta !== 0 && !isActivePlayer(state, pid)) return "unknown cash party";
  }
  return null;
}

/** Full validity of a proposal: structurally sound, moves something, names at
 *  least two parties, cash nets to zero, and — after simulated execution —
 *  every player left in the red can climb back to ≥ 0 by mortgaging (the same
 *  raisable test the rent path uses). Returns an error reason or null. */
function validateTradeProposal(
  state: GameState,
  terms: TradeTerms,
): string | null {
  const assetError = validateTradeAssets(state, terms);
  if (assetError) return assetError;

  const movesProperty = Object.keys(terms.propertyTo).length > 0;
  const movesCard = Object.keys(terms.gojfTo).length > 0;
  const movesCash = Object.values(terms.cashDelta).some((v) => v !== 0);
  if (!movesProperty && !movesCard && !movesCash) return "trade is empty";

  const cashSum = Object.values(terms.cashDelta).reduce((a, b) => a + b, 0);
  if (cashSum !== 0) return "cash doesn't balance";

  if (tradeParticipants(state, terms).size < 2) {
    return "a trade needs at least two parties";
  }

  // Affordability: simulate, then make sure every resulting debtor could
  // recover. Pre-trade cash alone isn't required — they may mortgage to cover.
  const post = applyTradeTerms(state, terms);
  for (const p of post.players) {
    if (p.cash < 0 && p.cash + maxRaisableCash(post, p.id) < 0) {
      return `${p.id} can't cover their obligation`;
    }
  }
  return null;
}

/** Discard any in-flight trade / manage intermission and return the active
 *  player to a clean pre-roll. Used by cancel / decline and as the resume
 *  target after a trade or manage commit — the next autoStep re-checks the
 *  boundary queue from here. Rebuilding the turn fresh drops `managerId`,
 *  `tradeDraft`, `pendingTrade`, and `pendingBuy`. */
function returnToPreRoll(state: GameState): GameState {
  return {
    ...state,
    turn: {
      playerId: state.turn.playerId,
      phase: "pre-roll",
      doublesStreak: state.turn.doublesStreak,
    },
  };
}

/** If anyone has armed a boundary intermission, dequeue the first still-eligible
 *  entry and open it: `trade` opens an empty trade-building draft, `manage` sets
 *  the managing phase for that player. Returns null when nobody valid is queued,
 *  so the caller proceeds to roll. */
function tryEnterBoundary(state: GameState): GameState | null {
  if (state.boundaryQueue.length === 0) return null;
  const idx = state.boundaryQueue.findIndex((entry) =>
    isActivePlayer(state, entry.playerId),
  );
  if (idx === -1) return null;
  const entry = state.boundaryQueue[idx];
  const boundaryQueue = [
    ...state.boundaryQueue.slice(0, idx),
    ...state.boundaryQueue.slice(idx + 1),
  ];
  if (entry.kind === "trade") {
    return {
      ...state,
      boundaryQueue,
      turn: {
        ...state.turn,
        phase: "trade-building",
        tradeDraft: {
          proposerId: entry.playerId,
          propertyTo: {},
          gojfTo: {},
          cashDelta: {},
        },
      },
    };
  }
  return {
    ...state,
    boundaryQueue,
    turn: {
      ...state.turn,
      phase: "managing",
      managerId: entry.playerId,
      // Seed empty staging so the broadcast view has a shape from the moment the
      // intermission opens (mirrors the trade branch seeding `tradeDraft`).
      manageStaged: { build: {}, mortgage: {} },
    },
  };
}

function applySetQueue(
  state: GameState,
  intent: Extract<Intent, { kind: "set-queue" }>,
): ApplyResult {
  if (!isActivePlayer(state, intent.playerId)) {
    return { ok: false, reason: "unknown player" };
  }
  const present = state.boundaryQueue.some(
    (e) => e.playerId === intent.playerId && e.kind === intent.queue,
  );
  // Idempotent: setting the arm to the state it's already in is a no-op. This is
  // what lets the optimistic overlay replay this intent on a head that already
  // reflects the arm (a confirmation echo, a conflict rebase) without flipping it
  // back off — the bug a relative toggle caused.
  if (intent.armed === present) return { ok: true, state, newEvents: [] };
  const boundaryQueue = intent.armed
    ? [...state.boundaryQueue, { playerId: intent.playerId, kind: intent.queue }]
    : state.boundaryQueue.filter(
        (e) => !(e.playerId === intent.playerId && e.kind === intent.queue),
      );
  return { ok: true, state: { ...state, boundaryQueue }, newEvents: [] };
}

function applyCancelManage(
  state: GameState,
  intent: Extract<Intent, { kind: "cancel-manage" }>,
): ApplyResult {
  if (state.turn.phase !== "managing") {
    return { ok: false, reason: "no manage intermission open" };
  }
  if (intent.playerId !== state.turn.managerId) {
    return { ok: false, reason: "not the manager" };
  }
  return { ok: true, state: returnToPreRoll(state), newEvents: [] };
}

/** Replace the live manage staging with a fresh snapshot the actor computed
 *  client-side. Staging is a broadcast preview — the real legality (even build,
 *  bank supply, affordability) is enforced at the `manage` commit — so this only
 *  guards the things that would make the broadcast itself dishonest: the right
 *  phase, the right actor, and ownership of every staged square. The actor is the
 *  manager (`managing`) or the current debtor (`must-raise-cash`); mirrors
 *  `manageActorId`, inlined to avoid an engine→manage import cycle. */
function applyUpdateManageStaging(
  state: GameState,
  intent: Extract<Intent, { kind: "update-manage-staging" }>,
): ApplyResult {
  const { phase, managerId } = state.turn;
  let actor: string | null;
  if (phase === "managing") actor = managerId ?? null;
  else if (phase === "must-raise-cash") actor = firstNegativePlayer(state);
  else return { ok: false, reason: "no manage intermission open" };
  if (actor === null || intent.playerId !== actor) {
    return { ok: false, reason: "not the manage actor" };
  }
  for (const posStr of [
    ...Object.keys(intent.staged.build),
    ...Object.keys(intent.staged.mortgage),
  ]) {
    if (state.ownership[Number(posStr)] !== intent.playerId) {
      return { ok: false, reason: "you don't own that property" };
    }
  }
  const manageStaged = {
    build: intent.staged.build,
    mortgage: intent.staged.mortgage,
  };
  return {
    ok: true,
    state: { ...state, turn: { ...state.turn, manageStaged } },
    newEvents: [],
  };
}

function applyUpdateTradeDraft(
  state: GameState,
  intent: Extract<Intent, { kind: "update-trade-draft" }>,
): ApplyResult {
  if (state.turn.phase !== "trade-building" || !state.turn.tradeDraft) {
    return { ok: false, reason: "no trade being built" };
  }
  if (intent.playerId !== state.turn.tradeDraft.proposerId) {
    return { ok: false, reason: "not the proposer" };
  }
  // Drafts may be unbalanced mid-edit, but must stay structurally sane so the
  // authoritative state never holds a corrupt assignment.
  const error = validateTradeAssets(state, intent.terms);
  if (error) return { ok: false, reason: error };
  const tradeDraft = {
    proposerId: state.turn.tradeDraft.proposerId,
    propertyTo: intent.terms.propertyTo,
    gojfTo: intent.terms.gojfTo,
    cashDelta: intent.terms.cashDelta,
  };
  return {
    ok: true,
    state: { ...state, turn: { ...state.turn, tradeDraft } },
    newEvents: [],
  };
}

function applyCancelTrade(
  state: GameState,
  intent: Extract<Intent, { kind: "cancel-trade" }>,
): ApplyResult {
  const { phase, tradeDraft, pendingTrade } = state.turn;
  if (phase === "trade-building" && tradeDraft) {
    if (intent.playerId !== tradeDraft.proposerId) {
      return { ok: false, reason: "not the proposer" };
    }
    return { ok: true, state: returnToPreRoll(state), newEvents: [] };
  }
  if (phase === "trade-pending" && pendingTrade) {
    if (intent.playerId !== pendingTrade.proposerId) {
      return { ok: false, reason: "not the proposer" };
    }
    return { ok: true, state: returnToPreRoll(state), newEvents: [] };
  }
  return { ok: false, reason: "no trade to cancel" };
}

function applyProposeTrade(
  state: GameState,
  intent: Extract<Intent, { kind: "propose-trade" }>,
): ApplyResult {
  if (state.turn.phase !== "trade-building" || !state.turn.tradeDraft) {
    return { ok: false, reason: "no trade being built" };
  }
  const draft = state.turn.tradeDraft;
  if (intent.playerId !== draft.proposerId) {
    return { ok: false, reason: "not the proposer" };
  }
  const terms: TradeTerms = {
    propertyTo: draft.propertyTo,
    gojfTo: draft.gojfTo,
    cashDelta: draft.cashDelta,
  };
  const error = validateTradeProposal(state, terms);
  if (error) return { ok: false, reason: error };

  // The proposer is seeded approved iff they're a party; everyone else named
  // starts unapproved. Id is stable for the single live proposal (rngState is
  // unchanged by trades) and only needs to outlive this pending trade.
  const approvals: Record<string, boolean> = {};
  for (const id of tradeParticipants(state, terms)) {
    approvals[id] = id === draft.proposerId;
  }
  const pendingTrade: PendingTrade = {
    id: `trade-${state.turns.length.toString()}-${state.rngState.toString()}`,
    proposerId: draft.proposerId,
    propertyTo: terms.propertyTo,
    gojfTo: terms.gojfTo,
    cashDelta: terms.cashDelta,
    approvals,
  };
  return {
    ok: true,
    state: {
      ...state,
      turn: {
        ...state.turn,
        phase: "trade-pending",
        tradeDraft: undefined,
        pendingTrade,
      },
    },
    newEvents: [],
  };
}

function applyAcceptTrade(
  state: GameState,
  intent: Extract<Intent, { kind: "accept-trade" }>,
): ApplyResult {
  const pending = state.turn.pendingTrade;
  if (state.turn.phase !== "trade-pending" || !pending) {
    return { ok: false, reason: "no trade to accept" };
  }
  if (intent.tradeId !== pending.id) return { ok: false, reason: "stale trade" };
  if (!(intent.playerId in pending.approvals)) {
    return { ok: false, reason: "not a party to this trade" };
  }
  if (pending.approvals[intent.playerId]) {
    return { ok: true, state, newEvents: [] }; // idempotent re-approve
  }
  const approvals = { ...pending.approvals, [intent.playerId]: true };
  if (!Object.values(approvals).every(Boolean)) {
    return {
      ok: true,
      state: {
        ...state,
        turn: { ...state.turn, pendingTrade: { ...pending, approvals } },
      },
      newEvents: [],
    };
  }

  // Unanimous — execute. Move assets + cash + fees, log it, then settle (any
  // receiver pushed into the red raises cash before play resumes at pre-roll).
  const executed = applyTradeTerms(state, pending);
  const tradeEvent: GameEvent = {
    kind: "trade",
    proposerId: pending.proposerId,
    propertyTo: pending.propertyTo,
    gojfTo: pending.gojfTo,
    cashDelta: pending.cashDelta,
  };
  const turns = appendEventToActiveTurn(executed.turns, tradeEvent);
  return {
    ok: true,
    state: settleOrRaise({ ...executed, turns }, "pre-roll"),
    newEvents: [tradeEvent],
  };
}

function applyDeclineTrade(
  state: GameState,
  intent: Extract<Intent, { kind: "decline-trade" }>,
): ApplyResult {
  const pending = state.turn.pendingTrade;
  if (state.turn.phase !== "trade-pending" || !pending) {
    return { ok: false, reason: "no trade to decline" };
  }
  if (intent.tradeId !== pending.id) return { ok: false, reason: "stale trade" };
  if (!(intent.playerId in pending.approvals)) {
    return { ok: false, reason: "not a party to this trade" };
  }
  // A single decline kills the whole proposal.
  return { ok: true, state: returnToPreRoll(state), newEvents: [] };
}

// ---------------------------------------------------------------------------
// Jail. Three ways in (the "Go to Jail" tile, three doubles, and — once cards
// land — a card), and four ways out: roll a double, pay the $50 fine, play a
// Get-Out-of-Jail-Free card, or serve the three-turn sentence (the third failed
// roll forces the fine). A jailed player's turn opens at `jail-decision`; a
// human picks pay / card / roll in the prompt, a bot is driven by the policy.
// See `monopoly/CLAUDE.md` "Jail".
// ---------------------------------------------------------------------------

/** Move the active player forward `total` squares, crediting GO salary on a
 *  board wrap. Pure position / cash update — the caller has already emitted the
 *  roll / jail-roll event and resolves the landed tile next via `resolveTile`. */
function moveActivePlayer(state: GameState, total: number): GameState {
  const idx = state.players.findIndex((p) => p.id === state.turn.playerId);
  const player = state.players[idx];
  const sum = player.position + total;
  const toPos = sum % SPACES.length;
  const passedGo = sum >= SPACES.length;
  const players = state.players.map((p, i) =>
    i === idx
      ? { ...p, position: toPos, cash: passedGo ? p.cash + PASS_GO_SALARY : p.cash }
      : p,
  );
  return { ...state, players };
}

/** Resolve the tile the active player has just moved onto: a "Go to Jail" cell
 *  sends them away, an unowned ownable opens a buy-decision, an owned square
 *  charges rent (which may bust them), anything else settles the landing.
 *  `total` is the dice sum (for utility rent). Shared by the normal-roll and the
 *  jail-escape paths in `autoStep` so both resolve a landing identically. */
function resolveTile(
  state: GameState,
  total: number,
): { state: GameState; newEvents: readonly GameEvent[] } {
  const idx = state.players.findIndex((p) => p.id === state.turn.playerId);
  const toPos = state.players[idx].position;
  const space = SPACES[toPos];
  if (space.kind === "go-to-jail") return sendToJail(state, "tile");
  if (space.kind === "chance") return drawCard(state, "chance");
  if (space.kind === "community-chest") return drawCard(state, "communityChest");

  // Tax (Income / Luxury): a fixed fee to the bank, routed through the unified
  // debt path so it can bust or drop into must-raise-cash like any other charge.
  if (space.kind === "tax") {
    const taxEvent: GameEvent = {
      kind: "tax",
      taxName: space.name,
      amount: space.amount,
    };
    return chargeToCreditor(state, state.turn.playerId, null, space.amount, taxEvent);
  }

  const landedOnUnownedOwnable =
    ownablePrice(toPos) !== null && !(toPos in state.ownership);
  if (landedOnUnownedOwnable) {
    const turn: TurnState = {
      ...state.turn,
      phase: "buy-decision",
      pendingBuy: toPos,
    };
    return { state: { ...state, turn }, newEvents: [] };
  }

  const amount = rentDue(state, toPos, total, state.turn.playerId);
  if (amount !== null && amount > 0) {
    const ownerId = state.ownership[toPos];
    return chargeRent(state, state.turn.playerId, ownerId, toPos, amount);
  }

  return { state: afterLanding(state), newEvents: [] };
}

/** Send the active player to jail — landing on the "Go to Jail" tile, rolling
 *  a third consecutive double, or drawing a "Go to Jail" card. Relocate them to
 *  the Jail cell, lock them in on jail turn 1, log `go-to-jail`, and end the
 *  turn: going to jail forfeits the rest of the turn even if the move was a
 *  double. No GO salary (you're sent, not advanced past GO). */
function sendToJail(
  state: GameState,
  reason: "tile" | "three-doubles" | "card",
): { state: GameState; newEvents: readonly GameEvent[] } {
  const idx = state.players.findIndex((p) => p.id === state.turn.playerId);
  const players = state.players.map((p, i) =>
    i === idx ? { ...p, position: JAIL_POSITION, inJail: true, jailTurns: 1 } : p,
  );
  const event: GameEvent = { kind: "go-to-jail", reason };
  const turns = appendEventToActiveTurn(state.turns, event);
  const next = advanceToNextPlayer({ ...state, players, turns }, state.turn.playerId);
  return { state: next, newEvents: [event] };
}

// ---------------------------------------------------------------------------
// Chance / Community Chest. A card draw is mechanical (it runs inside
// `autoStep` via `resolveTile`, never as an intent). Every card resolves into
// machinery the engine already has: move + resolve the landed tile, a bank or
// per-player charge, jail, or holding a GOJF. The pile lives in `state.decks`
// as an index list; a draw rotates the card to the bottom (a GOJF instead
// leaves the pile while held). See `monopoly/CLAUDE.md` "Chance / Community
// Chest decks".
// ---------------------------------------------------------------------------

/** Index of the Get-Out-of-Jail-Free card within a source's static deck. */
function gojfIndex(source: CardSource): number {
  return deckFor(source).findIndex((c) => c.effect.kind === "jail-free");
}

/** Draw the top card of `source`'s pile, then resolve its effect. The card
 *  rotates to the bottom of the pile, except a GOJF which leaves the pile (it's
 *  recorded as held in `jailFreeCards` and re-appended when used). The pile is
 *  never empty: only the lone GOJF can be absent, so a front card always
 *  exists. */
function drawCard(
  state: GameState,
  source: CardSource,
): { state: GameState; newEvents: readonly GameEvent[] } {
  const pile = state.decks[source];
  const cardIndex = pile[0];
  const card = deckFor(source)[cardIndex];
  const newPile =
    card.effect.kind === "jail-free"
      ? pile.slice(1) // held card leaves the pile
      : [...pile.slice(1), cardIndex]; // rotate to the bottom
  const next: GameState = {
    ...state,
    decks: { ...state.decks, [source]: newPile },
  };
  return resolveCardEffect(next, source, card);
}

/** Resolve a drawn card's effect, emitting a headline `card-drawn` event plus
 *  whatever follow-on events the effect produces (rent, charge, jail, …). */
function resolveCardEffect(
  state: GameState,
  source: CardSource,
  card: Card,
): { state: GameState; newEvents: readonly GameEvent[] } {
  const playerId = state.turn.playerId;
  const effect = card.effect;
  switch (effect.kind) {
    case "collect": {
      const event: GameEvent = {
        kind: "card-drawn",
        source,
        cardId: card.id,
        cash: effect.amount,
      };
      const idx = state.players.findIndex((p) => p.id === playerId);
      const players = state.players.map((p, i) =>
        i === idx ? { ...p, cash: p.cash + effect.amount } : p,
      );
      const turns = appendEventToActiveTurn(state.turns, event);
      return {
        state: afterLanding({ ...state, players, turns }),
        newEvents: [event],
      };
    }
    case "pay":
      return payBank(state, source, card, effect.amount);
    case "repairs": {
      const amount = repairCost(state, playerId, effect.perHouse, effect.perHotel);
      if (amount === 0) {
        // No buildings: a no-op charge — log just the headline (no cash).
        const event: GameEvent = { kind: "card-drawn", source, cardId: card.id };
        const turns = appendEventToActiveTurn(state.turns, event);
        return { state: afterLanding({ ...state, turns }), newEvents: [event] };
      }
      return payBank(state, source, card, amount);
    }
    case "pay-each":
      return payEach(state, source, card, effect.amount);
    case "collect-each":
      return collectEach(state, source, card, effect.amount);
    case "advance-to":
      return advanceToCard(state, source, card, effect.position);
    case "advance-nearest":
      return advanceNearestCard(state, source, card, effect.target);
    case "back-three":
      return backThreeCard(state, source, card);
    case "go-to-jail": {
      const event: GameEvent = { kind: "card-drawn", source, cardId: card.id };
      const turns = appendEventToActiveTurn(state.turns, event);
      const jailed = sendToJail({ ...state, turns }, "card");
      return { state: jailed.state, newEvents: [event, ...jailed.newEvents] };
    }
    case "jail-free": {
      const event: GameEvent = { kind: "card-drawn", source, cardId: card.id };
      const jailFreeCards = { ...state.jailFreeCards, [source]: playerId };
      const turns = appendEventToActiveTurn(state.turns, event);
      return {
        state: afterLanding({ ...state, jailFreeCards, turns }),
        newEvents: [event],
      };
    }
  }
}

/** Charge the drawer a bank fee for a `pay` / `repairs` card. This is the
 *  card's terminal step (no movement follows), so it reuses `chargeToCreditor`
 *  exactly like the tax tile does — the headline `card-drawn` (carrying the
 *  signed amount) IS the charge event, so debt routes through must-raise-cash /
 *  bankruptcy and the log reads as one line. */
function payBank(
  state: GameState,
  source: CardSource,
  card: Card,
  amount: number,
): { state: GameState; newEvents: readonly GameEvent[] } {
  const event: GameEvent = {
    kind: "card-drawn",
    source,
    cardId: card.id,
    cash: -amount,
  };
  return chargeToCreditor(state, state.turn.playerId, null, amount, event);
}

/** Total a "repairs" card costs `ownerId`: per-house and per-hotel rates over
 *  their developed properties (a level-5 lot is a hotel, 1–4 are houses). */
function repairCost(
  state: GameState,
  ownerId: string,
  perHouse: number,
  perHotel: number,
): number {
  let houses = 0;
  let hotels = 0;
  for (const [posStr, oid] of Object.entries(state.ownership)) {
    if (oid !== ownerId) continue;
    const level = state.houses[Number(posStr)] ?? 0;
    if (level === 5) hotels++;
    else houses += level;
  }
  return houses * perHouse + hotels * perHotel;
}

/** Chairman of the Board: the drawer pays every other player `amount`, logged
 *  as one transfer line per opponent. The drawer's net (−amount × opponents)
 *  routes through the debt model — they may go negative and raise cash. v1
 *  simplification (flagged in CLAUDE.md): a drawer who can't cover the whole
 *  payout even after liquidating busts to the bank rather than paying each as
 *  far as their cash stretches — vanishingly rare at $50/head. */
function payEach(
  state: GameState,
  source: CardSource,
  card: Card,
  amount: number,
): { state: GameState; newEvents: readonly GameEvent[] } {
  const drawerId = state.turn.playerId;
  const opponents = state.players.filter((p) => !p.bankrupt && p.id !== drawerId);
  const total = amount * opponents.length;
  const drawer = state.players.find((p) => p.id === drawerId);
  const drawnEvent: GameEvent = { kind: "card-drawn", source, cardId: card.id };
  const turns0 = appendEventToActiveTurn(state.turns, drawnEvent);

  if (total === 0 || !drawer) {
    return { state: afterLanding({ ...state, turns: turns0 }), newEvents: [drawnEvent] };
  }

  if (drawer.cash + maxRaisableCash(state, drawerId) < total) {
    const bust = goBankrupt({ ...state, turns: turns0 }, drawerId, null);
    const resolved =
      bustSequenced(bust.state)
        ? bust.state
        : advanceToNextPlayer(bust.state, drawerId);
    return { state: resolved, newEvents: [drawnEvent, ...bust.newEvents] };
  }

  const transfers: GameEvent[] = opponents.map((o) => ({
    kind: "card-transfer",
    fromId: drawerId,
    toId: o.id,
    amount,
  }));
  const opponentIds = new Set(opponents.map((o) => o.id));
  const players = state.players.map((p) => {
    if (p.id === drawerId) return { ...p, cash: p.cash - total };
    if (opponentIds.has(p.id)) return { ...p, cash: p.cash + amount };
    return p;
  });
  let turns = turns0;
  for (const t of transfers) turns = appendEventToActiveTurn(turns, t);
  const after: GameState = { ...state, players, turns };
  return {
    state: settleOrRaise(after, "after-landing"),
    newEvents: [drawnEvent, ...transfers],
  };
}

/** Birthday: every other player pays the drawer `amount`, one transfer line
 *  each. Each leg is independent — an opponent who can't cover even after
 *  liquidating goes bankrupt to the drawer (official rule); one who can but
 *  must mortgage goes negative and settles via must-raise-cash at the end. */
function collectEach(
  state: GameState,
  source: CardSource,
  card: Card,
  amount: number,
): { state: GameState; newEvents: readonly GameEvent[] } {
  const drawerId = state.turn.playerId;
  const drawnEvent: GameEvent = { kind: "card-drawn", source, cardId: card.id };
  const opponentIds = state.players
    .filter((p) => !p.bankrupt && p.id !== drawerId)
    .map((p) => p.id);

  let cur: GameState = {
    ...state,
    turns: appendEventToActiveTurn(state.turns, drawnEvent),
  };
  const newEvents: GameEvent[] = [drawnEvent];

  for (const oppId of opponentIds) {
    if (cur.turn.phase === "game-over") break;
    const opp = cur.players.find((p) => p.id === oppId);
    if (!opp || opp.bankrupt) continue;
    const transfer: GameEvent = {
      kind: "card-transfer",
      fromId: oppId,
      toId: drawerId,
      amount,
    };
    const oppIdx = cur.players.findIndex((p) => p.id === oppId);
    const drawerIdx = cur.players.findIndex((p) => p.id === drawerId);

    if (opp.cash + maxRaisableCash(cur, oppId) < amount) {
      // Can't cover even by liquidating → hand over remaining cash, then bust
      // to the drawer (their estate transfers; may end the game).
      const players = cur.players.map((p, i) => {
        if (i === oppIdx) return { ...p, cash: 0 };
        if (i === drawerIdx) return { ...p, cash: p.cash + opp.cash };
        return p;
      });
      const turns = appendEventToActiveTurn(cur.turns, transfer);
      const bust = goBankrupt({ ...cur, players, turns }, oppId, drawerId);
      cur = bust.state;
      newEvents.push(transfer, ...bust.newEvents);
    } else {
      const players = cur.players.map((p, i) => {
        if (i === oppIdx) return { ...p, cash: p.cash - amount };
        if (i === drawerIdx) return { ...p, cash: p.cash + amount };
        return p;
      });
      const turns = appendEventToActiveTurn(cur.turns, transfer);
      cur = { ...cur, players, turns };
      newEvents.push(transfer);
    }
  }

  if (cur.turn.phase === "game-over") return { state: cur, newEvents };
  // Any opponent left negative (mortgageable) settles in seat order; once
  // everyone is back to ≥ 0 the drawer's landing resolves.
  return { state: settleOrRaise(cur, "after-landing"), newEvents };
}

/** Move the active player to an absolute board position, crediting GO salary
 *  (and emitting `pass-go`) when the forward move wraps the board. Returns the
 *  new state and any GO event. */
function moveToPosition(
  state: GameState,
  target: number,
): { state: GameState; events: readonly GameEvent[] } {
  const idx = state.players.findIndex((p) => p.id === state.turn.playerId);
  const from = state.players[idx].position;
  // A forward move to a lower-or-equal index wrapped past GO. Card targets are
  // never the player's own square, so `target < from` ⇔ wrapped.
  const passedGo = target < from;
  const players = state.players.map((p, i) =>
    i === idx
      ? { ...p, position: target, cash: passedGo ? p.cash + PASS_GO_SALARY : p.cash }
      : p,
  );
  if (passedGo) {
    const event: GameEvent = { kind: "pass-go" };
    const turns = appendEventToActiveTurn(state.turns, event);
    return { state: { ...state, players, turns }, events: [event] };
  }
  return { state: { ...state, players }, events: [] };
}

/** Position of the nearest tile of `kind` strictly ahead of `from`, wrapping
 *  the board. Used by the "advance to nearest railroad / utility" cards. */
function nearestForward(from: number, kind: "railroad" | "utility"): number {
  for (let step = 1; step <= SPACES.length; step++) {
    const pos = (from + step) % SPACES.length;
    if (SPACES[pos].kind === kind) return pos;
  }
  return from; // unreachable — the board always has both kinds
}

/** "Advance to" a named square, then resolve it normally (so Boardwalk charges
 *  its normal rent, GO pays nothing, Reading uses normal railroad rent). Dice
 *  total is 0: none of these targets is a utility, so no dice-based rent. */
function advanceToCard(
  state: GameState,
  source: CardSource,
  card: Card,
  position: number,
): { state: GameState; newEvents: readonly GameEvent[] } {
  const event: GameEvent = { kind: "card-drawn", source, cardId: card.id };
  const turns = appendEventToActiveTurn(state.turns, event);
  const moved = moveToPosition({ ...state, turns }, position);
  const resolved = resolveTile(moved.state, 0);
  return {
    state: resolved.state,
    newEvents: [event, ...moved.events, ...resolved.newEvents],
  };
}

/** "Go back three squares", then resolve the tile landed on. Going back never
 *  passes GO. Dice total is 0: no Chance square sits exactly three ahead of a
 *  utility, so back-3 never lands on a dice-rent utility — but it CAN land on
 *  Community Chest (from position 36), which chains another draw via
 *  `resolveTile`. */
function backThreeCard(
  state: GameState,
  source: CardSource,
  card: Card,
): { state: GameState; newEvents: readonly GameEvent[] } {
  const event: GameEvent = { kind: "card-drawn", source, cardId: card.id };
  const turns = appendEventToActiveTurn(state.turns, event);
  const idx = state.players.findIndex((p) => p.id === state.turn.playerId);
  const to = (state.players[idx].position - 3 + SPACES.length) % SPACES.length;
  const players = state.players.map((p, i) =>
    i === idx ? { ...p, position: to } : p,
  );
  const resolved = resolveTile({ ...state, players, turns }, 0);
  return { state: resolved.state, newEvents: [event, ...resolved.newEvents] };
}

/** "Advance to the nearest railroad / utility" with the cards' special rent:
 *  a railroad pays 2× the owner's normal rent; a utility pays 10× a fresh dice
 *  throw, regardless of how many utilities the owner holds. Unowned → buy
 *  decision; owned by the drawer or mortgaged → no charge. */
function advanceNearestCard(
  state: GameState,
  source: CardSource,
  card: Card,
  target: "railroad" | "utility",
): { state: GameState; newEvents: readonly GameEvent[] } {
  const event: GameEvent = { kind: "card-drawn", source, cardId: card.id };
  const turns = appendEventToActiveTurn(state.turns, event);
  const from = state.players.find((p) => p.id === state.turn.playerId)?.position ?? 0;
  const pos = nearestForward(from, target);
  const moved = moveToPosition({ ...state, turns }, pos);
  const before = [event, ...moved.events];
  let cur = moved.state;
  const landerId = cur.turn.playerId;
  const ownerId = cur.ownership[pos];

  if (!ownerId) {
    // Unowned: offer to buy at face price (existing buy-decision flow).
    const turn: TurnState = { ...cur.turn, phase: "buy-decision", pendingBuy: pos };
    return { state: { ...cur, turn }, newEvents: before };
  }
  if (ownerId === landerId || cur.mortgaged[pos]) {
    return { state: afterLanding(cur), newEvents: before };
  }

  let rentAmount: number;
  if (target === "railroad") {
    const display = rentAt(cur, pos);
    const normal = display !== null && display.kind === "dollars" ? display.amount : 0;
    rentAmount = normal * 2;
  } else {
    // Throw the dice for the utility (the card's own roll, not the move roll).
    const rng = createRng(cur.rngState);
    const d1 = rollDie(rng);
    const d2 = rollDie(rng);
    rentAmount = (d1 + d2) * 10;
    cur = { ...cur, rngState: rng.getState() };
  }
  const charged = chargeRent(cur, landerId, ownerId, pos, rentAmount);
  return { state: charged.state, newEvents: [...before, ...charged.newEvents] };
}

/** Resolve one jail turn for the active (jailed) player by rolling for doubles:
 *  - Doubles → escape and move out by the roll. Escaping on a double does NOT
 *    grant another roll (official), so the turn settles after the landing.
 *  - No doubles on jail turn 1 or 2 → serve another turn; the turn ends, still
 *    jailed, with `jailTurns` advanced.
 *  - No doubles on jail turn 3 → the sentence is up: pay the $50 fine (to the
 *    bank) and move out by the roll. If they can't cover the fine even after
 *    liquidating, they go bankrupt to the bank.
 *
 *  Entered from `autoStep` at `jail-decision` when nobody chose to pay / use a
 *  card. See `monopoly/CLAUDE.md` "Jail". */
function jailRoll(
  state: GameState,
): { state: GameState; newEvents: readonly GameEvent[] } {
  const rng = createRng(state.rngState);
  const idx = state.players.findIndex((p) => p.id === state.turn.playerId);
  const player = state.players[idx];
  const d1 = rollDie(rng);
  const d2 = rollDie(rng);
  const total = d1 + d2;
  const escaped = d1 === d2;
  const jailTurn = player.jailTurns;
  const rngState = rng.getState();
  const rollEvent: GameEvent = { kind: "jail-roll", dice: [d1, d2], escaped, jailTurn };

  if (escaped) {
    // Leave on the double and move out — no bonus roll (doublesStreak stays 0).
    const freed = state.players.map((p, i) =>
      i === idx ? { ...p, inJail: false, jailTurns: 0 } : p,
    );
    const base: GameState = {
      ...state,
      players: freed,
      turns: appendEventToActiveTurn(state.turns, rollEvent),
      rngState,
    };
    const resolved = resolveTile(moveActivePlayer(base, total), total);
    return { state: resolved.state, newEvents: [rollEvent, ...resolved.newEvents] };
  }

  if (jailTurn < 3) {
    // Failed roll, sentence continues: serve another turn, still jailed.
    const stayed = state.players.map((p, i) =>
      i === idx ? { ...p, jailTurns: p.jailTurns + 1 } : p,
    );
    const turns = appendEventToActiveTurn(state.turns, rollEvent);
    const next = advanceToNextPlayer(
      { ...state, players: stayed, turns, rngState },
      state.turn.playerId,
    );
    return { state: next, newEvents: [rollEvent] };
  }

  // Third failed roll: forced to pay the fine to the bank, then move out.
  const payEvent: GameEvent = { kind: "jail-pay" };
  const freed = state.players.map((p, i) =>
    i === idx ? { ...p, inJail: false, jailTurns: 0, cash: p.cash - JAIL_FEE } : p,
  );
  let turns = appendEventToActiveTurn(state.turns, rollEvent);
  turns = appendEventToActiveTurn(turns, payEvent);
  const paid: GameState = { ...state, players: freed, turns, rngState };
  const events: GameEvent[] = [rollEvent, payEvent];

  // Can't cover the $50 even after liquidating everything → bankrupt to the bank.
  const freedPlayer = paid.players[idx];
  if (freedPlayer.cash + maxRaisableCash(paid, freedPlayer.id) < 0) {
    const bust = goBankrupt(paid, freedPlayer.id, null);
    const resolved =
      bustSequenced(bust.state)
        ? bust.state
        : advanceToNextPlayer(bust.state, freedPlayer.id);
    return { state: resolved, newEvents: [...events, ...bust.newEvents] };
  }

  const moved = moveActivePlayer(paid, total);
  if (moved.players[idx].cash < 0) {
    // The fine alone put them in the red: settle before play continues. The
    // landing's own rent is skipped in this rare case (they raise cash first) —
    // a deliberate v1 simplification noted in monopoly/CLAUDE.md.
    return { state: settleOrRaise(moved, "after-landing"), newEvents: events };
  }
  const resolved = resolveTile(moved, total);
  return { state: resolved.state, newEvents: [...events, ...resolved.newEvents] };
}

function applyPayToLeaveJail(
  state: GameState,
  intent: Extract<Intent, { kind: "pay-to-leave-jail" }>,
): ApplyResult {
  if (state.turn.phase !== "jail-decision") {
    return { ok: false, reason: `cannot pay to leave jail in phase ${state.turn.phase}` };
  }
  if (intent.playerId !== state.turn.playerId) {
    return { ok: false, reason: "not your turn" };
  }
  const idx = state.players.findIndex((p) => p.id === intent.playerId);
  const player = state.players[idx];
  if (!player.inJail) return { ok: false, reason: "not in jail" };
  if (player.cash < JAIL_FEE) return { ok: false, reason: "insufficient cash" };

  const players = state.players.map((p, i) =>
    i === idx ? { ...p, cash: p.cash - JAIL_FEE, inJail: false, jailTurns: 0 } : p,
  );
  const payEvent: GameEvent = { kind: "jail-pay" };
  const turns = appendEventToActiveTurn(state.turns, payEvent);
  // Out of jail: resume at pre-roll so the normal auto-roll moves them this
  // turn. A double rolled after paying DOES grant another roll — they're a free
  // player now — which falls out of routing through the standard pre-roll path.
  return {
    ok: true,
    state: { ...state, players, turns, turn: enterPreRoll(intent.playerId) },
    newEvents: [payEvent],
  };
}

function applyUseJailCard(
  state: GameState,
  intent: Extract<Intent, { kind: "use-jail-card" }>,
): ApplyResult {
  if (state.turn.phase !== "jail-decision") {
    return { ok: false, reason: `cannot use a jail card in phase ${state.turn.phase}` };
  }
  if (intent.playerId !== state.turn.playerId) {
    return { ok: false, reason: "not your turn" };
  }
  const idx = state.players.findIndex((p) => p.id === intent.playerId);
  const player = state.players[idx];
  if (!player.inJail) return { ok: false, reason: "not in jail" };
  const source = heldJailCard(state, intent.playerId);
  if (source === null) return { ok: false, reason: "no jail card held" };

  // Return the card to the bottom of its deck: clear the holder and re-append
  // its index to the pile (it left the pile when acquired).
  const jailFreeCards = { ...state.jailFreeCards };
  delete jailFreeCards[source];
  const decks = {
    ...state.decks,
    [source]: [...state.decks[source], gojfIndex(source)],
  };
  const players = state.players.map((p, i) =>
    i === idx ? { ...p, inJail: false, jailTurns: 0 } : p,
  );
  const cardEvent: GameEvent = { kind: "jail-card", source };
  const turns = appendEventToActiveTurn(state.turns, cardEvent);
  return {
    ok: true,
    state: {
      ...state,
      players,
      jailFreeCards,
      decks,
      turns,
      turn: enterPreRoll(intent.playerId),
    },
    newEvents: [cardEvent],
  };
}

/** Run mechanical transitions (dice, movement, rent, card draws, …) until the
 *  state hits a phase that requires a decision. No-op outside the two phases it
 *  drives from: `jail-decision` (a jailed player's turn — roll for doubles via
 *  `jailRoll`, only reached when nobody chose to pay / use a card) and
 *  `pre-roll` (the normal turn start).
 *
 *  At pre-roll it opens a queued boundary intermission, else sends a jailed
 *  player to `jail-decision`, else rolls 2d6 and moves. A third consecutive
 *  double sends the player to jail without moving. Otherwise `resolveTile`
 *  finishes the landing — `go-to-jail` tile, `buy-decision` (unowned ownable),
 *  rent (busting to the creditor when uncoverable), `game-over`, another roll
 *  (doubles), or `post-roll`. Card draws remain deferred. */
export function autoStep(
  state: GameState,
): { state: GameState; newEvents: readonly GameEvent[] } {
  // A jailed player's turn: roll for doubles. Only reached when neither the
  // human prompt nor the bot policy resolved the jail decision with pay / card.
  if (state.turn.phase === "jail-decision") return jailRoll(state);

  if (state.turn.phase !== "pre-roll") {
    return { state, newEvents: [] };
  }
  // "Just before the next roll": if anyone has armed a boundary intermission,
  // open the head entry's phase (trade-building or managing) instead of rolling.
  // This is the single boundary the Trade / Manage toggles pause at — equally
  // "right after a turn ends" and "right before the next begins". Each resolves
  // back to pre-roll, where the next autoStep re-checks the queue.
  const boundary = tryEnterBoundary(state);
  if (boundary) return { state: boundary, newEvents: [] };

  const playerIdx = state.players.findIndex(
    (p) => p.id === state.turn.playerId,
  );
  const player = state.players[playerIdx];

  // A jailed player rolls for doubles instead of moving: open their jail
  // decision. Reached only after the boundary queue is empty, so a jailed
  // player's turn boundary still honors others' trade / manage intermissions.
  // No event — the jail-roll fires on the next autoStep, or the chosen
  // pay / use-card intent resolves it first.
  if (player.inJail) {
    return {
      state: { ...state, turn: { ...state.turn, phase: "jail-decision" } },
      newEvents: [],
    };
  }

  const rng = createRng(state.rngState);
  const d1 = rollDie(rng);
  const d2 = rollDie(rng);
  const total = d1 + d2;
  const sum = player.position + total;
  const toPos = sum % SPACES.length;
  const passedGo = sum >= SPACES.length;
  const doublesStreak = d1 === d2 ? state.turn.doublesStreak + 1 : 0;
  const rollEvent: GameEvent = {
    kind: "roll",
    dice: [d1, d2],
    doublesStreak,
    toPosition: toPos,
    passedGo,
  };
  const base: GameState = {
    ...state,
    turns: appendEventToActiveTurn(state.turns, rollEvent),
    rngState: rng.getState(),
    turn: { ...state.turn, doublesStreak },
  };

  // Third consecutive double: straight to jail without moving or passing GO.
  if (doublesStreak === 3) {
    const jailed = sendToJail(base, "three-doubles");
    return { state: jailed.state, newEvents: [rollEvent, ...jailed.newEvents] };
  }

  const resolved = resolveTile(moveActivePlayer(base, total), total);
  return { state: resolved.state, newEvents: [rollEvent, ...resolved.newEvents] };
}

function rollDie(rng: Rng): number {
  return Math.floor(rng.next() * 6) + 1;
}

// Append an event to the trailing TurnGroup, which is always the active
// player's: freshGame opens it for the starting player and apply(end-turn)
// opens a new one for the next player before autoStep runs again.
function appendEventToActiveTurn(
  turns: readonly TurnGroup[],
  event: GameEvent,
): readonly TurnGroup[] {
  const last = turns[turns.length - 1];
  const updated: TurnGroup = { ...last, events: [...last.events, event] };
  return [...turns.slice(0, -1), updated];
}
