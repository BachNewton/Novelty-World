import type { Page } from "@playwright/test";
import { test, expect } from "./test";
import type { PlayReadout } from "../src/projects/betrayal/components/play/play-screen";

/**
 * Betrayal's hot-seat game with two controllers on one device: seats claimed
 * by pad at setup, only the acting seat's pad acting (and driving the camera)
 * while the other is idle, seats taken over mid-game in the seats panel, a
 * pad disconnecting and opening its seats, and touch and the mouse acting for
 * whoever the game waits on. The pads are simulated: `navigator.getGamepads`
 * returns two standard pads whose buttons and sticks the test sets. Every wait
 * is on the game's state or on animation frames (the gamepad reader's own
 * event), never a pause.
 */

const PAGE = "/board-games/betrayal";
const SAVED = "nw:betrayal:hot-seat";

test.use({
  launchOptions: {
    args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"],
  },
});
test.setTimeout(120_000);

/** Ann (Zoe Ingstrom) goes first, then Ben (Ox Bellows), then Cat (Father Rhinehardt). */
const GAME = {
  format: 3,
  game: {
    seed: "e2e-pads",
    sets: ["base"],
    seats: [
      { name: "Ann", character: "zoe-ingstrom" },
      { name: "Ben", character: "ox-bellows" },
      { name: "Cat", character: "father-rhinehardt" },
    ],
    today: { month: 11, day: 5 },
  },
  actions: [],
};
const code = Buffer.from(JSON.stringify(GAME)).toString("base64url");

const BUTTON = { A: 0, B: 1, X: 2, Menu: 9, DpadDown: 13 } as const;

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

/** Unplugs a pad: gone from `getGamepads`, with the browser's disconnect event. */
async function unplug(page: Page, pad: number): Promise<void> {
  await page.evaluate((index) => {
    const pads = (window as unknown as { testPads: (TestPad | null)[] })
      .testPads;
    const gone = pads[index];
    pads[index] = null;
    const event = new Event("gamepaddisconnected");
    Object.defineProperty(event, "gamepad", { value: gone });
    window.dispatchEvent(event);
  }, pad);
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
      if (!hook?.isReady()) return false;
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
    .getByRole("group", { name: `${seat}'s pad` })
    .getByRole("button", { name: pad, exact: true });

test("two pads: claimed at setup, only the acting seat's pad acts and drives the camera, reassigned in the panel, freed on disconnect", async ({
  page,
}) => {
  await openSetup(page);

  // Pad 1 takes the first seat; Pad 2 moves down and takes the next two.
  await press(page, 0, BUTTON.A);
  await expect(padButton(page, "Player 1", "Pad 1")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await press(page, 1, BUTTON.DpadDown);
  await expect(page.locator("[data-highlighted]")).toContainText("Seat 1");
  await press(page, 1, BUTTON.A);
  await press(page, 1, BUTTON.DpadDown);
  await press(page, 1, BUTTON.A);
  await expect(padButton(page, "Player 2", "Pad 2")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(padButton(page, "Player 3", "Pad 2")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(padButton(page, "Player 1", "Open")).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // The claims carry into the game: seat by seat, Ann has Pad 1, Ben and Cat Pad 2.
  await page.getByRole("button", { name: "Resume" }).click();
  await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");

  // Pad 2's stick is idle on Ann's turn: the camera stays put. Pad 1's moves it.
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

  // Pad 2's X does nothing on Ann's turn; Pad 1's ends it.
  const annTurn = (await readout(page)).pending?.id;
  await press(page, 1, BUTTON.X);
  expect((await readout(page)).pending?.id).toBe(annTurn);
  await press(page, 0, BUTTON.X);
  await until(
    page,
    "play.holder === 1 && play.turnSeat === 1 && play.pending?.kind === 'turn'",
  );

  // On Ben's turn it is the other way round.
  const benTurn = (await readout(page)).pending?.id;
  await press(page, 0, BUTTON.X);
  expect((await readout(page)).pending?.id).toBe(benTurn);
  await press(page, 1, BUTTON.X);
  await until(
    page,
    "play.holder === 2 && play.turnSeat === 2 && play.pending?.kind === 'turn'",
  );

  // Cat hands her seat to Pad 1: any pad's Menu opens the seats panel, on the acting seat, and A takes it.
  await press(page, 0, BUTTON.Menu);
  const panel = page.getByRole("dialog", { name: "Seats and pads" });
  await expect(panel).toBeVisible();
  await expect(panel.locator("[data-highlighted]")).toContainText("Cat");
  await press(page, 0, BUTTON.A);
  await expect(padButton(page, "Cat", "Pad 1")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await press(page, 0, BUTTON.B);
  await expect(panel).toBeHidden();
  const catTurn = (await readout(page)).pending?.id;
  await press(page, 1, BUTTON.X);
  expect((await readout(page)).pending?.id).toBe(catTurn);
  await press(page, 0, BUTTON.X);
  await until(page, "play.holder === 0 && play.turnSeat === 0");

  // Pad 2 is unplugged: Ben's seat opens, the status box says so, and Pad 1 may play it.
  await unplug(page, 1);
  await expect(
    page.getByLabel("What you can do now").getByRole("status"),
  ).toContainText("Pad 2 disconnected: Ben (Ox Bellows) is open to any pad.");
  await press(page, 0, BUTTON.X);
  await until(page, "play.holder === 1 && play.turnSeat === 1");
  await press(page, 0, BUTTON.X);
  await until(page, "play.holder === 2 && play.turnSeat === 2");
});

test.describe("on a touch screen with a mouse", () => {
  test.use({ hasTouch: true });

  test("touch and the mouse act for whoever the game waits on, whatever its pad, and set pads in the panel", async ({
    page,
  }) => {
    await openSetup(page);
    await press(page, 1, BUTTON.A);
    await expect(padButton(page, "Player 1", "Pad 2")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Resume" }).click();
    await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");

    // Ann's seat is Pad 2's, but the mouse ends her turn.
    await page.getByRole("button", { name: "End turn" }).click();
    await until(page, "play.holder === 1 && play.turnSeat === 1");

    // The panel by mouse: Ben's seat goes to Pad 2, so Pad 1 is idle on his turn.
    await page
      .getByRole("button", { name: "Seats", exact: true })
      .first()
      .click();
    const panel = page.getByRole("dialog", { name: "Seats and pads" });
    await padButton(page, "Ben", "Pad 2").click();
    await expect(padButton(page, "Ben", "Pad 2")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await padButton(page, "Ann", "Open").click();
    await expect(padButton(page, "Ann", "Open")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await panel.getByRole("button", { name: "Done" }).click();
    await expect(panel).toBeHidden();
    const benTurn = (await readout(page)).pending?.id;
    await press(page, 0, BUTTON.X);
    expect((await readout(page)).pending?.id).toBe(benTurn);

    // A tap ends it all the same.
    await page.getByRole("button", { name: "End turn" }).tap();
    await until(page, "play.holder === 2 && play.turnSeat === 2");
  });
});
