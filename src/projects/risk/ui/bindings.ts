import type { Binding } from "@/shared/components/prompts";

/*
 * Risk's controls: the one map from a meaning to its control on a controller and on the
 * keyboard, following Betrayal's wherever the two games share a meaning (`CLAUDE.md`, "Input").
 * Touch has no glyphs: its control is the thing tapped. Pressing the focused thing (A, Enter or
 * Space) and backing out (B, Esc) go without saying and show no glyph.
 */

export type Meaning = "end-phase" | "menu" | "less" | "more" | "choices" | "blitz" | "log";

export const BINDINGS: Record<Meaning, Binding> = {
  /** Ending the attack or the turn is a hold, as Betrayal's End turn is: there is no undo. */
  "end-phase": { pad: "X", key: "Backspace", fills: true },
  /** The war room: the cards, the battle log and leaving, in one dialog. */
  menu: { pad: "Menu", key: "M", fills: false },
  less: { pad: "LB", key: "[", fills: false },
  more: { pad: "RB", key: "]", fills: false },
  choices: { pad: "DpadLeftRight", key: "Tab", fills: false },
  blitz: { pad: null, key: "B", fills: false },
  log: { pad: null, key: "L", fills: false },
};

/** Keys by code for the meanings above, for the keyboard handler. */
export const KEY_CODES = {
  endPhase: "Backspace",
  menu: "KeyM",
  less: "BracketLeft",
  more: "BracketRight",
  blitz: "KeyB",
  log: "KeyL",
  pan: { KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0] } as Record<string, readonly [number, number]>,
  dice: { Digit1: 1, Digit2: 2, Digit3: 3, Numpad1: 1, Numpad2: 2, Numpad3: 3 } as Record<string, 1 | 2 | 3>,
} as const;
