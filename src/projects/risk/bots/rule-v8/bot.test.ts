import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import type { CardId, GameState, Move, Seat } from "../../contract";
import { referenceEngine as engine } from "../../engine";
import { inside, randomLegalMove } from "../../engine/test-kit";
import type { EngineState } from "../../engine/state";
import { positionBoard, positionBreakdown, type SeatPosition } from "../../eval/positions";
import type { Bot } from "../bot";
import { fromView } from "../rule-v1/board";
import { ruleV6Bot } from "../rule-v6";
import { breakdown } from "../rule-v6/evaluate";
import { features } from "./features";
import { GOLDEN } from "./golden";
import { ruleV8Bot, V8_PARAMS } from "./index";
import { predict } from "./network";

// v8: its network reproduces the trained model, its features read only the seat's view, and as
// a player it moves legally, as a function of its input alone.

function ask(bot: Bot, state: GameState, seat: Seat, seed: string): Move {
  const options = engine.options(state, seat);
  if (!options) throw new Error(`seat ${seat.toString()} has no options`);
  const view = engine.view(state, seat);
  return bot({ seat, view, options, events: [], history: [], humans: view.seats.map(() => false), seed });
}

/** The same game with everything `seat` can't see dealt again: the other hands (same sizes)
 *  and the deck's order, shuffled together. */
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

/** A game with v8 at `seat` and random legal players elsewhere, each of v8's moves checked by
 *  `check` before it is applied, until the game ends or v8 has made `moves` moves. */
function fuzz(players: number, seed: string, seat: Seat, check: (state: GameState, move: Move, step: number) => void, moves = Infinity): Seat | null {
  let asked = 0;
  let state = engine.newGame({ players }, seed).state;
  const rng = createRng(`fuzz:${seed}`);
  for (let step = 0; step < 20_000; step++) {
    const view = engine.view(state, null);
    if (view.phase === "game-over" || asked >= moves) return view.winner;
    const active = view.active;
    const options = engine.options(state, active);
    if (!options) throw new Error("the active seat has no options");
    let move: Move;
    if (active === seat) {
      move = ask(ruleV8Bot, state, active, `${seed}/${step.toString()}`);
      check(state, move, step);
      asked++;
    } else {
      move = randomLegalMove(options, engine.view(state, active), rng);
    }
    const result = engine.apply(state, active, move);
    if (!result.ok) throw new Error(`step ${step.toString()}: v8 at seat ${active.toString()} made an illegal move ${JSON.stringify(move)}: ${result.reason}`);
    state = result.state;
  }
  throw new Error(`game ${seed} did not end`);
}

describe("rule-v8", () => {
  it("gives the trained model's probability for held-out recorded positions", () => {
    expect(GOLDEN.length).toBeGreaterThanOrEqual(5);
    for (const golden of GOLDEN) {
      const record: SeatPosition = { ...golden.record, cards: golden.record.cards as CardId[] };
      const { p } = golden;
      expect(Math.abs(predict(features(positionBoard(record), record.seat, positionBreakdown(record))) - p)).toBeLessThan(1e-9);
    }
  });

  it("reads its features from the seat's view alone", () => {
    const rng = createRng("v8-features");
    let changed = 0;
    let checked = 0;
    fuzz(5, "v8-features", 1, (state) => {
      const read = (s: GameState) => {
        const b = fromView(engine.view(s, 1));
        return Array.from(features(b, 1, breakdown(b, 1, V8_PARAMS)));
      };
      const other = redealHidden(state, 1, rng);
      if (inside(other).deck.join() !== inside(state).deck.join()) changed++;
      expect(read(other)).toEqual(read(state));
      checked++;
    }, 40);
    expect(checked).toBe(40);
    expect(changed).toBeGreaterThan(checked / 2);
  });

  it("makes only legal moves against random players, game to its end, at 5 players", () => {
    expect(fuzz(5, "v8-legal", 2, () => {})).not.toBeNull();
  });

  it("gives the same move for the same input, whatever its seat can't see", () => {
    const rng = createRng("v8-same");
    fuzz(4, "v8-same", 1, (state, move, step) => {
      expect(ask(ruleV8Bot, state, 1, `v8-same/${step.toString()}`)).toEqual(move);
      expect(ask(ruleV8Bot, redealHidden(state, 1, rng), 1, `v8-same/${step.toString()}`)).toEqual(move);
    }, 40);
  });

  it("plays v6 while six seats are alive", () => {
    fuzz(6, "v8-six", 0, (state, move, step) => {
      if (engine.view(state, 0).seats.every((s) => !s.eliminated)) expect(ask(ruleV6Bot, state, 0, `v8-six/${step.toString()}`)).toEqual(move);
    }, 20);
  });
});
