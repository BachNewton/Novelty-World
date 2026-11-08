import { describe, expect, it } from "vitest";
import { simulateGame, type Contender } from "../eval/simulate";
import { RATING_EXCLUDED, VERSIONS } from "./index";

// Every archived version is frozen: its Elo was measured on exactly its play, and the ratings
// cache keeps its games keyed by label, not by code. Each version copies its own policy but
// shares the engine, development, manage and logic code, so a change there can alter a frozen
// bot's play without touching its folder. So each version's play over two seeded tables against a
// fixed field of other archived bots is pinned by a fingerprint: each game's length and every
// seat's money at its end. A change to shared code that moves it is a change to that bot, made as
// a new version. A game reaches the common paths only: versions that differ from their base in a
// rare spot (a human-gated price, a narrow auction reserve) can share a fingerprint, and a change
// confined to that spot passes here.
// A new version's fingerprint is written on its first run. search-v3 is left out: it is unrated
// (so no cached games rest on it), and its rollouts take half a minute to play one table.

const FIELD: Contender[] = ["claude-v2", "jane-v2", "fable-v1"].map((label) => ({ label, bot: VERSIONS[label] }));
const SEEDS = ["frozen-a", "frozen-b"];

const UNPINNED = new Set(["search-v3"]);

/** Most games end well before it; a deadlocked one stops here. */
const MAX_TURNS = 300;

describe("archived bots are frozen", () => {
  it("leaves out only unrated versions", () => {
    for (const label of UNPINNED) expect(RATING_EXCLUDED.has(label), label).toBe(true);
  });

  for (const label of Object.keys(VERSIONS).filter((l) => !UNPINNED.has(l)).sort()) {
    it(`${label} plays the game it was rated on`, () => {
      const bot = VERSIONS[label];
      const play = (seed: string, seats: Contender[]) => {
        const result = simulateGame({ seed, seats, maxTurns: MAX_TURNS });
        return `${result.turns.toString()} turns, ${result.steps.toString()} steps: ${result.standings.map((s) => `${s.id} ${s.cash.toString()}/${s.netWorth.toString()}${s.bankrupt ? " out" : ""}`).join(", ")}`;
      };
      const fingerprint = SEEDS.map((seed) => play(seed, [{ label, bot }, ...FIELD]));
      expect(fingerprint).toMatchSnapshot();
    });
  }
});
