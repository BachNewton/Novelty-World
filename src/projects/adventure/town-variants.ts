import type { TownPiece, TownTexture } from "./fantasy-town";

/**
 * The town kit's pieces each of its other colour maps changes: those whose
 * triangles sample a texel that differs from the kit's own map. Every other
 * piece looks the same in either. Written by `tools/town-variants.mjs` from the
 * kit's files; rerun it when the kit or a map changes.
 */
export const TOWN_VARIANTS: Record<TownTexture, readonly TownPiece[]> = {
  "variation-a": [
    "banner-green",
    "banner-red",
    "roof",
    "roof-corner",
    "roof-corner-inner",
    "roof-corner-round",
    "roof-flat",
    "roof-gable",
    "roof-gable-detail",
    "roof-gable-end",
    "roof-gable-top",
    "roof-high",
    "roof-high-corner",
    "roof-high-corner-round",
    "roof-high-cornerinner",
    "roof-high-flat",
    "roof-high-gable",
    "roof-high-gable-detail",
    "roof-high-gable-end",
    "roof-high-gable-top",
    "roof-high-left",
    "roof-high-point",
    "roof-high-right",
    "roof-high-window",
    "roof-left",
    "roof-point",
    "roof-right",
    "roof-window",
    "stall-green",
    "stall-red",
  ],
};
