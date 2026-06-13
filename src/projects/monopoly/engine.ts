import { SPACES } from "./data";
import { ownablePrice } from "./logic";
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
  };
  const armedPauses = paused
    ? clearArmedFlag(state.armedPauses, state.turn.playerId, "beforeEnd")
    : state.armedPauses;
  return { turn, armedPauses };
}

function clearArmedFlag(
  armedPauses: GameState["armedPauses"],
  playerId: string,
  flag: keyof ArmedPauses,
): GameState["armedPauses"] {
  const cur = armedPauses[playerId];
  return { ...armedPauses, [playerId]: { ...cur, [flag]: false } };
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
  const { turn, armedPauses } = enterPostRoll(afterPurchase);
  return {
    ok: true,
    state: { ...afterPurchase, turn, armedPauses },
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
  // the property unowned and drops the active turn into post-roll.
  const { turn, armedPauses } = enterPostRoll(state);
  return { ok: true, state: { ...state, turn, armedPauses }, newEvents: [] };
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

  const currentIdx = state.players.findIndex((p) => p.id === intent.playerId);
  const nextIdx = (currentIdx + 1) % state.players.length;
  const nextPlayer = state.players[nextIdx];
  const lastTurn = state.turns[state.turns.length - 1];
  const nextTurnGroup: TurnGroup = {
    turn: lastTurn.turn + 1,
    playerId: nextPlayer.id,
    events: [],
  };
  const { turn, armedPauses } = enterPreRoll(state.armedPauses, nextPlayer.id);
  return {
    ok: true,
    state: {
      ...state,
      turns: [...state.turns, nextTurnGroup],
      turn,
      armedPauses,
    },
    newEvents: [],
  };
}

/** Run mechanical transitions (dice, movement, rent, card draws, …) until
 *  the state hits a phase that requires a decision or has `turn.paused`
 *  set. No-op when the state is already at a decision point.
 *
 *  Current scope: rolls 2d6 in `pre-roll`, moves the active player, records
 *  the roll event, and either stops at `buy-decision` (when the landed
 *  square is an unowned property/railroad/utility) or at `post-roll`.
 *  Doubles, jail, rent, card draws, and tax are intentionally deferred —
 *  landing on a square is otherwise a no-op while we grow the loop. */
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
    doublesStreak: 0,
    toPosition: toPos,
    passedGo,
  };
  const turns = appendEventToActiveTurn(state.turns, rollEvent);
  const afterMove: GameState = {
    ...state,
    players,
    turns,
    rngState: rng.getState(),
  };
  const landedOnUnownedOwnable =
    ownablePrice(toPos) !== null && !(toPos in state.ownership);
  if (landedOnUnownedOwnable) {
    // Buy-decision is its own phase; the armed `beforeEnd` pause is
    // consumed at post-roll, not here. If the player buys or declines, the
    // applyBuy / applyDeclineBuy paths route through `enterPostRoll` and
    // honor the armed flag then.
    const turn: TurnState = {
      ...state.turn,
      phase: "buy-decision",
      pendingBuy: toPos,
    };
    return { state: { ...afterMove, turn }, newEvents: [rollEvent] };
  }
  const { turn, armedPauses } = enterPostRoll(afterMove);
  return {
    state: { ...afterMove, turn, armedPauses },
    newEvents: [rollEvent],
  };
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
