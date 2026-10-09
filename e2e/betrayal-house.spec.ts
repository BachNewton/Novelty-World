import { test, expect, type Page } from "@playwright/test";

/**
 * The Betrayal house view's stand-in decision, once per input method: each
 * test moves Longfellow to a chosen room. Every wait is on the view's own
 * state (window.__betrayalHouse), never a pause.
 */

const HOUSE = "/board-games/betrayal?house";

// The house is WebGL: run it on the GPU, as the shots tools do, rather than a slow software renderer.
test.use({ launchOptions: { args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] } });
test.setTimeout(90_000);

interface Point {
  x: number;
  y: number;
}

async function openHouse(page: Page): Promise<void> {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(HOUSE);
  await page.waitForFunction(() => window.__betrayalHouse?.isReady() === true && window.__betrayalHouse.state().phase === "choosing", null, {
    timeout: 60_000,
  });
}

const focused = (page: Page) => page.evaluate(() => window.__betrayalHouse?.state().focused ?? null);

/** A choice other than the focused one, on the floor showing, whose spot on
 *  the screen is open house (not under the page's panels). */
async function openChoice(page: Page): Promise<{ room: string; at: Point }> {
  const found = await page.evaluate(() => {
    const house = window.__betrayalHouse;
    if (!house) throw new Error("No house view");
    const state = house.state();
    for (const choice of state.choices) {
      if (choice.room === state.focused || choice.floor !== state.floor) continue;
      const at = house.screenPoint(choice.room);
      if (at && document.elementFromPoint(at.x, at.y) instanceof HTMLCanvasElement) return { room: choice.room, at };
    }
    return null;
  });
  if (!found) throw new Error("No choice shows in the open");
  return found;
}

/** Waits for Longfellow to stand in `room` with the turn passed to the other explorer. */
async function arrived(page: Page, room: string): Promise<void> {
  await page.waitForFunction(
    (target) => {
      const state = window.__betrayalHouse?.state();
      return state?.phase === "choosing" && state.active === 1 && state.explorers[0].room === target;
    },
    room,
    { timeout: 45_000 },
  );
}

/** Presses directions until the focus reaches `room`: each press goes the way
 *  the room lies on screen from the focused choice, along the larger axis. */
async function steer(page: Page, room: string, press: (direction: "up" | "down" | "left" | "right") => Promise<void>): Promise<void> {
  for (let tries = 0; tries < 8; tries++) {
    const now = await focused(page);
    if (now === room) return;
    const [from, to] = await page.evaluate(
      ([a, b]) => [window.__betrayalHouse?.screenPoint(a), window.__betrayalHouse?.screenPoint(b)],
      [now ?? "", room],
    );
    if (!from || !to) throw new Error(`No screen point for ${now} or ${room}`);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    await press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    await page.waitForFunction((was) => window.__betrayalHouse?.state().focused !== was, now);
  }
  throw new Error(`The focus never reached ${room}`);
}

test("mouse: hovering a room focuses it, and a click walks there", async ({ page }) => {
  await openHouse(page);
  const { room, at } = await openChoice(page);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => focused(page)).toBe(room);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => window.__betrayalHouse?.state().phase === "walking");
  await arrived(page, room);
});

/** Hovers a choice where it shows on screen, checks it took the focus without
 *  changing floor, and clicks it. */
async function clickThrough(page: Page, room: string): Promise<void> {
  const floor = await page.evaluate(() => window.__betrayalHouse?.state().floor);
  const at = await page.evaluate((target) => window.__betrayalHouse?.screenPoint(target) ?? null, room);
  if (!at) throw new Error(`${room} has no place on screen`);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => focused(page)).toBe(room);
  expect(await page.evaluate(() => window.__betrayalHouse?.state().floor)).toBe(floor);
  await page.mouse.click(at.x, at.y);
}

test("mouse: the room across a stair is offered as the stair, up and back down", async ({ page }) => {
  await openHouse(page);
  // On the ground floor, the Upper Landing shows as the grand staircase's run.
  await clickThrough(page, "upper-landing");
  await arrived(page, "upper-landing");
  expect(await page.evaluate(() => window.__betrayalHouse?.state().floor)).toBe("ground");
  // The pawn takes its turn, and the view follows Longfellow back upstairs.
  await page.evaluate(() => window.__betrayalHouse?.choose("library"));
  await page.waitForFunction(() => {
    const state = window.__betrayalHouse?.state();
    return state?.phase === "choosing" && state.active === 0 && window.__betrayalHouse?.isReady() === true;
  }, null, { timeout: 45_000 });
  expect(await page.evaluate(() => window.__betrayalHouse?.state().floor)).toBe("upper");
  // On the upper floor, the Grand Staircase shows as the flight down the well.
  await clickThrough(page, "grand-staircase");
  await arrived(page, "grand-staircase");
});

test("keyboard: arrows move the focus across the screen, and Enter walks there", async ({ page }) => {
  await openHouse(page);
  const keys = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" } as const;
  await steer(page, "dining-room", (direction) => page.keyboard.press(keys[direction]));
  await expect(page.getByText("Enter", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await arrived(page, "dining-room");
});

test.describe("touch", () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

  test("a tap focuses a room, and a second tap on it walks there", async ({ page }) => {
    await openHouse(page);
    const { room, at } = await openChoice(page);
    await page.touchscreen.tap(at.x, at.y);
    await expect.poll(() => focused(page)).toBe(room);
    expect(await page.evaluate(() => window.__betrayalHouse?.state().phase)).toBe("choosing");
    await page.touchscreen.tap(at.x, at.y);
    await arrived(page, room);
  });
});

test.describe("controller", () => {
  // A standard-layout pad the page sees as connected: the gamepad library
  // reads the pads every frame, so the test presses buttons by changing them.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const pad = {
        index: 0,
        id: "Test pad (STANDARD GAMEPAD)",
        mapping: "standard",
        connected: true,
        timestamp: 0,
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      };
      Object.assign(window, { testPad: pad });
      Object.defineProperty(navigator, "getGamepads", { value: () => [pad, null, null, null] });
    });
  });

  /** Holds a button until `done` holds, then lets go and waits for the pad
   *  to be read again, so the next press is seen as a new one. */
  async function press(page: Page, button: number, done: () => Promise<void>): Promise<void> {
    const setButton = (pressed: boolean) =>
      page.evaluate(
        ([index, down]) => {
          const pad = (window as unknown as { testPad: { buttons: { pressed: boolean; value: number }[] } }).testPad;
          pad.buttons[index] = { ...pad.buttons[index], pressed: down, value: down ? 1 : 0 };
        },
        [button, pressed] as const,
      );
    await setButton(true);
    await done();
    await setButton(false);
    const frame = await page.evaluate(() => window.__betrayalHouse?.frameCount() ?? 0);
    await page.waitForFunction((n) => (window.__betrayalHouse?.frameCount() ?? 0) >= n + 2, frame);
  }

  test("the d-pad moves the focus, and A walks there", async ({ page }) => {
    await openHouse(page);
    const DPAD = { up: 12, down: 13, left: 14, right: 15 } as const;
    await steer(page, "dining-room", async (direction) => {
      const was = await focused(page);
      await press(page, DPAD[direction], () => page.waitForFunction((w) => window.__betrayalHouse?.state().focused !== w, was).then(() => undefined));
    });
    await expect(page.getByText("walk", { exact: true })).toBeVisible();
    await press(page, 0, () => page.waitForFunction(() => window.__betrayalHouse?.state().phase !== "choosing").then(() => undefined));
    await arrived(page, "dining-room");
  });
});
