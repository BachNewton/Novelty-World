import type { Locator, Page } from "@playwright/test";

/**
 * Simulated game controllers for the e2e suites: `navigator.getGamepads`
 * returns standard (Xbox-layout) pads whose buttons the test sets. The
 * gamepad library reads the pads once per animation frame, so every press
 * waits on frames, the reader's own event, never a pause.
 */

export const BUTTON = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, View: 8, Menu: 9, DpadUp: 12, DpadDown: 13, DpadLeft: 14, DpadRight: 15 } as const;
export type ButtonName = keyof typeof BUTTON;

interface TestPad {
  buttons: { pressed: boolean; touched: boolean; value: number }[];
}

/** `count` standard pads in slots 0 up, connected from the page's start. */
export async function withPads(page: Page, count = 1): Promise<void> {
  await page.addInitScript((n) => {
    const pads = Array.from({ length: 4 }, (_, index) =>
      index < n
        ? {
            index,
            id: `Test pad ${String(index)} (STANDARD GAMEPAD)`,
            mapping: "standard",
            connected: true,
            timestamp: 0,
            axes: [0, 0, 0, 0],
            buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
          }
        : null,
    );
    Object.assign(window, { testPads: pads });
    Object.defineProperty(navigator, "getGamepads", { value: () => pads });
  }, count);
}

/** Waits for `count` animation frames. */
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

async function setButton(page: Page, pad: number, button: ButtonName, down: boolean): Promise<void> {
  await page.evaluate(
    ([index, at, pressed]) => {
      const target = (window as unknown as { testPads: (TestPad | null)[] }).testPads[index];
      if (!target) throw new Error(`No test pad in slot ${String(index)}`);
      target.buttons[at] = { ...target.buttons[at], pressed, value: pressed ? 1 : 0 };
    },
    [pad, BUTTON[button], down] as const,
  );
  await frames(page);
}

/** Presses and lets go of a button on a pad, each seen by the pad reader. */
export async function press(page: Page, button: ButtonName, pad = 0): Promise<void> {
  await setButton(page, pad, button, true);
  await setButton(page, pad, button, false);
}

/**
 * Moves a pad's focus onto `target` with the d-pad, steering by where the
 * focus is now after every press: a page under load can draw a frame slowly
 * enough that one press is held into a repeat, so a fixed count of presses
 * could overshoot.
 */
export async function padTo(page: Page, target: Locator, pad = 0): Promise<void> {
  for (let steps = 0; ; steps++) {
    const direction = await target.evaluate((element) => {
      const active = document.activeElement;
      if (active === element) return null;
      if (!(active instanceof HTMLElement) || active === document.body) return "DpadDown";
      const [a, b] = [active.getBoundingClientRect(), element.getBoundingClientRect()];
      const [ay, by] = [(a.top + a.bottom) / 2, (b.top + b.bottom) / 2];
      const sameRow = (ay > b.top && ay < b.bottom) || (by > a.top && by < a.bottom);
      if (!sameRow) return by > ay ? "DpadDown" : "DpadUp";
      return (b.left + b.right) / 2 > (a.left + a.right) / 2 ? "DpadRight" : "DpadLeft";
    });
    if (direction === null) return;
    if (steps > 40) throw new Error(`The d-pad never reached ${String(target)}`);
    await press(page, direction, pad);
  }
}
