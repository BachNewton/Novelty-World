import type { Page } from "@playwright/test";

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
