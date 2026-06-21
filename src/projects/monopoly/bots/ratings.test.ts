import { describe, expect, it } from "vitest";
import { BOT_RATINGS } from "./ratings";
import { RATING_EXCLUDED, VERSIONS } from "./versions";

// Guardrail: every version the lobby can field MUST have a strength rating, so the
// selector never shows a player a blank where an Elo should be — and so the
// auto-derived "best" pointers (overall + per family, in `roles.ts`) are always
// defined. A version is rateable unless it's `dumb` (a null stub) or in
// `RATING_EXCLUDED` (deliberately unrated — those render DEPRECATED). If this
// fails after you add a version, regenerate the ladder: `npm run sim:ratings`.
describe("bot strength ratings coverage", () => {
  it("rates every version except dumb and the excluded set", () => {
    const rateable = Object.keys(VERSIONS).filter(
      (v) => v !== "dumb" && !RATING_EXCLUDED.has(v),
    );
    const unrated = rateable.filter((v) => BOT_RATINGS[v] === undefined);
    expect(
      unrated,
      `versions with no Elo — run \`npm run sim:ratings\`: ${unrated.join(", ")}`,
    ).toEqual([]);
  });

  it("leaves the excluded set unrated (they render deprecated)", () => {
    const wronglyRated = [...RATING_EXCLUDED].filter(
      (v) => BOT_RATINGS[v] !== undefined,
    );
    expect(wronglyRated).toEqual([]);
  });
});
