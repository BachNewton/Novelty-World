import { test, expect } from "./test";

/**
 * Frogmino's replays: a named input log played in the real game scene. The
 * game mirrors the team's rule state in data attributes, so every wait is on
 * the game's own state, never a pause.
 */
const PROOF = "/games/3d-games/frogmino?replay=proof-block-party";

test("?replay=proof-block-party plays Block Party's proof through its first rows, with no bonk", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(PROOF);
  const game = page.getByTestId("frogmino-game");
  const panel = page.getByTestId("frogmino-replay");
  await expect(panel).toContainText("Replay: proof-block-party", { timeout: 30_000 });
  // The log jumps the team out of the helicopter, then the rows pass it.
  await expect(game).not.toHaveAttribute("data-depth", "0", { timeout: 30_000 });
  await expect(game).toHaveAttribute("data-passes", "2", { timeout: 30_000 });
  await expect(game).toHaveAttribute("data-bonked-at", "");
  // The run's clock has started with the jump out, gold still in reach.
  const timer = page.getByTestId("frogmino-timer");
  await expect(timer).not.toHaveText("0:00.0");
  await expect(timer).toHaveAttribute("data-medal", "gold");

  // A restart plays it from aboard the helicopter again.
  await page.getByRole("button", { name: "Restart (R)" }).click();
  await expect(game).toHaveAttribute("data-passes", "0");
  await expect(panel).toHaveAttribute("data-replay-over", "false");
});
