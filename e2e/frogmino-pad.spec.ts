import type { Page } from "@playwright/test";
import { test, expect } from "./test";
import { padTo, press, withPads } from "./gamepad";
import { localRoomList } from "./relay";

/**
 * Frogmino's menus by controller alone: the d-pad moves a focus round each
 * screen's buttons, A presses the one focused, B goes back, Menu starts, and
 * on the local join screen A and B join and leave first. The pads are
 * simulated (`gamepad.ts`); every wait is on the page's own state.
 */
const LOBBY = "/games/3d-games/frogmino";
const TIMEOUT = 30_000;

function lobbyUrl(): string {
  return `${LOBBY}?${localRoomList()}`;
}

const focusedCourse = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("data-course") ?? null);
const picked = (page: Page) => page.locator('[data-course][aria-pressed="true"]');

test("lobby, local co-op join, a course and Start, then the game's menu back to the lobby, by controller", async ({ page }) => {
  await withPads(page, 2);
  await page.goto(lobbyUrl());
  const local = page.getByRole("button", { name: "Local co-op" });
  await expect(local).toBeVisible({ timeout: TIMEOUT });
  await expect(page.getByTestId("pad-hints")).toBeVisible();

  // The first press only shows the focus, on the first button.
  await press(page, "A");
  await expect(local).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-pad-nav", "");
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
  await padTo(page, menu.getByRole("button", { name: "Back to lobby" }));
  await press(page, "A");
  await expect(local).toBeVisible();
});
