import { describe, expect, it } from "vitest";
import { BOT_RATINGS } from "./ratings";
import { RATING_EXCLUDED, RATING_PANEL, VERSIONS } from "./versions";

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

// Guardrail: the anchor panel (`RATING_PANEL`) is a hand-maintained eval knob feeding
// BOTH tools — the rater fits the ladder over the panel graph, and `sim:gauntlet
// --panel` uses it as the crown-gate field. A typo, a dropped anchor, or an excluded
// member would silently corrupt the ladder AND the crown gate, so pin the invariants.
// See `bots/CLAUDE.md` "The ANCHOR PANEL" and METHOD.md "Non-transitivity & the crown".
describe("anchor panel invariants", () => {
  const ANCHOR = "claude-v2"; // the permanent Elo anchor; must be in the panel

  it("contains only known, rateable versions", () => {
    const unknown = RATING_PANEL.filter((v) => !(v in VERSIONS));
    expect(unknown, `panel members not in VERSIONS: ${unknown.join(", ")}`).toEqual([]);
    const excluded = RATING_PANEL.filter((v) => RATING_EXCLUDED.has(v));
    expect(excluded, `panel members in RATING_EXCLUDED: ${excluded.join(", ")}`).toEqual([]);
    expect(RATING_PANEL).toContain(ANCHOR);
  });

  it("has no duplicate members", () => {
    expect(RATING_PANEL.length).toBe(new Set(RATING_PANEL).size);
  });

  it("is fully rated, so both tools can field it", () => {
    const unrated = RATING_PANEL.filter((v) => BOT_RATINGS[v] === undefined);
    expect(
      unrated,
      `panel members with no Elo — run \`npm run sim:ratings\`: ${unrated.join(", ")}`,
    ).toEqual([]);
  });
});
