import type { Page } from "@playwright/test";
import { test, expect } from "./test";
import type { PlayReadout } from "../src/projects/betrayal/components/play/play-screen";

/**
 * Rooms placed and moved by a rule, and choices among rooms, in the house:
 * the Mystic Elevator, discovered through the Entrance Hall's north door and
 * entered, rolls where it goes. Its cells glow on the floor rolled, and on any
 * other floor as markers at the same place; its own cell, when it may stay,
 * leaves it there. Placed, it is carried with Ann in it to its new cell. The
 * Dog's run offers rooms, which glow as places. Every wait is on the game's
 * own state (window.__betrayalPlay), never a pause.
 */

const PAGE = "/board-games/betrayal";
const SAVED = "nw:betrayal:hot-seat";

test.use({ launchOptions: { args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] } });
test.setTimeout(120_000);

/** Zoe goes first (it is her birthday). Each seed rolls the elevator a floor: 3 the upper floor, 2 its own (the ground), 1 the basement. */
const SEEDS = { upper: "e2e-elevator-0", ground: "e2e-elevator-2", basement: "e2e-elevator-1" } as const;

function gameCode(seed: string, scenario: object): string {
  const game = {
    format: 3,
    game: {
      seed,
      sets: ["base"],
      seats: [
        { name: "Ann", character: "zoe-ingstrom" },
        { name: "Ben", character: "ox-bellows" },
        { name: "Cat", character: "father-rhinehardt" },
      ],
      today: { month: 11, day: 5 },
      scenario,
    },
    actions: [],
  };
  return Buffer.from(JSON.stringify(game)).toString("base64url");
}

const readout = (page: Page): Promise<PlayReadout> =>
  page.evaluate(() => {
    const hook = window.__betrayalPlay;
    if (!hook) throw new Error("No game on the page");
    return hook.play();
  });

/** Waits until the game's state passes `check`, with the house built and the camera settled (or, `settled` false, at once). */
async function until(page: Page, check: string, settled = true): Promise<void> {
  await page
    .waitForFunction(
      ([body, ready]) => {
        const hook = window.__betrayalPlay;
        if (!hook || (ready && !hook.isReady())) return false;
        return (new Function("play", `return ${body}`) as (play: unknown) => boolean)(hook.play());
      },
      [check, settled] as const,
      { timeout: 60_000 },
    )
    .catch(async (error: unknown) => {
      const now = await page.evaluate(() => {
        const hook = window.__betrayalPlay;
        return hook ? { ready: hook.isReady(), play: hook.play() } : null;
      });
      throw new Error(`${check} never held. ${now ? `Ready: ${now.ready}; the game: ${JSON.stringify(now.play)}` : `No game on the page, at ${page.url()}`}`, { cause: error });
    });
}

async function resume(page: Page, code: string): Promise<void> {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { name: "New game" })).toBeVisible();
  await page.evaluate(([key, value]) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [SAVED, code] as const);
  await page.reload();
  await page.getByRole("button", { name: "Resume" }).click();
  await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
}

/** Where a target shows on the page, if it shows in the open house (no panel over it). */
const pointOf = (page: Page, id: string) =>
  page.evaluate((target) => {
    const point = window.__betrayalPlay?.screenPoint(target) ?? null;
    return point && document.elementFromPoint(point.x, point.y) instanceof HTMLCanvasElement ? point : null;
  }, id);

async function shownAt(page: Page, id: string): Promise<{ x: number; y: number }> {
  const at = await pointOf(page, id);
  if (!at) throw new Error(`${id} doesn't show in the open house`);
  return at;
}

/** Points at a target, checks it took the focus, and clicks it. */
async function clickTarget(page: Page, id: string): Promise<void> {
  const at = await shownAt(page, id);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => page.evaluate((point) => window.__betrayalPlay?.targetAt(point), at)).toBe(id);
  await page.mouse.click(at.x, at.y);
}

/** Ann explores north into the Mystic Elevator, which rolls as she enters, and asks where it goes. */
async function rideTheElevator(page: Page, floor: string): Promise<void> {
  await clickTarget(page, "explore:ground:2:-1");
  await until(page, `play.pending?.kind === 'place-tile' && play.ghost?.tile === 'mystic-elevator' && play.ghost.spot.floor === '${floor}' && play.floor === '${floor}' && play.rooms['zoe-ingstrom'] === 'mystic-elevator'`);
}

/** The ghost's other cells, as their target ids. */
const otherCells = async (page: Page) => (await readout(page)).ghost?.targets.filter((id) => id.startsWith("cell:")) ?? [];

test("keyboard and mouse: a cell on another floor glows on this one, and the elevator carries Ann down to the basement", async ({ page }) => {
  await resume(page, gameCode(SEEDS.basement, { stack: ["mystic-elevator"] }));
  await rideTheElevator(page, "basement");
  const first = (await readout(page)).ghost?.spot;

  // Back on the ground floor, the basement's cells glow where they lie below it, and choosing one moves the ghost there, showing its floor.
  await page.evaluate(() => window.__betrayalPlay?.setFloor("ground"));
  await until(page, "play.floor === 'ground'");
  const cells = await otherCells(page);
  expect(cells.length).toBeGreaterThan(0);
  let cell: string | null = null;
  for (const candidate of cells) if (!cell && (await pointOf(page, candidate))) cell = candidate;
  if (!cell) throw new Error("No basement cell shows on the ground floor");
  await clickTarget(page, cell);
  const [, , x, y] = cell.split(":");
  await until(page, `play.ghost?.spot.x === ${x} && play.ghost.spot.y === ${y} && play.floor === 'basement'`);
  expect((await readout(page)).ghost?.spot).not.toEqual(first);

  // Placed, it is carried there with Ann in it, while the game has already moved on; the clock held, it is seen in flight.
  await page.evaluate(() => window.__betrayalPlay?.freezeClock(1000));
  await clickTarget(page, "ghost");
  await until(page, "play.moving && play.floors['mystic-elevator'] === 'basement' && play.pending?.kind === 'turn' && play.rooms['zoe-ingstrom'] === 'mystic-elevator'", false);
  await page.evaluate(() => window.__betrayalPlay?.freezeClock(null));
  await until(page, "!play.moving && play.floor === 'basement' && play.queued === 0 && play.problem === null");
});

test.describe("touch", () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

  test("on its own floor, its own cell leaves it where it is", async ({ page }) => {
    await resume(page, gameCode(SEEDS.ground, { stack: ["mystic-elevator"] }));
    await rideTheElevator(page, "ground");
    expect((await readout(page)).ghost?.targets).toContain("stay");
    const before = await readout(page);
    // A first tap focuses its own room, and a second leaves it there.
    const at = await shownAt(page, "stay");
    expect(await page.evaluate((point) => window.__betrayalPlay?.targetAt(point), at)).toBe("stay");
    await page.touchscreen.tap(at.x, at.y);
    await expect(page.getByRole("tooltip")).toContainText("Leave the Mystic Elevator where it is");
    await page.touchscreen.tap(at.x, at.y);
    await until(page, "play.ghost === null && play.pending?.kind === 'turn' && !play.moving && play.problem === null");
    const after = await readout(page);
    expect([after.floors["mystic-elevator"], after.rotations["mystic-elevator"]]).toEqual([before.floors["mystic-elevator"], before.rotations["mystic-elevator"]]);
  });
});

test.describe("controller", () => {
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

  type TestPad = { axes: number[]; buttons: { pressed: boolean; value: number }[] };
  const setPad = (page: Page, change: { button?: [number, boolean]; stick?: [number, number] }) =>
    page.evaluate((next) => {
      const pad = (window as unknown as { testPad: TestPad }).testPad;
      if (next.button) pad.buttons[next.button[0]] = { ...pad.buttons[next.button[0]], pressed: next.button[1], value: next.button[1] ? 1 : 0 };
      if (next.stick) pad.axes = [next.stick[0], next.stick[1], 0, 0];
    }, change);
  /** Waits for the page to read the pad again, so the next press is a new one. */
  const read = async (page: Page) => {
    const frame = await page.evaluate(() => window.__betrayalPlay?.frameCount() ?? 0);
    await page.waitForFunction((n) => (window.__betrayalPlay?.frameCount() ?? 0) >= n + 2, frame);
  };
  const A = 0;
  const X = 2;

  async function press(page: Page, button: number, check: string, settled = true): Promise<void> {
    await setPad(page, { button: [button, true] });
    await until(page, check, settled);
    await setPad(page, { button: [button, false] });
    await read(page);
  }

  /** Pans with the left stick towards a target until the reticle at the screen's centre selects it. */
  async function aim(page: Page, id: string): Promise<void> {
    for (let tries = 0; (await page.evaluate(() => window.__betrayalPlay?.reticle() ?? null)) !== id; tries++) {
      if (tries > 40) throw new Error(`The reticle never reached ${id}`);
      const at = await page.evaluate((target) => window.__betrayalPlay?.screenPoint(target) ?? null, id);
      if (!at) throw new Error(`${id} doesn't show`);
      const viewport = page.viewportSize();
      if (!viewport) throw new Error("No viewport");
      const [dx, dy] = [at.x - viewport.width / 2, at.y - viewport.height / 2];
      const length = Math.hypot(dx, dy) || 1;
      await setPad(page, { stick: [(dx / length) * 0.5, (dy / length) * 0.5] });
      await page.waitForFunction(
        ([target, n]) => window.__betrayalPlay?.reticle() === target || (window.__betrayalPlay?.frameCount() ?? 0) >= n + 6,
        [id, await page.evaluate(() => window.__betrayalPlay?.frameCount() ?? 0)] as const,
      );
    }
    await setPad(page, { stick: [0, 0] });
    await read(page);
  }

  test("the reticle chooses another cell and A places it; any input lands the room in flight", async ({ page }) => {
    await resume(page, gameCode(SEEDS.upper, { stack: ["mystic-elevator"] }));
    await rideTheElevator(page, "upper");
    const [cell] = await otherCells(page);
    await aim(page, cell);
    const [, , x, y] = cell.split(":");
    await press(page, A, `play.ghost?.spot.x === ${x} && play.ghost.spot.y === ${y}`);

    // A places it as it shows; with the clock held, it is in flight with Ann in it.
    await page.evaluate(() => window.__betrayalPlay?.freezeClock(1000));
    await press(page, A, "play.moving && play.floors['mystic-elevator'] === 'upper' && play.pending?.kind === 'turn'", false);
    // A press while it flies lands it at once, and only that.
    await press(page, A, "!play.moving && play.canEnd && play.holder === 0", false);
    await page.evaluate(() => window.__betrayalPlay?.freezeClock(null));
    await press(page, X, "play.holder === 1 && play.rooms['zoe-ingstrom'] === 'mystic-elevator' && play.problem === null");
  });
});

test("the rooms a choice names glow in the house, and a click on one chooses it", async ({ page }) => {
  await resume(page, gameCode("e2e-play", { explorers: [{ seat: 0, cards: ["dog"] }] }));
  await page.getByRole("button", { name: "Send the Dog to a room up to 6 spaces away and back" }).click();
  await until(page, "play.pending?.kind === 'choose-one' && play.targets.some((t) => t.id === 'option:0')");
  const { targets, panel } = await readout(page);
  expect(targets.map((target) => target.label)).toEqual(["Send the Dog to the Foyer", "Send the Dog to the Grand Staircase", "Send the Dog to the Upper Landing"]);
  expect(panel).toEqual([]);
  await clickTarget(page, "option:0");
  await until(page, "play.pending?.kind !== 'choose-one' && play.problem === null && play.queued === 0");
});
