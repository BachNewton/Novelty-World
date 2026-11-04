import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, type Mesh, type MeshBasicNodeMaterial } from "three/webgpu";
import { placeSigns, type Placement, type SignPlacement } from "../roadside/material";
import type { RoadsideModel } from "../roadside/models";
import { TownPainted, townModel } from "./paint";

/*
 * Name signs: a street's blades on a corner post, and a village's board. Names are the one thing geometry can't say: a
 * name plate draws through `namePlateMaterial`, each instance with its own cell of a sheet drawn on a canvas, for only
 * the names it's given. A road sign that says something else is the real one, `art/surfaces`' Traficom plates.
 */

const SINK_M = 0.5;
const POST_R = 0.03;

/** A street-name blade, along +x from its origin at the post. */
export const STREET_PLATE = { wideM: 0.9, tallM: 0.18 } as const;
/** A village's board, its origin between the posts. */
export const VILLAGE_PLATE = { wideM: 2, tallM: 0.5 } as const;
const VILLAGE_BOARD_LOW_M = 1.35;
/** The height of the middle of a village sign's board above the frame's foot. */
export const VILLAGE_PLATE_Y_M = VILLAGE_BOARD_LOW_M + VILLAGE_PLATE.tallM / 2;

export interface NameSheet {
  texture: CanvasTexture;
  /** A name's cell, for a plate's instance: left, bottom, width, height, in the sheet's uv. */
  cell: (name: string) => SignPlacement["cell"];
}

const CELL_PADDING = 0.08;
/** The largest side a texture is sure to have on WebGPU. */
const SHEET_MOST_PX = 8192;

/**
 * Every name in `names` on one sheet, white on the plate's blue, in cells `cellWidePx` wide, laid out near square so
 * neither side runs out first. `aspect` is a cell's width over its height, the plate's own, so nothing stretches.
 * `ink` turns a token's name into a CSS colour. With no names it's one blank cell, for a list with nothing to show.
 */
export function createNameSheet(names: readonly string[], aspect: number, ink: (token: string) => string, cellWidePx = 256): NameSheet {
  const cellWide = cellWidePx;
  const cellTall = Math.round(cellWide / aspect);
  const columns = Math.max(1, Math.ceil(Math.sqrt((names.length * cellTall) / cellWide)));
  const rows = Math.max(1, Math.ceil(names.length / columns));
  if (columns * cellWide > SHEET_MOST_PX || rows * cellTall > SHEET_MOST_PX) throw new Error(`${names.length} names don't fit one sheet`);
  const canvas = document.createElement("canvas");
  canvas.width = columns * cellWide;
  canvas.height = rows * cellTall;
  const pen = canvas.getContext("2d");
  if (pen === null) throw new Error("no 2D canvas for the name sheet");
  pen.fillStyle = ink("plate-blue");
  pen.fillRect(0, 0, canvas.width, canvas.height);
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  const cells = new Map(names.map((name, index) => {
    const [column, row] = [index % columns, Math.floor(index / columns)];
    const [x, y] = [column * cellWide, row * cellTall];
    const inset = Math.round(cellTall * CELL_PADDING);
    pen.strokeStyle = ink("wall-trim");
    pen.lineWidth = Math.max(2, cellTall * 0.04);
    pen.strokeRect(x + inset, y + inset, cellWide - inset * 2, cellTall - inset * 2);
    const fit = cellWide - inset * 6;
    const largest = Math.round(cellTall * 0.58);
    pen.font = `600 ${largest}px sans-serif`;
    // Text's width scales with its size, so one measure fits it.
    pen.font = `600 ${Math.min(largest, Math.floor((largest * fit) / pen.measureText(name).width))}px sans-serif`;
    pen.fillStyle = ink("wall-trim");
    pen.fillText(name, x + cellWide / 2, y + cellTall / 2 + cellTall * 0.03);
    return [name, [column / columns, 1 - (row + 1) / rows, 1 / columns, 1 / rows] as const] as const;
  }));
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  return {
    texture,
    cell: (name) => {
      const found = cells.get(name);
      if (found === undefined) throw new Error(`no name "${name}" on this sheet`);
      return found;
    },
  };
}

/** A plate readable from both sides, along +x from `fromX`: for a blade on a post, or on a wall. */
function namePlate(fromX: number, wideM: number, tallM: number): TownPainted {
  const [left, right, half] = [fromX, fromX + wideM, tallM / 2];
  const cell = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
  return new TownPainted()
    .face([[left, -half, 0.012], [right, -half, 0.012], [right, half, 0.012], [left, half, 0.012]], "name-face", 1, cell)
    .face([[right, -half, -0.012], [left, -half, -0.012], [left, half, -0.012], [right, half, -0.012]], "name-face", 1, cell)
    .face([[left, half, 0.012], [right, half, 0.012], [right, half, -0.012], [left, half, -0.012]], "plate-back")
    .face([[left, -half, 0.012], [right, -half, 0.012], [right, -half, -0.012], [left, -half, -0.012]], "plate-back");
}

/** A street name's blade: draws through `placeNamePlates`. Gone by 200 m, where it's a blue dash of a pixel. */
export function buildStreetNamePlate(): RoadsideModel {
  return townModel(namePlate(0, STREET_PLATE.wideM, STREET_PLATE.tallM), null, 200, 200);
}

/** The board on a village's sign: draws through `placeNamePlates`. */
export function buildVillagePlate(): RoadsideModel {
  return townModel(namePlate(-VILLAGE_PLATE.wideM / 2, VILLAGE_PLATE.wideM, VILLAGE_PLATE.tallM), null, 320, 320);
}

/** Plates at their places, each with its name's cell. */
export function placeNamePlates(model: RoadsideModel, sheet: NameSheet, places: readonly (Placement & { name: string })[], material: MeshBasicNodeMaterial): Mesh {
  return placeSigns(model, places.map((place) => ({ ...place, cell: sheet.cell(place.name) })), material);
}

/** The bare post a street's blades go on, at the corner of a junction. */
export function buildStreetNamePost(): RoadsideModel {
  const top = 3.1;
  const near = new TownPainted().tube([0, -SINK_M, 0], [0, top, 0], POST_R + 0.008, 5, { radiusTo: POST_R, cap: true }, "galvanised");
  const far = new TownPainted().tube([0, -SINK_M, 0], [0, top, 0], 0.05, 3, {}, "galvanised");
  return townModel(near, far, 60, 260);
}

/** The heights blades sit at on that post. */
export const STREET_BLADE_Y_M = [2.88, 2.66] as const;

/** A junction's blades on its post: one along each road, reading from the street. */
export function bladesOnPost({ x, y, z }: { x: number; y: number; z: number }, roads: readonly { name: string; yaw: number }[]): (Placement & { name: string })[] {
  return roads.slice(0, STREET_BLADE_Y_M.length).map(({ name, yaw }, index) => ({ x, y: y + STREET_BLADE_Y_M[index], z, yaw, name }));
}

/** The frame of a village's sign: two tarred posts, a white frame and a little red hood. Its name is a `buildVillagePlate` at `VILLAGE_PLATE_Y_M`. */
export function buildVillageSign(): RoadsideModel {
  const half = VILLAGE_PLATE.wideM / 2;
  const [low, high] = [VILLAGE_BOARD_LOW_M, VILLAGE_BOARD_LOW_M + VILLAGE_PLATE.tallM];
  const hood = (into: TownPainted, reach: number) => {
    const [eaves, ridge] = [high + 0.14, high + 0.46];
    return into
      .face([[-half - reach, eaves, 0.34], [half + reach, eaves, 0.34], [half + reach, ridge, 0], [-half - reach, ridge, 0]], "roof-red", 1.02)
      .face([[-half - reach, eaves, -0.34], [half + reach, eaves, -0.34], [half + reach, ridge, 0], [-half - reach, ridge, 0]], "roof-red", 0.95);
  };
  const near = new TownPainted();
  for (const x of [-half - 0.1, half + 0.1]) near.box([x - 0.07, -SINK_M, -0.07], [x + 0.07, high + 0.22, 0.07], "post-wood", { open: true, shadeTop: 1.1 });
  hood(near, 0.32)
    .box([-half - 0.03, high, -0.05], [half + 0.03, high + 0.06, 0.05], "board-white", { open: true })
    .box([-half - 0.03, low - 0.06, -0.05], [half + 0.03, low, 0.05], "board-white", { open: true });
  const far = hood(new TownPainted(), 0.3)
    .box([-half - 0.1, -SINK_M, -0.08], [half + 0.1, low, 0.08], "post-wood", { open: true })
    .face([[-half, low, 0], [half, low, 0], [half, high, 0], [-half, high, 0]], "plate-blue");
  return townModel(near, far, 320, 900);
}
