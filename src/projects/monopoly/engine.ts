import { SPACES } from "./data";
import {
  mortgageValueAt,
  ownablePrice,
  rentDue,
  unmortgageCostAt,
} from "./logic";
import type {
  ArmedPauses,
  ApplyResult,
  GameEvent,
  GameState,
  Intent,
  Player,
  TurnGroup,
  TurnState,
} from "./types";

/** Salary paid to a player whose move passes (or lands on) GO. */
const PASS_GO_SALARY = 200;

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
 *  Wired so far: `buy`, `decline-buy`, `set-armed-pause`, `resume`,
 *  `end-turn`. Richer intents (build, trade, …) are rejected until they're
 *  implemented. The surface deliberately stays small per
 *  `monopoly/CLAUDE.md`. No RNG argument — these are deterministic; engine
 *  functions that need randomness read it out of `state.rngState` themselves. */
export function apply(state: GameState, intent: Intent): ApplyResult {
  if (intent.kind === "buy") return applyBuy(state, intent);
  if (intent.kind === "decline-buy") return applyDeclineBuy(state, intent);
  if (intent.kind === "set-armed-pause") {
    return applySetArmedPause(state, intent);
  }
  if (intent.kind === "mortgage") return applyMortgage(state, intent);
  if (intent.kind === "unmortgage") return applyUnmortgage(state, intent);
  if (intent.kind === "resume") return applyResume(state, intent);
  if (intent.kind === "end-turn") return applyEndTurn(state, intent);
  return { ok: false, reason: `intent ${intent.kind} not yet implemented` };
}

/** Compute the next turn block when control passes to `nextPlayerId` at
 *  pre-roll, consuming a `beforeRoll` armed pause if one is set. Caller
 *  merges the returned values into the new state.
 *
 *  Centralized so every path into pre-roll (end-turn today; future
 *  three-doubles bust-out, jail-release, etc.) honors armed pauses
 *  identically. */
function enterPreRoll(
  armedPausesIn: GameState["armedPauses"],
  nextPlayerId: string,
): { turn: TurnState; armedPauses: GameState["armedPauses"] } {
  // `armedPauses` is dense by invariant: every seated player has an entry
  // (freshGame seeds it; sliceState preserves it). Routes that mutate the
  // record (applySetArmedPause) only touch known players. So a direct
  // lookup is safe — no optional chaining required.
  const paused = armedPausesIn[nextPlayerId].beforeRoll;
  const turn: TurnState = {
    playerId: nextPlayerId,
    phase: "pre-roll",
    doublesStreak: 0,
    paused,
  };
  const armedPauses = paused
    ? clearArmedFlag(armedPausesIn, nextPlayerId, "beforeRoll")
    : armedPausesIn;
  return { turn, armedPauses };
}

/** Compute the next turn block for the active player landing at post-roll,
 *  consuming a `beforeEnd` armed pause if one is set. Also clears any
 *  `pendingBuy` from a just-resolved buy-decision so the post-roll state
 *  doesn't carry stale data.
 *
 *  Centralized so every path into post-roll (`autoStep` after a no-op
 *  landing, `applyBuy`, `applyDeclineBuy`, future rent/tax/card paths)
 *  honors armed pauses identically. */
function enterPostRoll(
  state: GameState,
): { turn: TurnState; armedPauses: GameState["armedPauses"] } {
  // See enterPreRoll: dense-record invariant lets us drop the optional chain.
  const paused = state.armedPauses[state.turn.playerId].beforeEnd;
  const turn: TurnState = {
    ...state.turn,
    phase: "post-roll",
    paused,
    pendingBuy: undefined,
    pendingDebt: undefined,
  };
  const armedPauses = paused
    ? clearArmedFlag(state.armedPauses, state.turn.playerId, "beforeEnd")
    : state.armedPauses;
  return { turn, armedPauses };
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
    // Rolled doubles: same player rolls again. Keep the streak and honor an
    // armed before-roll pause exactly as a fresh turn would.
    const paused = state.armedPauses[state.turn.playerId].beforeRoll;
    const turn: TurnState = {
      ...state.turn,
      phase: "pre-roll",
      paused,
      pendingBuy: undefined,
    };
    const armedPauses = paused
      ? clearArmedFlag(state.armedPauses, state.turn.playerId, "beforeRoll")
      : state.armedPauses;
    return { ...state, turn, armedPauses };
  }
  const { turn, armedPauses } = enterPostRoll(state);
  return { ...state, turn, armedPauses };
}

function clearArmedFlag(
  armedPauses: GameState["armedPauses"],
  playerId: string,
  flag: keyof ArmedPauses,
): GameState["armedPauses"] {
  const cur = armedPauses[playerId];
  return { ...armedPauses, [playerId]: { ...cur, [flag]: false } };
}

/** Hand control to the next non-bankrupt player in seating order: open a
 *  new TurnGroup for them and route through `enterPreRoll` so any armed
 *  pause fires identically to the end-turn path. Used by `applyEndTurn`
 *  and by `autoStep` when a player busts mid-turn. Assumes at least one
 *  non-bankrupt player exists — the winner check in `goBankrupt` flips the
 *  phase to `game-over` before this can be reached otherwise. */
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
    const { turn, armedPauses } = enterPreRoll(state.armedPauses, candidate.id);
    return {
      ...state,
      turns: [...state.turns, nextTurnGroup],
      turn,
      armedPauses,
    };
  }
  return state;
}

/** Maximum cash a player could raise right now by mortgaging every
 *  un-mortgaged, building-free ownable they own. Used to decide between
 *  the must-raise-cash path (player CAN cover the debt with mortgages) and
 *  immediate bankruptcy (they couldn't even if they mortgaged everything).
 *
 *  Buildings block mortgaging in official rules, so a property with houses
 *  contributes nothing here — once selling buildings lands, this will
 *  expand to "could sell N houses for $X" too. */
function maxRaisableCash(state: GameState, ownerId: string): number {
  let total = 0;
  for (const [posStr, oid] of Object.entries(state.ownership)) {
    if (oid !== ownerId) continue;
    const pos = Number(posStr);
    if (state.mortgaged[pos]) continue;
    if (state.houses[pos]) continue;
    const value = mortgageValueAt(pos);
    if (value !== null) total += value;
  }
  return total;
}

/** Charge the active player rent for landing on `position`. Three branches:
 *
 *  1. Cash >= debt: pay in full immediately. Emit a `rent` event reflecting
 *     the payment.
 *  2. Cash < debt but cash + raisable >= debt: enter the `must-raise-cash`
 *     phase with `pendingDebt` set. No cash moves and no event is emitted
 *     yet — the rent event fires at settle time (in `applyMortgage` when
 *     the player has scraped enough cash together to clear the debt). The
 *     log reads "mortgage A, mortgage B, rent paid" in chronological order
 *     rather than "rent owed" then a silent settlement.
 *  3. Cash + raisable < debt: emit the rent event with the FULL debt
 *     (records the obligation), transfer all of the payer's cash to the
 *     creditor, and bust them. The log reads "owed $1100 → bust → estate
 *     to Jordan" — papering over the partial settlement is more confusing
 *     than calling it out. */
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

  if (payer.cash >= rentAmount) {
    const players = state.players.map((p, i) => {
      if (i === payerIdx) return { ...p, cash: p.cash - rentAmount };
      if (i === recipientIdx) return { ...p, cash: p.cash + rentAmount };
      return p;
    });
    const rentEvent: GameEvent = {
      kind: "rent",
      ownerId: recipientId,
      position,
      amount: rentAmount,
    };
    const turns = appendEventToActiveTurn(state.turns, rentEvent);
    return {
      state: { ...state, players, turns },
      newEvents: [rentEvent],
    };
  }

  const raisable = maxRaisableCash(state, payerId);
  if (payer.cash + raisable >= rentAmount) {
    // Enter must-raise-cash. Cash transfer and rent event are deferred to
    // settle time so the log reads in chronological order.
    const turn: TurnState = {
      ...state.turn,
      phase: "must-raise-cash",
      paused: false,
      pendingDebt: { amount: rentAmount, creditorId: recipientId },
    };
    return { state: { ...state, turn }, newEvents: [] };
  }

  // Even mortgaging everything won't cover. Transfer whatever cash there
  // is, log the full debt, bust.
  const players = state.players.map((p, i) => {
    if (i === payerIdx) return { ...p, cash: 0 };
    if (i === recipientIdx) return { ...p, cash: p.cash + payer.cash };
    return p;
  });
  const rentEvent: GameEvent = {
    kind: "rent",
    ownerId: recipientId,
    position,
    amount: rentAmount,
  };
  const turns = appendEventToActiveTurn(state.turns, rentEvent);
  const afterPartial: GameState = { ...state, players, turns };
  const bust = goBankrupt(afterPartial, payerId, recipientId);
  return {
    state: bust.state,
    newEvents: [rentEvent, ...bust.newEvents],
  };
}

/** Pay an active-turn `pendingDebt` and exit the must-raise-cash phase
 *  through the same `afterLanding` path the original rent step would have
 *  taken if cash had been available — which means doubles still grant
 *  another roll, and armed `beforeEnd` pauses still fire when the streak
 *  ends. Emits the deferred `rent` event recording the full debt amount.
 *  Used by `applyMortgage` once the payer's cash crosses the threshold.
 *
 *  Assumes the caller has already verified `pendingDebt` is set and
 *  `payer.cash >= debt.amount` — both conditions hold by construction at
 *  every call site. */
function settleDebt(
  state: GameState,
  payerId: string,
  position: number,
): { state: GameState; newEvents: readonly GameEvent[] } {
  if (!state.turn.pendingDebt) {
    throw new Error("settleDebt called without pendingDebt");
  }
  const debt = state.turn.pendingDebt;
  const payerIdx = state.players.findIndex((p) => p.id === payerId);
  const creditorIdx = state.players.findIndex((p) => p.id === debt.creditorId);

  const players = state.players.map((p, i) => {
    if (i === payerIdx) return { ...p, cash: p.cash - debt.amount };
    if (i === creditorIdx) return { ...p, cash: p.cash + debt.amount };
    return p;
  });

  const rentEvent: GameEvent = {
    kind: "rent",
    ownerId: debt.creditorId,
    position,
    amount: debt.amount,
  };
  const turns = appendEventToActiveTurn(state.turns, rentEvent);
  // Drop the must-raise-cash phase (any value works as a placeholder —
  // afterLanding will pick the correct next phase from doublesStreak) and
  // clear pendingDebt before handing off.
  const paid: GameState = {
    ...state,
    players,
    turns,
    turn: { ...state.turn, pendingDebt: undefined },
  };
  return {
    state: afterLanding(paid),
    newEvents: [rentEvent],
  };
}

/** Settle a player's estate to a creditor: their properties (with houses
 *  and mortgage status) and Get-Out-of-Jail-Free cards flow to the
 *  creditor; cash already moved in `chargeRent` so this just zeroes
 *  whatever remains. Emits a `bankrupt` event, and a `winner` event +
 *  game-over phase transition if exactly one non-bankrupt player remains.
 *
 *  Simplification flagged in CLAUDE.md (deferred): real Monopoly forces
 *  houses to be sold back to the bank at half price when the estate
 *  transfers. Here they ride along with the property — most house games
 *  play it this way and the simpler rule keeps the engine lean. */
function goBankrupt(
  state: GameState,
  debtorId: string,
  creditorId: string,
): { state: GameState; newEvents: readonly GameEvent[] } {
  const debtorIdx = state.players.findIndex((p) => p.id === debtorId);
  const players = state.players.map((p, i) =>
    i === debtorIdx ? { ...p, cash: 0, bankrupt: true } : p,
  );

  const ownership: Record<number, string> = {};
  for (const [posStr, ownerId] of Object.entries(state.ownership)) {
    const pos = Number(posStr);
    ownership[pos] = ownerId === debtorId ? creditorId : ownerId;
  }

  const jailFreeCards = { ...state.jailFreeCards };
  if (jailFreeCards.chance === debtorId) jailFreeCards.chance = creditorId;
  if (jailFreeCards.communityChest === debtorId) {
    jailFreeCards.communityChest = creditorId;
  }

  const bankruptEvent: GameEvent = { kind: "bankrupt", creditorId };
  let turns = appendEventToActiveTurn(state.turns, bankruptEvent);
  const newEvents: GameEvent[] = [bankruptEvent];
  let next: GameState = {
    ...state,
    players,
    ownership,
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
      turn: { ...next.turn, phase: "game-over", paused: false },
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

/** Phases that allow voluntary mortgage / unmortgage actions on the active
 *  player's own turn — gated by `paused` for the rolling phases so a
 *  player can't sneak a mortgage between the auto-pacer's roll and rent
 *  steps. `must-raise-cash` is a separate, forced entry point that only
 *  accepts mortgage (not unmortgage) — see applyMortgage / applyUnmortgage. */
function canActOnAssets(state: GameState): boolean {
  const { phase, paused } = state.turn;
  if (phase === "pre-roll" && paused) return true;
  if (phase === "post-roll" && paused) return true;
  return false;
}

function applyMortgage(
  state: GameState,
  intent: Extract<Intent, { kind: "mortgage" }>,
): ApplyResult {
  if (intent.playerId !== state.turn.playerId) {
    return { ok: false, reason: "not your turn" };
  }
  const inRaiseCash = state.turn.phase === "must-raise-cash";
  if (!inRaiseCash && !canActOnAssets(state)) {
    return {
      ok: false,
      reason: `cannot mortgage in phase ${state.turn.phase}`,
    };
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

  // Auto-settle the must-raise-cash debt the moment cash crosses the
  // threshold. The player's mortgage flow is "raise just enough" — no
  // explicit confirmation step. settleDebt routes through enterPostRoll so
  // armed `beforeEnd` pauses still fire correctly after the bust.
  if (inRaiseCash && state.turn.pendingDebt) {
    const updatedPayer = afterMortgage.players[payerIdx];
    if (updatedPayer.cash >= state.turn.pendingDebt.amount) {
      const position = state.players[payerIdx].position;
      const settled = settleDebt(afterMortgage, intent.playerId, position);
      return {
        ok: true,
        state: settled.state,
        newEvents: [mortgageEvent, ...settled.newEvents],
      };
    }
  }

  return { ok: true, state: afterMortgage, newEvents: [mortgageEvent] };
}

function applyUnmortgage(
  state: GameState,
  intent: Extract<Intent, { kind: "unmortgage" }>,
): ApplyResult {
  if (intent.playerId !== state.turn.playerId) {
    return { ok: false, reason: "not your turn" };
  }
  if (!canActOnAssets(state)) {
    return {
      ok: false,
      reason: `cannot unmortgage in phase ${state.turn.phase}`,
    };
  }
  if (state.ownership[intent.position] !== intent.playerId) {
    return { ok: false, reason: "you don't own that square" };
  }
  if (!state.mortgaged[intent.position]) {
    return { ok: false, reason: "not mortgaged" };
  }
  const cost = unmortgageCostAt(intent.position);
  if (cost === null) {
    return { ok: false, reason: "not an ownable space" };
  }
  const payerIdx = state.players.findIndex((p) => p.id === intent.playerId);
  const payer = state.players[payerIdx];
  if (payer.cash < cost) {
    return { ok: false, reason: "insufficient cash" };
  }
  const players = state.players.map((p, i) =>
    i === payerIdx ? { ...p, cash: p.cash - cost } : p,
  );
  const mortgaged: Record<number, boolean> = {};
  for (const [posStr, flag] of Object.entries(state.mortgaged)) {
    if (Number(posStr) === intent.position) continue;
    mortgaged[Number(posStr)] = flag;
  }
  const unmortgageEvent: GameEvent = {
    kind: "unmortgage",
    position: intent.position,
    cost,
  };
  const turns = appendEventToActiveTurn(state.turns, unmortgageEvent);
  return {
    ok: true,
    state: { ...state, players, mortgaged, turns },
    newEvents: [unmortgageEvent],
  };
}

function applySetArmedPause(
  state: GameState,
  intent: Extract<Intent, { kind: "set-armed-pause" }>,
): ApplyResult {
  if (!state.players.some((p) => p.id === intent.playerId)) {
    return { ok: false, reason: "unknown player" };
  }
  const cur = state.armedPauses[intent.playerId];
  const key: keyof ArmedPauses =
    intent.when === "before-roll" ? "beforeRoll" : "beforeEnd";
  if (cur[key] === intent.armed) {
    // Idempotent: the checkbox UI may resubmit the value it already holds
    // (e.g. on a re-render driven by a remote state push). Accept without
    // emitting a change so the diff stays clean.
    return { ok: true, state, newEvents: [] };
  }
  const updated: ArmedPauses = { ...cur, [key]: intent.armed };
  const armedPauses = { ...state.armedPauses, [intent.playerId]: updated };
  return { ok: true, state: { ...state, armedPauses }, newEvents: [] };
}

function applyResume(
  state: GameState,
  intent: Extract<Intent, { kind: "resume" }>,
): ApplyResult {
  // Only the active player can resume their own turn — the pause belongs
  // to the active turn, not to whoever armed it.
  if (intent.playerId !== state.turn.playerId) {
    return { ok: false, reason: "not your turn" };
  }
  if (!state.turn.paused) {
    return { ok: false, reason: "turn is not paused" };
  }
  return {
    ok: true,
    state: { ...state, turn: { ...state.turn, paused: false } },
    newEvents: [],
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

/** Run mechanical transitions (dice, movement, rent, card draws, …) until
 *  the state hits a phase that requires a decision or has `turn.paused`
 *  set. No-op when the state is already at a decision point.
 *
 *  Current scope: rolls 2d6 in `pre-roll`, moves the active player, pays
 *  rent if the landed square is owned by someone else (busting the active
 *  player to the creditor when they can't cover), then either stops at
 *  `buy-decision` (unowned ownable), `game-over` (only one survivor),
 *  the next non-bankrupt player's `pre-roll` (active player just busted),
 *  another `pre-roll` for the same player (rolled doubles), or `post-roll`
 *  (default). Doubles grant another roll, capped at three in a row — the
 *  third would jail the player, which isn't built yet, so the turn just
 *  ends. Jail, card draws, and tax remain deferred. */
export function autoStep(
  state: GameState,
): { state: GameState; newEvents: readonly GameEvent[] } {
  if (state.turn.phase !== "pre-roll" || state.turn.paused) {
    return { state, newEvents: [] };
  }
  const rng = createRng(state.rngState);
  const playerIdx = state.players.findIndex(
    (p) => p.id === state.turn.playerId,
  );
  const player = state.players[playerIdx];

  const d1 = rollDie(rng);
  const d2 = rollDie(rng);
  const total = d1 + d2;
  const fromPos = player.position;
  const sum = fromPos + total;
  const toPos = sum % SPACES.length;
  const passedGo = sum >= SPACES.length;
  const doublesStreak = d1 === d2 ? state.turn.doublesStreak + 1 : 0;

  const movedPlayer: Player = {
    ...player,
    position: toPos,
    cash: passedGo ? player.cash + PASS_GO_SALARY : player.cash,
  };
  const players = state.players.map((p, i) =>
    i === playerIdx ? movedPlayer : p,
  );

  const rollEvent: GameEvent = {
    kind: "roll",
    dice: [d1, d2],
    doublesStreak,
    toPosition: toPos,
    passedGo,
  };
  const turns = appendEventToActiveTurn(state.turns, rollEvent);
  const afterMove: GameState = {
    ...state,
    players,
    turns,
    rngState: rng.getState(),
    turn: { ...state.turn, doublesStreak },
  };

  const landedOnUnownedOwnable =
    ownablePrice(toPos) !== null && !(toPos in state.ownership);
  if (landedOnUnownedOwnable) {
    // Buy-decision is its own phase; the armed `beforeEnd` pause is
    // consumed at post-roll, not here. If the player buys or declines, the
    // applyBuy / applyDeclineBuy paths route through `enterPostRoll` and
    // honor the armed flag then.
    const turn: TurnState = {
      ...afterMove.turn,
      phase: "buy-decision",
      pendingBuy: toPos,
    };
    return { state: { ...afterMove, turn }, newEvents: [rollEvent] };
  }

  let workingState = afterMove;
  const newEvents: GameEvent[] = [rollEvent];

  // Charge rent if owed. `rentDue` already returns null for unowned,
  // self-owned, and mortgaged squares — no extra branching needed here.
  const amount = rentDue(workingState, toPos, total, state.turn.playerId);
  if (amount !== null && amount > 0) {
    const ownerId = workingState.ownership[toPos];
    const charged = chargeRent(
      workingState,
      state.turn.playerId,
      ownerId,
      toPos,
      amount,
    );
    workingState = charged.state;
    newEvents.push(...charged.newEvents);
  }

  // If rent busted the active player out, hand control to the next
  // non-bankrupt player (or stay at game-over if `goBankrupt` already set
  // the phase that way). Skips both `post-roll` and any armed `beforeEnd`
  // pause for the bankrupt player — they're not making more decisions.
  const activeAfter = workingState.players[playerIdx];
  if (activeAfter.bankrupt) {
    if (workingState.turn.phase === "game-over") {
      return { state: workingState, newEvents };
    }
    return {
      state: advanceToNextPlayer(workingState, state.turn.playerId),
      newEvents,
    };
  }

  // Rent couldn't be paid from cash but the player can raise it by
  // mortgaging — chargeRent parked the state at must-raise-cash. Don't
  // route through afterLanding; the player owes the engine a settle before
  // the post-roll transition (which happens inside applyMortgage when cash
  // crosses the debt threshold).
  if (workingState.turn.phase === "must-raise-cash") {
    return { state: workingState, newEvents };
  }

  return { state: afterLanding(workingState), newEvents };
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
