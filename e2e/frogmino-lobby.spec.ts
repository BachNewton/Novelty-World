import { test, expect } from "./test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import nextEnv from "@next/env";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { PEER_SIGNAL } from "./peer-signal";

/**
 * Frogmino's lobby: solo play, and co-op rooms found through the live list
 * of open games (Supabase presence) and joined over the shared PeerJS room.
 *
 * `?peer-signal=local:<port>` keeps PeerJS on the local PeerServer this run
 * started. The open-games list is real Supabase presence, so each test
 * lists its rooms on a channel of its own (`?room-list=<unique>`): real
 * players never see the tests' rooms, and no test sees another's. Every wait
 * is on a DOM state the page renders or an event; there are no fixed pauses.
 */
test.describe.configure({ mode: "serial" });

const LOBBY = "/games/3d-games/frogmino";
const TIMEOUT = 15_000;

function lobbyUrl(channel: string): string {
  return `${LOBBY}?${PEER_SIGNAL}&room-list=${channel}`;
}

function uniqueChannel(): string {
  return `e2e-${crypto.randomUUID()}`;
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

async function expectInGame(page: Page): Promise<void> {
  await expect(page.locator("canvas")).toBeVisible({ timeout: TIMEOUT });
  await expect(page.getByRole("button", { name: "Host co-op" })).toHaveCount(0);
}

test("Play solo from the lobby starts the game", async ({ browser }) => {
  const player = await open(browser, lobbyUrl(uniqueChannel()), "Solo");
  try {
    await player.page.getByRole("button", { name: "Play solo" }).click();
    await expectInGame(player.page);
  } finally {
    await player.ctx.close();
  }
});

test("?play=solo skips the lobby", async ({ browser }) => {
  const player = await open(browser, `${LOBBY}?play=solo`, "Solo");
  try {
    await expectInGame(player.page);
  } finally {
    await player.ctx.close();
  }
});

test("a hosted game is listed live, joined with a click, and started", async ({ browser }) => {
  const url = lobbyUrl(uniqueChannel());
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
  const url = lobbyUrl(uniqueChannel());
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
  const channel = uniqueChannel();
  // A listing with no PeerJS host behind it, as a host that vanished
  // between being listed and being clicked leaves.
  nextEnv.loadEnvConfig(process.cwd());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url === undefined || key === undefined) throw new Error("e2e: Supabase env vars are missing");
  const supabase = createClient(url, key);
  const ghost: RealtimeChannel = supabase.channel(`lobby:frogmino:${channel}`);
  await new Promise<void>((resolve, reject) => {
    ghost.subscribe((status, err) => {
      if (status === "SUBSCRIBED") resolve();
      else if (status !== "CLOSED") reject(err ?? new Error(`ghost listing channel: ${status}`));
    });
  });
  expect(await ghost.track({ code: "ZZZZ", hostName: "Ghost", players: 1, capacity: 2, listedAt: Date.now() })).toBe(
    "ok",
  );

  const guest = await open(browser, lobbyUrl(channel), "Leapy");
  try {
    await openGame(guest.page, "Ghost").click();
    await expect(guest.page.getByText("That game has closed. Pick another!")).toBeVisible({ timeout: TIMEOUT });
  } finally {
    await guest.ctx.close();
    await supabase.removeAllChannels();
  }
});
