import { describe, expect, it } from "vitest";
import type { GameState, Seat } from "../contract";
import { referenceEngine as engine } from ".";
import { checkOptionsMatchApply, MAX_STEPS, play, playRandomGame } from "./test-kit";

// Random-legal games with every invariant checked on every step (INV-1..INV-9) and the options
// held equal to what `apply` accepts: one game per player count, which between them reach every
// event the engine emits. `fuzz.slow.test.ts` plays many more.

describe("random-legal games", () => {
  for (const players of [3, 4, 5, 6]) {
    it(`${players} players: invariants hold on every step, options match apply, and the game ends`, () => {
      const game = playRandomGame({
        players,
        seed: `fuzz-${players}`,
        engine,
        maxSteps: MAX_STEPS,
        onStep: checkOptionsMatchApply,
      });
      expect(game.winner).not.toBeNull();
      expect(engine.options(game.final, game.winner as Seat)).toBeNull();
    });
  }
});

describe("INV-10 determinism", () => {
  it("a game replays identically from its seed and its moves, as plain JSON", () => {
    const game = playRandomGame({ players: 4, seed: "replay", engine, maxSteps: MAX_STEPS });
    const started = engine.newGame({ players: 4 }, "replay");
    let state = started.state;
    const events = [...started.events];
    for (const { seat, move } of game.moves) {
      const result = play(engine, state, seat, move);
      events.push(...result.events);
      state = JSON.parse(JSON.stringify(result.state)) as GameState;
    }
    expect(state).toEqual(game.final);
    expect(events).toEqual(game.events);
  });

  it("different seeds give different games", () => {
    const a = engine.newGame({ players: 4 }, "seed-a");
    const b = engine.newGame({ players: 4 }, "seed-b");
    expect(a.events).not.toEqual(b.events);
  });
});
