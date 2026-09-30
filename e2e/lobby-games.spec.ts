import { test, expect } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";

/**
 * Room-code games on the shared PeerJS room (`src/shared/lib/peer`): a host
 * creates a room, guests join by typing its code, and they play for real.
 *
 * Offline by design: `?peer-signal=local` points PeerJS at the local
 * PeerServer started by global-setup, with no STUN or TURN. Every wait is
 * on a DOM state the game renders; there are no fixed pauses.
 */
test.describe.configure({ mode: "serial" });

const SIGNAL = "?peer-signal=local";
const TIC_TAC_TOE = `/games/tic-tac-toe${SIGNAL}`;
const EUCHRE = `/games/card-games/euchre${SIGNAL}`;
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
  test("two players join by code, play to a win, rematch, and see a departure", async ({ browser }) => {
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
      const o = hostSide === "X" ? guest.page : host.page;

      // X takes the top row while O plays the middle.
      const moves: [Page, number][] = [
        [x, 1],
        [o, 4],
        [x, 2],
        [o, 5],
        [x, 3],
      ];
      for (const [mover, cell] of moves) {
        const mark = mover === x ? "X" : "O";
        await expect(mover.getByText("Your turn")).toBeVisible();
        await mover.getByRole("button", { name: `Cell ${cell}`, exact: true }).click();
        for (const page of [x, o]) {
          await expect(page.getByRole("button", { name: `Cell ${cell}`, exact: true })).toHaveText(mark);
        }
      }
      await expect(x.getByText("You win!")).toBeVisible();
      await expect(o.getByText("You lose!")).toBeVisible();

      // The guest asks for a rematch; the host deals a fresh board to both.
      await guest.page.getByRole("button", { name: "Play Again" }).click();
      for (const page of [host.page, guest.page]) {
        await expect(page.getByRole("button", { name: "Cell 1", exact: true })).toHaveText("");
        await expect(page.getByText(/You are [XO]/)).toBeVisible();
      }

      // Closing the page (not the context) tears its WebRTC channels down at once.
      await guest.page.close();
      await expect(host.page.getByText("Your opponent left")).toBeVisible({ timeout: CONNECT_TIMEOUT });
      await expect(host.page.getByTestId("room-code")).toHaveText(code);
    } finally {
      await host.ctx.close();
      await guest.ctx.close();
    }
  });

  test("a code nobody holds says so", async ({ browser }) => {
    const guest = await open(browser, TIC_TAC_TOE);
    try {
      await joinRoom(guest.page, "ZZZZ");
      await expect(guest.page.getByText("No room with code ZZZZ")).toBeVisible({ timeout: CONNECT_TIMEOUT });
    } finally {
      await guest.ctx.close();
    }
  });

  test("the guest learns when the host leaves", async ({ browser }) => {
    const host = await open(browser, TIC_TAC_TOE);
    const guest = await open(browser, TIC_TAC_TOE);
    try {
      const code = await createRoom(host.page);
      await joinRoom(guest.page, code);
      await expect(guest.page.getByText(/You are [XO]/)).toBeVisible({ timeout: CONNECT_TIMEOUT });
      await host.page.close();
      await expect(guest.page.getByText("The host left the game")).toBeVisible({ timeout: CONNECT_TIMEOUT });
    } finally {
      await host.ctx.close();
      await guest.ctx.close();
    }
  });
});

test.describe("Euchre", () => {
  test("four players pick teams, start, and a dropped player rejoins their seat", async ({ browser }) => {
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

      // A guest drops out; reopening the game in the same browser (same
      // profile) and typing the code puts them back in their seat.
      const dropped = guests[2];
      await dropped.page.close();
      const reopened = await dropped.ctx.newPage();

      await reopened.goto(EUCHRE);
      await joinRoom(reopened, code);
      await expect(reopened.getByRole("button", { name: "Leave game" })).toBeVisible({ timeout: CONNECT_TIMEOUT });
    } finally {
      for (const { ctx } of all) await ctx.close();
    }
  });
});
