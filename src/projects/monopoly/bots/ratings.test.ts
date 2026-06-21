import { describe, expect, it } from "vitest";
import { BOT_RATINGS } from "./ratings";
import { BOT_ROLES } from "./roles";

// Guardrail: every bot the lobby can field MUST have a strength rating, so the
// selector never shows a player a blank where an Elo should be. This checks the
// versions the pointers actually RESOLVE to (champion / featured / the auto-derived
// `-latest`), which is what a compile-time check can't cover — `-latest` is a
// runtime value. If it fails after you add or retarget a lobby bot, regenerate the
// ladder: `npm run sim:ratings`.
describe("lobby strength ratings coverage", () => {
  it("rates every version any lobby role resolves to", () => {
    const lobbyVersions = [...new Set(BOT_ROLES.map((r) => r.version))];
    const unrated = lobbyVersions.filter((v) => BOT_RATINGS[v] === undefined);
    expect(
      unrated,
      `lobby bots with no Elo — run \`npm run sim:ratings\`: ${unrated.join(", ")}`,
    ).toEqual([]);
  });
});
