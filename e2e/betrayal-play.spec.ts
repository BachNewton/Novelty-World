import type { Page } from "@playwright/test";
import { test, expect } from "./test";
import { PAGE } from "./betrayal-game";
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
      { character: "zoe-ingstrom" },
      { character: "ox-bellows" },
      { character: "father-rhinehardt" },
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

const BUTTON = { A: 0, X: 2, LB: 4, RB: 5, View: 8, DpadDown: 13, DpadLeft: 14, DpadRight: 15 } as const;

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

/** Brings the reticle to a target with the d-pad's right alone, going round every choice at most once, whichever floor each shows on. */
async function bumpTo(page: Page, id: string): Promise<void> {
  const targets = (await readout(page)).targets.length;
  const reticle = () => page.evaluate(() => window.__betrayalPlay?.reticle() ?? null);
  for (let presses = 0, at = await reticle(); at !== id; presses++, at = await reticle()) {
    if (presses > targets) throw new Error(`The d-pad never brought the reticle to ${id}`);
    await press(page, BUTTON.DpadRight, `window.__betrayalPlay.reticle() !== ${JSON.stringify(at)}`);
  }
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
  // Then its event card is answered in the status box: one line for the beat, its Why, and what Zoe can do now.
  await page.waitForFunction(() => {
    const play = window.__betrayalPlay?.play();
    return play?.pending?.kind === "choose-one" && play.tiles === 6;
  });
  const line = page.getByLabel("What happened");
  const why = page.getByRole("dialog", { name: "Why" });
  const now = page.getByLabel("What you can do now");
  // The card's beat over the room waits for a tap before its question shows.
  await page.getByRole("dialog", { name: "Card drawn: Something Hidden" }).getByRole("button", { name: "Go on" }).click();
  await until(page, "play.panel.length > 0");
  // The line is the last beat's: the walk in and the room's discovery are shown, not told.
  await expect(line).toContainText("Zoe Ingstrom draws the event Something Hidden.");
  await expect(line).not.toContainText("discovers");
  // Why is a tap away: each rule named, never by its page, with its full text.
  await page.getByRole("button", { name: /Why/ }).click();
  await expect(why).toContainText("The first explorer to discover a room with a card symbol draws that card.");
  await expect(why.getByRole("heading", { name: "Something Hidden" })).toBeVisible();
  await expect(why).toContainText("You may choose to make a Knowledge roll to work out what's odd; if you don't, nothing happens.");
  await expect(why).toContainText("4+: Draw an item card.");
  await expect(why).not.toContainText("p. 10");
  await page.keyboard.press("Escape");
  await expect(why).toBeHidden();
  // Zoe holds the device in her own turn, so the question doesn't name her.
  await expect(now).toContainText("Something Hidden: ");
  await expect(now).not.toContainText("Zoe Ingstrom:");
  await now.getByRole("button", { name: "Don't roll" }).click();
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

/**
 * Standing places: a figure keeps its place until it moves, whoever's turn it
 * is. All three start in the Entrance Hall, apart, the first player on the
 * prime place; each turn ends without a move, and no one steps anywhere.
 */
test("passing the turn moves no figure", async ({ page }) => {
  await resumeSaved(page);
  await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
  const places = async () => Object.fromEntries(Object.entries((await readout(page)).spots).map(([id, spot]) => [id, spot && `${spot.room} ${spot.x.toFixed(2)} ${spot.z.toFixed(2)}`]));
  const start = await places();
  expect(new Set(Object.values(start)).size).toBe(3);

  await page.getByRole("button", { name: "End turn" }).click();
  await until(page, "play.holder === 1 && play.turnSeat === 1 && !play.walking");
  expect(await places()).toEqual(start);

  await page.getByRole("button", { name: "End turn" }).click();
  await until(page, "play.holder === 2 && play.turnSeat === 2 && !play.walking");
  expect(await places()).toEqual(start);
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

/** The shared game saved in this browser, read back from its code. */
const savedShare = (page: Page) =>
  page.evaluate((key) => {
    const stored = localStorage.getItem(key);
    if (stored === null) throw new Error("No saved game");
    const code = JSON.parse(stored) as string;
    return JSON.parse(atob(code.replace(/-/g, "+").replace(/_/g, "/"))) as { game: { seats: { character: string }[]; chosenHaunt?: number } };
  }, SAVED);

test("setup: characters chosen by portrait, one per card, and a chosen haunt carried into the game", async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(PAGE);
  await page.evaluate((key) => {
    localStorage.removeItem(key);
  }, SAVED);
  await page.reload();
  const seat0 = page.getByRole("listitem", { name: "Seat 0" });
  await expect(seat0.getByRole("button", { name: "Seat 0 character: Father Rhinehardt" })).toBeVisible();

  // Four seats by default, each showing its character's traits.
  await expect(page.getByRole("listitem", { name: /^Seat \d$/ })).toHaveCount(4);
  await expect(seat0.getByLabel("Father Rhinehardt's traits").getByLabel(/ track$/)).toHaveCount(4);

  // Tapping the portrait opens every character; one whose card another seat holds can't be picked.
  await seat0.getByRole("button", { name: "Seat 0 character: Father Rhinehardt" }).click();
  const grid = page.getByRole("dialog", { name: "Seat 0's character" });
  await expect(grid.getByRole("button", { name: /Ox Bellows/ })).toBeDisabled();
  await grid.getByRole("button", { name: /Heather Granville/ }).click();
  await expect(grid).toHaveCount(0);
  await expect(seat0.getByRole("button", { name: "Seat 0 character: Heather Granville" })).toBeVisible();
  await expect(seat0.getByLabel("Heather Granville's traits").getByLabel(/ track$/)).toHaveCount(4);

  await page.getByRole("button", { name: /^13 · / }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await until(page, "play.pending?.kind === 'turn'");
  const shared = await savedShare(page);
  expect(shared.game.chosenHaunt).toBe(13);
  expect(shared.game.seats[0].character).toBe("heather-granville");
});

/**
 * The reveal: haunt 13 started by the scenario, so the game opens at its
 * ready wait. The house's light is the haunt's, the traitor is named in red,
 * and each seat in turn is told who looks, then says it is ready.
 */
test("the haunt's reveal: the light is the haunt's, the traitor is named, and each seat reads in turn", async ({ page }) => {
  const haunted = { ...GAME, game: { ...GAME.game, scenario: { haunt: { number: 13, revealer: 0 } } } };
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(PAGE);
  await page.evaluate(([key, value]) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [SAVED, Buffer.from(JSON.stringify(haunted)).toString("base64url")] as const);
  await page.reload();
  await page.getByRole("button", { name: "Resume" }).click();
  await until(page, "play.pending?.type === 'ready' && play.holder === 0");
  expect((await readout(page)).mood).toBe("haunt");

  const reveal = page.getByLabel("The haunt begins");
  await expect(reveal).toContainText("Haunt 13");
  // Haunt 13's traitor, with these explorers, is Ox.
  await expect(reveal.locator("[data-traitor]")).toContainText("Ox Bellows");
  await expect(reveal).toContainText("Ox Bellows, look away");

  await reveal.getByRole("button", { name: "Secrets of Survival" }).click();
  const reader = page.getByRole("dialog", { name: "Secrets of Survival" });
  await expect(reader).toBeVisible();
  await reader.getByRole("button", { name: "Close" }).click();

  await reveal.getByRole("button", { name: "Ready" }).click();
  await until(page, "play.pending?.type === 'ready' && play.holder === 1");
  await expect(reveal).toContainText("you're the traitor");
  await expect(reveal.getByRole("button", { name: "Traitor's Tome" })).toBeVisible();
  await reveal.getByRole("button", { name: "Ready" }).click();
  await until(page, "play.pending?.type === 'ready' && play.holder === 2");
  await reveal.getByRole("button", { name: "Ready" }).click();
  await until(page, "play.status === 'haunt' && play.pending?.type === 'decision'");
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

/** The text of each element matching `selector` that overlaps `at` on the page. */
const overlapping = (page: Page, selector: string, at: { x: number; y: number; width: number; height: number }): Promise<(string | null)[]> =>
  page.evaluate(
    ([query, box]) =>
      [...document.querySelectorAll(query)]
        .map((element) => ({ name: element.textContent, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.left < box.x + box.width && rect.right > box.x && rect.top < box.y + box.height && rect.bottom > box.y)
        .map(({ name }) => name),
    [selector, at] as const,
  );

test("End turn shows top right with the frame meter beside it (under it on a phone), clear of the buttons, and ~ hides the meter on this device", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await resumeSaved(page);
  await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
  const meter = page.locator("[data-frame-meter] canvas").first();
  for (const size of [{ width: 360, height: 640 }, { width: 3440, height: 1440 }]) {
    await page.setViewportSize(size);
    await expect(meter).toBeVisible();
    const box = await page.locator("[data-frame-meter]").boundingBox();
    if (!box) throw new Error("The frame meter has no box");
    expect(await overlapping(page, "header button, section, [data-end-turn]", box), `at ${size.width}x${size.height}`).toEqual([]);
    // End turn is in the top right corner, in view without scrolling.
    const end = await page.getByRole("button", { name: "End turn" }).boundingBox();
    if (!end) throw new Error("End turn has no box");
    expect(end.x + end.width).toBeGreaterThan(size.width - 16);
    expect(end.y).toBeLessThan(16);
    expect(await overlapping(page, "header button", end), `at ${size.width}x${size.height}`).toEqual([]);
    if (size.width >= 640) {
      // Wide enough: the meter is just left of End turn, centred on it.
      expect(end.x - (box.x + box.width)).toBeLessThan(16);
      expect(Math.abs(box.y + box.height / 2 - (end.y + end.height / 2))).toBeLessThan(2);
    } else {
      // A phone: just under it, right-aligned with it.
      expect(box.y - (end.y + end.height)).toBeLessThan(16);
      expect(Math.abs(box.x + box.width - (end.x + end.width))).toBeLessThan(2);
    }
  }
  await page.keyboard.press("Shift+Backquote");
  await expect(meter).toBeHidden();
  await page.reload();
  await page.getByRole("button", { name: "Resume" }).click();
  await until(page, "play.holder === 0");
  await expect(meter).toBeHidden();
  await page.keyboard.press("Backquote");
  await expect(meter).toBeVisible();
});

/**
 * The rotation ghost: Zoe explores north into the Game Room, which fits three
 * ways round (0, 90° and 180°). Each input method turns the ghost through
 * them, round and back, then places it, and the room lands the way it showed.
 */
test.describe("the rotation ghost", () => {

  // Not waiting for the beats: the Game Room's card waits for a tap once it is placed.
  const placedTurned = (page: Page, rotation: number) =>
    page.waitForFunction((turned) => {
      const play = window.__betrayalPlay?.play();
      return play?.ghost === null && play.tiles === 6 && play.rotations["game-room"] === turned;
    }, rotation);

  test("keyboard and mouse: Tab and Shift+Tab and its arrows turn it, the wheel over it still zooms, and a click places it", async ({ page }) => {
    await resumeSaved(page);
    await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
    await clickTarget(page, "explore:ground:2:-1");
    await until(page, "play.ghost?.tile === 'game-room' && play.ghost.rotation === 0");
    expect((await readout(page)).ghost?.rotations).toEqual([0, 1, 2]);
    await expect(page.getByText("Way 1 of 3 it can go.")).toBeVisible();
    const yaw = await page.evaluate(() => window.__betrayalPlay?.camera().yaw);

    // Tab steps on through its ways round and Shift+Tab back, round the legal ways only, and the camera doesn't orbit.
    await page.keyboard.press("Tab");
    await until(page, "play.ghost?.rotation === 1");
    await page.keyboard.press("Tab");
    await until(page, "play.ghost?.rotation === 2");
    await page.keyboard.press("Tab");
    await until(page, "play.ghost?.rotation === 0");
    await page.keyboard.press("Shift+Tab");
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
    await clickTarget(page, "explore:ground:2:-1");
    // The room is placed and Zoe is in it, with her turn going on; the house shows it, and the box tells nothing of it.
    await until(page, "play.tiles === 6 && play.rooms['zoe-ingstrom'] === 'creaky-hallway' && play.pending?.kind === 'turn' && play.ghost === null");
    expect((await readout(page)).rotations["creaky-hallway"]).toBeDefined();
    await expect(page.getByLabel("What happened")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { turningAsked: { asked: boolean } }).turningAsked.asked)).toBe(false);
  });

  test.describe("controller", () => {
    test.beforeEach(async ({ page }) => {
      await withPad(page);
    });



    test("on the pad alone: the d-pad brings the reticle to the cell, A explores it, the d-pad steps its ways round, and A places it", async ({ page }) => {
      await resumeSaved(page);
      await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
      await bumpTo(page, "explore:ground:2:-1");
      await until(page, "play.preview?.target === 'explore:ground:2:-1'");
      await expect(page.getByLabel("Route preview")).toContainText("Drawing a card ends your movement for the rest of the turn.");
      await press(page, BUTTON.A, "play.pending?.kind === 'rotation'", false);
      await until(page, "play.ghost?.tile === 'game-room' && play.ghost.rotation === 0");
      await press(page, BUTTON.DpadRight, "play.ghost?.rotation === 1");
      // With a controller the arrows give way to the d-pad.
      await expect(page.getByRole("button", { name: "Turn it clockwise" })).toBeHidden();
      await press(page, BUTTON.DpadRight, "play.ghost?.rotation === 2");
      await press(page, BUTTON.DpadRight, "play.ghost?.rotation === 0");
      await press(page, BUTTON.DpadLeft, "play.ghost?.rotation === 2");
      await press(page, BUTTON.DpadLeft, "play.ghost?.rotation === 1");
      // The bumpers only ever change floor: the ghost stays as it is.
      await press(page, BUTTON.RB, "play.floor !== 'ground'");
      await press(page, BUTTON.LB, "play.floor === 'ground'");
      expect((await readout(page)).ghost?.rotation).toBe(1);
      await press(page, BUTTON.A, "play.ghost === null", false);
      await placedTurned(page, 1);
    });

    test("the d-pad's down moves into the status box, its left and right and A press a choice, and X held ends the turn", async ({ page }) => {
      await resumeSaved(page);
      await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
      await bumpTo(page, "explore:ground:2:-1");
      await press(page, BUTTON.A, "play.ghost?.tile === 'game-room'", false);
      await press(page, BUTTON.A, "play.pending?.kind === 'choose-one'", false);
      // A goes on from the card's beat, and its question shows.
      await press(page, BUTTON.A, "!play.playing && play.panel.length > 0");
      const focused = "document.activeElement?.textContent";
      await press(page, BUTTON.DpadDown, `${focused} === 'Make a Knowledge roll'`);
      await press(page, BUTTON.DpadRight, `${focused} === "Don't roll"`);
      await press(page, BUTTON.A, "play.pending?.kind === 'turn' && play.targets.length === 0");
      // End turn's background fills while X is held, and the turn then passes.
      await expect(page.locator("[data-end-turn] [data-hold-fill='rest']")).toBeAttached();
      await press(page, BUTTON.X, "play.holder === 1 && play.turnSeat === 1");
    });
  });

  test.describe("touch", () => {
    test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

    test("its arrows turn it, and a tap on it, focused like any choice, places it", async ({ page }) => {
      await resumeSaved(page);
      await until(page, "play.holder === 0 && play.pending?.kind === 'turn'");
      // A first tap on the cell beyond the doorway focuses it, and a second explores.
      const label = (await readout(page)).targets.find((target) => target.id === "explore:ground:2:-1")?.label;
      if (!label) throw new Error("No north doorway to explore");
      const doorway = await pointOf(page, "explore:ground:2:-1");
      await page.touchscreen.tap(doorway.x, doorway.y);
      await expect(page.getByLabel("Route preview")).toContainText(label);
      await page.touchscreen.tap(doorway.x, doorway.y);
      await until(page, "play.ghost?.tile === 'game-room' && play.ghost.rotation === 0");

      await page.getByRole("button", { name: "Turn it clockwise" }).tap();
      await until(page, "play.ghost?.rotation === 1");
      await page.getByRole("button", { name: "Turn it clockwise" }).tap();
      await until(page, "play.ghost?.rotation === 2");
      await page.getByRole("button", { name: "Turn it anticlockwise" }).tap();
      await until(page, "play.ghost?.rotation === 1");
      const ghost = await pointOf(page, "ghost");
      await page.touchscreen.tap(ghost.x, ghost.y);
      await placedTurned(page, 1);
    });
  });
});

/**
 * Moves of several rooms: every room the move can reach glows, not only the
 * next ones, and pointing at one previews its route before anything is sent:
 * the path in the house, its cost and the rules it would set off. Committing
 * walks the explorer there while the game has already moved on. Zoe goes
 * from the Entrance Hall up the Grand Staircase to the Upper Landing, three
 * of her four spaces, on each input, and the view follows her upstairs.
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

  test("keyboard and mouse: hovering previews a route and its rules, and a click walks it", async ({ page }) => {
    await resumeSaved(page);
    await until(page, "play.holder === 0 && play.pending?.kind === 'turn' && play.floor === 'ground'");
    const ids = (await readout(page)).targets.map((target) => target.id);
    expect(ids).toEqual(expect.arrayContaining(["room:foyer", "room:grand-staircase", LANDING, "explore:ground:1:-1", "explore:upper:-1:0"]));

    // A cell to explore further on: exploring there may draw a card, which ends the move.
    const cell = await pointOf(page, "explore:ground:1:-1");
    await page.mouse.move(cell.x, cell.y);
    await until(page, "play.preview?.target === 'explore:ground:1:-1'");
    await expect(page.getByLabel("Route preview")).toContainText("Drawing a card ends your movement for the rest of the turn.");

    // The Upper Landing glows on the ground floor as the stairs its route takes.
    const stairs = await pointOf(page, LANDING);
    await page.mouse.move(stairs.x, stairs.y);
    await expectLandingPreview(page);
    expect((await readout(page)).queued).toBe(0);
    await holdTheWalk(page);
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
      await holdTheWalk(page);
      await page.touchscreen.tap(stairs.x, stairs.y);
      await walkedUpstairs(page);
    });
  });

  test.describe("controller", () => {
    test.beforeEach(async ({ page }) => {
      await withPad(page);
    });

    test("the bumpers bring the reticle to the route, which it previews, and A walks it", async ({ page }) => {
      await resumeSaved(page);
      await until(page, "play.holder === 0 && play.pending?.kind === 'turn' && play.floor === 'ground'");
      await bumpTo(page, LANDING);
      await expectLandingPreview(page);
      // Not waiting for the house to settle: the camera follows the walk, and the walk is what is checked next.
      await holdTheWalk(page);
      await press(page, BUTTON.A, "play.rooms['zoe-ingstrom'] === 'upper-landing'", false);
      await walkedUpstairs(page);
    });
  });
});

/**
 * The tag over a focused target, with its route's cost, stays on a 360px
 * phone screen even when the target sits at the screen's edge: Zoe's route to
 * the Upper Landing, its stairs dragged to the left edge, then the right.
 */
test.describe("the route tag on a phone", () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

  test("stays on screen with its target at either edge", async ({ page }) => {
    await resumeSaved(page);
    await until(page, "play.holder === 0 && play.pending?.kind === 'turn' && play.floor === 'ground'");
    const cdp = await page.context().newCDPSession(page);
    const LANDING = "room:upper-landing";
    for (const edge of [6, 354]) {
      // One finger drags the stairs to the edge, and the house settles there.
      const from = await pointOf(page, LANDING);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
      for (let step = 1; step <= 8; step++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + ((edge - from.x) * step) / 8, y: from.y, id: 1 }] });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.evaluate((id) => {
        window.__betrayalPlay?.focus(id);
      }, LANDING);
      await until(page, `play.preview?.target === '${LANDING}'`);
      const at = await page.evaluate((id) => window.__betrayalPlay?.screenPoint(id) ?? null, LANDING);
      if (!at) throw new Error("The stairs left the screen");
      const tag = page.getByRole("tooltip");
      await expect(tag).toContainText("3 of 4 spaces");
      const box = await tag.boundingBox();
      if (!box) throw new Error("The route tag doesn't show");
      // Close enough to the edge that a tag centred on it would run off.
      expect(Math.abs(at.x - edge)).toBeLessThan(box.width / 2);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(360);
    }
  });
});
