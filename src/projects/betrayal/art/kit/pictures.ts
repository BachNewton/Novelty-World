import type { PixelLegend } from "../textures";

/*
 * The pictures on the house's walls: Victorian silhouettes, black profiles
 * cut against a pale ground (or a few pale against a dark one, moonlit), at
 * the walls' own pixel density. A silhouette reads at a dozen pixels and
 * from across the room, where a painted face can't. A room hangs one by name
 * with `pictureFrame` (`decor.ts`); no two on one floor are the same.
 */

export interface Picture {
  /** What a room picks it by, and what the test checks repeats by. */
  name: string;
  /** An oval picture is masked to an oval and framed with an oval moulding. */
  shape: "oval" | "rect";
  rows: readonly string[];
  legend: PixelLegend;
}

/** Black cut paper on a pale ground. */
const CUT: PixelLegend = { o: "bone", "#": "soot" };
/** A pale figure on the dark of the night. */
const MOONLIT: PixelLegend = { o: "moonDark", "#": "boneLight" };
/** A black scene against a moonlit sky, its moon pale. */
const NIGHT: PixelLegend = { o: "moon", "#": "soot", m: "boneLight" };

/** The rows turned to face the other way. */
function mirrored(rows: readonly string[]): string[] {
  return rows.map((row) => [...row].reverse().join(""));
}

/** Two halves side by side, row by row. */
function beside(left: readonly string[], right: readonly string[]): string[] {
  return left.map((row, y) => row + right[y]);
}

/** The rows with every row above `below` left as bare ground. */
function cleared(rows: readonly string[], below: number): string[] {
  return rows.map((row, y) => (y < below ? "o".repeat(row.length) : row));
}

const GENTLEMAN = [
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "ooooooo#####oooooo",
  "oooooo#######ooooo",
  "ooooo#########oooo",
  "oooo##########oooo",
  "oooooo########oooo",
  "ooooo#########oooo",
  "oooo##########oooo",
  "ooo###########oooo",
  "ooooo#########oooo",
  "oooo##########oooo",
  "ooooo#########oooo",
  "ooo##########ooooo",
  "oooo########oooooo",
  "oooooo######oooooo",
  "oooooo#######ooooo",
  "ooooo#########oooo",
  "ooo############ooo",
  "oo##############oo",
  "o################o",
  "##################",
];

const LADY = mirrored([
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "ooooooo#####oooooo",
  "oooooo#######ooooo",
  "ooooo#########oooo",
  "ooooo#########oooo",
  "ooooo#########oooo",
  "ooooo#########oooo",
  "oooo##########oooo",
  "ooo############ooo",
  "ooooo###########oo",
  "oooo############oo",
  "ooooo##########ooo",
  "oooooo#######ooooo",
  "ooooooo#####oooooo",
  "ooooooo#####oooooo",
  "ooooooo#####oooooo",
  "oooooo#######ooooo",
  "oooo###########ooo",
  "oo##############oo",
  "o################o",
  "##################",
]);

const CHILD = [
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "oooooooo#####ooooo",
  "ooooooo########ooo",
  "oooooo##########oo",
  "ooooo###########oo",
  "ooooo###########oo",
  "oooo############oo",
  "ooooo############o",
  "ooooo###########oo",
  "oooooo#######o###o",
  "oooooooo####oo##oo",
  "oooooooo####ooo##o",
  "oooooo########oooo",
  "oooo############oo",
  "ooo##############o",
  "oo################",
  "o#################",
  "##################",
];

const OLD_WOMAN = mirrored([
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "ooooooo######ooooo",
  "ooooo##########ooo",
  "oooo############oo",
  "oooo############oo",
  "ooo#############oo",
  "oooo############oo",
  "oooooo##########oo",
  "ooooo##########ooo",
  "oooo###########ooo",
  "ooo############ooo",
  "ooooo##########ooo",
  "oooooo########oooo",
  "oooo##########oooo",
  "oooooo#######ooooo",
  "ooooooo#######oooo",
  "ooooooo#######oooo",
  "ooooo##########ooo",
  "oooo#############o",
  "ooo###############",
  "oo################",
  "o#################",
]);

const TOP_HAT = [
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "oooooo#######ooooo",
  "ooooooo#####oooooo",
  "ooooooo#####oooooo",
  "ooooooo#####oooooo",
  "ooooooo#####oooooo",
  "ooooooo#####oooooo",
  "oooo###########ooo",
  "ooooo#########oooo",
  "oooooo########oooo",
  "oooo##########oooo",
  "ooo##########ooooo",
  "ooooo########ooooo",
  "ooooo########ooooo",
  "ooooo#######oooooo",
  "oooooo######oooooo",
  "ooooooo#####oooooo",
  "oooooo#######ooooo",
  "ooooo#########oooo",
  "ooo#############oo",
  "oo###############o",
  "o#################",
  "##################",
];

/** The couple's halves, each facing left. */
const HUSBAND = [
  "ooooooooooooo",
  "ooooooooooooo",
  "ooooo####oooo",
  "oooo######ooo",
  "ooo########oo",
  "oo#########oo",
  "ooo########oo",
  "oo#########oo",
  "o#########ooo",
  "ooo#######ooo",
  "oo########ooo",
  "ooo#######ooo",
  "oooo#####oooo",
  "ooooo####oooo",
  "oooo######ooo",
  "oo##########o",
  "o############",
  "#############",
];

const WIFE = [
  "ooooooooooooo",
  "ooooooooooooo",
  "ooooo####oooo",
  "oooo######ooo",
  "ooo########oo",
  "ooo########oo",
  "ooo########oo",
  "oo#########oo",
  "ooo#########o",
  "oo##########o",
  "ooo########oo",
  "oooo#####oooo",
  "ooooo####oooo",
  "ooooo####oooo",
  "oooo######ooo",
  "oo##########o",
  "o############",
  "#############",
];

/** A head and shoulders seen from the front, the ground showing through its eyes. */
const FACING = [
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "oooooooooooooooooo",
  "ooooooo####ooooooo",
  "oooooo######oooooo",
  "ooooo########ooooo",
  "ooooo########ooooo",
  "ooooo##o##o##ooooo",
  "oooo##########oooo",
  "ooooo########ooooo",
  "ooooo########ooooo",
  "oooooo######oooooo",
  "ooooooo####ooooooo",
  "ooooooo####ooooooo",
  "oooooo######oooooo",
  "oooo##########oooo",
  "ooo############ooo",
  "oo##############oo",
  "o################o",
  "##################",
  "##################",
  "##################",
  "##################",
];

const MOON_TREE = [
  "oooooooooooooooooooooooo",
  "oooooooooooooooommmmoooo",
  "oo#ooooooo#oooommmmmmooo",
  "ooo#oooo#ooo#ommmmmmmmoo",
  "oooo#ooo#oo#oom#mmmmmmoo",
  "o#ooo#oo#o#ooo#mmmmmmmoo",
  "oo#ooo#o###o##mmmmmmmooo",
  "ooo##oo####o#ooommmmoooo",
  "ooooo#####oooooooooooooo",
  "oooooo####oooooooooooooo",
  "oooooo####oooooooooooooo",
  "oooooo####oooooooooooooo",
  "ooooo######ooooooooooooo",
  "ooo###########oooooooooo",
  "o#################oooooo",
  "########################",
];

const HOUSE = [
  "oooooooooooooooooooooooo",
  "oooooooooooo#ooooooooooo",
  "ooooooooooo###oooooooooo",
  "ooooooooooo###oooooooooo",
  "oooooooooo#####ooooooooo",
  "o#o#oooooo##o##ooooooooo",
  "oo#oooo#oo#####oooo#oooo",
  "oo#ooo###o#####ooo###ooo",
  "oo#oo#################oo",
  "oo#oo##o##o####o##o###oo",
  "oo#oo#################oo",
  "oo#####################o",
  "o#######################",
  "########################",
  "########################",
  "########################",
];

const SHIP = [
  "oooooooooooo#ooooooooooo",
  "oooooo#ooooo#ooooo#ooooo",
  "ooooo###ooo###ooo###oooo",
  "ooooo###ooo###ooo###oooo",
  "oooooo#ooooo#ooooo#o#ooo",
  "oooo#####o#####o#####ooo",
  "oooo#####o#####o######oo",
  "oooo#####o#####o#######o",
  "oooooo#ooooo#ooooo#ooooo",
  "oo#####################o",
  "ooo###################oo",
  "oooo#################ooo",
  "o##oo##oo##oo##oo##oo##o",
  "#oo##oo##oo##oo##oo##oo#",
  "oooooooooooooooooooooooo",
  "oo#ooooo#ooooo#ooooo#ooo",
];

const HUNT = [
  "oooooooo##oooooooooooooo",
  "oooooooo##oooooooooooooo",
  "ooooooo####ooooooooooooo",
  "oooooooo##ooooooo#oooooo",
  "ooooooo####ooooo###ooooo",
  "oooooo#####oooo#####oooo",
  "ooooooo###oooo###oo##ooo",
  "##oooo#########ooooooooo",
  "oo###############ooooooo",
  "oooo############oooooooo",
  "ooooo##########oooooo##o",
  "oooo##ooooooo###oo#####o",
  "oo##ooooooooooo##o#ooo##",
  "##ooooooooooooooo#ooooo#",
  "oooooooooooooooooooooooo",
  "########################",
];

const WILLOW = [
  "oooooo#####ooooooooooooo",
  "ooo###########oooooooooo",
  "o###############oooooooo",
  "#################ooooooo",
  "####o##o##o##o###ooooooo",
  "##o#o#oo##oo#o###ooooooo",
  "#o#o#ooo##ooo#o##ooo#ooo",
  "#o#ooooo#oooo#o#ooo###oo",
  "#o#ooooo#oooooo#oooo#ooo",
  "o#oooooo#ooooooo#ooo#ooo",
  "o#oooooo#ooooooo#ooo#ooo",
  "ooooooo##ooooooooooo#ooo",
  "oooooo####ooooooo#######",
  "########################",
  "########################",
  "########################",
];

const LIBRARY = {
  "whiskered gentleman": { shape: "oval", rows: GENTLEMAN, legend: CUT },
  "lady with a bun": { shape: "oval", rows: LADY, legend: CUT },
  child: { shape: "oval", rows: CHILD, legend: MOONLIT },
  "old woman in a bonnet": { shape: "oval", rows: OLD_WOMAN, legend: CUT },
  "man in a top hat": { shape: "rect", rows: TOP_HAT, legend: CUT },
  "stern couple": { shape: "rect", rows: beside(mirrored(HUSBAND), WIFE), legend: CUT },
  "moon through a bare tree": { shape: "rect", rows: MOON_TREE, legend: NIGHT },
  "house on its hill": { shape: "rect", rows: HOUSE, legend: CUT },
  ship: { shape: "rect", rows: SHIP, legend: MOONLIT },
  hunt: { shape: "rect", rows: HUNT, legend: CUT },
  "willow over a grave": { shape: "rect", rows: WILLOW, legend: CUT },
  // Haunted: a picture someone knows, gone wrong.
  "couple, one turned away": { shape: "rect", rows: beside(mirrored(HUSBAND), mirrored(WIFE)), legend: CUT },
  "empty oval": { shape: "oval", rows: cleared(GENTLEMAN, GENTLEMAN.length), legend: CUT },
  "headless gentleman": { shape: "oval", rows: cleared(GENTLEMAN, 17), legend: CUT },
  "turned to face you": { shape: "oval", rows: FACING, legend: CUT },
} satisfies Record<string, Omit<Picture, "name">>;

export type PictureName = keyof typeof LIBRARY;

export const PICTURE_NAMES = Object.keys(LIBRARY) as PictureName[];

/** The library's picture of that name. */
export function picture(name: PictureName): Picture {
  return { name, ...LIBRARY[name] };
}

/** A picture's rows as they are drawn: an oval one's corners left clear ("."). */
export function pictureRows({ shape, rows }: Picture): readonly string[] {
  if (shape === "rect") return rows;
  const rx = rows[0].length / 2;
  const ry = rows.length / 2;
  return rows.map((row, y) => [...row].map((cell, x) => (((x + 0.5 - rx) / rx) ** 2 + ((y + 0.5 - ry) / ry) ** 2 <= 1 ? cell : ".")).join(""));
}
