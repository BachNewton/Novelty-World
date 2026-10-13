import type { StandardButton } from "@/shared/lib/gamepad";
import { nextInDirection, type Direction } from "../../input/navigate";

/*
 * A controller's focus on the page's own controls. There is one focus: on a
 * choice in the house (the house's own), or on a button here. The page is
 * made of layers, each marked `data-pad-layer` with its height: the status
 * box under the house at 0, a sheet over the house at 1, a reader at 2, the
 * menu at 3. The pad works in the highest layer open. Its d-pad moves the
 * focus along a row and between rows (`nextInDirection`), and past the last
 * row up or down it scrolls a long text; A presses the button focused (or,
 * with none, puts the focus on the layer's start as the d-pad does); B
 * presses the layer's last `data-pad-back` control (the innermost thing open
 * closes first). A layer opening puts the focus on its `data-pad-start`
 * control, or its first.
 */

const DIRECTIONS: Partial<Record<StandardButton, Direction>> = { DpadUp: "up", DpadDown: "down", DpadLeft: "left", DpadRight: "right" };
/** How far the d-pad scrolls a long text past its last control, in CSS pixels. */
const SCROLL = 120;

/** The button the pad last focused: a button a click left focused is the pointer's, not the pad's. */
let owned: HTMLElement | null = null;

/** Puts the pad's focus on a control. */
export function padFocus(control: HTMLElement): void {
  control.focus({ preventScroll: false });
  owned = control;
}

/** The highest layer open in `root`, itself included; of two at one height, the later. */
export function topLayer(root: HTMLElement): HTMLElement | null {
  let top: HTMLElement | null = null;
  let height = -Infinity;
  const layers = [...(root.hasAttribute("data-pad-layer") ? [root] : []), ...root.querySelectorAll<HTMLElement>("[data-pad-layer]")];
  for (const layer of layers) {
    const at = Number(layer.dataset.padLayer);
    if (at >= height && shows(layer)) {
      top = layer;
      height = at;
    }
  }
  return top;
}

export const layerHeight = (layer: HTMLElement): number => Number(layer.dataset.padLayer);

function shows(element: Element): boolean {
  return element.getClientRects().length > 0 && element.checkVisibility({ visibilityProperty: true });
}

/** The buttons of a layer the pad can focus: enabled and showing, and not a layer's inside it. */
export function controlsOf(layer: HTMLElement): HTMLButtonElement[] {
  return [...layer.querySelectorAll("button")].filter((button) => !button.disabled && button.closest("[data-pad-layer]") === layer && shows(button));
}

/** The control in `layer` that has the focus, if any. In a layer marked
 *  `data-pad-owned` (the status box, under the house) only a focus the pad
 *  put there counts: a button a click left focused is the pointer's. */
export function padFocused(layer: HTMLElement): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !layer.contains(active)) return null;
  return layer.hasAttribute("data-pad-owned") && active !== owned ? null : active;
}

/** Puts the pad's focus on a layer's starting control: `data-pad-start` within `part` (or the layer), else its first. */
export function enterLayer(layer: HTMLElement, part: string | null = null): boolean {
  const controls = controlsOf(layer);
  const within = part === null ? controls : controls.filter((control) => control.closest(part) !== null);
  const start = within.find((control) => control.hasAttribute("data-pad-start")) ?? within.at(0) ?? controls.at(0);
  if (!start) return false;
  padFocus(start);
  return true;
}

/** Lets go of the pad's focus in a layer. */
export function leaveLayer(layer: HTMLElement): void {
  const focused = padFocused(layer);
  focused?.blur();
  owned = null;
}

/** The nearest scrolling box round `from` inside `layer`, or the layer's first. */
function scroller(layer: HTMLElement, from: HTMLElement | null): HTMLElement | null {
  const scrolls = (element: HTMLElement) => element.scrollHeight > element.clientHeight && /auto|scroll/.test(getComputedStyle(element).overflowY);
  for (let at = from; at !== null && layer.contains(at); at = at.parentElement) if (scrolls(at)) return at;
  if (scrolls(layer)) return layer;
  return [...layer.querySelectorAll<HTMLElement>("*")].find(scrolls) ?? null;
}

/** Scrolls a long text in a layer a step, returning whether it moved. */
function scrollStep(layer: HTMLElement, from: HTMLElement | null, direction: "up" | "down"): boolean {
  const box = scroller(layer, from);
  if (!box) return false;
  const was = box.scrollTop;
  box.scrollBy({ top: direction === "down" ? SCROLL : -SCROLL, behavior: "instant" });
  return box.scrollTop !== was;
}

/** What a d-pad, A or B press does in a layer: true when it did something.
 *  `out` is called for up past the top row and for B with nothing to close,
 *  where the layer gives the focus back (the status box, to the house). */
export function padPress(layer: HTMLElement, button: StandardButton, out: (() => void) | null = null): boolean {
  const from = padFocused(layer);
  const direction = DIRECTIONS[button];
  if (direction) {
    const controls = controlsOf(layer);
    const at = controls.findIndex((control) => control === from);
    if (at < 0) return enterLayer(layer);
    const next = nextInDirection(
      controls.map((control) => control.getBoundingClientRect()),
      at,
      direction,
    );
    if (next !== null) {
      padFocus(controls[next]);
      return true;
    }
    if (direction === "left" || direction === "right") return true;
    if (scrollStep(layer, from, direction)) return true;
    if (direction === "up" && out) out();
    return true;
  }
  if (button === "A") {
    // With nothing focused, A brings the focus into view rather than doing nothing.
    if (from === null) return enterLayer(layer);
    from.click();
    return true;
  }
  if (button === "B") {
    const backs = [...layer.querySelectorAll<HTMLElement>("[data-pad-back]")].filter((back) => back.closest("[data-pad-layer]") === layer && shows(back));
    const back = backs.at(-1);
    if (back) {
      back.click();
      // The focus stays in the layer: on the control that closed, when it stays.
      if (back.isConnected && from !== null && !from.isConnected) padFocus(back);
      return true;
    }
    if (out && from !== null) {
      out();
      return true;
    }
    return false;
  }
  return false;
}
