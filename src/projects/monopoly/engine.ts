import { SPACES } from "./data";
import {
  developmentLevel,
  maxBuildingSaleValue,
  planDevelopment,
} from "./development";
import {
  heldJailCard,
  mortgageInterestAt,
  mortgageValueAt,
  ownablePrice,
  rentDue,
  unmortgageCostAt,
} from "./logic";
import type {
  ApplyResult,
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

/** Apply a single external intent. On success the caller should then run
 *  `autoStep` to drain mechanics until the next decision point.
 *
 *  Wired so far: `buy`, `decline-buy`, `manage`, `mortgage`, the trade
 *  sub-game, `toggle-queue`, `cancel-manage`, the jail decisions
 *  (`pay-to-leave-jail`, `use-jail-card`), `end-turn`. Richer intents (auction,
 *  …) are rejected until they're implemented. The surface deliberately stays
 *  small per `monopoly/CLAUDE.md`. No RNG argument — these are deterministic;
 *  engine functions that need randomness read it out of `state.rngState`
 *  themselves. */
export function apply(state: GameState, intent: Intent): ApplyResult {
  if (intent.kind === "buy") return applyBuy(state, intent);
  if (intent.kind === "decline-buy") return applyDeclineBuy(state, intent);
  if (intent.kind === "manage") return applyManage(state, intent);
  if (intent.kind === "mortgage") return applyMortgage(state, intent);
  if (intent.kind === "toggle-queue") return applyToggleQueue(state, intent);
  if (intent.kind === "cancel-manage") return applyCancelManage(state, intent);
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
  if (intent.kind === "end-turn") return applyEndTurn(state, intent);
  return { ok: false, reason: `intent ${intent.kind} not yet implemented` };
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
        tradeDraft: undefined,
        pendingTrade: undefined,
      },
    };
  }
  const cleared: GameState = {
    ...state,
    turn: { ...state.turn, raiseCash: undefined },
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

/** Charge the active player rent for landing on `position`. Two branches:
 *
 *  1. Cash + raisable < rent: they can't cover it even after mortgaging
 *     everything. Transfer whatever cash they have, log the FULL debt (so the
 *     log reads "owed $1100 → bust → estate to Jordan"), bust to the creditor,
 *     and hand control onward (or end at game-over).
 *  2. Otherwise: deduct the rent immediately — cash may go negative — log it,
 *     then `settleOrRaise`. If they had the cash, play continues at once; if
 *     not, they drop into `must-raise-cash` and mortgage back to ≥ 0. The log
 *     reads "rent −$500 (now in the red), mortgage A, mortgage B".
 *
 *  This is the unified debt path: a debtor who CAN recover always does so by
 *  going negative then raising, never by deferring the payment. */
function chargeRent(
  state: GameState,
  payerId: string,
  recipientId: string,
  position: number,
  rentAmount: number,
): { state: GameState; newEvents: readonly GameEvent[] } {
  const payerIdx = state.players.findIndex((p) => p.id === payerId);
  const recipientIdx = state.players.findIndex((p) => p.id === recipientId);
  const payer = state.players[payerIdx];
  const rentEvent: GameEvent = {
    kind: "rent",
    ownerId: recipientId,
    position,
    amount: rentAmount,
  };

  // Can't cover even after mortgaging everything: partial transfer + bust.
  if (payer.cash + maxRaisableCash(state, payerId) < rentAmount) {
    const players = state.players.map((p, i) => {
      if (i === payerIdx) return { ...p, cash: 0 };
      if (i === recipientIdx) return { ...p, cash: p.cash + payer.cash };
      return p;
    });
    const turns = appendEventToActiveTurn(state.turns, rentEvent);
    const bust = goBankrupt({ ...state, players, turns }, payerId, recipientId);
    // Hand control onward unless the bust already ended the game.
    const resolved =
      bust.state.turn.phase === "game-over"
        ? bust.state
        : advanceToNextPlayer(bust.state, payerId);
    return { state: resolved, newEvents: [rentEvent, ...bust.newEvents] };
  }

  // Pay now (cash may dip below zero), log it, then settle or raise.
  const players = state.players.map((p, i) => {
    if (i === payerIdx) return { ...p, cash: p.cash - rentAmount };
    if (i === recipientIdx) return { ...p, cash: p.cash + rentAmount };
    return p;
  });
  const turns = appendEventToActiveTurn(state.turns, rentEvent);
  const charged: GameState = { ...state, players, turns };
  return {
    state: settleOrRaise(charged, "after-landing"),
    newEvents: [rentEvent],
  };
}

/** Settle a player's estate when they go bankrupt. Two creditors:
 *
 *  - A **player** creditor (`creditorId` set, the usual rent / fee bust): their
 *    properties (with houses and mortgage status) and Get-Out-of-Jail-Free cards
 *    flow to that creditor.
 *  - The **bank** (`creditorId === null`, e.g. an unpayable jail fine, later
 *    tax): the estate reverts — properties become unowned (buildings and
 *    mortgage flags cleared), held GOJF cards return to their decks.
 *
 *  Cash already moved in the charge path, so this just zeroes whatever remains.
 *  Emits a `bankrupt` event, and a `winner` event + game-over phase transition
 *  if exactly one non-bankrupt player remains.
 *
 *  Simplifications flagged in CLAUDE.md (deferred): real Monopoly forces houses
 *  to be sold back to the bank at half price when an estate transfers (here they
 *  ride along to a player creditor), and a bank estate is auctioned off rather
 *  than simply freed (auction isn't built). Both keep the engine lean and most
 *  house games play them this way. */
function goBankrupt(
  state: GameState,
  debtorId: string,
  creditorId: string | null,
): { state: GameState; newEvents: readonly GameEvent[] } {
  const debtorIdx = state.players.findIndex((p) => p.id === debtorId);
  const players = state.players.map((p, i) =>
    i === debtorIdx ? { ...p, cash: 0, bankrupt: true } : p,
  );

  const ownership: Record<number, string> = {};
  const houses = { ...state.houses };
  const mortgaged = { ...state.mortgaged };
  for (const [posStr, ownerId] of Object.entries(state.ownership)) {
    const pos = Number(posStr);
    if (ownerId !== debtorId) {
      ownership[pos] = ownerId;
    } else if (creditorId !== null) {
      ownership[pos] = creditorId;
    } else {
      // To the bank: the lot reverts to unowned, buildings and mortgage gone.
      delete houses[pos];
      delete mortgaged[pos];
    }
  }

  const jailFreeCards = { ...state.jailFreeCards };
  if (jailFreeCards.chance === debtorId) {
    if (creditorId !== null) jailFreeCards.chance = creditorId;
    else delete jailFreeCards.chance;
  }
  if (jailFreeCards.communityChest === debtorId) {
    if (creditorId !== null) jailFreeCards.communityChest = creditorId;
    else delete jailFreeCards.communityChest;
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
    turns,
  };

  // Winner check: exactly one survivor means the game is over.
  const alive = players.filter((p) => !p.bankrupt);
  if (alive.length === 1) {
    const winnerEvent: GameEvent = { kind: "winner", winnerId: alive[0].id };
    turns = appendEventToActiveTurn(next.turns, winnerEvent);
    newEvents.push(winnerEvent);
    next = {
      ...next,
      status: "finished",
      turns,
      turn: { ...next.turn, phase: "game-over" },
    };
  }

  return { state: next, newEvents };
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
  // CLAUDE.md says decline-buy sends the property to auction, but the
  // auction sub-game isn't built yet. Until it lands, declining just leaves
  // the property unowned and resolves the landing (post-roll, or another
  // roll when the move was doubles).
  return { ok: true, state: afterLanding(state), newEvents: [] };
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
      // Mortgaging raises cash; the lot must be building-free once the build
      // side runs (so "sell its houses then mortgage it" works in one commit).
      if (finalLevel(pos) !== 0) {
        return { ok: false, reason: "sell buildings before mortgaging" };
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
  if (state.houses[intent.position]) {
    return { ok: false, reason: "must sell buildings first" };
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
 *  hands. */
function mortgageInterestFees(
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
  const fees = mortgageInterestFees(state, terms);
  const players = state.players.map((p) => {
    const change = (terms.cashDelta[p.id] ?? 0) - (fees[p.id] ?? 0);
    return change === 0 ? p : { ...p, cash: p.cash + change };
  });
  return { ...state, ownership, jailFreeCards, players };
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
    turn: { ...state.turn, phase: "managing", managerId: entry.playerId },
  };
}

function applyToggleQueue(
  state: GameState,
  intent: Extract<Intent, { kind: "toggle-queue" }>,
): ApplyResult {
  if (!isActivePlayer(state, intent.playerId)) {
    return { ok: false, reason: "unknown player" };
  }
  const inQueue = state.boundaryQueue.some(
    (e) => e.playerId === intent.playerId && e.kind === intent.queue,
  );
  const boundaryQueue = inQueue
    ? state.boundaryQueue.filter(
        (e) => !(e.playerId === intent.playerId && e.kind === intent.queue),
      )
    : [...state.boundaryQueue, { playerId: intent.playerId, kind: intent.queue }];
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
  if (SPACES[toPos].kind === "go-to-jail") return sendToJail(state, "tile");

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

/** Send the active player to jail — landing on the "Go to Jail" tile or rolling
 *  a third consecutive double. Relocate them to the Jail cell, lock them in on
 *  jail turn 1, log `go-to-jail`, and end the turn: going to jail forfeits the
 *  rest of the turn even if the move was a double. No GO salary (you're sent,
 *  not advanced past GO). */
function sendToJail(
  state: GameState,
  reason: "tile" | "three-doubles",
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
      bust.state.turn.phase === "game-over"
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

  // Return the card to the bottom of its deck (holder cleared).
  const jailFreeCards = { ...state.jailFreeCards };
  delete jailFreeCards[source];
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
 *  (doubles), or `post-roll`. Card draws and tax remain deferred. */
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
