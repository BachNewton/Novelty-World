import { FANTASY_TOWN_PIECES, TOWN_TEXTURES, type TownTexture } from "../fantasy-town";
import { isNaturePiece, type KitPiece } from "../kit";
import { NATURE_KIT_PIECES } from "../nature-kit";
import { TOWN_VARIANTS } from "../town-variants";

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

/** A choice in the palette: a piece, and for a town piece another colour map changes, the piece in that map. */
export interface PaletteEntry {
  piece: KitPiece;
  texture?: TownTexture;
}

/** How each colour map marks a piece in it, after the piece's own name: `roof-high` and `roof-high` A. */
export const TEXTURE_MARK: Record<TownTexture, string> = { "variation-a": "A" };

/** An entry's name, unique in the palette: its piece, and its colour map where it has one. */
export const entryName = ({ piece, texture }: PaletteEntry): string => (texture === undefined ? piece : `${piece} ${texture}`);

/** A piece's entries: the piece, then the piece in each colour map that changes it. */
function entriesOf(piece: KitPiece): PaletteEntry[] {
  return [{ piece }, ...TOWN_TEXTURES.filter((texture) => TOWN_VARIANTS[texture].some((changed) => changed === piece)).map((texture) => ({ piece, texture }))];
}

/** Every piece of both kits, by group, each group's pieces in name order, each followed by its other colours. */
export const PALETTE: readonly { group: Group; entries: readonly PaletteEntry[] }[] = GROUPS.map((group) => ({
  group,
  entries: [...FANTASY_TOWN_PIECES, ...NATURE_KIT_PIECES]
    .filter((piece) => groupOf(piece) === group)
    .sort()
    .flatMap(entriesOf),
}));

/** Which kit a piece is from, for the palette's mark beside it. */
export const kitOf = (piece: KitPiece): "town" | "nature" => (isNaturePiece(piece) ? "nature" : "town");

/** Entries whose names hold every word of a search, in any order: "wood door" finds `wall-wood-door`, and "variation" a piece in another colour map. */
export function matches(entry: PaletteEntry, search: string): boolean {
  const name = entryName(entry).toLowerCase();
  return search
    .toLowerCase()
    .split(/[\s_-]+/)
    .every((word) => name.includes(word));
}
