import { test, expect } from "./test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { listRoom, localRoomList } from "./relay";

/**
 * Frogmino's lobby: co-op rooms found through the live list
 * of open games and joined over the shared relay room.
 *
 * Both are this run's own: the rooms are on the local relay it started, and
 * the open-games list on that relay's stand-in for Supabase presence, a list
 * of each test's own, so no test sees another's rooms. Every wait is on a DOM
 * state the page renders or an event; there are no fixed pauses.
 */
test.describe.configure({ mode: "serial" });

const LOBBY = "/games/3d-games/frogmino";
const TIMEOUT = 15_000;

function lobbyUrl(list: string): string {
  return `${LOBBY}?${localRoomList(list)}`;
}

function uniqueList(): string {
  return crypto.randomUUID();
}

interface Client {
  ctx: BrowserContext;
  page: Page;
}

/** A browser with its own saved profile, on the given page. */
async function open(browser: Browser, url: string, name: string): Promise<Client> {
  const ctx = await browser.newContext();
  const profile = JSON.stringify({ state: { id: crypto.randomUUID(), name }, version: 0 });
  await ctx.addInitScript((value) => localStorage.setItem("nw:profile", value), profile);
  const page = await ctx.newPage();
  await page.goto(url);
  return { ctx, page };
}

function openGame(page: Page, host: string) {
  return page.getByRole("button", { name: `Join ${host}'s game` });
}

test("a hosted game is listed live, joined with a click, and started", async ({ browser }) => {
  const url = lobbyUrl(uniqueList());
  const host = await open(browser, url, "Hoppy");
  const guest = await open(browser, url, "Leapy");
  const watcher = await open(browser, url, "Watcher");
  const all = [host, guest, watcher];
  try {
    await expect(guest.page.getByText("No open games yet")).toBeVisible({ timeout: TIMEOUT });

    await host.page.getByRole("button", { name: "Host co-op" }).click();
    await expect(host.page.getByTestId("room-status")).toHaveText("Connected", { timeout: TIMEOUT });
    await expect(host.page.getByRole("button", { name: "Start", exact: true })).toBeDisabled();

    // The game appears in the other lobbies without a reload.
    await expect(openGame(watcher.page, "Hoppy")).toBeVisible({ timeout: TIMEOUT });
    await openGame(guest.page, "Hoppy").click();

    for (const { page } of [host, guest]) {
      const players = page.getByRole("list", { name: "Players" });
      await expect(players.getByText("Hoppy")).toBeVisible({ timeout: TIMEOUT });
      await expect(players.getByText("Leapy")).toBeVisible({ timeout: TIMEOUT });
    }
    // A full game leaves the list.
    await expect(openGame(watcher.page, "Hoppy")).toHaveCount(0, { timeout: TIMEOUT });
    await expect(guest.page.getByText("Waiting for the host to start")).toBeVisible();

    // The host picks the course; the guest sees the pick.
    const pick = host.page.locator("[data-course]").first();
    await expect(pick).toHaveAttribute("aria-pressed", "true");
    const name = await pick.getByTestId("course-name").textContent();
    await expect(guest.page.getByTestId("course-chosen")).toContainText(name ?? "", { timeout: TIMEOUT });
    await pick.click();
    await expect(guest.page.getByTestId("course-chosen")).toContainText(name ?? "");

    await host.page.getByRole("button", { name: "Start", exact: true }).click();
    for (const { page } of [host, guest]) {
      await expect(page.getByTestId("frogmino-game")).toBeVisible({ timeout: TIMEOUT });
    }

    // The partner leaves the game: the host's game reopens and is listed again.
    await guest.page.getByRole("button", { name: "Leave", exact: true }).click();
    await expect(host.page.getByText("Leapy left the game")).toBeVisible({ timeout: TIMEOUT });
    await expect(openGame(watcher.page, "Hoppy")).toBeVisible({ timeout: TIMEOUT });

    // Closing the host's tab takes its game off the list.
    await host.page.close();
    await expect(openGame(watcher.page, "Hoppy")).toHaveCount(0, { timeout: TIMEOUT });
    await expect(watcher.page.getByText("No open games yet")).toBeVisible();
  } finally {
    for (const { ctx } of all) await ctx.close();
  }
});

test("the guest learns when the host leaves", async ({ browser }) => {
  const url = lobbyUrl(uniqueList());
  const host = await open(browser, url, "Hoppy");
  const guest = await open(browser, url, "Leapy");
  try {
    await host.page.getByRole("button", { name: "Host co-op" }).click();
    await openGame(guest.page, "Hoppy").click();
    await expect(guest.page.getByText("Waiting for the host to start")).toBeVisible({ timeout: TIMEOUT });
    await host.page.getByRole("button", { name: "Leave", exact: true }).click();
    await expect(guest.page.getByText("The host left the game")).toBeVisible({ timeout: TIMEOUT });
    await guest.page.getByRole("button", { name: "Back to lobby" }).click();
    await expect(guest.page.getByRole("button", { name: "Host co-op" })).toBeVisible();
  } finally {
    await host.ctx.close();
    await guest.ctx.close();
  }
});

test("joining a listed game whose host is gone says so", async ({ browser }) => {
  const list = uniqueList();
  // A listing with no host behind it, as a host that vanished
  // between being listed and being clicked leaves.
  const unlist = await listRoom("frogmino", list, {
    code: "ZZZZ",
    hostName: "Ghost",
    players: 1,
    capacity: 2,
    listedAt: Date.now(),
  });

  const guest = await open(browser, lobbyUrl(list), "Leapy");
  try {
    await openGame(guest.page, "Ghost").click();
    await expect(guest.page.getByText("That game has closed. Pick another!")).toBeVisible({ timeout: TIMEOUT });
  } finally {
    await guest.ctx.close();
    unlist();
  }
});
