/** Where Kenney's Fantasy Town Kit is served: each piece's GLB, with the colour map they share in `Textures/` beside them. */
const FANTASY_TOWN_PATH = "/adventure/fantasy-town";

/** Every piece in the kit, by its file's name, so a misspelt piece fails the typecheck rather than the page. */
export const FANTASY_TOWN_PIECES = [
  "balcony-wall", "balcony-wall-fence", "banner-green", "banner-red", "blade", "cart", "cart-high",
  "chimney", "chimney-base", "chimney-top", "fence", "fence-broken", "fence-curved", "fence-gate",
  "fountain-center", "fountain-corner", "fountain-corner-inner", "fountain-corner-inner-square",
  "fountain-curved", "fountain-edge", "fountain-round", "fountain-round-detail", "fountain-square",
  "fountain-square-detail", "hedge", "hedge-curved", "hedge-gate", "hedge-large", "hedge-large-curved",
  "hedge-large-gate", "lantern", "overhang", "pillar-stone", "pillar-wood", "planks", "planks-half",
  "planks-opening", "poles", "poles-horizontal", "road", "road-bend", "road-corner", "road-corner-inner",
  "road-curb", "road-curb-end", "road-edge", "road-edge-slope", "road-slope", "rock-large", "rock-small",
  "rock-wide", "roof", "roof-corner", "roof-corner-inner", "roof-corner-round", "roof-flat", "roof-gable",
  "roof-gable-detail", "roof-gable-end", "roof-gable-top", "roof-high", "roof-high-corner",
  "roof-high-corner-round", "roof-high-cornerinner", "roof-high-flat", "roof-high-gable",
  "roof-high-gable-detail", "roof-high-gable-end", "roof-high-gable-top", "roof-high-left",
  "roof-high-point", "roof-high-right", "roof-high-window", "roof-left", "roof-point", "roof-right",
  "roof-window", "stairs-full", "stairs-full-corner-inner", "stairs-full-corner-outer", "stairs-stone",
  "stairs-stone-corner", "stairs-stone-handrail", "stairs-stone-round", "stairs-wide-stone",
  "stairs-wide-stone-handrail", "stairs-wide-wood", "stairs-wide-wood-handrail", "stairs-wood",
  "stairs-wood-handrail", "stall", "stall-bench", "stall-green", "stall-red", "stall-stool", "tree",
  "tree-crooked", "tree-high", "tree-high-crooked", "tree-high-round", "wall", "wall-arch", "wall-arch-top",
  "wall-arch-top-detail", "wall-block", "wall-block-half", "wall-broken", "wall-corner",
  "wall-corner-detail", "wall-corner-diagonal", "wall-corner-diagonal-half", "wall-corner-edge",
  "wall-curved", "wall-detail-cross", "wall-detail-diagonal", "wall-detail-horizontal", "wall-diagonal",
  "wall-door", "wall-doorway-base", "wall-doorway-round", "wall-doorway-square", "wall-doorway-square-wide",
  "wall-doorway-square-wide-curved", "wall-half", "wall-rounded", "wall-side", "wall-slope",
  "wall-window-glass", "wall-window-round", "wall-window-shutters", "wall-window-small", "wall-window-stone",
  "wall-wood", "wall-wood-arch", "wall-wood-arch-top", "wall-wood-arch-top-detail", "wall-wood-block",
  "wall-wood-block-half", "wall-wood-broken", "wall-wood-corner", "wall-wood-corner-diagonal",
  "wall-wood-corner-diagonal-half", "wall-wood-corner-edge", "wall-wood-curved", "wall-wood-detail-cross",
  "wall-wood-detail-diagonal", "wall-wood-detail-horizontal", "wall-wood-diagonal", "wall-wood-door",
  "wall-wood-doorway-base", "wall-wood-doorway-round", "wall-wood-doorway-square",
  "wall-wood-doorway-square-wide", "wall-wood-doorway-square-wide-curved", "wall-wood-half",
  "wall-wood-rounded", "wall-wood-side", "wall-wood-slope", "wall-wood-window-glass",
  "wall-wood-window-round", "wall-wood-window-shutters", "wall-wood-window-small", "wall-wood-window-stone",
  "watermill", "watermill-wide", "wheel", "windmill",
] as const;

export type TownPiece = (typeof FANTASY_TOWN_PIECES)[number];

export function pieceUrl(piece: TownPiece): string {
  return `${FANTASY_TOWN_PATH}/${piece}.glb`;
}
