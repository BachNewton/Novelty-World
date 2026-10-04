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
} as CSSProperties;
