import { FANTASY_TOWN_PIECES } from "../fantasy-town";
import { isNaturePiece, type KitPiece } from "../kit";
import { NATURE_KIT_PIECES } from "../nature-kit";

/** The palette's groups, in the order it lists them: what a piece is for, read from its name, whichever kit it is from. */
export const GROUPS = [
  "walls",
  "timber walls",
  "roofs",
  "building parts",
  "stairs",
  "paving",
  "water",
  "hedges and fences",
  "trees",
  "plants",
  "crops",
  "rocks",
  "cliffs",
  "ground",
  "bridges and paths",
  "mills",
  "things",
] as const;
export type Group = (typeof GROUPS)[number];

/** Each group by the starts of its pieces' names; the first that matches a piece is its group. */
const BY_NAME: readonly (readonly [Group, readonly string[]])[] = [
  ["timber walls", ["wall-wood"]],
  ["walls", ["wall"]],
  ["roofs", ["roof"]],
  ["building parts", ["balcony", "chimney", "overhang", "pillar", "planks", "poles", "banner"]],
  ["stairs", ["stairs"]],
  ["paving", ["road"]],
  ["water", ["fountain", "ground_river", "lily"]],
  ["hedges and fences", ["hedge", "fence"]],
  ["trees", ["tree"]],
  ["plants", ["plant_", "grass", "flower", "mushroom", "hanging_moss", "cactus"]],
  ["crops", ["crop"]],
  ["rocks", ["rock", "stone_"]],
  ["cliffs", ["cliff"]],
  ["ground", ["ground_", "platform"]],
  ["bridges and paths", ["bridge", "path_"]],
  ["mills", ["windmill", "watermill", "wheel", "blade"]],
];

export function groupOf(piece: KitPiece): Group {
  return BY_NAME.find(([, starts]) => starts.some((start) => piece.startsWith(start)))?.[0] ?? "things";
}

/** Every piece of both kits, by group, each group's pieces in name order. */
export const PALETTE: readonly { group: Group; pieces: readonly KitPiece[] }[] = GROUPS.map((group) => ({
  group,
  pieces: [...FANTASY_TOWN_PIECES, ...NATURE_KIT_PIECES].filter((piece) => groupOf(piece) === group).sort(),
}));

/** Which kit a piece is from, for the palette's mark beside it. */
export const kitOf = (piece: KitPiece): "town" | "nature" => (isNaturePiece(piece) ? "nature" : "town");

/** Pieces whose names hold every word of a search, in any order: "wood door" finds `wall-wood-door`. */
export function matches(piece: KitPiece, search: string): boolean {
  const name = piece.toLowerCase();
  return search
    .toLowerCase()
    .split(/[\s_-]+/)
    .every((word) => name.includes(word));
}
