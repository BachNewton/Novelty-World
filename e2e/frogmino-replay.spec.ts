import { test, expect } from "./test";

/**
 * Frogmino's replays: a named input log played in the real game scene. The
 * game mirrors the team's rule state in data attributes, so every wait is on
 * the game's own state, never a pause.
 */
const PROOF = "/games/3d-games/frogmino?replay=proof-coop";

test("?replay=proof-coop plays the co-op course's proof through its first rows, with no bonk", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(PROOF);
  const game = page.getByTestId("frogmino-game");
  const panel = page.getByTestId("frogmino-replay");
  await expect(panel).toContainText("Replay: proof-coop", { timeout: 30_000 });
  // The log drops the team off the overpass, then the rows pass it.
  await expect(game).not.toHaveAttribute("data-depth", "0", { timeout: 30_000 });
  await expect(game).toHaveAttribute("data-passes", "2", { timeout: 30_000 });
  await expect(game).toHaveAttribute("data-bonked-at", "");

  // A restart plays it from the overpass again.
  await page.getByRole("button", { name: "Restart (R)" }).click();
  await expect(game).toHaveAttribute("data-passes", "0");
  await expect(panel).toHaveAttribute("data-replay-over", "false");
});
