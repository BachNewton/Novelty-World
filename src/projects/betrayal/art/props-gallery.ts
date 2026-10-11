/*
 * What the props gallery (`?bench=props`) shows, apart from how it draws it:
 * every kit piece, with a few of its variants, and every prop of every room,
 * each with its name and where it comes from; the grid they are laid out on;
 * and the pieces from different places that look like one piece built twice.
 */
import * as THREE from "three";
import { candelabra, candle, chamberstick, lantern } from "./kit/candles";
import { cobweb } from "./kit/cobweb";
import { pictureFrame, rug, windowPool } from "./kit/decor";
import { chair, table } from "./kit/furniture";
import { pawn } from "./kit/pawn";
import { pitHaze, pitShell } from "./kit/pit";
import { coil, slung } from "./kit/rope";
import { cask, crate } from "./kit/stores";
import { trunk } from "./kit/trunk";
import { solidLathe, vessel } from "./kit/vessel";
import { waterRectangle, waterSurface } from "./kit/water";
import { pieceName, type PropPlacement, type RoomDefinition } from "./room";
import { BENCH_ROOMS } from "./rooms";
import { PICTURE_LIBRARY } from "./rooms/picture-library";
import { batch, flat, group } from "./shapes";
import { roomTile } from "./stage";

/** Where a piece comes from: a file in the kit, or one room's props (by its place in them). */
export type GallerySource = { kind: "kit"; file: string } | { kind: "room"; id: string; index: number };

export interface GalleryEntry {
  key: string;
  /** Its own name; null for a room's prop that has none, which the gallery labels by what it turns out to be. */
  name: string | null;
  source: GallerySource;
  build: () => THREE.Object3D;
}

/** The kit files that build no piece of their own: the picture data, and the
 *  blocks of wall a room stands inside its tile, which are structure. */
export const KIT_FILES_WITHOUT_PIECES = ["index.ts", "pictures.ts", "wall-mass.ts"];

/** A rope slung between two posts' heights, as a room slings one into a batch. */
function slungRope(): THREE.Object3D {
  const b = batch();
  slung(b, new THREE.Vector3(-0.6, 0.8, 0), new THREE.Vector3(0.6, 0.8, 0), 0.25);
  return group(b.mesh());
}

const SMALL_POOL: [number, number] = [-0.6, 0.6];

const KIT_PIECES: { file: string; name: string; build: () => THREE.Object3D }[] = [
  { file: "candles.ts", name: "candle", build: () => candle() },
  { file: "candles.ts", name: "candle, tall", build: () => candle({ height: 0.35 }) },
  { file: "candles.ts", name: "candelabra", build: () => candelabra() },
  { file: "candles.ts", name: "candelabra, five arms", build: () => candelabra({ arms: 5 }) },
  { file: "candles.ts", name: "chamberstick", build: () => chamberstick() },
  { file: "candles.ts", name: "lantern", build: () => lantern() },
  { file: "cobweb.ts", name: "cobweb, slung", build: () => cobweb({ form: "slung" }) },
  { file: "cobweb.ts", name: "cobweb, fan", build: () => cobweb({ form: "fan" }) },
  { file: "furniture.ts", name: "table", build: () => table() },
  { file: "furniture.ts", name: "table, with a runner", build: () => table({ runner: "blood" }) },
  { file: "furniture.ts", name: "chair", build: () => chair() },
  { file: "furniture.ts", name: "chair, no cushion", build: () => chair({ cushion: null }) },
  { file: "decor.ts", name: "rug", build: () => rug() },
  { file: "decor.ts", name: "picture frame, oval", build: () => pictureFrame({ picture: "whiskered gentleman" }) },
  { file: "decor.ts", name: "picture frame", build: () => pictureFrame({ picture: "house on its hill" }) },
  { file: "decor.ts", name: "window pool", build: () => windowPool() },
  { file: "pawn.ts", name: "pawn", build: () => pawn() },
  { file: "pit.ts", name: "pit shell", build: () => pitShell({ x: SMALL_POOL, z: SMALL_POOL, bottom: -1.2 }) },
  { file: "pit.ts", name: "pit haze", build: () => pitHaze({ x: SMALL_POOL, z: SMALL_POOL, y: 0.02, colour: "wraith", opacity: 0.6 }) },
  { file: "rope.ts", name: "coil", build: () => coil() },
  { file: "rope.ts", name: "rope, slung", build: slungRope },
  { file: "stores.ts", name: "crate", build: () => crate() },
  { file: "stores.ts", name: "cask", build: () => cask() },
  { file: "stores.ts", name: "cask, no lid", build: () => cask({ lid: false }) },
  { file: "trunk.ts", name: "trunk", build: () => trunk() },
  { file: "trunk.ts", name: "trunk, open", build: () => trunk({ open: 1.1 }) },
  {
    file: "vessel.ts",
    name: "vessel (a goblet)",
    build: () => vessel([[0.04, 0], [0.04, 0.01], [0.008, 0.02], [0.008, 0.08], [0.035, 0.1], [0.045, 0.16]], flat("brass"), { wall: 0.005, depth: 0.05, sides: 8 }),
  },
  {
    file: "vessel.ts",
    name: "solid lathe (a decanter)",
    build: () => solidLathe([[0.07, 0], [0.08, 0.04], [0.07, 0.12], [0.025, 0.17], [0.022, 0.24], [0.035, 0.26], [0, 0.27]], flat("bloodDark"), 8),
  },
  { file: "water.ts", name: "water", build: () => waterSurface({ outline: waterRectangle(SMALL_POOL, SMALL_POOL), height: 0 }) },
];

/** A room's blocks of wall standing inside its tile (`wallMass`, `crossCorners`), named after where they stand: the shell's, not props. */
const STRUCTURE = /(corner|niches)( above)?$/;

export function isStructure(prop: PropPlacement): boolean {
  return STRUCTURE.test(pieceName(prop));
}

/** The rooms the gallery takes props from: every bench room, and the picture library. */
export const GALLERY_ROOMS: readonly RoomDefinition[] = [...BENCH_ROOMS, PICTURE_LIBRARY];

export function roomEntries(def: RoomDefinition): GalleryEntry[] {
  return def.props.flatMap((prop, index) => {
    if (isStructure(prop)) return [];
    const name = pieceName(prop);
    return [{ key: `room:${def.id}:${index}`, name: name === "prop" ? null : name, source: { kind: "room", id: def.id, index }, build: prop.build }];
  });
}

export function galleryEntries(): GalleryEntry[] {
  return [
    ...KIT_PIECES.map(({ file, name, build }) => ({ key: `kit:${name}`, name, source: { kind: "kit", file } as const, build })),
    ...GALLERY_ROOMS.flatMap(roomEntries),
  ];
}

/** What a source is called, as the gallery labels and groups it. */
export function sourceLabel(source: GallerySource): string {
  if (source.kind === "kit") return `kit/${source.file}`;
  return source.id === PICTURE_LIBRARY.id ? "Picture library" : roomTile(source.id).name;
}

/** The group a source falls in: `kit`, or the room's id. */
export function sourceGroup(source: GallerySource): string {
  return source.kind === "kit" ? "kit" : source.id;
}

/** A built piece's size (its bounds, from the floor up) and how many vertices it has, which tells apart pieces built by different code. */
export interface PieceShape {
  size: [x: number, y: number, z: number];
  vertices: number;
}

export function shapeOf(object: THREE.Object3D): PieceShape {
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  let vertices = 0;
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) vertices += (child.geometry as THREE.BufferGeometry).getAttribute("position").count;
  });
  return { size: [size.x, size.y, size.z], vertices };
}

/** Words that say where a piece stands or which of a pair it is, never what it is. */
const PLACE_WORDS = new Set(["left", "right", "top", "bottom", "above", "below", "cut", "wall", "the", "to", "of", "on", "a"]);

/** The last word of a name that says what the piece is, singular and lower case ("ritualCandle" is "candle", "slot shaft left" is "shaft"):
 *  what follows a comma or a bracket names a variant ("chair, no cushion"), so it is left out. */
export function nameWord(name: string): string {
  const words = name
    .split(/[,(]/)[0]
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 0 && !PLACE_WORDS.has(word));
  const last = words.at(-1) ?? name.toLowerCase();
  return last.length > 3 && last.endsWith("s") && !last.endsWith("ss") ? last.slice(0, -1) : last;
}

/** Sizes within this share of each other, on every side, count as alike. */
export const DUPLICATE_TOLERANCE = 0.35;
/** Sides closer than this (in metres) are alike whatever their share: a flat piece's thickness. */
const THIN = 0.03;

/** Whether two sizes are alike side for side, either way round on the floor (a toppled chair is still a chair). */
export function similarSize(a: PieceShape["size"], b: PieceShape["size"], tolerance = DUPLICATE_TOLERANCE): boolean {
  const sorted = (size: PieceShape["size"]) => [...size].sort((p, q) => p - q);
  const [sa, sb] = [sorted(a), sorted(b)];
  return sa.every((side, i) => Math.abs(side - sb[i]) <= Math.max(THIN, tolerance * Math.max(side, sb[i])));
}

export interface ShapedPiece {
  key: string;
  /** The name it is grouped by. */
  name: string;
  /** Its group: `kit` or the room's id. */
  group: string;
  shape: PieceShape;
}

export interface DuplicateGroup {
  word: string;
  keys: string[];
}

/**
 * Pieces that may be one piece built twice: their names end in the same word,
 * their sizes are alike, they come from more than one place, and they are not
 * all one geometry (pieces with the same vertex count are taken to be the same
 * builder, already shared). Of the pieces with one geometry, the first
 * stands for the rest. Largest groups first.
 */
export function possibleDuplicates(pieces: readonly ShapedPiece[]): DuplicateGroup[] {
  const clusters: { word: string; seed: ShapedPiece; members: ShapedPiece[] }[] = [];
  for (const piece of pieces) {
    const word = nameWord(piece.name);
    const cluster = clusters.find((each) => each.word === word && similarSize(each.seed.shape.size, piece.shape.size));
    if (cluster) cluster.members.push(piece);
    else clusters.push({ word, seed: piece, members: [piece] });
  }
  return clusters
    .map(({ word, members }) => {
      const seen = new Set<number>();
      const distinct = members.filter(({ shape }) => {
        if (seen.has(shape.vertices)) return false;
        seen.add(shape.vertices);
        return true;
      });
      return { word, members: distinct };
    })
    .filter(({ members }) => new Set(members.map((piece) => piece.group)).size > 1 && new Set(members.map((piece) => piece.shape.vertices)).size > 1)
    .sort((a, b) => b.members.length - a.members.length)
    .map(({ word, members }) => ({ word, keys: members.map((piece) => piece.key) }));
}

/** The kit piece a built piece is, when it has the same geometry and size: how an unnamed room prop is named. */
export function kitMatch(shape: PieceShape, kit: readonly { name: string; shape: PieceShape }[]): string | null {
  return kit.find((piece) => piece.shape.vertices === shape.vertices && similarSize(piece.shape.size, shape.size, 0))?.name ?? null;
}

export interface LayoutSection {
  title: string;
  items: { key: string; width: number; depth: number }[];
}

export interface GalleryLayout {
  /** Each piece's centre on the floor. */
  at: Map<string, [x: number, z: number]>;
  /** Where each section's title stands: before its first row. */
  titles: { title: string; at: [x: number, z: number] }[];
  /** The floor the pieces cover. */
  bounds: { x: [number, number]; z: [number, number] };
}

/** Space between pieces in a row, and the least room a piece is given across, for its label. */
const GAP = 0.4;
const MIN_WIDTH = 1;
/** Space between rows, for the labels under the row in front. */
const ROW_GAP = 0.9;
/** Space before a section's first row, for its title. */
const SECTION_GAP = 1.4;

/** Lays the sections out in rows across the floor, front to back, each piece in a row as wide as it needs. */
export function shelfLayout(sections: readonly LayoutSection[], rowWidth: number): GalleryLayout {
  const at = new Map<string, [number, number]>();
  const titles: GalleryLayout["titles"] = [];
  let z = 0;
  let widest = 0;
  for (const { title, items } of sections) {
    if (items.length === 0) continue;
    z += SECTION_GAP;
    titles.push({ title, at: [0, z - SECTION_GAP / 2] });
    let x = 0;
    let rowDepth = 0;
    let row: { key: string; width: number; depth: number }[] = [];
    const closeRow = () => {
      for (const item of row) {
        const [left] = at.get(item.key) ?? [0];
        at.set(item.key, [left, z + rowDepth / 2]);
      }
      z += rowDepth + ROW_GAP;
      widest = Math.max(widest, x - GAP);
      row = [];
      x = 0;
      rowDepth = 0;
    };
    for (const item of items) {
      const width = Math.max(item.width, MIN_WIDTH);
      if (row.length > 0 && x + width > rowWidth) closeRow();
      at.set(item.key, [x + width / 2, 0]);
      row.push(item);
      x += width + GAP;
      rowDepth = Math.max(rowDepth, item.depth);
    }
    closeRow();
  }
  return { at, titles, bounds: { x: [0, widest], z: [0, z] } };
}
