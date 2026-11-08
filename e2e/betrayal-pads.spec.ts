import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./test";
import type { PlayReadout } from "../src/projects/betrayal/components/play/play-screen";
import { PAGE, padTo, SAVED, shareCode } from "./betrayal-game";

/**
 * Betrayal's hot-seat game with two controllers on one device: a seat claimed
 * by pad at setup, and only the acting seat's pad acting (and driving the
 * camera) while the other is idle; and setup driven by a pad. Who may act is
 * unit-tested (`play/pads.test.ts`); these check the pads' input reaches the
 * gate. The pads are simulated: `navigator.getGamepads` returns two standard
 * pads whose buttons and sticks the test sets. Every wait is on the game's
 * state or on animation frames (the gamepad reader's own event), never a pause.
 */

test.use({
  launchOptions: {
    args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
  },
});
test.setTimeout(120_000);

/** Zoe Ingstrom goes first, then Ox Bellows, then Father Rhinehardt. */
const GAME = {
  game: {
    seed: "e2e-pads",
    sets: ["base"],
    seats: [
      { character: "zoe-ingstrom" },
      { character: "ox-bellows" },
      { character: "father-rhinehardt" },
    ],
    today: { month: 11, day: 5 },
  },
  actions: [],
};
const code = shareCode(GAME);

const BUTTON = { A: 0, B: 1, X: 2, Menu: 9 } as const;
const X = BUTTON.X;

interface TestPad {
  axes: number[];
  buttons: { pressed: boolean; touched: boolean; value: number }[];
}

/** Two standard controllers the page reads in place of real ones, in slots 0 and 1. */
async function withPads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const make = (index: number) => ({
      index,
      id: `Test pad ${index} (STANDARD GAMEPAD)`,
      mapping: "standard",
      connected: true,
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({
        pressed: false,
        touched: false,
        value: 0,
      })),
    });
    const pads: (ReturnType<typeof make> | null)[] = [make(0), make(1)];
    Object.assign(window, { testPads: pads });
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [pads[0], pads[1], null, null],
    });
  });
}

/** Waits for `count` animation frames: the gamepad library reads the pads once a frame. */
const frames = (page: Page, count = 2): Promise<void> =>
  page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let left = n;
        const step = () => {
          left--;
          if (left <= 0) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    count,
  );

const setPad = (
  page: Page,
  pad: number,
  change: { button?: number; down?: boolean; axes?: number[] },
) =>
  page.evaluate(
    ([index, { button, down, axes }]) => {
      const target = (window as unknown as { testPads: (TestPad | null)[] })
        .testPads[index];
      if (!target) throw new Error(`No pad in slot ${index}`);
      if (button !== undefined)
        target.buttons[button] = {
          ...target.buttons[button],
          pressed: down ?? false,
          value: down ? 1 : 0,
        };
      if (axes) target.axes = axes;
    },
    [pad, change] as const,
  );

/** Presses and releases a button on a pad, each seen by the pad reader. */
async function press(page: Page, pad: number, button: number): Promise<void> {
  await setPad(page, pad, { button, down: true });
  await frames(page);
  await setPad(page, pad, { button, down: false });
  await frames(page);
}

/** Holds a pad's X, End turn, until the game's state passes `check`, then lets go. */
async function holdX(page: Page, pad: number, check: string): Promise<void> {
  await setPad(page, pad, { button: X, down: true });
  await until(page, check);
  await setPad(page, pad, { button: X, down: false });
  await frames(page);
}

/** An idle pad's X: held, End turn's hold never starts, and the turn stays. */
async function idleX(page: Page, pad: number): Promise<void> {
  const turn = (await readout(page)).pending?.id;
  await setPad(page, pad, { button: X, down: true });
  await frames(page, 4);
  expect(await readout(page)).toMatchObject({ endHold: false, pending: { id: turn } });
  await setPad(page, pad, { button: X, down: false });
  await frames(page);
}

/** Moves a pad's focus to a button with its d-pad, and presses A on it. */
async function padPress(page: Page, pad: number, target: Locator): Promise<void> {
  await padTo(target, (button) => press(page, pad, button));
  await press(page, pad, BUTTON.A);
}

const readout = (page: Page): Promise<PlayReadout> =>
  page.evaluate(() => {
    const hook = window.__betrayalPlay;
    if (!hook) throw new Error("No game on the page");
    return hook.play();
  });

async function until(page: Page, check: string): Promise<void> {
  await page.waitForFunction(
    (body) => {
      const hook = window.__betrayalPlay;
      // No beats playing: an input while they play only skips them.
      if (!hook?.isReady() || hook.play().playing) return false;
      return (
        new Function("play", `return ${body}`) as (play: unknown) => boolean
      )(hook.play());
    },
    check,
    { timeout: 60_000 },
  );
}

const cameraTarget = (page: Page) =>
  page.evaluate(() => window.__betrayalPlay?.camera().target ?? null);

/** Opens the setup page with the seeded game saved, ready to resume. */
async function openSetup(page: Page): Promise<void> {
  page.on("pageerror", (error) => {
    throw error;
  });
  await withPads(page);
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { name: "New game" })).toBeVisible();
  await page.evaluate(
    ([key, value]) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    [SAVED, code] as const,
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
}

const padButton = (page: Page, seat: string, pad: string) =>
  page
    .getByRole("group", { name: `${seat}'s controller` })
    .getByRole("button", { name: pad, exact: true });

test("two pads: the pad of a seat not acting is ignored, its stick and its buttons, while the acting seat's pad plays", async ({
  page,
}) => {
  await openSetup(page);

  // Pad 1 claims the first seat on its picker (setup shows the next new game's characters; the saved game's first seat is Zoe's).
  await padPress(page, 0, padButton(page, "Father Rhinehardt", "Controller 1"));
  await expect(padButton(page, "Father Rhinehardt", "Controller 1")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Resume" }).click();
  await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");

  // Pad 2's stick is idle on Zoe's turn: the camera stays put. Pad 1's moves it.
  const before = await cameraTarget(page);
  await setPad(page, 1, { axes: [1, 0, 0, 0] });
  await frames(page, 20);
  expect(await cameraTarget(page)).toEqual(before);
  await setPad(page, 1, { axes: [0, 0, 0, 0] });
  await setPad(page, 0, { axes: [1, 0, 0, 0] });
  await page.waitForFunction((was) => {
    const now = window.__betrayalPlay?.camera().target;
    return (
      now !== undefined &&
      was !== null &&
      Math.hypot(now.x - was.x, now.z - was.z) > 0.05
    );
  }, before);
  await setPad(page, 0, { axes: [0, 0, 0, 0] });
  await until(page, "play.holder === 0");

  // Pad 2's X does nothing on Zoe's turn; Pad 1's, held, ends it.
  await idleX(page, 1);
  await holdX(page, 0, "play.holder === 1 && play.turnSeat === 1");
});

test("setup on a pad: A on a seat's portrait opens the grid, A picks a character there and B closes it, Menu does nothing, and Start starts", async ({ page }) => {
  await openSetup(page);
  const seat0 = page.getByRole("listitem", { name: "Seat 0" });
  await expect(seat0.getByRole("button", { name: "Seat 0 character: Father Rhinehardt" })).toBeVisible();
  const grid = page.getByRole("dialog", { name: "Seat 0's character" });
  await padPress(page, 0, seat0.getByRole("button", { name: /^Seat 0 character/ }));
  await expect(grid).toBeVisible();
  await padPress(page, 0, grid.getByRole("button", { name: /Professor Longfellow/ }));
  await expect(grid).toBeHidden();
  await expect(seat0.getByRole("button", { name: "Seat 0 character: Professor Longfellow" })).toBeVisible();
  await padPress(page, 0, seat0.getByRole("button", { name: /^Seat 0 character/ }));
  await expect(grid).toBeVisible();
  await press(page, 0, BUTTON.B);
  await expect(grid).toBeHidden();
  // Menu does nothing in setup: Start is a button like any other.
  await press(page, 0, BUTTON.Menu);
  await expect(page.getByRole("heading", { name: "New game" })).toBeVisible();
  await padPress(page, 0, page.getByRole("button", { name: "Start" }));
  await until(page, "play.pending?.kind === 'turn'");
});
