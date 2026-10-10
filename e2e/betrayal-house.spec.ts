import { test, expect, type Page } from "@playwright/test";

/**
 * The Betrayal house demo's stand-in decision, once per input method: each
 * test picks a room Longfellow can walk to and commits it, and most then stop
 * his move there, ending his turn. Choices are named by target id
 * (`walk:<room>`, `stop`, the room he stands in). There are three input
 * methods: a keyboard and mouse together, touch, and a controller. The camera
 * is free: it pans, orbits and zooms, and a controller selects with the
 * reticle at the screen's centre, where the mouse and a finger point. Every wait is on the view's own state
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

async function openHouse(page: Page): Promise<void> {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(HOUSE);
  await page.waitForFunction(() => window.__betrayalHouse?.isReady() === true && window.__betrayalHouse.state().phase === "choosing" && !window.__betrayalHouse.state().walking, null, {
    timeout: 60_000,
  });
}

const focused = (page: Page) => page.evaluate(() => window.__betrayalHouse?.state().focused ?? null);
const cameraNow = (page: Page) =>
  page.evaluate(() => {
    const house = window.__betrayalHouse;
    if (!house) throw new Error("No house view");
    return house.camera();
  });

/** The choice that stops Longfellow's move where he stands. */
const STOP = "stop";

async function screenPoint(page: Page, id: string): Promise<Point> {
  const at = await page.evaluate((target) => window.__betrayalHouse?.screenPoint(target) ?? null, id);
  if (!at) throw new Error(`${id} has no place on screen`);
  return at;
}

/** Waits for a few more frames to be drawn: the pad and held keys are read once a frame. */
async function frames(page: Page, count = 2): Promise<void> {
  const frame = await page.evaluate(() => window.__betrayalHouse?.frameCount() ?? 0);
  await page.waitForFunction(([n, more]) => (window.__betrayalHouse?.frameCount() ?? 0) >= n + more, [frame, count] as const);
}

/** A room to walk to on the floor showing, other than the focused one, whose
 *  spot on the screen is open house (not under the page's panels). */
async function openChoice(page: Page): Promise<{ id: string; room: string; at: Point }> {
  const found = await page.evaluate(() => {
    const house = window.__betrayalHouse;
    if (!house) throw new Error("No house view");
    const state = house.state();
    for (const choice of state.choices) {
      if (choice.stop || choice.id === state.focused || choice.floor !== state.floor) continue;
      const at = house.screenPoint(choice.id);
      if (at && document.elementFromPoint(at.x, at.y) instanceof HTMLCanvasElement) return { id: choice.id, room: choice.room, at };
    }
    return null;
  });
  if (!found) throw new Error("No choice shows in the open");
  return found;
}

/** Waits for Longfellow to stand in `room`, his walk over and the camera
 *  settled, offered his next leg or, with `turnOver`, with the turn passed to the pawn. */
async function arrived(page: Page, room: string, { turnOver = false } = {}): Promise<void> {
  await page.waitForFunction(
    ([target, over]) => {
      const house = window.__betrayalHouse;
      const state = house?.state();
      return state?.phase === "choosing" && !state.walking && state.active === (over ? 1 : 0) && state.explorers[0].room === target && house?.isReady() === true;
    },
    [room, turnOver] as const,
    { timeout: 45_000 },
  );
}

const stopped = (page: Page, room: string) => arrived(page, room, { turnOver: true });

/**
 * Pans the camera once towards the choice `id`: `push` starts a pan towards a
 * point on the screen (a unit direction, right and down) and returns the
 * direction it really pans (a key pans along one axis only), and `release`
 * stops it once the choice has passed the screen's centre that way, or `done` holds.
 */
async function panToward(
  page: Page,
  id: string,
  push: (direction: Point) => Promise<Point>,
  release: () => Promise<void>,
  done: string | null = null,
): Promise<void> {
  const to = await screenPoint(page, id);
  const box = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) throw new Error("No canvas");
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  const [dx, dy] = [to.x - box.x, to.y - box.y];
  const length = Math.hypot(dx, dy);
  const along = await push({ x: dx / length, y: dy / length });
  await page.waitForFunction(
    ([target, from, reticle]) => {
      const house = window.__betrayalHouse;
      if (!house) return false;
      if (reticle !== null && house.reticle() === reticle) return true;
      const now = house.screenPoint(target);
      // Past the centre: the pan has carried it the other side.
      return now !== null && (now.x - from.cx) * from.dx + (now.y - from.cy) * from.dy <= 0;
    },
    [id, { cx: box.x, cy: box.y, dx: along.x, dy: along.y }, done] as const,
    { timeout: 20_000 },
  );
  await release();
}

/** Pans the camera until the reticle at the screen's centre selects the choice `id`, aiming each push afresh. */
async function steerReticle(page: Page, id: string, push: (direction: Point) => Promise<Point>, release: () => Promise<void>): Promise<void> {
  for (let tries = 0; tries < 8; tries++) {
    if ((await page.evaluate(() => window.__betrayalHouse?.reticle() ?? null)) === id) return;
    await panToward(page, id, push, release, id);
  }
  throw new Error(`The reticle never reached ${id}`);
}

/** Hovers a choice where it shows on screen, checks it took the focus without
 *  changing floor, and clicks it. */
async function clickThrough(page: Page, id: string): Promise<void> {
  const floor = await page.evaluate(() => window.__betrayalHouse?.state().floor);
  const at = await screenPoint(page, id);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => focused(page)).toBe(id);
  expect(await page.evaluate(() => window.__betrayalHouse?.state().floor)).toBe(floor);
  await page.mouse.click(at.x, at.y);
}

test("keyboard and mouse: hovering a room focuses it, a click walks there, and a click where he stands stops", async ({ page }) => {
  await openHouse(page);
  const { id, room, at } = await openChoice(page);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => focused(page)).toBe(id);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => window.__betrayalHouse?.state().walking === true);
  await arrived(page, room);
  await clickThrough(page, STOP);
  await stopped(page, room);
});

test("keyboard and mouse: the wheel zooms, a right-drag orbits, and a left-drag pans", async ({ page }) => {
  await openHouse(page);
  const centre = await page.evaluate(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
  const before = await cameraNow(page);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => (await cameraNow(page)).zoom).toBeGreaterThan(before.zoom);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(centre.x + 120, centre.y, { steps: 6 });
  await page.mouse.up({ button: "right" });
  expect((await cameraNow(page)).yaw).not.toBeCloseTo(before.yaw, 2);
  // Dragging up with the right button tilts the camera down towards eye level.
  await page.mouse.down({ button: "right" });
  await page.mouse.move(centre.x + 120, centre.y - 80, { steps: 6 });
  await page.mouse.up({ button: "right" });
  expect((await cameraNow(page)).pitch).toBeLessThan(before.pitch - 0.3);
  const turned = await cameraNow(page);
  await page.mouse.down();
  await page.mouse.move(centre.x - 100, centre.y + 60, { steps: 6 });
  await page.mouse.up();
  const panned = await cameraNow(page);
  expect(Math.hypot(panned.target.x - turned.target.x, panned.target.z - turned.target.z)).toBeGreaterThan(1);
  expect(panned.yaw).toBeCloseTo(turned.yaw, 5);
  // A drag is not a click: nothing was chosen.
  expect(await page.evaluate(() => window.__betrayalHouse?.state().explorers[0].room)).toBe("library");
});

test("keyboard and mouse: up the stairs and on to an upper room in one turn, then back down", async ({ page }) => {
  await openHouse(page);
  // On the ground floor, the Upper Landing shows as the grand staircase's run: 3 of his 4 spaces.
  await clickThrough(page, "walk:upper-landing");
  await arrived(page, "upper-landing");
  const after = await page.evaluate(() => window.__betrayalHouse?.state());
  expect(after?.floor).toBe("upper");
  expect(after?.left).toBe(1);
  // His last space takes him on into the Drawing Room, which spends his move and ends the turn.
  await clickThrough(page, "walk:drawing-room");
  await stopped(page, "drawing-room");
  // The pawn walks to the Library and stops, and the view follows Longfellow back upstairs.
  await page.evaluate(() => window.__betrayalHouse?.choose("walk:library"));
  await page.waitForFunction(() => {
    const state = window.__betrayalHouse?.state();
    return state?.phase === "choosing" && !state.walking && state.explorers[1].room === "library";
  }, null, { timeout: 45_000 });
  await page.evaluate(() => window.__betrayalHouse?.choose("stop"));
  await page.waitForFunction(() => window.__betrayalHouse?.state().active === 0 && window.__betrayalHouse.isReady(), null, { timeout: 45_000 });
  expect(await page.evaluate(() => window.__betrayalHouse?.state().floor)).toBe("upper");
  // On the upper floor, the Grand Staircase shows as the flight down the well.
  await clickThrough(page, "walk:grand-staircase");
  await arrived(page, "grand-staircase");
});

test.describe("keyboard and mouse", () => {
  const PAN = (direction: Point) => (Math.abs(direction.x) > Math.abs(direction.y) ? (direction.x > 0 ? "KeyD" : "KeyA") : direction.y > 0 ? "KeyS" : "KeyW");

  test("WASD pans a room towards the middle, the mouse picks it, and Enter on the hovered room stops", async ({ page }) => {
    await openHouse(page);
    const { id, room } = await openChoice(page);
    let held: string | null = null;
    await panToward(
      page,
      id,
      async (direction) => {
        held = PAN(direction);
        await page.keyboard.down(held);
        return Math.abs(direction.x) > Math.abs(direction.y) ? { x: Math.sign(direction.x), y: 0 } : { x: 0, y: Math.sign(direction.y) };
      },
      async () => {
        if (held) await page.keyboard.up(held);
      },
    );
    // The mouse is the selection with the keys in use: no reticle.
    expect(await page.evaluate(() => window.__betrayalHouse?.reticle())).toBeNull();
    await expect(page.getByText("Click", { exact: true })).toBeVisible();
    await clickThrough(page, id);
    await arrived(page, room);
    const here = await screenPoint(page, STOP);
    await page.mouse.move(here.x, here.y);
    await expect.poll(() => focused(page)).toBe(STOP);
    await page.keyboard.press("Enter");
    await stopped(page, room);
  });

  test("G tilts the camera down to eye level, and the mouse still picks a room and walks there", async ({ page }) => {
    await openHouse(page);
    await page.keyboard.down("KeyG");
    // Held, the tilt stops at its lowest: about 9° above the floor.
    await page.waitForFunction(() => (window.__betrayalHouse?.camera().pitch ?? 1) < 0.16);
    await page.keyboard.up("KeyG");
    await page.waitForFunction(() => window.__betrayalHouse?.isReady());
    expect((await cameraNow(page)).pitch).toBeGreaterThan(0.15);
    const { id, room } = await openChoice(page);
    await clickThrough(page, id);
    await arrived(page, room);
  });

  test("Tab jumps the camera to the next choice and focuses it, and Enter takes it", async ({ page }) => {
    await openHouse(page);
    let id: string | null = null;
    for (let tries = 0; tries < 12; tries++) {
      const was = await focused(page);
      await page.keyboard.press("Tab");
      await page.waitForFunction((w) => window.__betrayalHouse?.state().focused !== w, was);
      id = await focused(page);
      if (id !== STOP) break;
    }
    if (id === null || id === STOP) throw new Error("Tab found no room to walk to");
    await page.waitForFunction(() => window.__betrayalHouse?.isReady());
    // The camera panned to it: it shows at the middle of the screen.
    const centre = await page.evaluate(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
    const at = await screenPoint(page, id);
    expect(Math.hypot(at.x - centre.x, at.y - centre.y)).toBeLessThan(8);
    const room = await page.evaluate((choice) => window.__betrayalHouse?.state().choices.find((candidate) => candidate.id === choice)?.room, id);
    if (!room) throw new Error(`${id} is no choice`);
    await page.keyboard.press("Enter");
    await arrived(page, room);
  });

  test("Escape clears the focus, and Enter then does nothing", async ({ page }) => {
    await openHouse(page);
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => window.__betrayalHouse?.state().focused != null);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => window.__betrayalHouse?.state().focused === null);
    await page.keyboard.press("Enter");
    await frames(page);
    expect(await page.evaluate(() => window.__betrayalHouse?.state().walking)).toBe(false);
    expect(await page.evaluate(() => window.__betrayalHouse?.state().active)).toBe(0);
  });

  test("recentre goes back to the active explorer after panning away and changing floor", async ({ page }) => {
    await openHouse(page);
    const home = await cameraNow(page);
    await page.keyboard.down("KeyD");
    await page.waitForFunction((from) => {
      const now = window.__betrayalHouse?.camera().target;
      return now !== undefined && Math.hypot(now.x - from.x, now.z - from.z) > 9;
    }, home.target);
    await page.keyboard.up("KeyD");
    await page.keyboard.press("PageUp");
    await page.waitForFunction(() => window.__betrayalHouse?.state().floor === "upper");
    await page.keyboard.press("KeyC");
    await page.waitForFunction(() => window.__betrayalHouse?.state().floor === "ground" && window.__betrayalHouse.isReady());
    const back = await cameraNow(page);
    expect(Math.hypot(back.target.x - home.target.x, back.target.z - home.target.z)).toBeLessThan(0.05);
    expect(back.zoom).toBe(home.zoom);
    // His own room is in the middle of the screen again.
    const middle = await page.evaluate(() => {
      const rect = document.querySelector("canvas")?.getBoundingClientRect();
      if (!rect) throw new Error("No canvas");
      return window.__betrayalHouse?.targetAt({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    });
    expect(middle).toBe(STOP);
  });
});

const wallsRaised = (page: Page) => page.evaluate(() => window.__betrayalHouse?.state().wallsRaised);

test("keyboard: holding V raises the walls, and letting go lets them down", async ({ page }) => {
  await openHouse(page);
  expect(await wallsRaised(page)).toBe(false);
  await page.keyboard.down("KeyV");
  await page.waitForFunction(() => window.__betrayalHouse?.state().wallsRaised === true);
  await page.keyboard.up("KeyV");
  await page.waitForFunction(() => window.__betrayalHouse?.state().wallsRaised === false);
});

test.describe("touch", () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

  test("holding the walls button raises the walls until the finger lifts, even slid off it", async ({ page }) => {
    await openHouse(page);
    const button = await page.getByRole("button", { name: "Raise the walls" }).boundingBox();
    if (!button) throw new Error("No walls button");
    const cdp = await page.context().newCDPSession(page);
    const [x, y] = [button.x + button.width / 2, button.y + button.height / 2];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    await page.waitForFunction(() => window.__betrayalHouse?.state().wallsRaised === true);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - 120, id: 1 }] });
    expect(await wallsRaised(page)).toBe(true);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction(() => window.__betrayalHouse?.state().wallsRaised === false);
  });
});

test.describe("touch", () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

  test("a tap focuses a room, and a second tap on it walks there or stops", async ({ page }) => {
    await openHouse(page);
    const { id, room, at } = await openChoice(page);
    await page.touchscreen.tap(at.x, at.y);
    await expect.poll(() => focused(page)).toBe(id);
    expect(await page.evaluate(() => window.__betrayalHouse?.state().phase)).toBe("choosing");
    await page.touchscreen.tap(at.x, at.y);
    await arrived(page, room);
    const here = await screenPoint(page, STOP);
    await page.touchscreen.tap(here.x, here.y);
    await expect.poll(() => focused(page)).toBe(STOP);
    expect(await page.evaluate(() => window.__betrayalHouse?.state().active)).toBe(0);
    await page.touchscreen.tap(here.x, here.y);
    await stopped(page, room);
  });

  test("one finger pans, a pinch zooms and a twist orbits, then taps still choose", async ({ page }) => {
    await openHouse(page);
    const cdp = await page.context().newCDPSession(page);
    type Finger = { x: number; y: number; id: number };
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", touchPoints: Finger[]) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    /** Moves fingers from where they start to where they end, in steps, one event each. */
    const gesture = async (from: Finger[], to: Finger[]) => {
      await touch("touchStart", from);
      for (let step = 1; step <= 8; step++) {
        await touch(
          "touchMove",
          from.map((finger, i) => ({ id: finger.id, x: finger.x + ((to[i].x - finger.x) * step) / 8, y: finger.y + ((to[i].y - finger.y) * step) / 8 })),
        );
      }
      await touch("touchEnd", []);
    };
    const [cx, cy] = [206, 400];
    const before = await cameraNow(page);

    await gesture([{ x: cx, y: cy, id: 1 }], [{ x: cx - 120, y: cy + 40, id: 1 }]);
    const panned = await cameraNow(page);
    expect(Math.hypot(panned.target.x - before.target.x, panned.target.z - before.target.z)).toBeGreaterThan(1);
    expect(panned.zoom).toBe(before.zoom);

    await gesture(
      [
        { x: cx - 40, y: cy, id: 1 },
        { x: cx + 40, y: cy, id: 2 },
      ],
      [
        { x: cx - 120, y: cy, id: 1 },
        { x: cx + 120, y: cy, id: 2 },
      ],
    );
    const pinched = await cameraNow(page);
    expect(pinched.zoom).toBeGreaterThan(panned.zoom * 2);
    expect(pinched.yaw).toBeCloseTo(panned.yaw, 5);

    // A quarter turn clockwise of the line between two fingers, at the same spread.
    await gesture(
      [
        { x: cx - 80, y: cy, id: 1 },
        { x: cx + 80, y: cy, id: 2 },
      ],
      [
        { x: cx - 57, y: cy - 57, id: 1 },
        { x: cx + 57, y: cy + 57, id: 2 },
      ],
    );
    const twisted = await cameraNow(page);
    expect(twisted.yaw - pinched.yaw).toBeCloseTo(Math.PI / 4, 1);
    expect(twisted.zoom).toBeCloseTo(pinched.zoom, 5);
    // Two fingers dragged up together tilt the camera down.
    await gesture(
      [
        { x: cx - 60, y: cy, id: 1 },
        { x: cx + 60, y: cy, id: 2 },
      ],
      [
        { x: cx - 60, y: cy - 90, id: 1 },
        { x: cx + 60, y: cy - 90, id: 2 },
      ],
    );
    const tilted = await cameraNow(page);
    expect(tilted.pitch).toBeLessThan(twisted.pitch - 0.3);
    expect(tilted.yaw).toBeCloseTo(twisted.yaw, 5);
    expect(tilted.zoom).toBeCloseTo(twisted.zoom, 5);
    // No gesture chose anything.
    expect(await page.evaluate(() => window.__betrayalHouse?.state().walking)).toBe(false);

    await page.evaluate(() => {
      window.__betrayalHouse?.recentre();
      window.__betrayalHouse?.setZoom(1);
    });
    await page.waitForFunction(() => window.__betrayalHouse?.isReady());
    const { room, at } = await openChoice(page);
    await page.touchscreen.tap(at.x, at.y);
    await page.touchscreen.tap(at.x, at.y);
    await arrived(page, room);
  });

  test("the on-screen buttons change floor and recentre", async ({ page }) => {
    await openHouse(page);
    await page.getByRole("button", { name: "Floor up" }).tap();
    await page.waitForFunction(() => window.__betrayalHouse?.state().floor === "upper");
    await page.getByRole("button", { name: "Recentre" }).tap();
    await page.waitForFunction(() => window.__betrayalHouse?.state().floor === "ground" && window.__betrayalHouse.isReady());
  });
});

test.describe("controller", () => {
  // A standard-layout pad the page sees as connected: the gamepad library
  // reads the pads every frame, so the test presses buttons and tilts sticks by changing them.
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

  const BUTTON = { A: 0, B: 1, Y: 3, LB: 4, RB: 5, LS: 10, DpadUp: 12, DpadDown: 13 } as const;

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
    await frames(page);
  }

  const setStick = (page: Page, x: number, y: number) =>
    page.evaluate(
      ([sx, sy]) => {
        const pad = (window as unknown as { testPad: { axes: number[] } }).testPad;
        pad.axes = [sx, sy, pad.axes[2], pad.axes[3]];
      },
      [x, y] as const,
    );

  /** A, held until the decision it answers is gone. */
  const pressA = async (page: Page) => {
    const was = await page.evaluate(() => JSON.stringify(window.__betrayalHouse?.state().choices));
    await press(page, BUTTON.A, () => page.waitForFunction((w) => JSON.stringify(window.__betrayalHouse?.state().choices) !== w, was));
  };

  test("the left stick pans the reticle onto a room, and A walks there; RB jumps to a choice, and A takes it", async ({ page }) => {
    await openHouse(page);
    const { id, room } = await openChoice(page);
    await steerReticle(
      page,
      id,
      async (direction) => {
        await setStick(page, direction.x * 0.7, direction.y * 0.7);
        return direction;
      },
      async () => {
        await setStick(page, 0, 0);
        await frames(page);
      },
    );
    expect(await focused(page)).toBe(id);
    await expect(page.getByText("walk", { exact: true })).toBeVisible();
    await pressA(page);
    await arrived(page, room);
    // RB round the choices until the jump comes back to the room he stands in, then A stops there.
    for (let tries = 0; tries < 12; tries++) {
      const was = await focused(page);
      await press(page, BUTTON.RB, () => page.waitForFunction((w) => window.__betrayalHouse?.state().focused !== w, was));
      if ((await focused(page)) === STOP) break;
    }
    expect(await focused(page)).toBe(STOP);
    await page.waitForFunction(() => window.__betrayalHouse?.isReady());
    await pressA(page);
    await stopped(page, room);
  });

  test("the right stick tilts down to eye level, and the reticle still selects and A takes it", async ({ page }) => {
    await openHouse(page);
    const setRightStick = (x: number, y: number) =>
      page.evaluate(
        ([sx, sy]) => {
          const pad = (window as unknown as { testPad: { axes: number[] } }).testPad;
          pad.axes = [pad.axes[0], pad.axes[1], sx, sy];
        },
        [x, y] as const,
      );
    // Down on the stick tilts down.
    await setRightStick(0, 0.9);
    await page.waitForFunction(() => (window.__betrayalHouse?.camera().pitch ?? 1) < 0.16);
    await setRightStick(0, 0);
    await page.waitForFunction(() => window.__betrayalHouse?.isReady());
    // The camera is on the room he stands in, so the reticle selects it.
    await page.waitForFunction(() => window.__betrayalHouse?.reticle() === "stop");
    expect(await focused(page)).toBe(STOP);
    await pressA(page);
    await stopped(page, "library");
  });

  test("holding the left stick's click raises the walls, and letting go lets them down", async ({ page }) => {
    await openHouse(page);
    await press(page, BUTTON.LS, () => page.waitForFunction(() => window.__betrayalHouse?.state().wallsRaised === true));
    await page.waitForFunction(() => window.__betrayalHouse?.state().wallsRaised === false);
  });

  test("the d-pad changes floor, Y recentres, and B backs out", async ({ page }) => {
    await openHouse(page);
    await press(page, BUTTON.DpadUp, () => page.waitForFunction(() => window.__betrayalHouse?.state().floor === "upper"));
    await press(page, BUTTON.Y, () => page.waitForFunction(() => window.__betrayalHouse?.state().floor === "ground"));
    await page.waitForFunction(() => window.__betrayalHouse?.isReady() && window.__betrayalHouse.reticle() === "stop");
    await press(page, BUTTON.B, () => page.waitForFunction(() => window.__betrayalHouse?.state().focused === null));
    expect(await page.evaluate(() => window.__betrayalHouse?.reticle())).toBeNull();
  });
});

test("input during a walk fast-forwards it and acts, rather than being ignored", async ({ page }) => {
  await openHouse(page);
  // With the clock stopped, the walk to the Foyer never ends on its own.
  await page.evaluate(() => {
    window.__betrayalHouse?.freezeClock(100);
    window.__betrayalHouse?.choose("walk:foyer");
  });
  const during = await page.evaluate(() => window.__betrayalHouse?.state());
  expect(during?.walking).toBe(true);
  expect(during?.phase).toBe("choosing");
  // Tab to a next leg (not stopping), then Enter takes it.
  for (let tries = 0; tries < 12; tries++) {
    const was = await focused(page);
    await page.keyboard.press("Tab");
    await page.waitForFunction((w) => window.__betrayalHouse?.state().focused !== w, was);
    if ((await focused(page)) !== STOP) break;
  }
  const state = await page.evaluate(() => window.__betrayalHouse?.state());
  const next = state?.choices.find((choice) => choice.id === state.focused);
  if (!next || next.stop) throw new Error("No next leg is offered while he walks");
  await page.keyboard.press("Enter");
  // The walk to the Foyer is over at once, and the next leg is taken from there.
  await page.waitForFunction((room) => window.__betrayalHouse?.state().explorers[0].room === room, next.room);
  expect(await page.evaluate(() => window.__betrayalHouse?.state().left)).toBe(4 - 1 - next.steps);
  await page.evaluate(() => window.__betrayalHouse?.freezeClock(null));
  await arrived(page, next.room);
});

test("a resolution above the pixel-ratio cap holds at the cap through a resize", async ({ page }) => {
  await openHouse(page);
  await page.evaluate(() => window.__betrayalHouse?.setResolution(1080));
  // 1080p on a 240px-tall view asks for 4.5 device pixels per CSS pixel, past the house's cap of 4.
  await page.setViewportSize({ width: 400, height: 240 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    return canvas !== null && canvas.clientHeight === 240 && canvas.height === 240 * 4;
  });
});
