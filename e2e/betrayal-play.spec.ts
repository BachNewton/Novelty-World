import { test, expect, type Page } from "@playwright/test";
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

const PAGE = "/board-games/betrayal";
const SAVED = "nw:betrayal:hot-seat";

test.use({ launchOptions: { args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] } });
test.setTimeout(120_000);

/** Zoe goes first (it is her birthday), the room stack is the Game Room, and
 *  the event deck starts with Something Hidden, which asks a question. */
const GAME = {
  format: 3,
  game: {
    seed: "e2e-play",
    sets: ["base"],
    seats: [
      { name: "Ann", character: "zoe-ingstrom" },
      { name: "Ben", character: "ox-bellows" },
      { name: "Cat", character: "father-rhinehardt" },
    ],
    today: { month: 11, day: 5 },
    scenario: { stack: ["game-room"], decks: { event: ["something-hidden"] } },
  },
  actions: [],
};

const code = Buffer.from(JSON.stringify(GAME)).toString("base64url");

const readout = (page: Page): Promise<PlayReadout> =>
  page.evaluate(() => {
    const hook = window.__betrayalPlay;
    if (!hook) throw new Error("No game on the page");
    return hook.play();
  });

/** Waits until the game's state passes `check`, with the house built and the camera settled. */
async function until(page: Page, check: string): Promise<void> {
  await page.waitForFunction(
    (body) => {
      const hook = window.__betrayalPlay;
      if (!hook?.isReady()) return false;
      return (new Function("play", `return ${body}`) as (play: unknown) => boolean)(hook.play());
    },
    check,
    { timeout: 60_000 },
  );
}

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
  const at = await page.evaluate((target) => {
    const point = window.__betrayalPlay?.screenPoint(target) ?? null;
    return point && document.elementFromPoint(point.x, point.y) instanceof HTMLCanvasElement ? point : null;
  }, id);
  if (!at) throw new Error(`${id} doesn't show in the open house`);
  return at;
}

/** A standard controller the page reads in place of a real one, its buttons set by `press`. */
async function withPad(page: Page): Promise<void> {
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
}

const BUTTON = { A: 0, X: 2, LB: 4, RB: 5, View: 8, DpadLeft: 14, DpadRight: 15 } as const;

/** Holds a button until the game's state passes `check` (by default with the
 *  house settled too), then lets go and waits for the pad to be read again,
 *  so the next press is a new one. */
async function press(page: Page, button: number, check: string, settled = true): Promise<void> {
  const setButton = (pressed: boolean) =>
    page.evaluate(
      ([index, down]) => {
        const pad = (window as unknown as { testPad: { buttons: { pressed: boolean; value: number }[] } }).testPad;
        pad.buttons[index] = { ...pad.buttons[index], pressed: down, value: down ? 1 : 0 };
      },
      [button, pressed] as const,
    );
  await setButton(true);
  if (settled) await until(page, check);
  else await page.waitForFunction((body) => (new Function("play", `return ${body}`) as (play: unknown) => boolean)(window.__betrayalPlay?.play()), check);
  await setButton(false);
  const frame = await page.evaluate(() => window.__betrayalPlay?.frameCount() ?? 0);
  await page.waitForFunction((n) => (window.__betrayalPlay?.frameCount() ?? 0) >= n + 2, frame);
}

test("a seeded game: a discovery, an event card, a move and ended turns, with keyboard and mouse", async ({ page }) => {
  await resumeSaved(page);
  await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
  const start = await readout(page);
  expect(start.targets.map((t) => t.id)).toContain("doorway:entrance-hall:top");
  expect(start.canEnd).toBe(true);
  await expect(page.getByText("Ann (Zoe Ingstrom): your turn", { exact: false })).toBeVisible();

  // Ann explores north: the doorway glows in the house.
  await clickTarget(page, "doorway:entrance-hall:top");
  await until(page, "play.pending?.kind === 'rotation'");
  // The Game Room shows as a ghost on its cell: E turns it a quarter turn on, and Enter places it.
  await until(page, "play.ghost?.tile === 'game-room' && play.ghost.rotation === 0");
  await page.keyboard.press("KeyE");
  await until(page, "play.ghost?.rotation === 1");
  await page.keyboard.press("Enter");
  // Then its event card is answered in the status box, which says what happened, why, and what Ann can do now.
  await until(page, "play.pending?.kind === 'choose-one' && play.tiles === 6");
  const happened = page.getByRole("list", { name: "What happened" });
  const why = page.getByRole("list", { name: "Why it happened" });
  const now = page.getByLabel("What you can do now");
  await expect(happened).toContainText("Zoe Ingstrom discovers the Game Room.");
  await expect(happened).toContainText("Zoe Ingstrom draws the event Something Hidden.");
  await expect(why).toContainText("Rulebook, p. 10: The first explorer to discover a room with a card symbol draws that card.");
  await expect(why).toContainText("Something Hidden: You may choose to make a Knowledge roll to work out what's odd; if you don't, nothing happens.");
  // The card's full text is a tap away.
  await expect(why).not.toContainText("4+: Draw an item card.");
  await why.getByRole("listitem").filter({ hasText: "Something Hidden:" }).getByRole("button", { name: "Full rule" }).click();
  await expect(why).toContainText("4+: Draw an item card.");
  await expect(now).toContainText("Ann (Zoe Ingstrom): Something Hidden: ");
  await now.getByRole("button", { name: "Don't roll" }).click();
  // Drawing the card ended Ann's move. With nothing left to do, ending her turn is hers to choose, and the box says why it's all there is.
  await until(page, "play.holder === 0 && play.pending?.kind === 'turn' && play.targets.length === 0");
  expect((await readout(page)).canEnd).toBe(true);
  await expect(now).toContainText("No moves or actions left: End turn.");
  await expect(now.getByRole("button")).toHaveText(["End turn"]);
  await now.getByRole("button", { name: "End turn" }).click();
  // The device passes to Ben.
  await until(page, "play.holder === 1 && play.turnSeat === 1 && play.pending?.kind === 'turn'");
  expect((await readout(page)).rooms["zoe-ingstrom"]).toBe("game-room");
  await expect(page.getByText("Ben (Ox Bellows): your turn", { exact: false })).toBeVisible();

  // Ben walks into the Foyer, and ends his turn.
  await clickTarget(page, "room:foyer");
  await until(page, "play.rooms['ox-bellows'] === 'foyer' && play.holder === 1");
  await page.getByRole("button", { name: "End turn" }).click();
  await until(page, "play.holder === 2 && play.turnSeat === 2");

  // Cat ends her turn from the keyboard: Tab to the button, then Enter.
  const endTurn = page.getByRole("button", { name: "End turn" });
  for (let tabs = 0; !(await endTurn.evaluate((button) => button === document.activeElement)); tabs++) {
    if (tabs > 20) throw new Error("Tab never reached End turn");
    await page.keyboard.press("Tab");
  }
  await page.keyboard.press("Enter");
  await until(page, "play.holder === 0 && play.turnSeat === 0");
  const after = await readout(page);
  expect(after.queued).toBe(0);
  expect(after.problem).toBeNull();

  // The game was saved as it went: a reload resumes it where it is.
  const version = after.version;
  await page.reload();
  await page.getByRole("button", { name: "Resume" }).click();
  await until(page, `play.version === ${version} && play.holder === 0`);
});

test("a game saved by an older engine is refused, not replayed", async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(PAGE);
  const old = Buffer.from(JSON.stringify({ ...GAME, format: 2 })).toString("base64url");
  await page.evaluate(([key, value]) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [SAVED, old] as const);
  await page.reload();
  await expect(page.getByText("The saved game can't be resumed", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume" })).toHaveCount(0);
});

test("a new game from the setup starts with the first player holding the device", async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(PAGE);
  await page.evaluate((key) => {
    localStorage.removeItem(key);
  }, SAVED);
  await page.reload();
  await expect(page.getByRole("button", { name: "Resume" })).toHaveCount(0);
  await page.getByRole("button", { name: "Start" }).click();
  await until(page, "play.pending?.kind === 'turn' && play.holder === play.turnSeat && play.targets.length > 0");
});

test("the playtesting view is at ?debug", async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(`${PAGE}?debug`);
  await expect(page.getByText("Playtesting view: hot-seat, no server")).toBeVisible();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: "End your turn" })).toBeVisible();
});

/**
 * The rotation ghost: Ann explores north into the Game Room, which fits three
 * ways round (0, 90° and 180°). Each input method turns the ghost through
 * them, round and back, then places it, and the room lands the way it showed.
 */
test.describe("the rotation ghost", () => {

  const placedTurned = (page: Page, rotation: number) => until(page, `play.ghost === null && play.tiles === 6 && play.rotations['game-room'] === ${rotation}`);

  test("keyboard and mouse: Q and E and its arrows turn it, the wheel over it still zooms, and a click places it", async ({ page }) => {
    await resumeSaved(page);
    await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
    await clickTarget(page, "doorway:entrance-hall:top");
    await until(page, "play.ghost?.tile === 'game-room' && play.ghost.rotation === 0");
    expect((await readout(page)).ghost?.rotations).toEqual([0, 1, 2]);
    await expect(page.getByText("Way 1 of 3 it can go.")).toBeVisible();
    const yaw = await page.evaluate(() => window.__betrayalPlay?.camera().yaw);

    // E turns it on and Q back, round the legal ways only, and the camera doesn't orbit.
    await page.keyboard.press("KeyE");
    await until(page, "play.ghost?.rotation === 1");
    await page.keyboard.press("KeyE");
    await until(page, "play.ghost?.rotation === 2");
    await page.keyboard.press("KeyE");
    await until(page, "play.ghost?.rotation === 0");
    await page.keyboard.press("KeyQ");
    await until(page, "play.ghost?.rotation === 2");
    expect(await page.evaluate(() => window.__betrayalPlay?.camera().yaw)).toBe(yaw);

    // The wheel always zooms, even over the ghost: it never turns it.
    const zoom = await page.evaluate(() => window.__betrayalPlay?.camera().zoom ?? 0);
    const ghost = await pointOf(page, "ghost");
    await page.mouse.move(ghost.x, ghost.y);
    await page.mouse.wheel(0, -100);
    await page.waitForFunction((before) => (window.__betrayalPlay?.camera().zoom ?? 0) > before, zoom);
    expect((await readout(page)).ghost?.rotation).toBe(2);

    // Its arrows turn it; a click on it places it as it shows.
    await page.getByRole("button", { name: "Turn it clockwise" }).click();
    await until(page, "play.ghost?.rotation === 0");
    await page.getByRole("button", { name: "Turn it clockwise" }).click();
    await until(page, "play.ghost?.rotation === 1");
    await clickTarget(page, "ghost");
    await placedTurned(page, 1);
  });

  test("a room that fits only one way is placed with no ghost and no question, and appears", async ({ page }) => {
    // The Creaky Hallway, through the Entrance Hall's north door, fits one way only.
    const oneWay = { ...GAME, game: { ...GAME.game, scenario: { stack: ["creaky-hallway"] } } };
    await page.addInitScript(() => {
      // Records whether a question about turning a room, or its ghost, ever shows.
      const flags = { asked: false };
      Object.assign(window, { turningAsked: flags });
      new MutationObserver(() => {
        if (document.documentElement.textContent.includes("which way should") || window.__betrayalPlay?.play().ghost) flags.asked = true;
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    page.on("pageerror", (error) => {
      throw error;
    });
    await page.goto(PAGE);
    await page.evaluate(([key, value]) => {
      localStorage.setItem(key, JSON.stringify(value));
    }, [SAVED, Buffer.from(JSON.stringify(oneWay)).toString("base64url")] as const);
    await page.reload();
    await page.getByRole("button", { name: "Resume" }).click();
    await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
    await clickTarget(page, "doorway:entrance-hall:top");
    // The room is placed and Ann is in it, with her turn going on; the screen says so.
    await until(page, "play.tiles === 6 && play.rooms['zoe-ingstrom'] === 'creaky-hallway' && play.pending?.kind === 'turn' && play.ghost === null");
    expect((await readout(page)).rotations["creaky-hallway"]).toBeDefined();
    await expect(page.getByText("discovers the Creaky Hallway", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { turningAsked: { asked: boolean } }).turningAsked.asked)).toBe(false);
  });

  test.describe("controller", () => {
    test.beforeEach(async ({ page }) => {
      await withPad(page);
    });



    test("the bumpers and the d-pad turn it; A places it", async ({ page }) => {
      await resumeSaved(page);
      await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
      await clickTarget(page, "doorway:entrance-hall:top");
      await until(page, "play.ghost?.tile === 'game-room' && play.ghost.rotation === 0");
      await press(page, BUTTON.RB, "play.ghost?.rotation === 1");
      await expect(page.getByText("LB / RB or the d-pad's left and right turn it. A places it.")).toBeVisible();
      // With a controller the arrows give way to the buttons.
      await expect(page.getByRole("button", { name: "Turn it clockwise" })).toBeHidden();
      await press(page, BUTTON.RB, "play.ghost?.rotation === 2");
      await press(page, BUTTON.DpadRight, "play.ghost?.rotation === 0");
      await press(page, BUTTON.LB, "play.ghost?.rotation === 2");
      await press(page, BUTTON.DpadLeft, "play.ghost?.rotation === 1");
      await press(page, BUTTON.A, "play.ghost === null");
      await placedTurned(page, 1);
    });

    test("View moves into the status box, the d-pad and A press its choice, and X ends the turn", async ({ page }) => {
      await resumeSaved(page);
      await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
      await clickTarget(page, "doorway:entrance-hall:top");
      await until(page, "play.ghost?.tile === 'game-room'");
      await press(page, BUTTON.A, "play.pending?.kind === 'choose-one'");
      const now = page.getByLabel("What you can do now");
      await expect(now).toContainText("View moves into this box");
      const focused = "document.activeElement?.textContent";
      await press(page, BUTTON.View, `${focused} === 'Make a Knowledge roll'`);
      await press(page, BUTTON.DpadRight, `${focused} === "Don't roll"`);
      await press(page, BUTTON.A, "play.pending?.kind === 'turn' && play.targets.length === 0");
      // End turn shows its button, and X takes it.
      await expect(now.getByRole("button", { name: "End turn" })).toContainText("X");
      await press(page, BUTTON.X, "play.holder === 1 && play.turnSeat === 1");
    });
  });

  test.describe("touch", () => {
    test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

    test("a tap on it or its arrows turns it; the button places it", async ({ page }) => {
      await resumeSaved(page);
      await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
      // A first tap on the doorway focuses it, and a second explores.
      const label = (await readout(page)).targets.find((target) => target.id === "doorway:entrance-hall:top")?.label;
      if (!label) throw new Error("No north doorway to explore");
      const doorway = await pointOf(page, "doorway:entrance-hall:top");
      await page.touchscreen.tap(doorway.x, doorway.y);
      await expect(page.getByLabel("Route preview")).toContainText(label);
      await page.touchscreen.tap(doorway.x, doorway.y);
      await until(page, "play.ghost?.tile === 'game-room' && play.ghost.rotation === 0");

      const ghost = await pointOf(page, "ghost");
      await page.touchscreen.tap(ghost.x, ghost.y);
      await until(page, "play.ghost?.rotation === 1");
      await expect(page.getByText("Tap the room, or its arrows, to turn it.")).toBeVisible();
      await page.touchscreen.tap(ghost.x, ghost.y);
      await until(page, "play.ghost?.rotation === 2");
      await page.getByRole("button", { name: "Turn it anticlockwise" }).tap();
      await until(page, "play.ghost?.rotation === 1");
      await page.getByRole("button", { name: "Place the Game Room" }).tap();
      await placedTurned(page, 1);
    });
  });
});

/**
 * Moves of several rooms: every room the move can reach glows, not only the
 * next ones, and pointing at one previews its route before anything is sent:
 * the path in the house, its cost and the rules it would set off. Committing
 * walks the explorer there while the game has already moved on. Ann goes
 * from the Entrance Hall up the Grand Staircase to the Upper Landing, three
 * of her four spaces, on each input, and the view follows her upstairs.
 */
test.describe("a move of several rooms, previewed", () => {
  const LANDING = "room:upper-landing";

  /** The route committed: the state is there at once, while the walk plays; then the walk ends upstairs, the floor having followed. */
  async function walkedUpstairs(page: Page): Promise<void> {
    await page.waitForFunction(() => {
      const play = window.__betrayalPlay?.play();
      return play?.rooms["zoe-ingstrom"] === "upper-landing" && play.walking && play.holder === 0 && play.pending?.kind === "turn";
    });
    await until(page, "!play.walking && play.floor === 'upper' && play.rooms['zoe-ingstrom'] === 'upper-landing' && play.queued === 0 && play.problem === null");
  }

  async function expectLandingPreview(page: Page): Promise<void> {
    await until(page, `play.preview?.target === '${LANDING}'`);
    const { preview } = await readout(page);
    expect(preview?.route.map((place) => place.room)).toEqual(["entrance-hall", "foyer", "grand-staircase", "upper-landing"]);
    expect(preview).toMatchObject({ spaces: 3, left: 4, warnings: [] });
    await expect(page.getByLabel("Route preview")).toContainText("Move to the Upper Landing: 3 of 4 spaces");
  }

  test("keyboard and mouse: hovering previews a route and its rules, and a click walks it", async ({ page }) => {
    await resumeSaved(page);
    await until(page, "play.holder === 0 && play.pending?.kind === 'turn' && play.floor === 'ground'");
    const ids = (await readout(page)).targets.map((target) => target.id);
    expect(ids).toEqual(expect.arrayContaining(["room:foyer", "room:grand-staircase", LANDING, "doorway:foyer:top", "doorway:upper-landing:left"]));

    // A doorway further on: exploring there may draw a card, which ends the move.
    const doorway = await pointOf(page, "doorway:foyer:top");
    await page.mouse.move(doorway.x, doorway.y);
    await until(page, "play.preview?.target === 'doorway:foyer:top'");
    await expect(page.getByLabel("Route preview")).toContainText("Drawing a card ends your movement for the rest of the turn.");

    // The Upper Landing glows on the ground floor as the stairs its route takes.
    const stairs = await pointOf(page, LANDING);
    await page.mouse.move(stairs.x, stairs.y);
    await expectLandingPreview(page);
    expect((await readout(page)).queued).toBe(0);
    await page.mouse.click(stairs.x, stairs.y);
    await walkedUpstairs(page);
  });

  test.describe("touch", () => {
    test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

    test("a first tap previews the route, and a second walks it", async ({ page }) => {
      await resumeSaved(page);
      await until(page, "play.holder === 0 && play.pending?.kind === 'turn' && play.floor === 'ground'");
      const stairs = await pointOf(page, LANDING);
      await page.touchscreen.tap(stairs.x, stairs.y);
      await expectLandingPreview(page);
      expect((await readout(page)).rooms["zoe-ingstrom"]).toBe("entrance-hall");
      await page.touchscreen.tap(stairs.x, stairs.y);
      await walkedUpstairs(page);
    });
  });

  test.describe("controller", () => {
    test.beforeEach(async ({ page }) => {
      await withPad(page);
    });

    test("the stick brings the reticle onto the route, which it previews, and A walks it", async ({ page }) => {
      await resumeSaved(page);
      await until(page, "play.holder === 0 && play.pending?.kind === 'turn' && play.floor === 'ground'");
      // Pans the house under the screen-centre reticle towards the stairs, until the reticle snaps onto them.
      const stairs = await pointOf(page, LANDING);
      const middle = await page.evaluate(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
      const length = Math.hypot(stairs.x - middle.x, stairs.y - middle.y);
      const stick = (x: number, y: number) =>
        page.evaluate(([ax, ay]) => {
          (window as unknown as { testPad: { axes: number[] } }).testPad.axes = [ax, ay, 0, 0];
        }, [x, y] as const);
      await stick((0.5 * (stairs.x - middle.x)) / length, (0.5 * (stairs.y - middle.y)) / length);
      for (let i = 0; i < 12; i++) {
        const f = await page.evaluate(() => window.__betrayalPlay?.frameCount() ?? 0);
        await page.waitForFunction((n) => (window.__betrayalPlay?.frameCount() ?? 0) >= n + 10, f);
        console.log("dbg", await page.evaluate((id) => [window.__betrayalPlay?.reticle(), window.__betrayalPlay?.screenPoint(id), window.__betrayalPlay?.play().floor, window.__betrayalPlay?.play().focused], LANDING));
      }
      await page.waitForFunction((id) => window.__betrayalPlay?.reticle() === id, LANDING);
      await stick(0, 0);
      await expectLandingPreview(page);
      // Not waiting for the house to settle: the camera follows the walk, and the walk is what is checked next.
      await press(page, BUTTON.A, "play.rooms['zoe-ingstrom'] === 'upper-landing'", false);
      await walkedUpstairs(page);
    });
  });
});
