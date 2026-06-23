import { describe, expect, it } from "vitest";
import { claudeV38Bot } from "../versions/claude-v38";
import { simulateGame, type Contender } from "../simulate";
import { makeParamBot } from "./bot";
import { DEFAULT_PARAMS } from "./params";

// FIDELITY: the parameterized bot built from DEFAULT_PARAMS must be byte-identical
// to claude-v38 — same decisions, so the same game unfolds move-for-move. This is
// what makes the ES's optimization faithful: it tunes the REAL bot, and the frozen
// winner (versions/opt-v1) is claude-v38 with different constants, nothing else.
//
// We assert it by playing identical 4-seat games (same seed, same seating) — one
// seated with claude-v38, one with the default param bot — and requiring every
// observable outcome to match: winner, turn count, step count, full event tally,
// and the decision/structural play-by-play. A single divergent decision would
// fork the deterministic game and fail one of these.

const paramBot = makeParamBot(DEFAULT_PARAMS);

function seatsAll(bot: Contender["bot"], label: string): Contender[] {
  return [0, 1, 2, 3].map((i) => ({ label: `${label}-${i.toString()}`, bot }));
}

describe("param bot fidelity — DEFAULT_PARAMS reproduces claude-v38", () => {
  // A spread of seeds so the equality is exercised across varied games, not one.
  const seeds = ["sim-1", "fid-2", "fid-3", "fid-7", "fid-11"];

  for (const seed of seeds) {
    it(`is move-for-move identical to claude-v38 (seed ${seed})`, () => {
      const ref = simulateGame({
        seed,
        seats: seatsAll(claudeV38Bot, "v38"),
        maxTurns: 2000,
        includeLog: true,
      });
      const got = simulateGame({
        seed,
        seats: seatsAll(paramBot, "opt"),
        maxTurns: 2000,
        includeLog: true,
      });

      expect(got.terminated).toBe(ref.terminated);
      expect(got.turns).toBe(ref.turns);
      expect(got.steps).toBe(ref.steps);
      expect(got.eventCounts).toEqual(ref.eventCounts);
      // Winner identity is by SEAT INDEX (labels differ between the two runs).
      const refWinnerSeat = ref.standings.findIndex((s) => s.id === ref.winnerId);
      const gotWinnerSeat = got.standings.findIndex((s) => s.id === got.winnerId);
      expect(gotWinnerSeat).toBe(refWinnerSeat);
      // The full decision/structural play-by-play must match event-for-event.
      expect(got.highlights.map((h) => ({ turn: h.turn, kind: h.event.kind }))).toEqual(
        ref.highlights.map((h) => ({ turn: h.turn, kind: h.event.kind })),
      );
      // And the bot reasoning notes (the strings) must be identical too — a
      // different constant would change a "to N houses" / sweetener phrase.
      const notes = (r: typeof ref): string[] =>
        r.highlights
          .filter((h) => h.event.kind === "bot-note")
          .map((h) => (h.event.kind === "bot-note" ? h.event.text : ""));
      expect(notes(got)).toEqual(notes(ref));
    });
  }
});
