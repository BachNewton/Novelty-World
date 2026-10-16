import { test, expect } from "./test";

/**
 * Frogmino's music in a real browser: a theme renders in its worker (bundled
 * by Next.js) and plays. The unit tests render every theme in Node; this
 * catches what only a browser can break, the worker and the audio graph.
 */

test("?music renders a course's theme in its worker and plays it", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await page.goto("/games/3d-games/frogmino?music");
  const card = page.locator("li", { has: page.getByRole("heading", { level: 3 }) }).first();
  await card.getByRole("button", { name: "Play" }).click();
  await expect(card.getByRole("button", { name: "Stop" })).toBeVisible({ timeout: 30_000 });
  await card.getByRole("button", { name: "Stop" }).click();
  await expect(card.getByRole("button", { name: "Play" })).toBeVisible();
  expect(errors).toEqual([]);
});
