import { test, expect } from "./test";

/**
 * Frogmino's local co-op: two players on one keyboard, each half joining
 * from the join screen, then each driving their own frog. Who gets which
 * slot is `input/lineup.test.ts`'s, and which key is whose
 * `keyboard.test.ts`'s. The game mirrors the team's rule state in data
 * attributes, so every wait is on the game's own state, never a pause.
 */
const LOBBY = "/games/3d-games/frogmino";
const TIMEOUT = 30_000;

test("both halves of the keyboard join, start, and each hops its own frog", async ({ page }) => {
  await page.goto(`${LOBBY}?play=local`);
  const start = page.getByRole("button", { name: "Start", exact: true });
  await expect(start).toBeDisabled({ timeout: TIMEOUT });

  await page.keyboard.press("Slash");
  await expect(page.getByTestId("slot-1")).toHaveText("Keyboard: arrows");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("slot-2")).toHaveText("Keyboard: WASD");

  await page.keyboard.press("Enter");
  const game = page.getByTestId("frogmino-game");
  await expect(game).toHaveAttribute("data-depth", "0", { timeout: TIMEOUT });
  await expect(game).toHaveAttribute("data-hopped-at", ",");

  // Either player's jump forward jumps the team out of the helicopter.
  await page.keyboard.press("KeyW");
  await expect(game).not.toHaveAttribute("data-depth", "0");
  // The arrows are Sprout's here, so / hops Sprout, and Space Splash.
  await page.keyboard.press("Slash");
  await expect(game).toHaveAttribute("data-hopped-at", /^\d+,$/);
  await page.keyboard.press("Space");
  await expect(game).toHaveAttribute("data-hopped-at", /^\d+,\d+$/);
});

test("on a phone, Start stays in view however long the course list", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto(`${LOBBY}?play=local`);
  const start = page.getByRole("button", { name: "Start", exact: true });
  await expect(start).toBeVisible({ timeout: TIMEOUT });
  await expect(page.locator("[data-course]").first()).toBeVisible();
  expect(await start.evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(640);
});
