import { test, expect } from "@playwright/test";

/**
 * Frogmino's local co-op: two players on one keyboard, each half joining
 * from the join screen, then each driving their own frog. The game mirrors
 * the team's rule state in data attributes, so every wait is on the game's
 * own state, never a pause.
 */
const LOBBY = "/games/3d-games/frogmino";
const TIMEOUT = 30_000;

test("?play=local opens the join screen, where both halves of the keyboard join and start", async ({ page }) => {
  await page.goto(`${LOBBY}?play=local`);
  const start = page.getByRole("button", { name: "Start", exact: true });
  await expect(start).toBeDisabled({ timeout: TIMEOUT });
  await expect(page.getByText("Road: 10 lanes")).toBeVisible();

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
  // The lobby lists online games too: on the local PeerServer, and on a
  // room-list channel of the test's own.
  await page.goto(`${LOBBY}?peer-signal=local&room-list=e2e-${crypto.randomUUID()}`);
  await page.getByRole("button", { name: "Local co-op" }).click();
  await expect(page.getByText("Road: 10 lanes")).toBeVisible({ timeout: TIMEOUT });
  await page.getByRole("button", { name: "Back to lobby" }).click();
  await expect(page.getByRole("button", { name: "Play solo" })).toBeVisible();
});
