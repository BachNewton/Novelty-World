import { test, expect } from "./test";

/**
 * Risk's sounds in a real browser: the one path that loads ZzFX in the bundle on the main thread,
 * renders through the page's AudioContext and unlocks it with a real click. Every sound's design is
 * rendered in Node by the unit tests, and mute and volume are the shared sound settings' tests.
 */

// e2e-covers: src/projects/risk/components/sound-board.ts src/projects/risk/components/sound-lab.tsx src/projects/risk/ui/sounds.ts
test("?sounds plays a sound through the game's player once a click unlocks the audio", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await page.goto("/games/board-games/risk?sounds");
  await page.getByRole("button", { name: "Play", exact: true }).first().click();
  await expect(page.getByText("Audio running")).toBeVisible();
  expect(errors).toEqual([]);
});
