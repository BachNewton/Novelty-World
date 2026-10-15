import { devices } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { test, expect } from "./test";
import { LOCAL_RELAY } from "./relay";

/**
 * Frogmino's touch controls on an emulated phone, in online co-op, where
 * each player has a device of their own: the host plays on the phone, its
 * partner on a desktop browser. The game mirrors the team's rule state in
 * data attributes, so every wait is on the game's own state, never a pause.
 */
test.describe.configure({ mode: "serial" });

const PIXEL = devices["Pixel 7"];
const PHONE = { viewport: PIXEL.viewport, deviceScaleFactor: PIXEL.deviceScaleFactor, isMobile: true, hasTouch: true };
const LOBBY = "/games/3d-games/frogmino";
const TIMEOUT = 30_000;

interface Client {
  ctx: BrowserContext;
  page: Page;
}

async function open(browser: Browser, url: string, name: string, phone: boolean): Promise<Client> {
  const ctx = await browser.newContext(phone ? PHONE : {});
  const profile = JSON.stringify({ state: { id: crypto.randomUUID(), name }, version: 0 });
  await ctx.addInitScript((value) => localStorage.setItem("nw:profile", value), profile);
  const page = await ctx.newPage();
  await page.goto(url);
  return { ctx, page };
}

// Playwright's touchscreen only taps, so a drag goes through the DevTools
// protocol as a real touch sequence.
async function drag(page: Page, x: number, fromY: number, toY: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const point = (y: number) => [{ x, y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(fromY) });
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: point(fromY + ((toY - fromY) * i) / steps),
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test("on a phone, a drag up jumps the team out of the helicopter, and then a tap in the centre hops", async ({ browser }) => {
  const url = `${LOBBY}?${LOCAL_RELAY}&room-list=e2e-${crypto.randomUUID()}`;
  const host = await open(browser, url, "Hoppy", true);
  const guest = await open(browser, url, "Leapy", false);
  try {
    await host.page.getByRole("button", { name: "Host co-op" }).click({ timeout: TIMEOUT });
    await guest.page.getByRole("button", { name: "Join Hoppy's game" }).click({ timeout: TIMEOUT });
    const start = host.page.getByRole("button", { name: "Start", exact: true });
    await expect(start).toBeEnabled({ timeout: TIMEOUT });
    await start.click();

    const { page } = host;
    const layer = page.getByTestId("frogmino-touch");
    const game = page.getByTestId("frogmino-game");
    await expect(layer).toBeVisible({ timeout: TIMEOUT });
    const box = await layer.boundingBox();
    if (box === null) throw new Error("The touch layer has no box");
    const centreX = box.x + box.width / 2;
    const centreY = box.y + box.height / 2;

    // The team starts aboard the helicopter, where a hop does nothing; a jump
    // forward jumps it out onto the road.
    await expect(game).toHaveAttribute("data-depth", "0");
    await drag(page, centreX, centreY + 20, centreY - 30);
    await expect(game).not.toHaveAttribute("data-depth", "0", { timeout: TIMEOUT });

    // The host is Sprout, the first frog.
    await expect(game).toHaveAttribute("data-hopped-at", /^,/);
    await page.touchscreen.tap(centreX, centreY);
    await expect(game).toHaveAttribute("data-hopped-at", /^\d+,/, { timeout: TIMEOUT });

    // The course sets each frog's piece for the whole run, so there is nothing to swap.
    await expect(page.getByRole("button", { name: "Swap" })).toHaveCount(0);
  } finally {
    await host.ctx.close();
    await guest.ctx.close();
  }
});
