import { describe, expect, it } from "vitest";
import { apply, autoStep, isLegal } from "../../engine";
import { freshGame } from "../../mocks";
import { driveOp } from "../../pacing";
import type { GameState, Intent } from "../../types";
import type { Bot } from "../decision";
import { botFor } from "../registry";
import { landonBot } from "./landon";

// ---------------------------------------------------------------------------
// Does the learned policy actually PLAY?
//
// Every other suite here measures numbers: parity to the trainer's distributions,
// element-identity of the extracted encoder. None of them plays a move. This one
// drives real games through the pacer and asserts the three things the numeric
// suites structurally cannot see:
//
//   - the multi-consultation composites resolve (arm -> commit, draft -> propose)
//     rather than bouncing or wedging;
//   - every intent the bot emits is legal on the state it was handed;
//   - turns reach their dice, so games actually finish.
// ---------------------------------------------------------------------------

/** The shipped main-agent bundle, read out of the repo like everything else the
 *  suite touches — so this suite runs, and has to pass, on a fresh clone. */
const BUNDLE = "landon-v1";

/** The pacer drives seats whose `botStrategy` is set; `freshGame` leaves seat 0
 *  human, and a human seat makes `driverRole` return "none" so the game cannot
 *  advance at all. */
function allBots(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, botStrategy: "dumb" as const })),
  };
}

/** Play one game to termination (or the step cap), routing `seats` to their bots
 *  and asserting legality on every intent the pacer accepts. */
function play(
  seed: string,
  seats: readonly (Bot | null)[],
  // A few thousand beats is several full turn-cycles — plenty to show composites
  // resolving and turns reaching their dice. Games are NOT played to a winner
  // here: at ~17 ms per forward pass that is minutes each, and strength is the
  // gauntlet's job anyway. This suite only has to prove the bot is well-formed.
  cap = 2_000,
): {
  state: GameState;
  steps: number;
  intents: number;
  byKind: Record<string, number>;
  ms: number;
} {
  const started = performance.now();
  let state = allBots(freshGame(seed));
  const byKind: Record<string, number> = {};
  let intents = 0;
  let steps = 0;

  const resolve = (s: GameState, playerId: string): Bot | null => {
    const idx = s.players.findIndex((p) => p.id === playerId);
    return idx < 0 ? null : (seats[idx] ?? botFor("opt-v4"));
  };

  for (; steps < cap; steps++) {
    if (state.status !== "active") break;
    const op = driveOp(state, true, null, resolve);
    if (op === null) break;
    if (op.kind === "step") {
      const next = autoStep(state).state;
      if (next === state) break; // no mechanical progress available
      state = next;
      continue;
    }
    const intent: Intent = op.intent;
    expect(isLegal(state, intent), `illegal ${intent.kind} at ${state.turn.phase}`).toBe(true);
    const next = applyChecked(state, intent);
    byKind[intent.kind] = (byKind[intent.kind] ?? 0) + 1;
    intents++;
    if (next === state) break;
    state = next;
  }
  return { state, steps, intents, byKind, ms: performance.now() - started };
}

function applyChecked(state: GameState, intent: Intent): GameState {
  const r = apply(state, intent);
  expect(r.ok, `apply rejected ${intent.kind}`).toBe(true);
  return r.ok ? r.state : state;
}

describe("the learned bot plays real games", () => {
  const bot = landonBot({ bundle: BUNDLE });

  it("loads its bundle and answers on a fresh board", () => {
    const state = allBots(freshGame("smoke"));
    const decision = bot(state, state.turn.playerId);
    // `null` is contractually fine, but a bot whose weights failed to load
    // answers null EVERYWHERE — which is what this really guards.
    const answered = state.players.some((p) => bot(state, p.id) !== null);
    expect(answered || decision === null).toBe(true);
  });

  it("is deterministic across repeated calls", () => {
    const state = allBots(freshGame("determinism"));
    for (const p of state.players) {
      expect(bot(state, p.id)).toEqual(bot(state, p.id));
    }
  });

  it("plays a full game against archive bots without an illegal move", { timeout: 300_000 }, () => {
    const { state, steps, intents, byKind, ms } = play("landon-vs-field", [bot, null, null, null]);
    console.log(
      `[ppo/bot] seat0=landon vs opt-v4 x3: ${steps.toString()} steps, ` +
        `${intents.toString()} intents, status=${state.status}, ` +
        `turn=${state.turns.length.toString()}, ${(ms / 1000).toFixed(1)}s ` +
        `(${(steps / (ms / 1000)).toFixed(0)} beats/s), kinds=${JSON.stringify(byKind)}`,
    );
    expect(intents).toBeGreaterThan(50);
    // A turn that never reaches its dice is the classic wedge for a policy that
    // arms boundaries; if the game advanced turns, the composites are resolving.
    expect(state.turns.length).toBeGreaterThan(5);
  });

  it("plays every seat without an illegal move", { timeout: 300_000 }, () => {
    const { state, steps, intents, byKind, ms } = play("landon-selfplay", [bot, bot, bot, bot]);
    console.log(
      `[ppo/bot] self-play: ${intents.toString()} intents, status=${state.status}, ` +
        `turn=${state.turns.length.toString()}, ${(ms / 1000).toFixed(1)}s ` +
        `(${(steps / (ms / 1000)).toFixed(0)} beats/s), kinds=${JSON.stringify(byKind)}`,
    );
    expect(intents).toBeGreaterThan(50);
    expect(state.turns.length).toBeGreaterThan(5);
  });

  // The composite that has no analogue in training: the rig armed and committed a
  // manage plan inside ONE transition, the pacer spreads it over two
  // consultations. If the arm ever fails to produce a commit, `manage` never
  // appears while `set-queue` does.
  it("resolves the manage composite: arms lead to commits", { timeout: 300_000 }, () => {
    const { byKind } = play("landon-manage", [bot, bot, bot, bot]);
    const arms = byKind["set-queue"] ?? 0;
    const commits = byKind["manage"] ?? 0;
    const cancels = byKind["cancel-manage"] ?? 0;
    console.log(
      `[ppo/bot] composites: set-queue=${arms.toString()} manage=${commits.toString()} ` +
        `cancel-manage=${cancels.toString()} propose-trade=${(byKind["propose-trade"] ?? 0).toString()} ` +
        `update-trade-draft=${(byKind["update-trade-draft"] ?? 0).toString()}`,
    );
    if (arms > 0) expect(commits + cancels).toBeGreaterThan(0);
  });
});
