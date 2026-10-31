import type { InteriorPart } from "./paint";
import type { RoomMesh, V3 } from "./room-mesh";

/*
 * The furniture every home shares, each piece a function of its sizes and its
 * materials, drawn on its origin in `RoomMesh.place`: feet on the floor, back to -z,
 * front to +z. Sizes are real ones, in metres.
 */

const legs = (mesh: RoomMesh, halfX: number, halfZ: number, tall: number, thick: number, part: InteriorPart) => {
  for (const x of [-halfX, halfX]) for (const z of [-halfZ, halfZ]) mesh.box([x - thick / 2, 0, z - thick / 2], [x + thick / 2, tall, z + thick / 2], part, { open: true });
};

export interface SofaOptions {
  wide?: number;
  fabric?: InteriorPart;
  cushion?: InteriorPart;
  wood?: InteriorPart;
  seats?: number;
}

export function sofa(mesh: RoomMesh, { wide = 2, fabric = "linen", cushion = "rust", wood = "oak", seats = 2 }: SofaOptions = {}) {
  const half = wide / 2;
  const [deep, back] = [0.9, 0.2];
  legs(mesh, half - 0.1, deep / 2 - 0.1, 0.12, 0.05, wood);
  mesh.solid([-half, 0.12, -deep / 2], [half, 0.3, deep / 2], fabric, { shade: 0.9 });
  mesh.solid([-half, 0.12, -deep / 2], [half, 0.78, -deep / 2 + back], fabric);
  for (const side of [-1, 1]) mesh.solid([side > 0 ? half - 0.16 : -half, 0.12, -deep / 2], [side > 0 ? half : -half + 0.16, 0.62, deep / 2], fabric);
  const inner = wide - 0.32;
  for (let seat = 0; seat < seats; seat++) {
    const x0 = -half + 0.16 + (inner * seat) / seats;
    const x1 = x0 + inner / seats;
    mesh.box([x0 + 0.01, 0.3, -deep / 2 + back], [x1 - 0.01, 0.43, deep / 2 - 0.02], fabric, { shade: 1.04 });
    mesh.face([[x0 + 0.03, 0.42, -deep / 2 + back], [x1 - 0.03, 0.42, -deep / 2 + back], [x1 - 0.03, 0.74, -deep / 2 + back + 0.0], [x0 + 0.03, 0.74, -deep / 2 + back]], fabric);
    mesh.box([x0 + 0.04, 0.43, -deep / 2 + back], [x1 - 0.04, 0.72, -deep / 2 + back + 0.1], fabric, { shade: 1.06 });
  }
  mesh.place(-half + 0.34, -deep / 2 + back + 0.14, 0, (m) => m.box([-0.2, 0.43, -0.05], [0.2, 0.76, 0.05], cushion));
  mesh.place(half - 0.34, -deep / 2 + back + 0.14, 0, (m) => m.box([-0.2, 0.43, -0.05], [0.2, 0.76, 0.05], cushion, { shade: 0.9 }));
}

export function armchair(mesh: RoomMesh, { fabric = "mustard", wood = "oak" }: { fabric?: InteriorPart; wood?: InteriorPart } = {}) {
  const [half, deep] = [0.4, 0.8];
  legs(mesh, half - 0.07, deep / 2 - 0.07, 0.16, 0.05, wood);
  mesh.solid([-half, 0.16, -deep / 2], [half, 0.42, deep / 2], fabric);
  mesh.solid([-half, 0.16, -deep / 2], [half, 0.86, -deep / 2 + 0.16], fabric, { shade: 1.05 });
  for (const side of [-1, 1]) mesh.solid([side > 0 ? half - 0.1 : -half, 0.42, -deep / 2], [side > 0 ? half : -half + 0.1, 0.62, deep / 2], wood);
}

export function coffeeTable(mesh: RoomMesh, { wide = 1.2, deep = 0.6, wood = "oak" }: { wide?: number; deep?: number; wood?: InteriorPart } = {}) {
  legs(mesh, wide / 2 - 0.06, deep / 2 - 0.06, 0.4, 0.05, wood);
  mesh.solid([-wide / 2, 0.4, -deep / 2], [wide / 2, 0.44, deep / 2], wood);
  mesh.box([-wide / 2 + 0.08, 0.16, -deep / 2 + 0.08], [wide / 2 - 0.08, 0.18, deep / 2 - 0.08], wood, { shade: 0.9 });
  // A pile of books and a cup.
  mesh.box([-0.28, 0.44, -0.1], [0.02, 0.47, 0.1], "navy").box([-0.26, 0.47, -0.09], [0, 0.5, 0.08], "rust");
  mesh.tube([0.3, 0.44, 0.05], [0.3, 0.52, 0.05], 0.04, 6, "paint-white", { cap: true });
}

export function diningTable(mesh: RoomMesh, { wide = 1.8, deep = 0.9, wood = "oak", legPart = wood }: { wide?: number; deep?: number; wood?: InteriorPart; legPart?: InteriorPart } = {}) {
  legs(mesh, wide / 2 - 0.08, deep / 2 - 0.08, 0.71, 0.07, legPart);
  mesh.solid([-wide / 2, 0.71, -deep / 2], [wide / 2, 0.75, deep / 2], wood);
  mesh.box([-wide / 2 + 0.1, 0.65, -deep / 2 + 0.1], [wide / 2 - 0.1, 0.71, deep / 2 - 0.1], legPart, { shade: 0.88 });
}

export function chair(mesh: RoomMesh, { wood = "oak", seat = wood }: { wood?: InteriorPart; seat?: InteriorPart } = {}) {
  const half = 0.21;
  legs(mesh, half - 0.02, half - 0.02, 0.44, 0.035, wood);
  mesh.box([-half, 0.44, -half], [half, 0.47, half], seat);
  for (const x of [-half + 0.02, half - 0.02]) mesh.box([x - 0.018, 0.47, -half], [x + 0.018, 0.88, -half + 0.03], wood, { open: true });
  mesh.box([-half, 0.76, -half], [half, 0.86, -half + 0.03], wood);
  mesh.box([-half + 0.03, 0.6, -half + 0.005], [half - 0.03, 0.64, -half + 0.025], wood, { open: true });
}

/** Four chairs round a table laid out by `diningTable`'s sizes. */
export function diningSet(mesh: RoomMesh, { wide = 1.8, deep = 0.9, wood = "oak", chairWood = wood, seat = chairWood, perSide = 2 }: { wide?: number; deep?: number; wood?: InteriorPart; chairWood?: InteriorPart; seat?: InteriorPart; perSide?: number } = {}) {
  diningTable(mesh, { wide, deep, wood });
  for (let index = 0; index < perSide; index++) {
    const x = -wide / 2 + (wide * (index + 0.5)) / perSide;
    mesh.place(x, -deep / 2 - 0.12, 0, (m) => {
      chair(m, { wood: chairWood, seat });
    });
    mesh.place(x, deep / 2 + 0.12, 2, (m) => {
      chair(m, { wood: chairWood, seat });
    });
  }
  mesh.tube([0, 0.75, 0], [0, 0.83, 0], 0.07, 7, "pot-clay", { radiusTo: 0.09, cap: true });
  mesh.tube([0, 0.83, 0], [0.03, 1.02, 0.02], 0.012, 3, "leaf-dark");
  mesh.tube([0, 0.83, 0], [-0.05, 0.98, -0.02], 0.012, 3, "leaf-dark");
}

const BOOK_PARTS: readonly InteriorPart[] = ["rust", "navy", "mustard", "moss", "linen", "red-paint", "paint-sage"];

function books(mesh: RoomMesh, x0: number, x1: number, y: number, z: number, seed: number) {
  let x = x0;
  let roll = seed;
  while (x < x1 - 0.06) {
    roll = (roll * 37 + 11) % 101;
    const thick = 0.025 + (roll % 5) * 0.008;
    const tall = 0.19 + (roll % 7) * 0.012;
    if (roll % 9 !== 0) mesh.box([x, y, z - 0.09], [x + thick, y + tall, z + 0.07], BOOK_PARTS[roll % BOOK_PARTS.length]);
    x += thick + (roll % 9 === 0 ? 0.09 : 0.003);
  }
}

export function bookshelf(mesh: RoomMesh, { wide = 1.2, tall = 2, deep = 0.3, wood = "oak", shelves = 4, seed = 3 }: { wide?: number; tall?: number; deep?: number; wood?: InteriorPart; shelves?: number; seed?: number } = {}) {
  const half = wide / 2;
  mesh.block([-half, 0, -deep / 2], [half, tall, deep / 2]);
  mesh.face([[half, 0, -deep / 2], [-half, 0, -deep / 2], [-half, tall, -deep / 2], [half, tall, -deep / 2]], wood, 0.8);
  mesh.face([[-half, 0, -deep / 2 + 0.01], [half, 0, -deep / 2 + 0.01], [half, tall, -deep / 2 + 0.01], [-half, tall, -deep / 2 + 0.01]], wood, 0.74);
  for (const x of [-half, half - 0.03]) mesh.box([x, 0, -deep / 2], [x + 0.03, tall, deep / 2], wood, { open: true });
  for (let shelf = 0; shelf <= shelves; shelf++) {
    const y = 0.05 + ((tall - 0.08) * shelf) / shelves;
    mesh.box([-half, y, -deep / 2], [half, y + 0.03, deep / 2], wood);
    if (shelf < shelves) books(mesh, -half + 0.05, half - 0.05, y + 0.03, 0, seed + shelf * 13);
  }
}

export function sideboard(mesh: RoomMesh, { wide = 1.5, tall = 0.8, deep = 0.42, wood = "oak", front = wood }: { wide?: number; tall?: number; deep?: number; wood?: InteriorPart; front?: InteriorPart } = {}) {
  const half = wide / 2;
  legs(mesh, half - 0.06, deep / 2 - 0.05, 0.14, 0.04, wood);
  mesh.solid([-half, 0.14, -deep / 2], [half, tall, deep / 2], wood);
  const doors = 3;
  for (let door = 0; door < doors; door++) {
    const x0 = -half + 0.02 + ((wide - 0.04) * door) / doors;
    const x1 = -half + 0.02 + ((wide - 0.04) * (door + 1)) / doors;
    mesh.face([[x0 + 0.01, 0.17, deep / 2 + 0.006], [x1 - 0.01, 0.17, deep / 2 + 0.006], [x1 - 0.01, tall - 0.03, deep / 2 + 0.006], [x0 + 0.01, tall - 0.03, deep / 2 + 0.006]], front);
  }
}

export interface LampOptions {
  power?: number;
  shadePart?: InteriorPart;
  post?: InteriorPart;
}

export function floorLamp(mesh: RoomMesh, { power = 0.55, shadePart = "linen", post = "black" }: LampOptions = {}) {
  mesh.tube([0, 0, 0], [0, 0.03, 0], 0.14, 8, post, { cap: true }).tube([0, 0.03, 0], [0, 1.42, 0], 0.012, 4, post);
  mesh.tube([0, 1.42, 0], [0, 1.66, 0], 0.22, 8, "bulb", { radiusTo: 0.15 });
  mesh.tube([0, 1.42, 0], [0, 1.66, 0], 0.224, 8, shadePart, { radiusTo: 0.154 });
  mesh.lamp([0, 1.5, 0], power);
}

export function tableLamp(mesh: RoomMesh, { power = 0.28, shadePart = "linen" as InteriorPart, post = "pot-clay" as InteriorPart, y = 0 } = {}) {
  mesh.tube([0, y, 0], [0, y + 0.2, 0], 0.07, 7, post, { radiusTo: 0.03 });
  mesh.tube([0, y + 0.2, 0], [0, y + 0.38, 0], 0.15, 8, shadePart, { radiusTo: 0.1, cap: true });
  mesh.tube([0, y + 0.2, 0], [0, y + 0.203, 0], 0.15, 8, "bulb");
  mesh.lamp([0, y + 0.27, 0], power);
}

export function pendant(mesh: RoomMesh, { ceiling = 2.4, drop = 0.8, power = 0.7, shadePart = "black" as InteriorPart } = {}) {
  const y = ceiling - drop;
  mesh.tube([0, ceiling, 0], [0, y + 0.2, 0], 0.006, 3, "black");
  mesh.tube([0, y, 0], [0, y + 0.2, 0], 0.24, 10, shadePart, { radiusTo: 0.05, cap: true });
  mesh.tube([0, y + 0.03, 0], [0, y + 0.03, 0.001], 0.07, 6, "bulb");
  mesh.lamp([0, y - 0.1, 0], power);
}

export function ceilingStrip(mesh: RoomMesh, { ceiling = 2.6, long = 1.5, power = 0.45 } = {}) {
  mesh.box([-long / 2, ceiling - 0.06, -0.06], [long / 2, ceiling, 0.06], "steel");
  mesh.box([-long / 2 + 0.02, ceiling - 0.075, -0.04], [long / 2 - 0.02, ceiling - 0.06, 0.04], "bulb");
  mesh.lamp([0, ceiling - 0.2, 0], power);
}

export function rug(mesh: RoomMesh, { wide = 2.4, deep = 1.7, part = "rug-red" as InteriorPart, edge = "rug-pale" as InteriorPart, stripes = 5 } = {}) {
  const [halfX, halfZ] = [wide / 2, deep / 2];
  const y = 0.008;
  const strips = stripes * 2 + 1;
  for (let strip = 0; strip < strips; strip++) {
    const z0 = -halfZ + (deep * strip) / strips;
    const z1 = -halfZ + (deep * (strip + 1)) / strips;
    mesh.face([[-halfX, y, z1], [halfX, y, z1], [halfX, y, z0], [-halfX, y, z0]], strip % 2 === 0 ? edge : part);
  }
}

export function woodStove(mesh: RoomMesh, { flueTo = 2.4, part = "black" as InteriorPart } = {}) {
  legs(mesh, 0.2, 0.17, 0.14, 0.05, part);
  mesh.solid([-0.26, 0.14, -0.22], [0.26, 0.82, 0.22], part);
  mesh.box([-0.3, 0.82, -0.26], [0.3, 0.86, 0.26], part);
  mesh.face([[-0.17, 0.26, 0.222], [0.17, 0.26, 0.222], [0.17, 0.62, 0.222], [-0.17, 0.62, 0.222]], "ember");
  for (const x of [-0.06, 0.06]) mesh.box([x - 0.012, 0.26, 0.22], [x + 0.012, 0.62, 0.235], part);
  mesh.box([-0.2, 0.62, 0.22], [0.2, 0.67, 0.235], part).box([-0.2, 0.21, 0.22], [0.2, 0.26, 0.235], part);
  mesh.tube([0, 0.86, -0.05], [0, flueTo, -0.05], 0.075, 8, part);
  // A hearth of stone under it.
  mesh.box([-0.6, 0, -0.45], [0.6, 0.03, 0.6], "stone-dark", { open: true });
  mesh.lamp([0, 0.45, 0.45], 0.12);
}

/** A kakelugn: the tall tiled stove of an old house. */
export function tileStove(mesh: RoomMesh, { tall = 2.7, part = "tile-blue" as InteriorPart } = {}) {
  mesh.solid([-0.42, 0, -0.42], [0.42, 0.2, 0.42], "trim");
  mesh.solid([-0.38, 0.2, -0.38], [0.38, tall - 0.2, 0.38], part);
  mesh.box([-0.42, tall - 0.2, -0.42], [0.42, tall - 0.12, 0.42], "trim");
  mesh.box([-0.36, tall - 0.12, -0.36], [0.36, tall, 0.36], part);
  mesh.box([-0.42, 1.25, -0.42], [0.42, 1.3, 0.42], "trim");
  mesh.face([[-0.17, 0.35, 0.383], [0.17, 0.35, 0.383], [0.17, 0.72, 0.383], [-0.17, 0.72, 0.383]], "black");
  mesh.box([-0.19, 0.33, 0.38], [0.19, 0.36, 0.4], "steel").box([-0.19, 0.71, 0.38], [0.19, 0.74, 0.4], "steel");
  mesh.tube([0.1, 0.5, 0.385], [0.1, 0.5, 0.42], 0.015, 5, "steel", { cap: true });
}

/** A modern hanging fire in a wall of concrete. */
export function wallFire(mesh: RoomMesh, { wide = 1.4 } = {}) {
  const half = wide / 2;
  mesh.solid([-half - 0.25, 0, -0.12], [half + 0.25, 2.8, 0.12], "wall-concrete");
  mesh.face([[-half, 0.45, 0.122], [half, 0.45, 0.122], [half, 0.85, 0.122], [-half, 0.85, 0.122]], "black");
  mesh.face([[-half + 0.1, 0.45, 0.124], [half - 0.1, 0.45, 0.124], [half - 0.16, 0.66, 0.124], [half - 0.5, 0.6, 0.124], [-half + 0.4, 0.72, 0.124], [-half + 0.14, 0.58, 0.124]], "ember");
  mesh.lamp([0, 0.6, 0.5], 0.14);
}

export function logBasket(mesh: RoomMesh) {
  mesh.box([-0.25, 0, -0.17], [0.25, 0.3, 0.17], "iron", { open: true });
  for (const [x, y] of [[-0.14, 0.34], [0, 0.34], [0.14, 0.34], [-0.07, 0.44], [0.07, 0.44]]) mesh.tube([x, y, -0.23], [x, y, 0.23], 0.06, 6, "birch", { cap: true });
  mesh.block([-0.25, 0, -0.2], [0.25, 0.46, 0.2]);
}

export interface BedOptions {
  wide?: number;
  cover?: InteriorPart;
  throwPart?: InteriorPart;
  wood?: InteriorPart;
}

/** A bed with its head to -z. */
export function bed(mesh: RoomMesh, { wide = 1.6, cover = "wool", throwPart = "navy", wood = "oak" }: BedOptions = {}) {
  const [half, long] = [wide / 2, 2.05];
  legs(mesh, half - 0.06, long / 2 - 0.06, 0.16, 0.06, wood);
  mesh.solid([-half, 0.16, -long / 2], [half, 0.3, long / 2], wood);
  mesh.solid([-half - 0.03, 0.0, -long / 2 - 0.06], [half + 0.03, 1.0, -long / 2], wood);
  mesh.solid([-half + 0.02, 0.3, -long / 2 + 0.02], [half - 0.02, 0.5, long / 2 - 0.02], cover);
  mesh.box([-half + 0.015, 0.34, long * 0.12], [half - 0.015, 0.515, long / 2 - 0.015], throwPart);
  const pillows = wide > 1.2 ? 2 : 1;
  for (let pillow = 0; pillow < pillows; pillow++) {
    const x = -half + (wide * (pillow + 0.5)) / pillows;
    mesh.box([x - 0.33 + (pillows === 1 ? 0.0 : 0.02), 0.5, -long / 2 + 0.08], [x + 0.33 - 0.02, 0.62, -long / 2 + 0.52], "page");
  }
}

export function nightstand(mesh: RoomMesh, { wood = "oak" as InteriorPart, lamp = true } = {}) {
  legs(mesh, 0.19, 0.16, 0.2, 0.03, wood);
  mesh.solid([-0.23, 0.2, -0.2], [0.23, 0.55, 0.2], wood);
  mesh.face([[-0.2, 0.24, 0.203], [0.2, 0.24, 0.203], [0.2, 0.52, 0.203], [-0.2, 0.52, 0.203]], wood, 0.9);
  mesh.box([-0.04, 0.37, 0.2], [0.04, 0.39, 0.22], "steel");
  if (lamp) tableLamp(mesh, { y: 0.55 });
}

export function wardrobe(mesh: RoomMesh, { wide = 1.4, tall = 2.1, part = "paint-white" as InteriorPart } = {}) {
  const half = wide / 2;
  mesh.solid([-half, 0, -0.3], [half, tall, 0.3], part);
  mesh.box([-0.012, 0.08, 0.3], [0.012, tall - 0.05, 0.305], "stone-dark");
  for (const x of [-0.07, 0.07]) mesh.box([x - 0.012, 1, 0.3], [x + 0.012, 1.25, 0.33], "steel");
}

export type PictureKind = "sea" | "island" | "field" | "boat";

/** A framed picture, in shapes rather than a texture, hung with its back to -z and its centre on the origin. */
export function picture(mesh: RoomMesh, { wide = 0.7, tall = 0.5, kind = "sea" as PictureKind, frame = "walnut" as InteriorPart } = {}) {
  const [hw, ht] = [wide / 2, tall / 2];
  const back = 0.012;
  mesh.box([-hw, -ht, 0], [hw, ht, 0.024], frame);
  const [left, right, low, high] = [-hw + 0.03, hw - 0.03, -ht + 0.03, ht - 0.03];
  const span = high - low;
  const horizon = low + span * 0.48;
  const quad = (x0: number, y0: number, x1: number, y1: number, part: InteriorPart, lift = 0) => mesh.face([[x0, y0, 0.025 + back * lift], [x1, y0, 0.025 + back * lift], [x1, y1, 0.025 + back * lift], [x0, y1, 0.025 + back * lift]], part);
  quad(left, horizon, right, high, "sky-paint");
  quad(left, low, right, horizon, kind === "field" ? "land-paint" : "sea-paint");
  const at = (u: number, v: number): V3 => [left + (right - left) * u, low + span * v, 0.04];
  if (kind === "island" || kind === "sea") mesh.face([at(0.08, 0.48), at(0.62, 0.48), at(0.5, 0.62), at(0.34, 0.68), at(0.18, 0.6)], kind === "sea" ? "stone" : "leaf-dark");
  if (kind === "sea") mesh.face([at(0.62, 0.3), at(0.92, 0.3), at(0.86, 0.34), at(0.68, 0.34)], "page");
  if (kind === "field") {
    mesh.face([at(0.1, 0.46), at(0.42, 0.46), at(0.42, 0.72), at(0.26, 0.86), at(0.1, 0.72)], "red-paint");
    mesh.face([at(0.55, 0.48), at(1, 0.48), at(1, 0.62), at(0.75, 0.68)], "leaf-dark");
  }
  if (kind === "boat") {
    mesh.face([at(0.25, 0.32), at(0.75, 0.32), at(0.66, 0.2), at(0.34, 0.2)], "red-paint");
    mesh.face([at(0.5, 0.36), at(0.74, 0.36), at(0.5, 0.86)], "page");
    mesh.face([at(0.46, 0.36), at(0.46, 0.76), at(0.28, 0.36)], "page");
  }
}

export function curtains(mesh: RoomMesh, { wide = 1.6, tall = 1.8, part = "linen" as InteriorPart } = {}) {
  const half = wide / 2;
  mesh.tube([-half - 0.15, tall, 0.06], [half + 0.15, tall, 0.06], 0.012, 4, "black");
  for (const side of [-1, 1]) {
    const folds = 3;
    for (let fold = 0; fold < folds; fold++) {
      const x = side * (half + 0.08 - fold * 0.1);
      const out = 0.04 + (fold % 2) * 0.05;
      const [a, b] = side > 0 ? [x - 0.1, x] : [x, x + 0.1];
      mesh.face([[a, 0.05, out], [b, 0.05, 0.1 - out + 0.04], [b, tall, 0.1 - out + 0.04], [a, tall, out]], part, fold % 2 === 0 ? 1 : 0.86);
    }
  }
}

export function plant(mesh: RoomMesh, { tall = 1.2, y = 0 } = {}) {
  mesh.tube([0, y, 0], [0, y + 0.3, 0], 0.13, 7, "pot-clay", { radiusTo: 0.17, cap: true });
  const leaves = 7;
  for (let leaf = 0; leaf < leaves; leaf++) {
    const around = leaf * 2.4;
    const reach = 0.28 + (leaf % 3) * 0.08;
    const tip: V3 = [Math.cos(around) * reach, y + 0.3 + tall * (0.5 + (leaf % 4) * 0.16), Math.sin(around) * reach];
    const [sx, sz] = [-Math.sin(around) * 0.09, Math.cos(around) * 0.09];
    mesh.face([[sx * 0.2, y + 0.3, sz * 0.2], [tip[0] * 0.6 + sx, tip[1] * 0.75, tip[2] * 0.6 + sz], tip, [tip[0] * 0.6 - sx, tip[1] * 0.75, tip[2] * 0.6 - sz]], leaf % 2 === 0 ? "leaf" : "leaf-dark");
  }
}

export interface KitchenOptions {
  wide?: number;
  tall?: number;
  front?: InteriorPart;
  top?: InteriorPart;
  splash?: InteriorPart;
  handle?: InteriorPart;
}

/** A run of kitchen along a wall: base units, worktop, hob, sink, wall units and a fridge at the end. */
export function kitchenRun(mesh: RoomMesh, { wide = 3.2, tall = 2.4, front = "paint-sage", top = "birch", splash = "tile", handle = "steel" }: KitchenOptions = {}) {
  const half = wide / 2;
  const deep = 0.6;
  const fridge = 0.62;
  const runEnd = half - fridge;
  mesh.solid([-half, 0.1, -0.3], [runEnd, 0.86, 0.28], front);
  mesh.box([-half, 0, -0.3], [runEnd, 0.1, 0.22], "black", { open: true });
  mesh.solid([-half, 0.86, -0.3], [runEnd, 0.9, 0.31], top);
  const units = Math.round((runEnd + half) / 0.6);
  const unit = (runEnd + half) / units;
  for (let index = 0; index < units; index++) {
    const x0 = -half + unit * index;
    mesh.face([[x0 + 0.012, 0.12, 0.285], [x0 + unit - 0.012, 0.12, 0.285], [x0 + unit - 0.012, 0.84, 0.285], [x0 + 0.012, 0.84, 0.285]], front, 1.05);
    mesh.box([x0 + unit / 2 - 0.07, 0.76, 0.285], [x0 + unit / 2 + 0.07, 0.775, 0.31], handle);
  }
  // Splashback, wall units, and an oven under the hob.
  mesh.face([[-half, 0.9, -0.295], [runEnd, 0.9, -0.295], [runEnd, 1.46, -0.295], [-half, 1.46, -0.295]], splash);
  const hobX = -half + unit * 1.5;
  mesh.box([hobX - 0.29, 0.9, -0.25], [hobX + 0.29, 0.91, 0.25], "black");
  for (const [x, z] of [[-0.14, -0.12], [0.14, -0.12], [-0.14, 0.12], [0.14, 0.12]]) mesh.tube([hobX + x, 0.91, z], [hobX + x, 0.912, z], 0.08, 8, "iron", { cap: true });
  mesh.face([[hobX - 0.28, 0.18, 0.29], [hobX + 0.28, 0.18, 0.29], [hobX + 0.28, 0.66, 0.29], [hobX - 0.28, 0.66, 0.29]], "black");
  mesh.box([hobX - 0.26, 0.68, 0.285], [hobX + 0.26, 0.7, 0.32], "steel");
  const sinkX = runEnd - unit;
  mesh.box([sinkX - 0.28, 0.9, -0.2], [sinkX + 0.28, 0.905, 0.22], "steel");
  mesh.face([[sinkX - 0.22, 0.907, 0.16], [sinkX + 0.22, 0.907, 0.16], [sinkX + 0.22, 0.907, -0.14], [sinkX - 0.22, 0.907, -0.14]], "iron");
  mesh.tube([sinkX, 0.9, -0.23], [sinkX, 1.16, -0.23], 0.012, 5, "steel").tube([sinkX, 1.16, -0.23], [sinkX, 1.16, -0.05], 0.012, 5, "steel");
  mesh.solid([-half, 1.46, -0.3], [runEnd - 1, tall - 0.2 > 2.1 ? 2.2 : tall - 0.15, 0.03], front, { shade: 1.02 });
  const hoodX = hobX;
  mesh.box([hoodX - 0.3, 1.46, -0.3], [hoodX + 0.3, 1.52, 0.1], "steel");
  // A shelf with plates and jars on the rest.
  const shelfFrom = runEnd - 1 + 0.08;
  mesh.box([shelfFrom, 1.62, -0.3], [runEnd, 1.65, -0.07], top);
  for (let jar = 0; jar < 4; jar++) mesh.tube([shelfFrom + 0.12 + jar * 0.2, 1.65, -0.19], [shelfFrom + 0.12 + jar * 0.2, 1.65 + 0.12 + (jar % 2) * 0.05, -0.19], 0.05, 6, jar % 2 === 0 ? "paint-white" : "pot-clay", { cap: true });
  mesh.solid([runEnd + 0.01, 0, -0.32], [half, 1.95, deep / 2 + 0.02], "appliance");
  mesh.box([runEnd + 0.01, 1.28, deep / 2 + 0.02], [half, 1.295, deep / 2 + 0.03], "stone-dark");
  mesh.box([runEnd + 0.06, 1.34, deep / 2 + 0.02], [runEnd + 0.09, 1.7, deep / 2 + 0.06], "steel");
  mesh.box([runEnd + 0.06, 0.7, deep / 2 + 0.02], [runEnd + 0.09, 1.2, deep / 2 + 0.06], "steel");
}

/** Slatted benches in tiers, with the wall at -z, on the sauna's long side. */
export function saunaBenches(mesh: RoomMesh, { wide = 2.2, tiers = 2, wood = "birch" as InteriorPart } = {}) {
  const half = wide / 2;
  const stepDeep = 0.6;
  for (let tier = 0; tier < tiers; tier++) {
    const y = 0.45 * (tiers - tier);
    const [back, front] = [-0.3 + tier * stepDeep, -0.3 + (tier + 1) * stepDeep];
    const slats = 5;
    for (let slat = 0; slat < slats; slat++) {
      const z = back + ((front - back) * slat) / slats;
      mesh.box([-half, y - 0.03, z + 0.008], [half, y, z + stepDeep / slats - 0.008], wood);
    }
    mesh.block([-half, y - 0.03, back], [half, y, front]);
    mesh.box([-half + 0.05, 0, front - 0.1], [-half + 0.1, y - 0.03, front - 0.05], wood, { open: true });
    mesh.box([half - 0.1, 0, front - 0.1], [half - 0.05, y - 0.03, front - 0.05], wood, { open: true });
    mesh.face([[-half, y - 0.3, front - 0.03], [half, y - 0.3, front - 0.03], [half, y - 0.05, front - 0.03], [-half, y - 0.05, front - 0.03]], wood, 0.8);
  }
}

export function saunaStove(mesh: RoomMesh, { steel = "iron" as InteriorPart } = {}) {
  mesh.solid([-0.24, 0, -0.24], [0.24, 0.62, 0.24], steel);
  mesh.face([[-0.12, 0.14, 0.242], [0.12, 0.14, 0.242], [0.12, 0.34, 0.242], [-0.12, 0.34, 0.242]], "ember");
  mesh.box([-0.26, 0.62, -0.26], [0.26, 0.66, 0.26], steel);
  const stones = 16;
  for (let stone = 0; stone < stones; stone++) {
    const around = stone * 2.4;
    const reach = 0.04 + (stone / stones) * 0.19;
    const [x, z] = [Math.cos(around) * reach, Math.sin(around) * reach];
    const y = 0.68 + (1 - stone / stones) * 0.2;
    mesh.tube([x, y - 0.05, z], [x + 0.01, y + 0.04, z], 0.065, 5, stone % 3 === 0 ? "stone-dark" : "stone", { radiusTo: 0.03, cap: true });
  }
  mesh.lamp([0, 0.3, 0.5], 0.16);
}

export function bucket(mesh: RoomMesh) {
  mesh.tube([0, 0, 0], [0, 0.26, 0], 0.13, 8, "oak", { radiusTo: 0.16 });
  mesh.tube([0, 0.002, 0], [0, 0.2, 0], 0.11, 8, "sea-paint", { radiusTo: 0.14, cap: true });
  mesh.tube([0.1, 0.25, 0], [0.42, 0.48, 0.1], 0.012, 4, "oak");
  mesh.tube([0.42, 0.42, 0.1], [0.42, 0.5, 0.1], 0.05, 6, "steel", { cap: true });
}

export function towelRail(mesh: RoomMesh, { wide = 1, part = "rust" as InteriorPart } = {}) {
  mesh.box([-wide / 2, 1.5, 0], [wide / 2, 1.56, 0.02], "birch");
  const pegs = 3;
  for (let peg = 0; peg < pegs; peg++) {
    const x = -wide / 2 + (wide * (peg + 0.5)) / pegs;
    mesh.tube([x, 1.53, 0.02], [x, 1.53, 0.08], 0.012, 4, "oak");
    if (peg !== 1) mesh.box([x - 0.14, 0.92, 0.03], [x + 0.14, 1.5, 0.055], peg === 0 ? part : "wool");
  }
}

export function benchLow(mesh: RoomMesh, { wide = 1.2, wood = "pine" as InteriorPart } = {}) {
  legs(mesh, wide / 2 - 0.06, 0.13, 0.42, 0.05, wood);
  mesh.solid([-wide / 2, 0.42, -0.18], [wide / 2, 0.46, 0.18], wood);
}

/** A workbench against a wall, with a board of tools over it. */
export function workbench(mesh: RoomMesh, { wide = 2.2, wood = "birch" as InteriorPart } = {}) {
  const half = wide / 2;
  legs(mesh, half - 0.08, 0.24, 0.86, 0.08, "iron");
  mesh.solid([-half, 0.86, -0.3], [half, 0.92, 0.3], wood);
  mesh.box([-half + 0.05, 0.25, -0.26], [half - 0.05, 0.29, 0.26], wood, { shade: 0.86 });
  mesh.face([[-half, 1.1, -0.295], [half, 1.1, -0.295], [half, 1.95, -0.295], [-half, 1.95, -0.295]], "wall-boards", 0.86);
  const tools: readonly (readonly [number, number, number, InteriorPart])[] = [[-0.7, 0.1, 0.42, "rust"], [-0.45, 0.04, 0.5, "steel"], [-0.25, 0.06, 0.36, "navy"], [0, 0.04, 0.46, "steel"], [0.25, 0.14, 0.3, "mustard"], [0.55, 0.05, 0.5, "black"]];
  for (const [x, w, long, part] of tools) mesh.box([x - w / 2, 1.3, -0.29], [x + w / 2, 1.3 + long, -0.27], part);
  mesh.solid([-half + 0.15, 0.92, -0.2], [-half + 0.65, 1.1, 0.1], "red-paint");
  mesh.box([-half + 0.15, 1.1, -0.1], [-half + 0.65, 1.12, 0], "black");
  mesh.tube([half - 0.3, 0.92, 0], [half - 0.3, 1.1, 0], 0.08, 7, "steel", { cap: true });
}

export function tyreStack(mesh: RoomMesh, { count = 4 } = {}) {
  for (let tyre = 0; tyre < count; tyre++) {
    mesh.tube([0, tyre * 0.22, 0], [0, tyre * 0.22 + 0.2, 0], 0.33, 12, "rubber", { cap: true });
    mesh.tube([0, tyre * 0.22 + 0.201, 0], [0, tyre * 0.22 + 0.202, 0], 0.17, 8, "black", { cap: true });
  }
  mesh.block([-0.3, 0, -0.3], [0.3, count * 0.22, 0.3]);
}

export function shelfRack(mesh: RoomMesh, { wide = 1.8, tall = 2.1 } = {}) {
  const half = wide / 2;
  for (const x of [-half, half]) for (const z of [-0.22, 0.22]) mesh.box([x - 0.02, 0, z - 0.02], [x + 0.02, tall, z + 0.02], "iron", { open: true });
  const parts: readonly InteriorPart[] = ["red-paint", "navy", "steel", "linen", "mustard", "moss"];
  for (let shelf = 0; shelf < 4; shelf++) {
    const y = 0.25 + shelf * 0.6;
    mesh.box([-half, y, -0.24], [half, y + 0.03, 0.24], "birch");
    for (let item = 0; item < 3; item++) {
      const x = -half + 0.35 + item * ((wide - 0.6) / 2);
      const tallness = 0.16 + ((shelf + item) % 3) * 0.1;
      mesh.box([x - 0.16, y + 0.03, -0.14], [x + 0.14, y + 0.03 + tallness, 0.14], parts[(shelf * 2 + item) % parts.length]);
    }
  }
  mesh.block([-half, 0, -0.24], [half, tall, 0.24]);
}

/** A table of the kind that stands in a hall or by a window. */
export function sideTable(mesh: RoomMesh, { wood = "walnut" as InteriorPart, lamp = false } = {}) {
  mesh.tube([0, 0, 0], [0, 0.03, 0], 0.18, 8, wood, { cap: true }).tube([0, 0.03, 0], [0, 0.55, 0], 0.025, 5, wood);
  mesh.tube([0, 0.55, 0], [0, 0.58, 0], 0.28, 10, wood, { cap: true });
  if (lamp) tableLamp(mesh, { y: 0.58 });
}
