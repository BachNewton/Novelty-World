import type { Locator, Page } from "@playwright/test";
import { expect } from "./test";
import type { PlayReadout } from "../src/projects/betrayal/components/play/play-screen";

/*
 * Driving Betrayal's hot-seat game from a spec: a seeded game saved in the
 * browser and resumed, the game's readout (window.__betrayalPlay), waits on
 * its state, and a stand-in controller. Every wait is on the game's own
 * state or events, never a pause. (betrayal-play.spec.ts keeps its own
 * copies of these, a refactor target.)
 */

/** The game's page, baking its light at the coarse test density: the specs check the UI, not the light. */
export const PAGE = "/board-games/betrayal?lightmap=test";
/** The house view prototype, at the same density. */
export const HOUSE = `${PAGE}&house`;
/** Where the page saves its game, as its share code. */
export const SAVED = "nw:betrayal:saved-game";

/** A game as the page's share code (`share.ts`): its format's prefix, then the game as base64url JSON. */
export const shareCode = (game: object): string => `v1.${Buffer.from(JSON.stringify(game)).toString("base64url")}`;

/** A game for the share code: Zoe goes first (it is her birthday), then Ox, then Father Rhinehardt. */
export function seededGame(scenario: object, seed = "e2e-play") {
  return {
    game: {
      seed,
      sets: ["base"],
      seats: [
        { character: "zoe-ingstrom" },
        { character: "ox-bellows" },
        { character: "father-rhinehardt" },
      ],
      today: { month: 11, day: 5 },
      scenario,
    },
    actions: [],
  };
}

export const readout = (page: Page): Promise<PlayReadout> =>
  page.evaluate(() => {
    const hook = window.__betrayalPlay;
    if (!hook) throw new Error("No game on the page");
    return hook.play();
  });

/** Waits until the game's state passes `check`, with the house built, the camera settled and no beats playing, so the pending decision's choices show. */
export async function until(page: Page, check: string): Promise<void> {
  await page
    .waitForFunction(
      (body) => {
        const hook = window.__betrayalPlay;
        if (!hook?.isReady() || hook.play().playing) return false;
        return (new Function("play", `return ${body}`) as (play: unknown) => boolean)(hook.play());
      },
      check,
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

/** Waits until the game's state passes `check`, settled or not: for a state seen while beats play. */
export async function whilePlaying(page: Page, check: string): Promise<void> {
  await page.waitForFunction((body) => (new Function("play", `return ${body}`) as (play: unknown) => boolean)(window.__betrayalPlay?.play()), check, { timeout: 60_000 });
}

/** The drawn card over its room, once the beats before it (the walk into the room) have played and it shows. */
export async function drawnCard(page: Page, card: string, name: string): Promise<Locator> {
  await whilePlaying(page, `play.card?.card === ${JSON.stringify(card)}`);
  const shown = page.getByRole("dialog", { name: `Card drawn: ${name}` });
  await expect(shown).toBeVisible();
  return shown;
}

/** Resumes a seeded game saved in this browser. */
export async function resume(page: Page, game: object): Promise<void> {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { name: "New game" })).toBeVisible();
  await page.evaluate(([key, value]) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [SAVED, shareCode(game)] as const);
  await page.reload();
  await page.getByRole("button", { name: "Resume" }).click();
}

/** Where a target shows on the page, checked to be open house (no panel over it). */
export async function pointOf(page: Page, id: string): Promise<{ x: number; y: number }> {
  const at = await page.evaluate((target) => {
    const point = window.__betrayalPlay?.screenPoint(target) ?? null;
    const over = point && document.elementFromPoint(point.x, point.y);
    // The frame meter draws on canvases too: open house is the house's own.
    return over instanceof HTMLCanvasElement && over.closest("[data-frame-meter]") === null ? point : null;
  }, id);
  if (!at) throw new Error(`${id} doesn't show in the open house`);
  return at;
}

/** Points at a target where it shows in the house, checks it took the focus, and clicks it. */
export async function clickTarget(page: Page, id: string): Promise<void> {
  const at = await pointOf(page, id);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => page.evaluate((point) => window.__betrayalPlay?.targetAt(point), at)).toBe(id);
  await page.mouse.click(at.x, at.y);
}

/** Records whether the old debug panel ever shows on the page. */
export async function watchDebugPanel(page: Page): Promise<() => Promise<boolean>> {
  await page.addInitScript(() => {
    const seen = { debug: false };
    Object.assign(window, { debugPanelSeen: seen });
    new MutationObserver(() => {
      if (document.querySelector("[data-debug-panel]")) seen.debug = true;
    }).observe(document, { childList: true, subtree: true });
  });
  return () => page.evaluate(() => (window as unknown as { debugPanelSeen: { debug: boolean } }).debugPanelSeen.debug);
}

/**
 * A standard controller the page reads in place of a real one, its buttons
 * set by `press`. By default the page sees it from the start. An `asleep`
 * pad behaves as Chrome's do: hidden from the page (`getGamepads` lists no
 * pad) until a button is pressed on it (`wakePad`), which shows it to the
 * page and fires `gamepadconnected`.
 */
export async function withPad(page: Page, { asleep = false }: { asleep?: boolean } = {}): Promise<void> {
  await page.addInitScript((hidden) => {
    const pad = {
      index: 0,
      id: "Test pad (STANDARD GAMEPAD)",
      mapping: "standard",
      connected: true,
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    const shown = { pad: !hidden };
    Object.assign(window, { testPad: pad, testPadShown: shown });
    Object.defineProperty(navigator, "getGamepads", { value: () => [shown.pad ? pad : null, null, null, null] });
  }, asleep);
}

/** Presses a button on an asleep pad, as a player picking it up would: the
 *  browser shows the page the pad with the button down and fires
 *  `gamepadconnected`, and the button is let go once the page has read it. */
export async function wakePad(page: Page, button: number): Promise<void> {
  await page.evaluate((index) => {
    const w = window as unknown as { testPad: { buttons: { pressed: boolean; value: number }[] }; testPadShown: { pad: boolean } };
    w.testPad.buttons[index] = { ...w.testPad.buttons[index], pressed: true, value: 1 };
    w.testPadShown.pad = true;
    const event = new Event("gamepadconnected");
    Object.defineProperty(event, "gamepad", { value: w.testPad });
    window.dispatchEvent(event);
  }, button);
  await frames(page);
  await setButton(page, button, false);
}

export const BUTTON = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, View: 8, Menu: 9, LS: 10, RS: 11, DpadUp: 12, DpadDown: 13, DpadLeft: 14, DpadRight: 15 } as const;

/** Waits for `count` animation frames: the gamepad library reads the pads once a frame. */
export const frames = (page: Page, count = 2): Promise<void> =>
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

/** Sets a pad button down or up, then waits for the pad to be read twice, so the page has seen it. */
export async function setButton(page: Page, button: number, pressed: boolean): Promise<void> {
  await page.evaluate(
    ([index, down]) => {
      const pad = (window as unknown as { testPad: { buttons: { pressed: boolean; value: number }[] } }).testPad;
      pad.buttons[index] = { ...pad.buttons[index], pressed: down, value: down ? 1 : 0 };
    },
    [button, pressed] as const,
  );
  await frames(page);
}

/** Presses and lets go of a pad button. */
export async function tapButton(page: Page, button: number): Promise<void> {
  await setButton(page, button, true);
  await setButton(page, button, false);
}

/** Holds a pad button until the game's state passes `check` (seen while beats play too), then lets go: End turn is X held. */
export async function holdButton(page: Page, button: number, check: string): Promise<void> {
  await setButton(page, button, true);
  await whilePlaying(page, check);
  await setButton(page, button, false);
}

type Pad = (button: number) => Promise<void>;

/**
 * Moves a controller's focus onto `target` with the d-pad alone, as a player
 * would: down into the status box from the house, then along rows and between
 * them towards it. `press` taps a button on the pad doing it.
 */
export async function padTo(target: Locator, press: Pad): Promise<void> {
  for (let steps = 0; ; steps++) {
    const direction = await target.evaluate((element) => {
      const active = document.activeElement;
      if (active === element) return null;
      if (!(active instanceof HTMLButtonElement)) return "DpadDown";
      const [a, b] = [active.getBoundingClientRect(), element.getBoundingClientRect()];
      const [ay, by] = [(a.top + a.bottom) / 2, (b.top + b.bottom) / 2];
      const sameRow = (ay > b.top && ay < b.bottom) || (by > a.top && by < a.bottom);
      if (!sameRow) return by > ay ? "DpadDown" : "DpadUp";
      return (b.left + b.right) / 2 > (a.left + a.right) / 2 ? "DpadRight" : "DpadLeft";
    });
    if (direction === null) return;
    if (steps > 40) throw new Error(`The d-pad never reached ${String(target)}`);
    await press(BUTTON[direction]);
  }
}

/** The one test pad's taps, for `padTo`. */
export const onePad = (page: Page): Pad => (button) => tapButton(page, button);
