import { test, expect } from "./test";
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { PEER_SIGNAL } from "./peer-signal";

/**
 * Frogmino's online co-op: two browsers host and join a game over the local
 * PeerServer, start it, and each player's keys move their own frog on both
 * screens. The game mirrors each frog's column (`data-cols`, Sprout's then
 * Splash's) and the team's depth on its root, so every wait is on the game's
 * own state, never a pause.
 */
test.describe.configure({ mode: "serial" });

const LOBBY = "/games/3d-games/frogmino";
const TIMEOUT = 20_000;

interface Client {
  ctx: BrowserContext;
  page: Page;
}

async function open(browser: Browser, url: string, name: string): Promise<Client> {
  const ctx = await browser.newContext();
  const profile = JSON.stringify({ state: { id: crypto.randomUUID(), name }, version: 0 });
  await ctx.addInitScript((value) => localStorage.setItem("nw:profile", value), profile);
  const page = await ctx.newPage();
  await page.goto(url);
  return { ctx, page };
}

/** Hoppy hosts, Leapy joins, Hoppy starts: both are in the game. */
async function startGame(browser: Browser): Promise<{ host: Client; guest: Client }> {
  const url = `${LOBBY}?${PEER_SIGNAL}&room-list=e2e-${crypto.randomUUID()}`;
  const host = await open(browser, url, "Hoppy");
  const guest = await open(browser, url, "Leapy");
  await host.page.getByRole("button", { name: "Host co-op" }).click();
  await guest.page.getByRole("button", { name: "Join Hoppy's game" }).click({ timeout: TIMEOUT });
  const start = host.page.getByRole("button", { name: "Start", exact: true });
  await expect(start).toBeEnabled({ timeout: TIMEOUT });
  await start.click();
  for (const { page } of [host, guest]) await expect(game(page)).toBeVisible({ timeout: TIMEOUT });
  return { host, guest };
}

function game(page: Page): Locator {
  return page.getByTestId("frogmino-game");
}

async function columns(page: Page): Promise<[number, number]> {
  const cols = await game(page).getAttribute("data-cols");
  const [sprout, splash] = (cols ?? "").split(",").map(Number);
  return [sprout, splash];
}

test("each player's keys move their own frog, on both screens", async ({ browser }) => {
  const { host, guest } = await startGame(browser);
  try {
    await expect(host.page.getByTestId("playing-as")).toHaveText("You're Sprout");
    await expect(guest.page.getByTestId("playing-as")).toHaveText("You're Splash");
    const [sprout, splash] = await columns(host.page);
    await expect(game(guest.page)).toHaveAttribute("data-cols", `${String(sprout)},${String(splash)}`);

    // Splash slides right, at once on the guest's screen and then on the host's.
    await guest.page.keyboard.press("ArrowRight");
    for (const { page } of [guest, host]) {
      await expect(game(page)).toHaveAttribute("data-cols", `${String(sprout)},${String(splash + 1)}`, { timeout: TIMEOUT });
    }
    // Sprout slides left, the same way round.
    await host.page.keyboard.press("ArrowLeft");
    for (const { page } of [host, guest]) {
      await expect(game(page)).toHaveAttribute("data-cols", `${String(sprout - 1)},${String(splash + 1)}`, { timeout: TIMEOUT });
    }
    // Either player's jump forward drops the whole team off the overpass.
    await guest.page.keyboard.press("KeyW");
    for (const { page } of [guest, host]) {
      await expect(game(page)).not.toHaveAttribute("data-depth", "0", { timeout: TIMEOUT });
    }

    // The guest leaves: the host is told, back in its waiting room.
    await guest.page.getByRole("button", { name: "Leave", exact: true }).click();
    await expect(host.page.getByText("Leapy left the game")).toBeVisible({ timeout: TIMEOUT });
    await expect(game(host.page)).toHaveCount(0);
  } finally {
    await host.ctx.close();
    await guest.ctx.close();
  }
});

test("the guest is told when the host leaves mid-game", async ({ browser }) => {
  const { host, guest } = await startGame(browser);
  try {
    await host.page.getByRole("button", { name: "Leave", exact: true }).click();
    await expect(guest.page.getByText("The host left the game")).toBeVisible({ timeout: TIMEOUT });
    await guest.page.getByRole("button", { name: "Back to lobby" }).click();
    await expect(guest.page.getByRole("button", { name: "Host co-op" })).toBeVisible();
  } finally {
    await host.ctx.close();
    await guest.ctx.close();
  }
});

test("a restart from either player starts the round over for both", async ({ browser }) => {
  const { host, guest } = await startGame(browser);
  try {
    await host.page.keyboard.press("KeyW");
    for (const { page } of [host, guest]) {
      await expect(game(page)).not.toHaveAttribute("data-depth", "0", { timeout: TIMEOUT });
    }
    // The guest asks; the host restarts both.
    await guest.page.keyboard.press("KeyR");
    for (const { page } of [host, guest]) {
      await expect(game(page)).toHaveAttribute("data-depth", "0", { timeout: TIMEOUT });
    }
  } finally {
    await host.ctx.close();
    await guest.ctx.close();
  }
});
