"use client";

import type { ComponentProps } from "react";
import { controlFor as bindingControl, Prompt as BindingPrompt, PromptButton as BindingButton, type Binding, type Control, type Hold } from "@/shared/components/prompts";
import type { InputKind } from "@/shared/lib/input";

/*
 * Betrayal's button prompts: the one map from a meaning to its control on
 * each input. The glyphs are the site's (`src/shared/components/prompts.tsx`),
 * painted in Betrayal's tokens (`theme.ts`).
 */

/** What a control means, whatever the input: the map's single source. A
 *  and B (Enter and Esc) are left out: pressing the focused thing and
 *  closing the topmost one go without saying, so they never show a glyph. */
export type Meaning = "end-turn" | "explorer" | "menu" | "follow" | "details" | "walls" | "floor-down" | "floor-up" | "choices" | "why";

/** Each meaning's control on a pad and on the keyboard, and whether it is a
 *  hold that fills before it acts. Touch has none, and a pad none for a
 *  button it reaches with the d-pad and presses with A (Why). */
export const BINDINGS: Record<Meaning, Binding> = {
  "end-turn": { pad: "X", key: "Backspace", fills: true },
  explorer: { pad: "Y", key: "I", fills: false },
  menu: { pad: "Menu", key: "M", fills: false },
  follow: { pad: "View", key: "C", fills: false },
  details: { pad: "R3", key: "Z", fills: false },
  walls: { pad: "L3", key: "V", fills: false },
  "floor-down": { pad: "LB", key: "F", fills: false },
  "floor-up": { pad: "RB", key: "R", fills: false },
  choices: { pad: "DpadLeftRight", key: "Tab", fills: false },
  why: { pad: null, key: "H", fills: false },
};

/** The control for a meaning on an input, or null where it has none (touch, or a key it lacks). */
export function controlFor(meaning: Meaning, input: InputKind): Control | null {
  return bindingControl(BINDINGS[meaning], input);
}

/** A meaning's glyph, for the input the player last used, or nothing on touch. */
export function Prompt({ meaning, input, className }: { meaning: Meaning; input: InputKind; className?: string }) {
  return <BindingPrompt binding={BINDINGS[meaning]} input={input} className={className} />;
}

/** A button with its meaning's prompt (the shared `PromptButton`). */
export function PromptButton({ meaning, ...button }: ComponentProps<"button"> & { meaning: Meaning; input: InputKind; hold?: Hold }) {
  return <BindingButton binding={BINDINGS[meaning]} {...button} />;
}

/** With a controller, the button its focus is on shows it plainly: a thick
 *  ink ring with a dark band inside it, so it reads on a pale portrait and a
 *  dark panel alike. No glyph marks it: A pressing the focused thing goes
 *  without saying, so glyphs are kept for controls that aren't obvious. */
export const PAD_FOCUS = "[&_button:focus]:outline-3 [&_button:focus]:outline-offset-2 [&_button:focus]:outline-(--bt-ink) [&_button:focus]:shadow-[0_0_0_2px_var(--bt-bg)]";
