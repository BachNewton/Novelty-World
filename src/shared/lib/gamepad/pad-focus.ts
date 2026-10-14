import { nextInDirection, type Direction } from "./navigation";

/*
 * A controller's focus on a screen's own controls, in the DOM: the buttons
 * and links under a root, each focused for real, so Enter and Space act on
 * it too. Text fields are skipped: a controller can't type, so it passes
 * them by. The d-pad moves the focus (`nextInDirection`), A presses the
 * control focused, B presses the root's last `data-pad-back` control showing
 * and Menu its last `data-pad-menu` one. A screen's starting control is its
 * `data-pad-start` one, else its first.
 *
 * The focus shows only while a controller was the last thing used: the page
 * marks the document `data-pad-nav`, which styles the focus (globals.css),
 * and any key or pointer press takes the mark away. A d-pad or A press with
 * the focus hidden only brings it into view, so a player never acts on a
 * control they haven't seen picked.
 */

const CONTROLS = "button, a[href]";

function shows(element: Element): boolean {
  return element.getClientRects().length > 0 && element.checkVisibility({ visibilityProperty: true });
}

/** The controls under `root` a pad can focus: enabled and showing. Of a
 *  control inside another (a button in a link), only the inner one. */
export function padControls(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(CONTROLS)].filter(
    (control) => !(control instanceof HTMLButtonElement && control.disabled) && control.querySelector(CONTROLS) === null && shows(control),
  );
}

export function padFocusShowing(): boolean {
  return document.documentElement.hasAttribute("data-pad-nav");
}

export function hidePadFocus(): void {
  document.documentElement.removeAttribute("data-pad-nav");
}

function focusControl(control: HTMLElement): void {
  control.focus({ preventScroll: true });
  control.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** The control under `root` with the focus, if any. */
function focused(root: HTMLElement): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && root.contains(active) && padControls(root).includes(active) ? active : null;
}

/** Shows the pad's focus under `root`: on the control focused already, or
 *  on the starting control. */
export function showPadFocus(root: HTMLElement): void {
  document.documentElement.setAttribute("data-pad-nav", "");
  if (focused(root)) return;
  const controls = padControls(root);
  const start = controls.find((control) => control.hasAttribute("data-pad-start")) ?? controls.at(0);
  if (start) focusControl(start);
}

/** Moves the pad's focus a step. */
export function padMove(root: HTMLElement, direction: Direction): void {
  const from = focused(root);
  if (!padFocusShowing() || from === null) {
    showPadFocus(root);
    return;
  }
  const controls = padControls(root);
  const next = nextInDirection(
    controls.map((control) => control.getBoundingClientRect()),
    controls.indexOf(from),
    direction,
  );
  if (next !== null) focusControl(controls[next]);
}

function lastMarked(root: HTMLElement, mark: string): HTMLElement | null {
  return padControls(root).findLast((control) => control.hasAttribute(mark)) ?? null;
}

/** What A, B or Menu does: true when the press did something. */
export function padPress(root: HTMLElement, button: "A" | "B" | "Menu"): boolean {
  if (button === "A") {
    const from = focused(root);
    if (!padFocusShowing() || from === null) showPadFocus(root);
    else from.click();
    return true;
  }
  const marked = lastMarked(root, button === "B" ? "data-pad-back" : "data-pad-menu");
  if (marked === null) return false;
  marked.click();
  return true;
}
