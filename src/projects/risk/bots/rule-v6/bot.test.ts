import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import type { GameState, Move, Seat } from "../../contract";
import { referenceEngine as engine } from "../../engine";
import { inside, randomLegalMove } from "../../engine/test-kit";
import type { EngineState } from "../../engine/state";
import type { Bot } from "../bot";
import { ruleV6Bot } from "./index";

// v6 as a player (v2's checks): every move it makes is legal, it is a function of its input alone,
// and that input is only what its seat may see.

function ask(bot: Bot, state: GameState, seat: Seat, seed: string): Move {
  const options = engine.options(state, seat);
  if (!options) throw new Error(`seat ${seat} has no options`);
  const view = engine.view(state, seat);
  return bot({ seat, view, options, events: [], history: [], humans: view.seats.map(() => false), seed });
}

/** The same game with everything `seat` can't see dealt again: the other hands (same
 *  sizes) and the deck's order, shuffled together. */
function redealHidden(state: GameState, seat: Seat, rng: Rng): GameState {
  const s = structuredClone(inside(state)) as EngineState;
  const hidden = [...s.deck, ...s.hands.flatMap((h, i) => (i === seat ? [] : h))];
  for (let i = hidden.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [hidden[i], hidden[j]] = [hidden[j], hidden[i]];
  }
  let k = 0;
  s.hands = s.hands.map((h, i) => (i === seat ? h : h.map(() => hidden[k++])));
  s.deck = hidden.slice(k);
  return { engineState: s };
}

/** A game with v2 at `v1Seat` and random legal players elsewhere, every v2 move checked
 *  by `check` before it is applied. */
function fuzz(
  players: number,
  seed: string,
  v1Seat: Seat,
  check: (state: GameState, move: Move, step: number) => void,
  v1Moves = Infinity,
): Seat | null {
  let asked = 0;
  let state = engine.newGame({ players }, seed).state;
  const rng = createRng(`fuzz:${seed}`);
  for (let step = 0; step < 20_000; step++) {
    const view = engine.view(state, null);
    if (view.phase === "game-over" || asked >= v1Moves) return view.winner;
    const seat = view.active;
    const options = engine.options(state, seat);
    if (!options) throw new Error("the active seat has no options");
    let move: Move;
    if (seat === v1Seat) {
      move = ask(ruleV6Bot, state, seat, `${seed}/${step}`);
      check(state, move, step);
      asked++;
    } else {
      move = randomLegalMove(options, engine.view(state, seat), rng);
    }
    const result = engine.apply(state, seat, move);
    if (!result.ok) throw new Error(`step ${step}: v2 at seat ${seat} made an illegal move ${JSON.stringify(move)}: ${result.reason}`);
    state = result.state;
  }
  throw new Error(`game ${seed} did not end`);
}

describe("rule-v6", () => {
  it.each([3, 4])("makes only legal moves against random players, game to its end, at %i players", (players) => {
    expect(fuzz(players, `legal-${players}`, players - 1, () => {})).not.toBeNull();
  });

  it("makes only legal moves against random players at 6 players", () => {
    // v2's first 80 moves: a whole game against five random players runs long.
    fuzz(6, "legal-6", 5, () => {}, 80);
  });

  it("gives the same move for the same input", () => {
    fuzz(4, "same-input", 1, (state, move, step) => {
      expect(ask(ruleV6Bot, state, 1, `same-input/${step}`)).toEqual(move);
    }, 60);
  });

  it("moves the same whatever its seat can't see", () => {
    const rng = createRng("hidden");
    let checked = 0;
    fuzz(5, "hidden", 2, (state, move, step) => {
      const other = redealHidden(state, 2, rng);
      expect(ask(ruleV6Bot, other, 2, `hidden/${step}`)).toEqual(move);
      checked++;
    }, 60);
    // v2 beats the random players before its 60th move in this game, so it is checked on
    // every move it made.
    expect(checked).toBeGreaterThanOrEqual(30);
  });

  it("plays whole games against itself to a winner", () => {
    for (const players of [3]) {
      let state = engine.newGame({ players }, `self-${players}`).state;
      for (let step = 0; ; step++) {
        const view = engine.view(state, null);
        if (view.phase === "game-over") break;
        if (view.turn > 600) throw new Error(`v6 against itself at ${players} players passed 600 turns`);
        const result = engine.apply(state, view.active, ask(ruleV6Bot, state, view.active, `self/${step}`));
        if (!result.ok) throw new Error(result.reason);
        state = result.state;
      }
    }
  });
});
