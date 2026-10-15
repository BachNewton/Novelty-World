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

/**
 * Presses and lets go of a button on a pad, held for exactly one read of the
 * pads. The library reads them in an animation-frame callback it asked for
 * during the frame before, so a callback asked for now runs after that
 * frame's read: the button goes down, is let go once one read has seen it,
 * and the press resolves once the next read has seen it let go. Done in the
 * page, the hold never depends on how long a round trip from the test takes:
 * on a page drawing slow frames, a press held over several reads would be
 * taken for a held direction and repeat.
 */
export async function press(page: Page, button: ButtonName, pad = 0): Promise<void> {
  await page.evaluate(
    ([index, at]) =>
      new Promise<void>((resolve) => {
        const target = (window as unknown as { testPads: (TestPad | null)[] }).testPads[index];
        if (!target) throw new Error(`No test pad in slot ${String(index)}`);
        const set = (pressed: boolean) => {
          target.buttons[at] = { ...target.buttons[at], pressed, value: pressed ? 1 : 0 };
        };
        set(true);
        requestAnimationFrame(() => {
          set(false);
          requestAnimationFrame(() => resolve());
        });
      }),
    [pad, BUTTON[button]] as const,
  );
}

/**
 * Moves a pad's focus onto `target` with the d-pad, steering by where the
 * focus is now after every press, so it never depends on the screen's layout
 * beyond where its buttons sit.
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
