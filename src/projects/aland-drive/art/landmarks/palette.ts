/*
 * The landmarks' colours, named and defined once, as the project's other world tokens are. The names continue
 * `--color-aland-drive-*`: this folder can't reach `globals.css`, so if they move there, `flat` reads them through
 * `themeColor` and this table goes.
 */
export const LANDMARK_COLOURS = {
  "tower-ochre": "#d6a65c",
  "tower-white": "#e9e6dc",
  "tower-core": "#6d7468",
  "tower-roof": "#8a9288",
  glass: "#2b3a44",
  "glass-sky": "#7f9fb4",
  "hull-black": "#1e2329",
  "hull-white": "#e6e4dc",
  "hull-gold": "#b98f3e",
  "hull-red": "#8c3226",
  "deck-wood": "#a58d68",
  "deck-house": "#d9d5c8",
  "ship-teak": "#7a5233",
  "mast-cream": "#ddcfae",
  "mast-dark": "#26231f",
  rigging: "#3a3631",
  "wire-pale": "#8d8a80",
  brick: "#99452f",
  "brick-dark": "#74331f",
  "brick-pale": "#b4664a",
  granite: "#94837a",
  "granite-red": "#8b5a4a",
  "granite-dark": "#5f5650",
  "copper-green": "#5f9078",
  "copper-dark": "#3f6a58",
  "plaster-ochre": "#c8b98f",
  "plaster-trim": "#e4dcc4",
  "slate-roof": "#4c5259",
  "mortar-white": "#d6d0c2",
  "stone-red": "#8d5a48",
  "stone-pale": "#b7a596",
  gravel: "#a9694f",
  ferry: "#f0f1ee",
  "ferry-red": "#b3262c",
  "ferry-blue": "#1c3f6e",
  "ferry-funnel": "#c22a2e",
} as const;

export type LandmarkColour = keyof typeof LANDMARK_COLOURS;
