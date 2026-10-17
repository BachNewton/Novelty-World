import { test, expect } from "./test";

/**
 * Risk's sounds in a real browser: the `?sounds` audition loads ZzFX in the bundle, renders every
 * sound into the page's AudioContext and plays them. The unit tests render every sound in Node;
 * this catches what only a browser can break, the audio graph and the autoplay unlock.
 */

test("?sounds renders every sound and plays each through the game's player", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await page.goto("/games/board-games/risk?sounds");
  await expect(page.getByRole("heading", { name: "Risk sounds" })).toBeVisible();
  const plays = page.getByRole("button", { name: "Play", exact: true });
  await expect(plays).toHaveCount(16);
  for (const play of await plays.all()) await play.click();
  await expect(page.getByText("Audio running")).toBeVisible();
  const mute = page.getByRole("button", { name: "Mute sound" });
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "Mute sound" })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
