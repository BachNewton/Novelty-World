import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import type { GameState } from "../contract";
import { referenceEngine } from "../engine";
import { inside } from "../engine/test-kit";
import type { EngineState } from "../engine/state";
import { riskBot } from "../bots";
import { positionRecords, recordGame, recordingEngine, recordSpecs, seatPosition, shardRange, type SeatPosition } from "./positions";
import { playGame, runSpec } from "./runner";

// The position recorder: its positions come from each seat's own view, its labels are the
// game's outcome, a game records the same every time, and shards split a recording exactly.

const FIELD = ["greedy", "gd-stacker", "gd-aggressive", "gd-defensive", "gd-continental"];

/** The same game with everything `seat` can't see dealt again: the other hands (same sizes)
 *  and the deck's order, shuffled together. */
function redealHidden(state: GameState, seat: number, rng: Rng): GameState {
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

describe("risk position recorder", () => {
  it("builds each position from the seat's own view alone", () => {
    const [spec] = recordSpecs(FIELD, 5, "positions-view", 0, 1, 60);
    const rng = createRng("positions-view");
    const seen: SeatPosition[] = [];
    let checked = 0;
    const engine = recordingEngine(5, (seat, state, history) => {
      const position = seatPosition(referenceEngine.view(state, seat), history);
      seen.push(position);
      const hidden = redealHidden(state, seat, rng);
      if (inside(hidden).deck.join() !== inside(state).deck.join()) checked++;
      expect(seatPosition(referenceEngine.view(hidden, seat), history)).toEqual(position);
    });
    playGame({ seed: spec.seed, bots: spec.labels.map(riskBot), maxTurns: spec.maxTurns, engine });
    // The redeals changed what the seat can't see at nearly every turn's end.
    expect(checked).toBeGreaterThan(seen.length / 2);
    // And the recorder builds exactly these positions for the game.
    expect(recordGame(spec).positions).toEqual(seen);
  });

  it("records every seat's turn ends and labels them with the game's outcome", () => {
    const [spec] = recordSpecs(["greedy"], 3, "positions-labels", 0, 1, 600);
    const result = recordGame(spec);
    const played = runSpec(spec);
    // Recording leaves the game as it is.
    expect({ winner: result.winner, places: result.places, turns: result.turns, decisions: result.decisions }).toEqual({
      winner: played.winner,
      places: played.places,
      turns: played.turns,
      decisions: played.decisions,
    });
    expect(result.winner).not.toBeNull();
    // Every turn but the one the winner won in has ended, one position each, in order.
    expect(result.positions.map((p) => p.turn)).toEqual(Array.from({ length: result.turns - 1 }, (_, i) => i + 1));
    for (const p of result.positions) expect(p.alive[p.seat]).toBe(true);
    for (const r of positionRecords(result)) {
      expect(r).toMatchObject({ game: 0, seed: spec.seed, players: 3, winner: result.winner, capped: false, places: result.places, turns: result.turns });
    }
  });

  it("keeps a capped game's positions, flagged, with no winner", () => {
    const [spec] = recordSpecs(FIELD, 5, "positions-capped", 0, 1, 12);
    const result = recordGame(spec);
    expect(result.winner).toBeNull();
    expect(result.positions.map((p) => p.turn)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(positionRecords(result).every((r) => r.capped && r.winner === null)).toBe(true);
  });

  it("records the same positions every time for a seed", () => {
    const [spec] = recordSpecs(FIELD, 5, "positions-same", 3, 1, 40);
    expect(JSON.stringify(positionRecords(recordGame(spec)))).toBe(JSON.stringify(positionRecords(recordGame(spec))));
  });

  it("seats every bot in every seat", () => {
    const field = ["a", "b", "c", "d", "e", "f", "g"];
    const specs = recordSpecs(field, 5, "x", 0, field.length, 600);
    for (let seat = 0; seat < 5; seat++) expect(new Set(specs.map((s) => s.labels[seat]))).toEqual(new Set(field));
    expect(new Set(specs.map((s) => s.seed)).size).toBe(specs.length);
  });

  it.each([
    [500, 1],
    [500, 7],
    [10_000, 20],
    [5, 8],
  ])("splits %i games over %i shards, every game in exactly one", (games, shards) => {
    const seeds = Array.from({ length: shards }, (_, k) => {
      const { from, count } = shardRange(games, k, shards);
      return recordSpecs(["greedy"], 3, "hybrid-data", from, count, 600).map((s) => s.seed);
    }).flat();
    expect(seeds).toEqual(recordSpecs(["greedy"], 3, "hybrid-data", 0, games, 600).map((s) => s.seed));
  });
});
