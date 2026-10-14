import type { Page } from "@playwright/test";
import { test, expect } from "./test";
import { press, withPads } from "./gamepad";
import { LOCAL_RELAY } from "./relay";

/**
 * Frogmino's menus by controller alone: the d-pad moves a focus round each
 * screen's buttons, A presses the one focused, B goes back, Menu starts, and
 * on the local join screen A and B join and leave first. The pads are
 * simulated (`gamepad.ts`); every wait is on the page's own state.
 */
const LOBBY = "/games/3d-games/frogmino";
const TIMEOUT = 30_000;

function lobbyUrl(): string {
  return `${LOBBY}?${LOCAL_RELAY}&room-list=e2e-${crypto.randomUUID()}`;
}

const focusedCourse = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("data-course") ?? null);
const picked = (page: Page) => page.locator('[data-course][aria-pressed="true"]');

test("lobby, local co-op join, a course and Start, then the game's menu back to the lobby, by controller", async ({ page }) => {
  await withPads(page, 2);
  await page.goto(lobbyUrl());
  const solo = page.getByRole("button", { name: "Play solo" });
  await expect(solo).toBeVisible({ timeout: TIMEOUT });
  await expect(page.getByTestId("pad-hints")).toBeVisible();

  // The first press only shows the focus, on the first button.
  await press(page, "A");
  await expect(solo).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-pad-nav", "");
  await press(page, "DpadRight");
  await expect(page.getByRole("button", { name: "Local co-op" })).toBeFocused();
  await press(page, "A");

  // On the join screen, A joins a controller that isn't in, pressing nothing.
  const sprout = page.getByTestId("slot-1");
  await expect(sprout).toHaveText("Press to join", { timeout: TIMEOUT });
  const first = await picked(page).getAttribute("data-course");
  await expect.poll(() => focusedCourse(page)).toBe(first);
  await press(page, "A");
  await expect(sprout).toHaveText("Controller 1");
  await expect(picked(page)).toHaveAttribute("data-course", first ?? "");

  // A controller that is in moves the focus and picks with A.
  await press(page, "DpadDown");
  const next = await focusedCourse(page);
  expect(next).not.toBeNull();
  expect(next).not.toBe(first);
  await press(page, "A");
  await expect(picked(page)).toHaveAttribute("data-course", next ?? "");

  // The second controller joins; the bumpers step the course.
  await press(page, "A", 1);
  await expect(page.getByTestId("slot-2")).toHaveText("Controller 2");
  await expect(picked(page)).toHaveAttribute("data-course", next ?? "");
  const ids = await page.locator("[data-course]").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-course")));
  await press(page, "RB", 1);
  await expect(picked(page)).toHaveAttribute("data-course", ids[(ids.indexOf(next) + 1) % ids.length] ?? "");

  // Menu starts.
  await press(page, "Menu");
  const game = page.getByTestId("frogmino-game");
  await expect(game).toHaveAttribute("data-depth", "0", { timeout: TIMEOUT });

  // In play the pads drive the frogs; View opens the menu over the game.
  await press(page, "View", 1);
  const menu = page.getByRole("dialog", { name: "Game menu" });
  await expect(menu.getByRole("button", { name: "Keep playing" })).toBeFocused();
  // B closes it, and the pads drive the frogs again.
  await press(page, "B", 1);
  await expect(menu).toHaveCount(0);
  await press(page, "DpadUp");
  await expect(game).not.toHaveAttribute("data-depth", "0");

  await press(page, "View");
  await expect(menu.getByRole("button", { name: "Keep playing" })).toBeFocused();
  await press(page, "DpadDown");
  await press(page, "DpadDown");
  await expect(menu.getByRole("button", { name: "Back to lobby" })).toBeFocused();
  await press(page, "A");
  await expect(solo).toBeVisible();
});

test("on the join screen B leaves a controller's slot, then goes back to the lobby", async ({ page }) => {
  await withPads(page);
  await page.goto(`${LOBBY}?play=local`);
  const sprout = page.getByTestId("slot-1");
  await expect(sprout).toHaveText("Press to join", { timeout: TIMEOUT });
  await press(page, "A");
  await expect(sprout).toHaveText("Controller 1");
  await press(page, "B");
  await expect(sprout).toHaveText("Press to join");
  await press(page, "B");
  await expect(page.getByRole("button", { name: "Play solo" })).toBeVisible({ timeout: TIMEOUT });
});

test("lobby, host co-op, and a course picked in the waiting room, by controller", async ({ page }) => {
  await withPads(page);
  await page.goto(lobbyUrl());
  await expect(page.getByRole("button", { name: "Play solo" })).toBeVisible({ timeout: TIMEOUT });
  await press(page, "DpadRight");
  await press(page, "DpadRight");
  await press(page, "DpadRight");
  await expect(page.getByRole("button", { name: "Host co-op" })).toBeFocused();
  await press(page, "A");

  await expect(page.getByTestId("room-status")).toHaveText("Connected", { timeout: TIMEOUT });
  await expect(picked(page)).toHaveCount(1);
  const ids = await page.locator("[data-course]").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-course")));
  // The host's bumpers step the course.
  const first = await picked(page).getAttribute("data-course");
  await press(page, "RB");
  await expect(picked(page)).toHaveAttribute("data-course", ids[(ids.indexOf(first) + 1) % ids.length] ?? "");

  // The d-pad reaches a course in the list, and A picks it.
  await press(page, "DpadUp");
  await expect.poll(() => focusedCourse(page)).not.toBeNull();
  await press(page, "DpadUp");
  const chosen = await focusedCourse(page);
  await press(page, "A");
  await expect(picked(page)).toHaveAttribute("data-course", chosen ?? "");

  // Start waits for a partner, and B leaves.
  await press(page, "Menu");
  await expect(page.getByTestId("room-status")).toBeVisible();
  await press(page, "B");
  await expect(page.getByRole("button", { name: "Host co-op" })).toBeVisible({ timeout: TIMEOUT });
});
