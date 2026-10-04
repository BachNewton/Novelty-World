import type { CSSProperties } from "react";

/** Betrayal's palette, a minimal dark set for the debug view. Applied as CSS
 *  custom properties on the project root, so descendants use `var(--bt-*)`
 *  without adding global tokens. The real art direction comes later. */
export const BETRAYAL_THEME = {
  "--bt-bg": "#0d0b10",
  "--bt-panel": "#17131c",
  "--bt-room": "#221c29",
  "--bt-line": "#3a3043",
  "--bt-door": "#b89b5e",
  "--bt-ink": "#e8e2ec",
  "--bt-muted": "#8f8599",
  "--bt-accent": "#9d6bc4",
  "--bt-danger": "#d0505a",
  /** What the pending decision is about: rooms and doorways it offers. */
  "--bt-focus": "#3b2a12",
  /** One colour per seat, so an explorer reads the same on the board and in panels. */
  "--bt-seat-0": "#e0a14a",
  "--bt-seat-1": "#5fb0c9",
  "--bt-seat-2": "#9fd36a",
  "--bt-seat-3": "#e07a9e",
  "--bt-seat-4": "#b49cf0",
  "--bt-seat-5": "#e6e07a",
} as CSSProperties;

/** Seat colours as whole class names, so Tailwind sees each one. */
export const SEAT_BG = [
  "bg-(--bt-seat-0)",
  "bg-(--bt-seat-1)",
  "bg-(--bt-seat-2)",
  "bg-(--bt-seat-3)",
  "bg-(--bt-seat-4)",
  "bg-(--bt-seat-5)",
] as const;
