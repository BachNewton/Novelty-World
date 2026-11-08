// e2e-covers: src/projects/tic-tac-toe/** src/projects/euchre/** public/tic-tac-toe/** public/euchre/**
import { test, expect } from "./test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { LOCAL_RELAY } from "./relay";

/**
 * Room-code games on the shared relay room (`src/shared/lib/peer`): a host
 * creates a room, guests join by typing its code, and play reaches every
 * page. Rooms' rules (an unknown code, a host leaving) are `room.test.ts`'s,
 * and Euchre's seats and rejoining its `logic.test.ts`.
 *
 * Offline by design: `?relay=local:<port>` points the rooms at the local
 * relay this run started. Every wait is
 * on a DOM state the game renders; there are no fixed pauses.
 */
test.describe.configure({ mode: "serial" });

const RELAY = `?${LOCAL_RELAY}`;
const TIC_TAC_TOE = `/games/tic-tac-toe${RELAY}`;
const EUCHRE = `/games/card-games/euchre${RELAY}`;
const CONNECT_TIMEOUT = 15_000;

interface Client {
  ctx: BrowserContext;
  page: Page;
}

async function open(browser: Browser, url: string): Promise<Client> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url);
  return { ctx, page };
}

async function createRoom(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Create Room" }).click();
  const code = page.getByTestId("room-code");
  await expect(code).toHaveText(/^[A-Z2-9]{4}$/, { timeout: CONNECT_TIMEOUT });
  return (await code.textContent()) ?? "";
}

async function joinRoom(page: Page, code: string): Promise<void> {
  await page.getByLabel("Room code").fill(code);
  await page.getByRole("button", { name: "Join", exact: true }).click();
}

test.describe("Tic Tac Toe", () => {
  test("two players join by code, and a move shows on both boards", async ({ browser }) => {
    const host = await open(browser, TIC_TAC_TOE);
    const guest = await open(browser, TIC_TAC_TOE);
    try {
      const code = await createRoom(host.page);
      await joinRoom(guest.page, code);

      const side = async (page: Page) => {
        const status = page.getByText(/You are [XO]/);
        await expect(status).toBeVisible({ timeout: CONNECT_TIMEOUT });
        return (await status.textContent())?.includes("You are X") === true ? "X" : "O";
      };
      const hostSide = await side(host.page);
      expect(await side(guest.page)).not.toBe(hostSide);
      const x = hostSide === "X" ? host.page : guest.page;

      await expect(x.getByText("Your turn")).toBeVisible();
      await x.getByRole("button", { name: "Cell 1", exact: true }).click();
      for (const { page } of [host, guest]) {
        await expect(page.getByRole("button", { name: "Cell 1", exact: true })).toHaveText("X");
      }
    } finally {
      await host.ctx.close();
      await guest.ctx.close();
    }
  });
});

test.describe("Euchre", () => {
  test("four players pick teams and start, and one seat is asked to bid", async ({ browser }) => {
    test.setTimeout(90_000);
    const host = await open(browser, EUCHRE);
    const guests = [
      await open(browser, EUCHRE),
      await open(browser, EUCHRE),
      await open(browser, EUCHRE),
    ];
    const all = [host, ...guests];
    try {
      const code = await createRoom(host.page);
      for (const guest of guests) await joinRoom(guest.page, code);
      for (const { page } of all) {
        await expect(page.getByText("4/4 players")).toBeVisible({ timeout: CONNECT_TIMEOUT });
      }

      // The host starts on Team A.
      await guests[0].page.getByRole("button", { name: "Join Team A" }).click();
      await expect(guests[0].page.getByRole("button", { name: "On Team A" })).toBeVisible();
      for (const guest of guests.slice(1)) {
        await guest.page.getByRole("button", { name: "Join Team B" }).click();
        await expect(guest.page.getByRole("button", { name: "On Team B" })).toBeVisible();
      }

      const start = host.page.getByRole("button", { name: "Start Game" });
      await expect(start).toBeEnabled();
      await start.click();
      for (const { page } of all) {
        await expect(page.getByRole("button", { name: "Leave game" })).toBeVisible({ timeout: CONNECT_TIMEOUT });
      }
      // Exactly one seat is asked to bid first.
      const bidding = await Promise.all(all.map(({ page }) => page.getByRole("button", { name: /Order Up/ }).count()));
      expect(bidding.reduce((a, b) => a + b, 0)).toBe(1);
    } finally {
      for (const { ctx } of all) await ctx.close();
    }
  });
});