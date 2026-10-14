import type { Page } from "@playwright/test";
import { test, expect } from "./test";
import { padTo, press, withPads } from "./gamepad";
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
  await padTo(page, page.getByRole("button", { name: "Local co-op" }));
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
  await padTo(page, page.getByRole("button", { name: "Host co-op" }));
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

test("local co-op: Course select from the game keeps both controllers in, and Menu starts the next course", async ({ page }) => {
  await withPads(page, 2);
  await page.goto(`${LOBBY}?play=local`);
  await expect(page.getByTestId("slot-1")).toHaveText("Press to join", { timeout: TIMEOUT });
  await press(page, "A");
  await press(page, "A", 1);
  const played = await picked(page).getAttribute("data-course");
  await press(page, "Menu", 1);
  const game = page.getByTestId("frogmino-game");
  await expect(game).toHaveAttribute("data-depth", "0", { timeout: TIMEOUT });

  await press(page, "View");
  const menu = page.getByRole("dialog", { name: "Game menu" });
  await expect(menu.getByRole("button", { name: "Keep playing" })).toBeFocused();
  await padTo(page, menu.getByRole("button", { name: "Course select" }));
  await press(page, "A");

  // Back on the join screen, both still in, the course just played still picked.
  await expect(page.getByTestId("slot-1")).toHaveText("Controller 1", { timeout: TIMEOUT });
  await expect(page.getByTestId("slot-2")).toHaveText("Controller 2");
  await expect(picked(page)).toHaveAttribute("data-course", played ?? "");
  await press(page, "RB", 1);
  await expect(picked(page)).not.toHaveAttribute("data-course", played ?? "");
  await press(page, "Menu");
  await expect(game).toHaveAttribute("data-depth", "0", { timeout: TIMEOUT });
});

test("online co-op: the guest's Course select takes both back to the waiting room, partner seated, and the host starts another course", async ({ browser }) => {
  // Two browsers each load the game twice.
  test.setTimeout(120_000);
  const url = `${LOBBY}?${LOCAL_RELAY}&room-list=e2e-${crypto.randomUUID()}`;
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const [host, guest] = await Promise.all(
      contexts.map(async (ctx, i) => {
        const profile = JSON.stringify({ state: { id: crypto.randomUUID(), name: i === 0 ? "Hoppy" : "Leapy" }, version: 0 });
        await ctx.addInitScript((value) => localStorage.setItem("nw:profile", value), profile);
        const page = await ctx.newPage();
        if (i === 1) await withPads(page);
        await page.goto(url);
        return page;
      }),
    );
    await host.getByRole("button", { name: "Host co-op" }).click({ timeout: TIMEOUT });
    await guest.getByRole("button", { name: "Join Hoppy's game" }).click({ timeout: TIMEOUT });
    const start = host.getByRole("button", { name: "Start", exact: true });
    await expect(start).toBeEnabled({ timeout: TIMEOUT });
    await start.click();
    for (const page of [host, guest]) await expect(page.getByTestId("frogmino-game")).toBeVisible({ timeout: TIMEOUT });

    await press(guest, "View");
    const menu = guest.getByRole("dialog", { name: "Game menu" });
    await expect(menu.getByRole("button", { name: "Keep playing" })).toBeFocused();
    await padTo(guest, menu.getByRole("button", { name: "Course select" }));
    await press(guest, "A");

    // Both are back in the waiting room, the partner still seated.
    await expect(start).toBeEnabled({ timeout: TIMEOUT });
    await expect(guest.getByTestId("course-chosen")).toBeVisible({ timeout: TIMEOUT });
    await expect(host.getByRole("list", { name: "Players" }).getByText("Leapy")).toBeVisible();

    // The host picks another course, the guest sees it, and the host starts it.
    const next = host.locator('[data-course][aria-pressed="false"]').first();
    const name = await next.getByTestId("course-name").textContent();
    await next.click();
    await expect(guest.getByTestId("course-chosen").getByTestId("course-name")).toHaveText(name ?? "", { timeout: TIMEOUT });
    await start.click();
    for (const page of [host, guest]) await expect(page.getByTestId("frogmino-game")).toBeVisible({ timeout: TIMEOUT });
  } finally {
    await Promise.all(contexts.map((ctx) => ctx.close()));
  }
});
