import { Cinzel } from "next/font/google";
import type { CSSProperties } from "react";

/** The war room's display face: capitals cut like an engraved brass plate. */
export const DISPLAY_FONT = Cinzel({ subsets: ["latin"], weight: ["600", "700"], variable: "--rk-font-display" });

/** Risk's palette: a war table at night, brass fittings, parchment, and the seats' inks.
 *  Applied as CSS custom properties on the project root, so descendants use `var(--rk-*)`. */
export const RISK_THEME = {
  "--rk-bg": "#0f0d0a",
  "--rk-panel": "#1b1712",
  "--rk-panel-raised": "#262019",
  "--rk-line": "#40352a",
  "--rk-text": "#efe4cc",
  "--rk-muted": "#a8987c",
  "--rk-brass": "#c9a24a",
  "--rk-brass-bright": "#f3d98f",
  "--rk-brass-dim": "#7d6430",
  "--rk-parchment": "#e8d9b5",
  "--rk-ink": "#2a2018",
  "--rk-danger": "#e0674f",
  /** The sea the board sits in, and its faint grid of meridians. */
  "--rk-sea": "#132229",
  "--rk-sea-grid": "#1c313a",
  "--rk-sea-line": "#cdbb92",
  /** Territory borders, and the heavier line round each continent. */
  "--rk-border": "#2a2018",
  "--rk-coast": "#0a1216",
  /** The seats' inks: apart in lightness as well as hue, and each paired with a shape and a
   *  hatching (`ui/seats.ts`), so no player needs to tell colours apart. */
  "--rk-seat-0": "#c8352a",
  "--rk-seat-1": "#3a6fd0",
  "--rk-seat-2": "#e2b13c",
  "--rk-seat-3": "#2f8a4e",
  "--rk-seat-4": "#9a62cf",
  "--rk-seat-5": "#8d867c",
  /** Text on a seat's ink: dark on the light ochre and iron, light on the rest. */
  "--rk-seat-ink-0": "#fff7ea",
  "--rk-seat-ink-1": "#fff7ea",
  "--rk-seat-ink-2": "#1d160c",
  "--rk-seat-ink-3": "#fff7ea",
  "--rk-seat-ink-4": "#fff7ea",
  "--rk-seat-ink-5": "#14110d",
  /** The dice: the attacker's red, the defender's ivory. */
  "--rk-die-attack": "#b32b22",
  "--rk-die-attack-pip": "#fff3e0",
  "--rk-die-defend": "#efe6d2",
  "--rk-die-defend-pip": "#1b140c",
  /** The site's button prompts and a controller's focus, in brass. */
  "--prompt-body": "#120f0b",
  "--prompt-ink": "#efe4cc",
  "--prompt-a": "#6cc24a",
  "--prompt-b": "#e5534b",
  "--prompt-x": "#4a9ae8",
  "--prompt-y": "#f2c53d",
  "--prompt-hold": "#c9a24a",
  "--color-pad-focus": "#f3d98f",
} as CSSProperties;

/** Seat colours as whole class names, so Tailwind sees each one. */
export const SEAT_BG = ["bg-(--rk-seat-0)", "bg-(--rk-seat-1)", "bg-(--rk-seat-2)", "bg-(--rk-seat-3)", "bg-(--rk-seat-4)", "bg-(--rk-seat-5)"] as const;
export const SEAT_TEXT = ["text-(--rk-seat-0)", "text-(--rk-seat-1)", "text-(--rk-seat-2)", "text-(--rk-seat-3)", "text-(--rk-seat-4)", "text-(--rk-seat-5)"] as const;

/** A panel's frame: dark leather with a brass edge. */
export const PANEL = "rounded-[0.5em] border border-(--rk-line) bg-(--rk-panel)";
/** The war room's buttons, sized in ems so the couch-distance layout scales them with its text. */
export const BUTTON =
  "inline-flex min-h-[2.6em] items-center justify-center gap-[0.4em] rounded-[0.4em] border border-(--rk-brass-dim) bg-(--rk-panel-raised) px-[0.9em] font-semibold text-(--rk-text) transition-colors hover:border-(--rk-brass) hover:bg-(--rk-line) disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-(--rk-brass-bright)";
export const PRIMARY = "border-(--rk-brass) bg-(--rk-brass) text-(--rk-ink) hover:bg-(--rk-brass-bright) hover:border-(--rk-brass-bright)";
export const DISPLAY = "font-(family-name:--rk-font-display) tracking-wide";
