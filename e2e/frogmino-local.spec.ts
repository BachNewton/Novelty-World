import { test, expect } from "./test";
import { LOCAL_RELAY } from "./relay";

/**
 * Frogmino's local co-op: two players on one keyboard, each half joining
 * from the join screen, then each driving their own frog. The game mirrors
 * the team's rule state in data attributes, so every wait is on the game's
 * own state, never a pause.
 */
const LOBBY = "/games/3d-games/frogmino";
const TIMEOUT = 30_000;

test("?play=local opens the join screen, where both halves of the keyboard join and start", async ({ page }) => {
  await page.goto(`${LOBBY}?play=local&course=tea-for-two`);
  const start = page.getByRole("button", { name: "Start", exact: true });
  await expect(start).toBeDisabled({ timeout: TIMEOUT });
  // The course the URL names is picked.
  const picked = page.locator('[data-course="tea-for-two"]');
  await expect(picked).toHaveAttribute("aria-pressed", "true");

  const sprout = page.getByTestId("slot-1");
  const splash = page.getByTestId("slot-2");
  await expect(sprout).toHaveText("Press to join");
  await page.keyboard.press("Slash");
  await expect(sprout).toHaveText("Keyboard: arrows");
  // A half joins once; the next takes the next slot.
  await page.keyboard.press("Slash");
  await expect(splash).toHaveText("Press to join");
  await page.keyboard.press("Space");
  await expect(splash).toHaveText("Keyboard: WASD");
  // Leaving frees the slot for the next to join.
  await page.keyboard.press("ArrowDown");
  await expect(sprout).toHaveText("Press to join");
  await expect(start).toBeDisabled();
  await page.keyboard.press("Slash");
  await expect(sprout).toHaveText("Keyboard: arrows");
  await expect(start).toBeEnabled();

  await page.keyboard.press("Enter");
  const game = page.getByTestId("frogmino-game");
  await expect(game).toHaveAttribute("data-depth", "0", { timeout: TIMEOUT });
  await expect(game).toHaveAttribute("data-hopped-at", ",");

  // Either player's jump forward drops the team off the overpass.
  await page.keyboard.press("KeyW");
  await expect(game).not.toHaveAttribute("data-depth", "0");
  // The arrows are Sprout's here, so / hops Sprout, and Space Splash.
  await page.keyboard.press("Slash");
  await expect(game).toHaveAttribute("data-hopped-at", /^\d+,$/);
  await page.keyboard.press("Space");
  await expect(game).toHaveAttribute("data-hopped-at", /^\d+,\d+$/);
});

test("Local co-op from the lobby opens the join screen, and Back returns", async ({ page }) => {
  // The lobby lists online games too: on the local relay, and on a
  // room-list channel of the test's own.
  await page.goto(`${LOBBY}?${LOCAL_RELAY}&room-list=e2e-${crypto.randomUUID()}`);
  await page.getByRole("button", { name: "Local co-op" }).click();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeDisabled({ timeout: TIMEOUT });
  await page.getByRole("button", { name: "Back to lobby" }).click();
  await expect(page.getByRole("button", { name: "Local co-op" })).toBeVisible();
});

test("the join screen lists the co-op courses by tier, and the keys and a click pick one", async ({ page }) => {
  await page.goto(`${LOBBY}?play=local`);
  const courses = page.locator("[data-course]");
  await expect(courses.first()).toBeVisible({ timeout: TIMEOUT });
  // Each course shows its tier, description and medal times; the first
  // easy course starts picked.
  await expect(page.getByRole("region", { name: "Easy courses" })).toBeVisible();
  const first = courses.first();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(first.getByLabel("Gold")).toBeVisible();
  const ids = await courses.evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-course")));
  const picked = () => page.locator('[data-course][aria-pressed="true"]');
  await expect(picked()).toHaveCount(1);

  // E and . step forward through the list, Q and , back, round the ends.
  await page.keyboard.press("KeyE");
  await expect(picked()).toHaveAttribute("data-course", ids[1 % ids.length] ?? "");
  await page.keyboard.press("Comma");
  await expect(picked()).toHaveAttribute("data-course", ids[0] ?? "");
  await page.keyboard.press("KeyQ");
  await expect(picked()).toHaveAttribute("data-course", ids[ids.length - 1] ?? "");

  // A click picks the course clicked.
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");

  // Both join, and Enter starts the game on it.
  await page.keyboard.press("Slash");
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("frogmino-game")).toHaveAttribute("data-depth", "0", { timeout: TIMEOUT });
});

test("on a phone, Start stays in view however long the course list", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto(`${LOBBY}?play=local`);
  const start = page.getByRole("button", { name: "Start", exact: true });
  await expect(start).toBeVisible({ timeout: TIMEOUT });
  await expect(page.locator("[data-course]").first()).toBeVisible();
  expect(await start.evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(640);
});
