import { describe, expect, it } from "vitest";
import { CROWN, SUBSTRATE } from "./champion";
import { RATING_EXCLUDED, VERSIONS } from "./versions";

// Guardrail: the crown/substrate labels are the evolution loop's mutable state, and
// their whole reason for being code rather than prose is that a stale one FAILS here
// instead of quietly misinforming the next session. Two ways they could go wrong:
// a typo, or a cull that removed the version they name.
describe("evolution-loop state", () => {
  it.each([
    ["CROWN", CROWN],
    ["SUBSTRATE", SUBSTRATE],
  ])("%s names a version that exists in the archive", (name, label) => {
    expect(
      Object.keys(VERSIONS),
      `${name} = "${label}" is not a registered version — it was renamed or culled`,
    ).toContain(label);
  });

  it.each([
    ["CROWN", CROWN],
    ["SUBSTRATE", SUBSTRATE],
  ])("%s is a real bot, not the dumb stub", (_name, label) => {
    expect(label).not.toBe("dumb");
    expect(typeof VERSIONS[label]).toBe("function");
  });

  // A crowned or substrate bot is by definition one we measure and build on, so it
  // must be rated — an excluded version has no Elo and renders deprecated, which
  // would be incoherent with holding the crown.
  it.each([
    ["CROWN", CROWN],
    ["SUBSTRATE", SUBSTRATE],
  ])("%s is not excluded from the ladder", (name, label) => {
    expect(RATING_EXCLUDED.has(label), `${name} = "${label}" is in RATING_EXCLUDED`).toBe(false);
  });
});
