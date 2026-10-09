import type { StandardButton } from "@/shared/lib/gamepad";

/*
 * A controller in the status box. X ends the turn when the turn offers it.
 * View moves the focus into the box, onto its first choice, and back out;
 * while the box has it, the d-pad moves between the box's buttons, A presses
 * the one focused and B returns to the house. The focus is the page's own;
 * the box only marks that the pad put it there.
 */

const NEXT: Partial<Record<StandardButton, 1 | -1>> = { DpadDown: 1, DpadRight: 1, DpadUp: -1, DpadLeft: -1 };

/** Takes a pad button the status box answers, returning whether it did. */
export function boxPadButton(box: HTMLElement | null, button: StandardButton, endTurn: (() => void) | null): boolean {
  if (button === "X" && endTurn) {
    endTurn();
    return true;
  }
  if (!box) return false;
  const buttons = [...box.querySelectorAll("button")];
  // The box is the pad's only while View put the focus there: a button a click or Tab left focused is not.
  const focused = box.dataset.pad === "on" ? (buttons.find((candidate) => candidate === document.activeElement) ?? null) : null;
  const leave = () => {
    delete box.dataset.pad;
    focused?.blur();
  };
  if (button === "View") {
    if (focused) leave();
    else {
      box.dataset.pad = "on";
      (box.querySelector<HTMLButtonElement>("[data-now] button") ?? buttons.at(0))?.focus();
    }
    return buttons.length > 0;
  }
  if (!focused) {
    delete box.dataset.pad;
    return false;
  }
  const step = NEXT[button];
  if (step !== undefined) {
    buttons[(buttons.indexOf(focused) + step + buttons.length) % buttons.length].focus();
    return true;
  }
  if (button === "A") {
    focused.click();
    return true;
  }
  if (button === "B") {
    leave();
    return true;
  }
  return false;
}
