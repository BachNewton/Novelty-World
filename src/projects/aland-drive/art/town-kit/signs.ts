import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, type Mesh, type MeshBasicNodeMaterial } from "three/webgpu";
import { placeSigns, type Placement, type SignPlacement } from "../roadside/material";
import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { TownPainted, townModel, uprightRing } from "./paint";

/*
 * Signs on poles. The pictorial ones are cut from geometry, so they stay opaque and sharp with no sheet of their own.
 * Names are the one thing geometry can't say: a name plate draws through `namePlateMaterial`, each instance with its
 * own cell of a sheet drawn on a canvas when the game starts, for only the names it's given.
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

const SHEET_WIDE_PX = 2048;
const CELL_PADDING = 0.08;

/**
 * Every name in `names` on one sheet, white on the plate's blue. `aspect` is a cell's width over its height, the
 * plate's own, so nothing stretches. `ink` turns a token's name into a CSS colour.
 */
export function createNameSheet(names: readonly string[], aspect: number, ink: (token: string) => string, columns = 4): NameSheet {
  const cellWide = Math.floor(SHEET_WIDE_PX / columns);
  const cellTall = Math.round(cellWide / aspect);
  const rows = Math.ceil(names.length / columns);
  const canvas = document.createElement("canvas");
  canvas.width = SHEET_WIDE_PX;
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
    let size = Math.round(cellTall * 0.58);
    pen.font = `600 ${size}px sans-serif`;
    while (pen.measureText(name).width > fit) {
      size -= 1;
      pen.font = `600 ${size}px sans-serif`;
    }
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

/** A blue square with a white triangle and a walker, as on the Finnish crossing sign, cut from geometry. Faces +z, or -z with `way` -1. */
function crossingPlate(into: TownPainted, y: number, z: number, way: 1 | -1): TownPainted {
  const half = 0.3;
  const at = (x: number, up: number, lift: number): V3 => [x * way, y + up, z + lift * way];
  return into
    .face([at(-half, -half, 0), at(half, -half, 0), at(half, half, 0), at(-half, half, 0)], "plate-blue")
    .face([at(-0.27, -0.23, 0.004), at(0.27, -0.23, 0.004), at(0, 0.26, 0.004)], "plate-white")
    .face([at(-0.27, -0.27, 0.004), at(0.27, -0.27, 0.004), at(0.27, -0.25, 0.004), at(-0.27, -0.25, 0.004)], "plate-white")
    .face([at(-0.015, 0.1, 0.008), at(0.022, 0.1, 0.008), at(0.022, 0.135, 0.008), at(-0.015, 0.135, 0.008)], "plate-black")
    .face([at(-0.03, 0.08, 0.008), at(0.03, 0.08, 0.008), at(0.05, -0.08, 0.008), at(0.002, -0.05, 0.008), at(-0.03, -0.08, 0.008)], "plate-black")
    .face([at(-0.03, -0.08, 0.008), at(0.005, -0.06, 0.008), at(-0.04, -0.2, 0.008), at(-0.08, -0.2, 0.008)], "plate-black")
    .face([at(0.002, -0.05, 0.008), at(0.05, -0.08, 0.008), at(0.09, -0.2, 0.008), at(0.05, -0.2, 0.008)], "plate-black");
}

const CROSSING_BANDS = 7;

/** A crossing's pole: black and white bands so it reads at a walk, and the crossing sign both ways. */
export function buildCrossingPole(): RoadsideModel {
  const [low, high, plateY] = [0.25, 2.3, 2.62];
  const near = new TownPainted().tube([0, -SINK_M, 0], [0, low, 0], POST_R + 0.012, 5, {}, "stripe-black");
  for (let band = 0; band < CROSSING_BANDS; band++) {
    const [from, to] = [low + ((high - low) * band) / CROSSING_BANDS, low + ((high - low) * (band + 1)) / CROSSING_BANDS];
    near.tube([0, from, 0], [0, to, 0], POST_R + 0.012, 5, {}, band % 2 === 0 ? "stripe-white" : "stripe-black");
  }
  near.tube([0, high, 0], [0, plateY + 0.32, 0], POST_R, 5, { cap: true }, "galvanised");
  crossingPlate(near, plateY, 0.04, 1);
  crossingPlate(near, plateY, -0.04, -1);
  const far = new TownPainted()
    .tube([0, -SINK_M, 0], [0, plateY, 0], 0.05, 3, {}, "stripe-white")
    .face([[-0.32, plateY - 0.32, 0], [0.32, plateY - 0.32, 0], [0.32, plateY + 0.32, 0], [-0.32, plateY + 0.32, 0]], "plate-blue");
  return townModel(near, far, 60, 320);
}

/** A town bus stop's pole: a yellow disc with a bus cut from geometry, and a timetable case at reading height. */
export function buildBusStopPole(): RoadsideModel {
  const top = 2.95;
  const plateY = 2.6;
  const near = new TownPainted().tube([0, -SINK_M, 0], [0, top, 0], POST_R + 0.012, 5, { radiusTo: POST_R, cap: true }, "galvanised");
  for (const way of [1, -1] as const) {
    const z = way * 0.05;
    near.face(uprightRing([0, plateY, z], 0.27, 12), "plate-yellow");
    const [lift, glass] = [z + way * 0.004, z + way * 0.006];
    near
      .face([[-0.17, plateY - 0.08, lift], [0.17, plateY - 0.08, lift], [0.17, plateY + 0.11, lift], [-0.17, plateY + 0.11, lift]], "plate-blue")
      .face([[-0.14, plateY + 0.01, glass], [0.14, plateY + 0.01, glass], [0.14, plateY + 0.08, glass], [-0.14, plateY + 0.08, glass]], "plate-white")
      .face([[-0.11, plateY - 0.14, lift], [-0.05, plateY - 0.14, lift], [-0.05, plateY - 0.08, lift], [-0.11, plateY - 0.08, lift]], "plate-black")
      .face([[0.05, plateY - 0.14, lift], [0.11, plateY - 0.14, lift], [0.11, plateY - 0.08, lift], [0.05, plateY - 0.08, lift]], "plate-black");
  }
  near
    .box([-0.17, 1.2, 0.04], [0.17, 1.72, 0.09], "lamp-iron", { shadeTop: 1.1 })
    .face([[-0.14, 1.23, 0.092], [0.14, 1.23, 0.092], [0.14, 1.69, 0.092], [-0.14, 1.69, 0.092]], "board-white", 0.92);
  const far = new TownPainted()
    .tube([0, -SINK_M, 0], [0, plateY, 0], 0.05, 3, {}, "galvanised")
    .face([[-0.26, plateY - 0.26, 0], [0.26, plateY - 0.26, 0], [0.26, plateY + 0.26, 0], [-0.26, plateY + 0.26, 0]], "plate-yellow");
  return townModel(near, far, 60, 320);
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
