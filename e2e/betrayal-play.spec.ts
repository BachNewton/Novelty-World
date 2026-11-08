import type { Page } from "@playwright/test";
import { test, expect } from "./test";
import { PAGE, SAVED, shareCode } from "./betrayal-game";
import type { PlayReadout } from "../src/projects/betrayal/components/play/play-screen";

/**
 * Betrayal's hot-seat game, the page's default: a seeded three-player game
 * resumed from this browser's save, played through a discovery (a doorway in
 * the house, then the room's rotation and its event card in the status box), a
 * move to a room and the turns ending, with keyboard and mouse (one input
 * method): the mouse points in the house and at the status box, and one turn is
 * ended from the keyboard. Every wait is on the game's own state (window.__betrayalPlay),
 * never a pause.
 */

test.use({ launchOptions: { args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] } });
test.setTimeout(120_000);

/** Zoe goes first (it is her birthday), the room stack is the Game Room, and
 *  the event deck starts with Something Hidden, which asks a question. */
const GAME = {
  game: {
    seed: "e2e-play",
    sets: ["base"],
    seats: [
      { character: "zoe-ingstrom" },
      { character: "ox-bellows" },
      { character: "father-rhinehardt" },
    ],
    today: { month: 11, day: 5 },
    scenario: { stack: ["game-room"], decks: { event: ["something-hidden"] } },
  },
  actions: [],
};

const code = shareCode(GAME);

const readout = (page: Page): Promise<PlayReadout> =>
  page.evaluate(() => {
    const hook = window.__betrayalPlay;
    if (!hook) throw new Error("No game on the page");
    return hook.play();
  });

/** Waits until the game's state passes `check`, with the house built, the camera settled and no beats playing, so the pending decision's choices show. */
async function until(page: Page, check: string): Promise<void> {
  await page.waitForFunction(
    (body) => {
      const hook = window.__betrayalPlay;
      if (!hook?.isReady() || hook.play().playing) return false;
      return (new Function("play", `return ${body}`) as (play: unknown) => boolean)(hook.play());
    },
    check,
    { timeout: 60_000 },
  ).catch(async (error: unknown) => {
    // Says why it never held: the game as it stands, or that the page has none (a reload, say, when the dev server rebuilt under the test).
    const now = await page.evaluate(() => {
      const hook = window.__betrayalPlay;
      return hook ? { ready: hook.isReady(), play: hook.play() } : null;
    });
    throw new Error(`${check} never held. ${now ? `Ready: ${now.ready}; the game: ${JSON.stringify(now.play)}` : `No game on the page, at ${page.url()}`}`, { cause: error });
  });
}

/** Resumes the seeded game. */
async function resumeSaved(page: Page): Promise<void> {
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
}

/** Points at a target where it shows in the house, checks it took the focus, and clicks it. */
async function clickTarget(page: Page, id: string): Promise<void> {
  const at = await pointOf(page, id);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => page.evaluate((point) => window.__betrayalPlay?.targetAt(point), at)).toBe(id);
  await page.mouse.click(at.x, at.y);
}

/** Where a target shows on the page, checked to be open house (no panel over it). */
async function pointOf(page: Page, id: string): Promise<{ x: number; y: number }> {
  const found = await page.evaluate((target) => {
    const point = window.__betrayalPlay?.screenPoint(target) ?? null;
    const over = point && document.elementFromPoint(point.x, point.y);
    // The frame meter draws on canvases too: open house is the house's own.
    const house = over instanceof HTMLCanvasElement && over.closest("[data-frame-meter]") === null;
    return { point, over: house ? null : (over?.outerHTML.slice(0, 200) ?? "nothing") };
  }, id);
  if (!found.point || found.over !== null) throw new Error(`${id} doesn't show in the open house: ${found.point ? `${found.over} is over it` : "it is off the screen"}`);
  return found.point;
}

test("a seeded game: a discovery, an event card, a move and ended turns, with keyboard and mouse", async ({ page }) => {
  await resumeSaved(page);
  await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
  const start = await readout(page);
  expect(start.targets.map((t) => t.id)).toContain("explore:ground:2:-1");
  expect(start.canEnd).toBe(true);
  // The turn needs no prompt: the seat's button names whose it is, and its places glow.
  await expect(page.locator("header").getByRole("button", { name: /^Zoe Ingstrom: character card/ })).toBeVisible();

  // Zoe explores north: the empty cell beyond the doorway glows in the house.
  await clickTarget(page, "explore:ground:2:-1");
  await until(page, "play.pending?.kind === 'rotation'");
  // The Game Room shows as a ghost on its cell: Tab steps to its next way round, and Enter places it.
  await until(page, "play.ghost?.tile === 'game-room' && play.ghost.rotation === 0");
  await page.keyboard.press("Tab");
  await until(page, "play.ghost?.rotation === 1");
  await page.keyboard.press("Enter");
  // Then its event card is answered on the card over the room: the box keeps one line for the beat and its Why.
  await page.waitForFunction(() => {
    const play = window.__betrayalPlay?.play();
    return play?.pending?.kind === "choose-one" && play.tiles === 6;
  });
  const line = page.getByLabel("What happened");
  const now = page.getByLabel("What you can do now");
  // The card asks at once, its question and choices on it; the box repeats neither.
  const card = page.getByRole("dialog", { name: "Card drawn: Something Hidden" });
  await until(page, "play.panel.length > 0 && play.card?.asks === true");
  await expect(now).toBeHidden();
  // The line is the last beat's, the card's draw, after the discovery's line named the room.
  await expect(line).toContainText("Zoe Ingstrom draws the event Something Hidden.");
  // Zoe holds the device in her own turn, so the question doesn't name her.
  await expect(card).toContainText("Something Hidden: ");
  await expect(card).not.toContainText("Zoe Ingstrom:");
  await card.getByRole("button", { name: "Don't roll" }).click();
  // Drawing the card ended Zoe's move. With nothing left to do, ending her turn is hers to choose.
  await until(page, "play.holder === 0 && play.pending?.kind === 'turn' && play.targets.length === 0");
  expect((await readout(page)).canEnd).toBe(true);
  await expect(page.getByRole("button", { name: "End turn" })).toBeVisible();
  // With no actions, the seat's button in the header shows no count.
  await expect(page.locator("header").getByRole("button", { name: /: character card$/ })).toBeVisible();
  await page.getByRole("button", { name: "End turn" }).click();
  // The device passes to Ox.
  await until(page, "play.holder === 1 && play.turnSeat === 1 && play.pending?.kind === 'turn'");
  expect((await readout(page)).rooms["zoe-ingstrom"]).toBe("game-room");
  await expect(page.locator("header").getByRole("button", { name: /^Ox Bellows: character card/ })).toBeVisible();

  // Ox walks into the Foyer, and ends his turn.
  await clickTarget(page, "room:foyer");
  await until(page, "play.rooms['ox-bellows'] === 'foyer' && play.holder === 1");
  await page.getByRole("button", { name: "End turn" }).click();
  await until(page, "play.holder === 2 && play.turnSeat === 2");

  // Father Rhinehardt ends his turn from the keyboard: Backspace, held. Let go too soon, End turn's fill empties.
  await page.keyboard.down("Backspace");
  await page.keyboard.up("Backspace");
  await expect(page.locator("[data-end-turn] [data-hold-fill='rest']")).toBeAttached();
  expect((await readout(page)).holder).toBe(2);
  await page.keyboard.down("Backspace");
  await until(page, "play.holder === 0 && play.turnSeat === 0");
  await page.keyboard.up("Backspace");
  const after = await readout(page);
  expect(after.queued).toBe(0);
  expect(after.problem).toBeNull();

  // The game was saved as it went: a reload resumes it where it is.
  const version = after.version;
  await page.reload();
  await page.getByRole("button", { name: "Resume" }).click();
  await until(page, `play.version === ${version} && play.holder === 0`);
});

/** The shared game saved in this browser, read back from its code. */
const savedShare = (page: Page) =>
  page.evaluate((key) => {
    const stored = localStorage.getItem(key);
    if (stored === null) throw new Error("No saved game");
    const code = JSON.parse(stored) as string;
    return JSON.parse(atob(code.replace(/^v\d+\./, "").replace(/-/g, "+").replace(/_/g, "/"))) as { game: { seats: { character: string }[]; chosenHaunt?: number } };
  }, SAVED);

test("setup: a character chosen by portrait and a chosen haunt are carried into the game", async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(PAGE);
  await page.evaluate((key) => {
    localStorage.removeItem(key);
  }, SAVED);
  await page.reload();
  const seat0 = page.getByRole("listitem", { name: "Seat 0" });
  await seat0.getByRole("button", { name: "Seat 0 character: Father Rhinehardt" }).click();
  const grid = page.getByRole("dialog", { name: "Seat 0's character" });
  await grid.getByRole("button", { name: /Heather Granville/ }).click();
  await expect(grid).toHaveCount(0);

  await page.getByRole("button", { name: /^13 · / }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await until(page, "play.pending?.kind === 'turn'");
  const shared = await savedShare(page);
  expect(shared.game.chosenHaunt).toBe(13);
  expect(shared.game.seats[0].character).toBe("heather-granville");
});

test("the playtesting view is at ?debug", async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(`${PAGE}&debug`);
  await expect(page.getByText("Playtesting view: hot-seat, no server")).toBeVisible();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: "End your turn" })).toBeVisible();
});

/** The wheel over the rotation ghost zooms the camera and never turns it, and a click on the ghost places it as it shows. */
test("the rotation ghost: the wheel over it zooms, and a click places it", async ({ page }) => {
  await resumeSaved(page);
  await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
  await clickTarget(page, "explore:ground:2:-1");
  await until(page, "play.ghost?.tile === 'game-room' && play.ghost.rotation === 0");
  await page.keyboard.press("Tab");
  await until(page, "play.ghost?.rotation === 1");

  const zoom = await page.evaluate(() => window.__betrayalPlay?.camera().zoom ?? 0);
  const ghost = await pointOf(page, "ghost");
  await page.mouse.move(ghost.x, ghost.y);
  await page.mouse.wheel(0, -100);
  await page.waitForFunction((before) => (window.__betrayalPlay?.camera().zoom ?? 0) > before, zoom);
  expect((await readout(page)).ghost?.rotation).toBe(1);

  await clickTarget(page, "ghost");
  // Not waiting for the beats: the Game Room's card waits for a tap once it is placed.
  await page.waitForFunction(() => {
    const play = window.__betrayalPlay?.play();
    return play?.ghost === null && play.tiles === 6 && play.rotations["game-room"] === 1;
  });
});

/**
 * A move of several rooms by touch: a first tap previews the route before
 * anything is sent, and a second walks it, while the game has already moved
 * on. Zoe goes from the Entrance Hall up the Grand Staircase to the Upper
 * Landing, three of her four spaces, and the view follows her upstairs.
 */
test.describe("a move of several rooms, previewed", () => {
  const LANDING = "room:upper-landing";

  /** Stops the stage's clock before a route is committed, so its walk can't
   *  end before the test sees it playing, however slowly the page draws. */
  const holdTheWalk = (page: Page) => page.evaluate(() => window.__betrayalPlay?.freezeClock(1000));

  /** The route committed, with the walk held: the state is there at once,
   *  while the walk plays; then, let go, the walk ends upstairs, the floor having followed. */
  async function walkedUpstairs(page: Page): Promise<void> {
    await page.waitForFunction(() => {
      const play = window.__betrayalPlay?.play();
      return play?.rooms["zoe-ingstrom"] === "upper-landing" && play.walking && play.holder === 0 && play.pending?.kind === "turn";
    });
    await page.evaluate(() => window.__betrayalPlay?.freezeClock(null));
    await until(page, "!play.walking && play.floor === 'upper' && play.rooms['zoe-ingstrom'] === 'upper-landing' && play.queued === 0 && play.problem === null");
  }

  async function expectLandingPreview(page: Page): Promise<void> {
    await until(page, `play.preview?.target === '${LANDING}'`);
    const { preview } = await readout(page);
    expect(preview?.route.map((place) => place.room)).toEqual(["entrance-hall", "foyer", "grand-staircase", "upper-landing"]);
    expect(preview).toMatchObject({ spaces: 3, left: 4, warnings: [] });
    await expect(page.getByLabel("Route preview")).toContainText("Move to the Upper Landing: 3 of 4 spaces");
  }

  test.describe("touch", () => {
    test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

    test("a first tap previews the route, and a second walks it", async ({ page }) => {
      await resumeSaved(page);
      await until(page, "play.holder === 0 && play.pending?.kind === 'turn' && play.floor === 'ground'");
      const stairs = await pointOf(page, LANDING);
      await page.touchscreen.tap(stairs.x, stairs.y);
      await expectLandingPreview(page);
      expect((await readout(page)).rooms["zoe-ingstrom"]).toBe("entrance-hall");
      await holdTheWalk(page);
      await page.touchscreen.tap(stairs.x, stairs.y);
      await walkedUpstairs(page);
    });
  });
});
