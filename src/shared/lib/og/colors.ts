// The design tokens the share images draw with. Satori renders them without a
// stylesheet, so it can't read the CSS variables in globals.css: these are the
// tokens' values, named as there, and a test holds them equal.
export const OG_COLORS = {
  "brand-orange": "#ff8c00",
  "brand-blue": "#00CED1",
  "brand-pink": "#FF2D95",
  "brand-green": "#22c55e",
  "surface-primary": "#0a0a0a",
  "surface-secondary": "#141414",
  "surface-tertiary": "#1e1e1e",
  "surface-elevated": "#262626",
  "text-primary": "#f5f5f5",
  "text-secondary": "#a3a3a3",
  "text-muted": "#737373",
  "border-default": "#262626",
  "border-hover": "#404040",
} as const;
