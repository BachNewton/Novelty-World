import { test, expect } from "./test";

/** Risk's `?insignia` audition draws every rank's insignia (twenty, Recruit to Field Marshal),
 *  each named by its own rank, and fits a 375-wide phone without scrolling sideways. */
test("?insignia shows every rank's insignia by name", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await page.setViewportSize({ width: 375, height: 640 });
  await page.goto("/games/board-games/risk?insignia");
  const ranks = page.getByRole("list", { name: "Ranks" }).getByRole("listitem");
  await expect(ranks).toHaveCount(20);
  const names = await ranks.evaluateAll((items) => items.map((item) => [...new Set([...item.querySelectorAll('[role="img"]')].map((img) => img.getAttribute("aria-label")))]));
  expect(names.every((name) => name.length === 1 && name[0])).toBe(true);
  expect(new Set(names.flat()).size).toBe(20);
  expect(names[0]).toEqual(["Recruit"]);
  expect(names[19]).toEqual(["Field Marshal"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(errors).toEqual([]);
});
