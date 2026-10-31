/*
 * The interior's paints. A part is a token, or two mixed, then a brightness, and what the material draws on it. Pure
 * data, so a room's triangles can be counted with no renderer. All colour comes from the game's tokens.
 */

export const SURFACES = ["plain", "planks", "panel", "logs", "stripes", "weave", "tile", "view-sea", "view-field", "view-town", "view-shore"] as const;
export type Surface = (typeof SURFACES)[number];

interface Paint {
  from: string;
  to?: string;
  share?: number;
  gain?: number;
  surface?: Surface;
  /** Gives its own light, so no light is baked on it. */
  glow?: boolean;
}

export const INTERIOR_PAINT = {
  "floor-pine": { from: "home-pine", surface: "planks" },
  "floor-oak": { from: "home-oak", to: "home-birch", share: 0.45, surface: "planks" },
  "floor-dark": { from: "home-walnut", to: "home-oak", share: 0.3, surface: "planks" },
  "floor-limed": { from: "home-birch", to: "home-plaster", share: 0.45, surface: "planks" },
  "floor-concrete": { from: "home-concrete", gain: 0.88 },
  "floor-duckboard": { from: "home-aspen", gain: 0.82, surface: "planks" },
  "wall-pine": { from: "home-pine", to: "home-birch", share: 0.5, surface: "panel" },
  "wall-white-panel": { from: "home-plaster", surface: "panel" },
  "wall-plaster": { from: "home-plaster" },
  "wall-sage": { from: "home-sage", to: "home-plaster", share: 0.3, surface: "panel" },
  "wall-log": { from: "home-oak", to: "home-walnut", share: 0.15, surface: "logs" },
  "wall-paper": { from: "home-paper", surface: "stripes" },
  "wall-aspen": { from: "home-aspen", surface: "panel" },
  "wall-concrete": { from: "home-concrete", gain: 1.04 },
  "wall-boards": { from: "home-birch", to: "home-concrete", share: 0.4, surface: "panel" },
  "wall-tile": { from: "home-tile", surface: "tile" },
  ceiling: { from: "home-plaster", gain: 1.02 },
  "ceiling-boards": { from: "home-birch", gain: 1.04, surface: "panel" },
  beam: { from: "home-walnut", to: "home-oak", share: 0.4 },
  trim: { from: "wall-trim" },
  pine: { from: "home-pine" },
  oak: { from: "home-oak" },
  birch: { from: "home-birch" },
  walnut: { from: "home-walnut" },
  "paint-white": { from: "wall-trim", gain: 0.96 },
  "paint-sage": { from: "home-sage" },
  "paint-blue": { from: "home-navy", to: "home-sage", share: 0.25 },
  linen: { from: "home-linen", surface: "weave" },
  wool: { from: "home-wool", surface: "weave" },
  rust: { from: "home-rust", surface: "weave" },
  navy: { from: "home-navy", surface: "weave" },
  moss: { from: "home-moss", surface: "weave" },
  mustard: { from: "home-mustard", surface: "weave" },
  "rug-red": { from: "wall-red", surface: "weave" },
  "rug-pale": { from: "home-wool", to: "home-linen", share: 0.5, surface: "weave" },
  "rug-blue": { from: "home-navy", to: "home-sage", share: 0.2, surface: "weave" },
  black: { from: "home-charcoal" },
  iron: { from: "home-charcoal", to: "home-steel", share: 0.12 },
  steel: { from: "home-steel" },
  appliance: { from: "wall-trim", to: "home-steel", share: 0.3 },
  tile: { from: "home-tile", surface: "tile" },
  "tile-blue": { from: "home-tile", to: "home-navy", share: 0.25, surface: "tile" },
  stone: { from: "wall-grey", gain: 0.95 },
  "stone-dark": { from: "wall-grey", to: "home-charcoal", share: 0.6 },
  concrete: { from: "home-concrete" },
  rubber: { from: "car-tyre", gain: 1.5 },
  leaf: { from: "tree-birch", gain: 1.05 },
  "leaf-dark": { from: "tree-pine", gain: 1.2 },
  "pot-clay": { from: "home-rust", to: "home-birch", share: 0.3 },
  "red-paint": { from: "wall-red", gain: 1.1 },
  "yellow-paint": { from: "wall-yellow" },
  "sea-paint": { from: "water", gain: 1.1 },
  "sky-paint": { from: "sky" },
  "land-paint": { from: "ground" },
  page: { from: "home-wool", gain: 1.05 },
  ember: { from: "home-ember", glow: true },
  bulb: { from: "home-bulb", glow: true },
  "view-sea": { from: "sky", surface: "view-sea", glow: true },
  "view-field": { from: "sky", surface: "view-field", glow: true },
  "view-town": { from: "sky", surface: "view-town", glow: true },
  "view-shore": { from: "sky", surface: "view-shore", glow: true },
} as const satisfies Record<string, Paint>;

export type InteriorPart = keyof typeof INTERIOR_PAINT;
export const INTERIOR_PARTS = Object.keys(INTERIOR_PAINT) as InteriorPart[];
export type ViewPart = "view-sea" | "view-field" | "view-town" | "view-shore";

export const paintOf = (part: InteriorPart): Paint => INTERIOR_PAINT[part];
