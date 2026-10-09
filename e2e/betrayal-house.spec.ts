import { test, expect, type Page } from "@playwright/test";

/**
 * The Betrayal house view's stand-in decision, once per input method: each
 * test walks Longfellow a leg to a chosen room and then stops his move there,
 * ending his turn. Every wait is on the view's own state
 * (window.__betrayalHouse), never a pause.
 */

const HOUSE = "/board-games/betrayal?house";

// The house is WebGL: run it on the GPU, as the shots tools do, rather than a slow software renderer.
test.use({ launchOptions: { args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] } });
test.setTimeout(90_000);

interface Point {
  x: number;
  y: number;
}

type Direction = "up" | "down" | "left" | "right";

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

/** Where Longfellow stands: the choice that stops his move there. */
const standing = (page: Page) => page.evaluate(() => window.__betrayalHouse?.state().explorers[0].room ?? "");

async function screenPoint(page: Page, room: string): Promise<Point> {
  const at = await page.evaluate((target) => window.__betrayalHouse?.screenPoint(target) ?? null, room);
  if (!at) throw new Error(`${room} has no place on screen`);
  return at;
}

/** A room to walk to, other than the focused one, on the floor showing,
 *  whose spot on the screen is open house (not under the page's panels). */
async function openChoice(page: Page): Promise<{ room: string; at: Point }> {
  const found = await page.evaluate(() => {
    const house = window.__betrayalHouse;
    if (!house) throw new Error("No house view");
    const state = house.state();
    for (const choice of state.choices) {
      if (choice.stop || choice.room === state.focused || choice.floor !== state.floor) continue;
      const at = house.screenPoint(choice.room);
      if (at && document.elementFromPoint(at.x, at.y) instanceof HTMLCanvasElement) return { room: choice.room, at };
    }
    return null;
  });
  if (!found) throw new Error("No choice shows in the open");
  return found;
}

/** Waits for Longfellow to stand in `room` and the camera to settle, offered
 *  his next leg or, with `turnOver`, with the turn passed to the pawn. */
async function arrived(page: Page, room: string, { turnOver = false } = {}): Promise<void> {
  await page.waitForFunction(
    ([target, over]) => {
      const house = window.__betrayalHouse;
      const state = house?.state();
      return state?.phase === "choosing" && state.active === (over ? 1 : 0) && state.explorers[0].room === target && house?.isReady() === true;
    },
    [room, turnOver] as const,
    { timeout: 45_000 },
  );
}

const stopped = (page: Page, room: string) => arrived(page, room, { turnOver: true });

/** Presses directions until the focus reaches `room`: each press goes the way
 *  the room lies on screen from the focused choice, along the larger axis. */
async function steer(page: Page, room: string, press: (direction: Direction) => Promise<void>): Promise<void> {
  for (let tries = 0; tries < 8; tries++) {
    const now = await focused(page);
    if (now === room) return;
    const from = await screenPoint(page, now ?? "");
    const to = await screenPoint(page, room);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    await press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    await page.waitForFunction((was) => window.__betrayalHouse?.state().focused !== was, now);
  }
  throw new Error(`The focus never reached ${room}`);
}

/** Hovers a choice where it shows on screen, checks it took the focus without
 *  changing floor, and clicks it. */
async function clickThrough(page: Page, room: string): Promise<void> {
  const floor = await page.evaluate(() => window.__betrayalHouse?.state().floor);
  const at = await screenPoint(page, room);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => focused(page)).toBe(room);
  expect(await page.evaluate(() => window.__betrayalHouse?.state().floor)).toBe(floor);
  await page.mouse.click(at.x, at.y);
}

test("mouse: hovering a room focuses it, a click walks there, and a click where he stands stops", async ({ page }) => {
  await openHouse(page);
  const { room, at } = await openChoice(page);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => focused(page)).toBe(room);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => window.__betrayalHouse?.state().phase === "walking");
  await arrived(page, room);
  await clickThrough(page, await standing(page));
  await stopped(page, room);
});

test("mouse: up the stairs and on to an upper room in one turn, then back down", async ({ page }) => {
  await openHouse(page);
  // On the ground floor, the Upper Landing shows as the grand staircase's run: 3 of his 4 spaces.
  await clickThrough(page, "upper-landing");
  await arrived(page, "upper-landing");
  const after = await page.evaluate(() => window.__betrayalHouse?.state());
  expect(after?.floor).toBe("upper");
  expect(after?.left).toBe(1);
  // His last space takes him on into the Drawing Room, which spends his move and ends the turn.
  await clickThrough(page, "drawing-room");
  await stopped(page, "drawing-room");
  // The pawn walks to the Library and stops, and the view follows Longfellow back upstairs.
  await page.evaluate(() => window.__betrayalHouse?.choose("library"));
  await page.waitForFunction(() => {
    const state = window.__betrayalHouse?.state();
    return state?.phase === "choosing" && state.explorers[1].room === "library";
  }, null, { timeout: 45_000 });
  await page.evaluate(() => window.__betrayalHouse?.choose("library"));
  await page.waitForFunction(() => window.__betrayalHouse?.state().active === 0 && window.__betrayalHouse.isReady(), null, { timeout: 45_000 });
  expect(await page.evaluate(() => window.__betrayalHouse?.state().floor)).toBe("upper");
  // On the upper floor, the Grand Staircase shows as the flight down the well.
  await clickThrough(page, "grand-staircase");
  await arrived(page, "grand-staircase");
});

test("keyboard: arrows move the focus across the screen, and Enter walks there or stops", async ({ page }) => {
  await openHouse(page);
  const keys = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" } as const;
  const arrow = (direction: Direction) => page.keyboard.press(keys[direction]);
  await steer(page, "dining-room", arrow);
  await expect(page.getByText("Enter", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await arrived(page, "dining-room");
  expect(await page.evaluate(() => window.__betrayalHouse?.state().left)).toBe(2);
  await steer(page, await standing(page), arrow);
  await page.keyboard.press("Enter");
  await stopped(page, "dining-room");
});

test.describe("touch", () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

  test("a tap focuses a room, and a second tap on it walks there or stops", async ({ page }) => {
    await openHouse(page);
    const { room, at } = await openChoice(page);
    await page.touchscreen.tap(at.x, at.y);
    await expect.poll(() => focused(page)).toBe(room);
    expect(await page.evaluate(() => window.__betrayalHouse?.state().phase)).toBe("choosing");
    await page.touchscreen.tap(at.x, at.y);
    await arrived(page, room);
    const here = await screenPoint(page, await standing(page));
    await page.touchscreen.tap(here.x, here.y);
    await expect.poll(() => focused(page)).toBe(room);
    expect(await page.evaluate(() => window.__betrayalHouse?.state().active)).toBe(0);
    await page.touchscreen.tap(here.x, here.y);
    await stopped(page, room);
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
  async function press(page: Page, button: number, done: () => Promise<unknown>): Promise<void> {
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

  test("the d-pad moves the focus, and A walks there or stops", async ({ page }) => {
    await openHouse(page);
    const DPAD = { up: 12, down: 13, left: 14, right: 15 } as const;
    const dpad = async (direction: Direction) => {
      const was = await focused(page);
      await press(page, DPAD[direction], () => page.waitForFunction((w) => window.__betrayalHouse?.state().focused !== w, was));
    };
    /** A, held until the decision it answers is gone. */
    const pressA = async () => {
      const was = await page.evaluate(() => JSON.stringify(window.__betrayalHouse?.state().choices));
      await press(page, 0, () => page.waitForFunction((w) => JSON.stringify(window.__betrayalHouse?.state().choices) !== w, was));
    };
    await steer(page, "dining-room", dpad);
    await expect(page.getByText("walk", { exact: true })).toBeVisible();
    await pressA();
    await arrived(page, "dining-room");
    await steer(page, await standing(page), dpad);
    await pressA();
    await stopped(page, "dining-room");
  });
});
