import { RuralMesh, type RuralPart } from "../rural/mesh";
import type { V3 } from "../roadside/mesh";

/*
 * The outside of a home is a rural-kit model: the same boards, trim and lighting as
 * the countryside it stands in, placed with `placeModel` and `ruralMaterials`. Here
 * are the parts every home shares, in the model's own frame: +z to the road, -z to
 * the water or the back of the plot, ground at y = 0.
 */

export interface Block {
  x: number;
  z: number;
  /** Half sizes across and along the ridge. */
  halfWide: number;
  halfLong: number;
  ridgeAlong: "x" | "z";
  floor?: number;
  eaves: number;
  /** Equal to the eaves is a flat roof. */
  ridge: number;
  overhang?: number;
  wall?: RuralPart;
  roof?: RuralPart;
}

export type WallSide = "front" | "back" | "left" | "right";

/** A point on a block's frame: across its ridge, up, and along it. */
function framed({ x, z, ridgeAlong }: Block) {
  return (across: number, up: number, along: number): V3 => (ridgeAlong === "z" ? [x + across, up, z + along] : [x + along, up, z - across]);
}

export function gabledBlock(mesh: RuralMesh, block: Block, { boards = true } = {}): RuralMesh {
  const { halfWide: w, halfLong: l, floor = 0, eaves, ridge, overhang = 0.35, wall = "red-boards", roof = "roof-dark" } = block;
  const at = framed(block);
  mesh
    .face([at(-w, floor, l), at(w, floor, l), at(w, eaves, l), at(0, ridge, l), at(-w, eaves, l)], wall)
    .face([at(w, floor, -l), at(-w, floor, -l), at(-w, eaves, -l), at(0, ridge, -l), at(w, eaves, -l)], wall, 0.92)
    .face([at(w, floor, l), at(w, floor, -l), at(w, eaves, -l), at(w, eaves, l)], wall, 0.96)
    .face([at(-w, floor, -l), at(-w, floor, l), at(-w, eaves, l), at(-w, eaves, -l)], wall, 0.96);
  const [wOut, lOut] = [w + overhang, l + overhang];
  const low = eaves - (overhang * (ridge - eaves)) / w;
  for (const side of [-1, 1]) {
    mesh.face([at(0, ridge, -lOut), at(0, ridge, lOut), at(side * wOut, low, lOut), at(side * wOut, low, -lOut)], roof, 1.02);
    mesh.face([at(side * w, eaves - 0.14, -lOut), at(side * w, eaves - 0.14, lOut), at(side * wOut, low - 0.1, lOut), at(side * wOut, low - 0.1, -lOut)], "roof-under");
    mesh.face([at(side * wOut, low, -lOut), at(side * wOut, low, lOut), at(side * wOut, low - 0.14, lOut), at(side * wOut, low - 0.14, -lOut)], "trim", 0.95);
    for (const end of [-lOut, lOut]) mesh.face([at(0, ridge + 0.02, end), at(side * wOut, low + 0.02, end), at(side * wOut, low - 0.15, end), at(0, ridge - 0.17, end)], "trim");
    if (!boards) continue;
    for (const end of [-l, l]) {
      const way = Math.sign(end);
      mesh.face([at(side * (w + 0.015), floor, end), at(side * (w + 0.015), eaves, end), at(side * (w + 0.015), eaves, end - way * 0.14), at(side * (w + 0.015), floor, end - way * 0.14)], "trim");
      mesh.face([at(side * w, floor, end + way * 0.015), at(side * w, eaves, end + way * 0.015), at(side * (w - 0.14), eaves, end + way * 0.015), at(side * (w - 0.14), floor, end + way * 0.015)], "trim");
    }
  }
  return mesh;
}

/** A flat-roofed box, with a thin white or dark edge to its roof. */
export function flatBlock(mesh: RuralMesh, block: Block, edge: RuralPart = "roof-dark"): RuralMesh {
  const { x, z, ridgeAlong, halfWide, halfLong, floor = 0, eaves, overhang = 0.3, wall = "tar-boards", roof = "roof-dark" } = block;
  const [halfX, halfZ] = ridgeAlong === "z" ? [halfWide, halfLong] : [halfLong, halfWide];
  mesh.box([x - halfX, floor, z - halfZ], [x + halfX, eaves, z + halfZ], wall, { open: true });
  mesh.box([x - halfX - overhang, eaves, z - halfZ - overhang], [x + halfX + overhang, eaves + 0.28, z + halfZ + overhang], edge);
  mesh.box([x - halfX - overhang + 0.1, eaves + 0.28, z - halfZ - overhang + 0.1], [x + halfX + overhang - 0.1, eaves + 0.31, z + halfZ + overhang - 0.1], roof, { open: true });
  return mesh;
}

/** A plain shape of a block, for distance: its walls and its roof. */
export function farBlock(mesh: RuralMesh, block: Block): RuralMesh {
  const { halfWide: w, halfLong: l, floor = 0, eaves, ridge, overhang = 0.35, wall = "red-boards", roof = "roof-dark" } = block;
  const at = framed(block);
  mesh
    .face([at(-w, floor, l), at(w, floor, l), at(w, eaves, l), at(0, ridge, l), at(-w, eaves, l)], wall)
    .face([at(w, floor, -l), at(-w, floor, -l), at(-w, eaves, -l), at(0, ridge, -l), at(w, eaves, -l)], wall, 0.92)
    .face([at(w, floor, l), at(w, floor, -l), at(w, eaves, -l), at(w, eaves, l)], wall, 0.96)
    .face([at(-w, floor, -l), at(-w, floor, l), at(-w, eaves, l), at(-w, eaves, -l)], wall, 0.96);
  if (ridge > eaves) {
    for (const side of [-1, 1]) mesh.face([at(0, ridge, -l - overhang), at(0, ridge, l + overhang), at(side * (w + overhang), eaves - 0.15, l + overhang), at(side * (w + overhang), eaves - 0.15, -l - overhang)], roof);
  } else {
    mesh.face([at(-w - overhang, eaves + 0.3, -l - overhang), at(w + overhang, eaves + 0.3, -l - overhang), at(w + overhang, eaves + 0.3, l + overhang), at(-w - overhang, eaves + 0.3, l + overhang)], roof);
  }
  return mesh;
}

export interface WallFrame {
  /** A point on the wall: `along` to the right as you face it from outside, `up`, and `out` from its face. */
  at: (along: number, up: number, out?: number) => V3;
}

/** The face of a block on one side, whatever way its ridge runs. */
export function wallOf({ x, z, ridgeAlong, halfWide, halfLong }: Block, side: WallSide): WallFrame {
  const [halfX, halfZ] = ridgeAlong === "z" ? [halfWide, halfLong] : [halfLong, halfWide];
  return {
    at(along, up, out = 0) {
      if (side === "front") return [x + along, up, z + halfZ + out];
      if (side === "back") return [x - along, up, z - halfZ - out];
      if (side === "right") return [x + halfX + out, up, z - along];
      return [x - halfX - out, up, z + along];
    },
  };
}

const plate = (mesh: RuralMesh, { at }: WallFrame, a0: number, y0: number, a1: number, y1: number, out: number, part: RuralPart, shade = 1) => mesh.face([at(a0, y0, out), at(a1, y0, out), at(a1, y1, out), at(a0, y1, out)], part, shade);

export interface WindowOptions {
  wide: number;
  tall: number;
  sill: number;
  panes?: readonly [across: number, up: number];
  frame?: RuralPart;
  /** The white surround and little pediment of an old house. */
  dressed?: boolean;
}

export function windowIn(mesh: RuralMesh, wall: WallFrame, along: number, { wide, tall, sill, panes = [2, 2], frame = "trim", dressed = false }: WindowOptions): RuralMesh {
  const [left, right, top] = [along - wide / 2, along + wide / 2, sill + tall];
  const edge = 0.09;
  plate(mesh, wall, left - edge, sill - edge, right + edge, top + edge, 0.02, frame);
  plate(mesh, wall, left, sill, right, top, 0.03, "glass");
  const [across, up] = panes;
  for (let bar = 1; bar < across; bar++) {
    const a = left + (wide * bar) / across;
    plate(mesh, wall, a - 0.022, sill, a + 0.022, top, 0.04, frame);
  }
  for (let bar = 1; bar < up; bar++) {
    const y = sill + (tall * bar) / up;
    plate(mesh, wall, left, y - 0.022, right, y + 0.022, 0.04, frame);
  }
  if (dressed) {
    mesh.face([wall.at(left - edge - 0.08, top + edge, 0.05), wall.at(right + edge + 0.08, top + edge, 0.05), wall.at(along, top + edge + 0.26, 0.05)], frame);
    plate(mesh, wall, left - edge - 0.05, sill - edge - 0.05, right + edge + 0.05, sill - edge + 0.02, 0.05, frame);
  }
  return mesh;
}

export function doorIn(mesh: RuralMesh, wall: WallFrame, along: number, { wide = 1, tall = 2.1, floor = 0, part = "door" as RuralPart, frame = "trim" as RuralPart, glazed = false } = {}): RuralMesh {
  const [left, right, top] = [along - wide / 2, along + wide / 2, floor + tall];
  const edge = 0.1;
  plate(mesh, wall, left - edge, floor, right + edge, top + edge, 0.02, frame);
  plate(mesh, wall, left, floor, right, top, 0.03, part);
  if (glazed) plate(mesh, wall, left + 0.2, floor + 1.15, right - 0.2, top - 0.2, 0.04, "glass");
  return mesh;
}

/** A garage or barn door, ribbed or with the white cross of a barn. */
export function bigDoorIn(mesh: RuralMesh, wall: WallFrame, along: number, { wide, tall, part = "tar-boards" as RuralPart, frame = "trim" as RuralPart, cross = false, ribs = 4 }: { wide: number; tall: number; part?: RuralPart; frame?: RuralPart; cross?: boolean; ribs?: number }): RuralMesh {
  const [left, right] = [along - wide / 2, along + wide / 2];
  const edge = 0.12;
  plate(mesh, wall, left - edge, 0, right + edge, tall + edge, 0.02, frame);
  plate(mesh, wall, left, 0, right, tall, 0.03, part);
  if (cross) {
    plate(mesh, wall, along - 0.05, 0, along + 0.05, tall, 0.04, frame);
    for (const [a0, a1] of [[left, along], [along, right]]) {
      for (const flip of [false, true]) {
        const [from, to] = flip ? [a1, a0] : [a0, a1];
        mesh.face([wall.at(from, 0, 0.04), wall.at(from + (to - from) * 0.08, 0, 0.04), wall.at(to, tall - 0.28, 0.04), wall.at(to, tall, 0.04), wall.at(to - (to - from) * 0.08, tall, 0.04), wall.at(from, 0.28, 0.04)], frame);
      }
    }
    return mesh;
  }
  for (let rib = 1; rib < ribs; rib++) {
    const y = (tall * rib) / ribs;
    plate(mesh, wall, left, y - 0.02, right, y + 0.02, 0.04, frame, 0.8);
  }
  return mesh;
}

export function chimney(mesh: RuralMesh, x: number, z: number, from: number, to: number, size = 0.32, part: RuralPart = "stone"): RuralMesh {
  mesh.box([x - size, from, z - size], [x + size, to, z + size], part, { open: true });
  return mesh.box([x - size - 0.05, to, z - size - 0.05], [x + size + 0.05, to + 0.1, z + size + 0.05], "trim");
}

export function foundation(mesh: RuralMesh, x0: number, z0: number, x1: number, z1: number, tall = 0.45, part: RuralPart = "stone"): RuralMesh {
  return mesh.box([x0, -0.4, z0], [x1, tall, z1], part, { open: true });
}

/** Steps up to a door on the +z side of a point, wide and running forward. */
export function steps(mesh: RuralMesh, x: number, z: number, rise: number, count: number, wide = 1.3, part: RuralPart = "stone"): RuralMesh {
  for (let step = 0; step < count; step++) {
    const y = rise * (1 - step / count);
    mesh.box([x - wide / 2, -0.1, z + step * 0.3], [x + wide / 2, y, z + (step + 1) * 0.3], part, { open: true });
  }
  return mesh;
}

export function porch(mesh: RuralMesh, x: number, z: number, { wide = 2, deep = 1.4, eaves = 2.5, rise = 2.9, floor = 0.45, wall = "trim" as RuralPart } = {}): RuralMesh {
  mesh.box([x - wide / 2, -0.2, z], [x + wide / 2, floor, z + deep], "deck", { open: true });
  for (const side of [-1, 1]) mesh.tube([x + (side * wide) / 2.3, floor, z + deep - 0.1], [x + (side * wide) / 2.3, eaves, z + deep - 0.1], 0.07, 5, {}, wall);
  const out = deep + 0.2;
  for (const side of [-1, 1]) mesh.face([[x, rise, z], [x, rise, z + out], [x + (side * (wide + 0.4)) / 2, eaves, z + out], [x + (side * (wide + 0.4)) / 2, eaves, z]], "roof-dark", 1.02);
  return mesh.face([[x - wide / 2 - 0.2, eaves, z + out + 0.01], [x + wide / 2 + 0.2, eaves, z + out + 0.01], [x, rise, z + out + 0.01]], "trim");
}

/** A jetty out over the water towards -z: `from` to `to` along z, on piles, deck at `y`. */
export function jetty(mesh: RuralMesh, x: number, from: number, to: number, { wide = 1.6, y = 0.55, bays = 4, ladder = true } = {}): RuralMesh {
  mesh.box([x - wide / 2, y - 0.08, to], [x + wide / 2, y, from], "deck-pale", { shadeTop: 1.04 });
  const planks = 14;
  for (let plank = 1; plank < planks; plank++) {
    const z = from + ((to - from) * plank) / planks;
    mesh.face([[x - wide / 2, y + 0.003, z - 0.012], [x + wide / 2, y + 0.003, z - 0.012], [x + wide / 2, y + 0.003, z + 0.012], [x - wide / 2, y + 0.003, z + 0.012]], "pile");
  }
  for (let bay = 0; bay <= bays; bay++) {
    const z = from + ((to - from) * bay) / bays;
    for (const side of [-1, 1]) mesh.tube([x + (side * wide) / 2, -2.2, z], [x + (side * wide) / 2, y + 0.1, z], 0.07, 4, {}, "pile");
  }
  if (ladder) {
    for (const side of [-1, 1]) mesh.beam([x + side * 0.2, -0.6, to - 0.05], [x + side * 0.2, y + 0.6, to - 0.05], 0.04, 0.04, "tractor-steel");
    for (let rung = 0; rung < 3; rung++) mesh.beam([x - 0.2, -0.2 + rung * 0.3, to - 0.05], [x + 0.2, -0.2 + rung * 0.3, to - 0.05], 0.03, 0.03, "tractor-steel");
  }
  return mesh;
}

/** A plain deck of boards on the ground or on posts. */
export function deck(mesh: RuralMesh, x0: number, z0: number, x1: number, z1: number, y: number, part: RuralPart = "deck"): RuralMesh {
  return mesh.box([x0, -0.3, z0], [x1, y, z1], part, { open: true });
}

export function railing(mesh: RuralMesh, from: V3, to: V3, { posts = 5, tall = 0.95, part = "trim" as RuralPart } = {}): RuralMesh {
  const raised = (point: V3, up: number): V3 => [point[0], point[1] + up, point[2]];
  mesh.beam(raised(from, tall), raised(to, tall), 0.09, 0.05, part);
  mesh.beam(raised(from, 0.12), raised(to, 0.12), 0.06, 0.04, part);
  for (let post = 0; post <= posts; post++) {
    const share = post / posts;
    const at: V3 = [from[0] + (to[0] - from[0]) * share, from[1], from[2] + (to[2] - from[2]) * share];
    mesh.beam(at, raised(at, tall), 0.07, 0.07, part);
  }
  return mesh;
}

/** Standing seams up a gabled roof, the white-painted sheet of the islands. */
export function roofSeams(mesh: RuralMesh, block: Block, count: number): RuralMesh {
  const { halfWide: w, halfLong: l, eaves, ridge, overhang = 0.35 } = block;
  const at = framed(block);
  const low = eaves - (overhang * (ridge - eaves)) / w;
  for (const side of [-1, 1]) {
    for (let seam = 1; seam < count; seam++) {
      const along = -l - overhang + ((2 * (l + overhang)) * seam) / count;
      mesh.face([at(0, ridge + 0.02, along - 0.02), at(0, ridge + 0.02, along + 0.02), at(side * (w + overhang), low + 0.02, along + 0.02), at(side * (w + overhang), low + 0.02, along - 0.02)], "roof-under", 1.5);
    }
  }
  mesh.beam(at(0, ridge + 0.02, -l - overhang), at(0, ridge + 0.02, l + overhang), 0.14, 0.06, "roof-under", 1.3);
  return mesh;
}

export function downpipe(mesh: RuralMesh, wall: WallFrame, along: number, eaves: number): RuralMesh {
  return mesh.tube(wall.at(along, 0.1, 0.08), wall.at(along, eaves, 0.08), 0.045, 4, {}, "trim");
}

/** A stack of split birch against a wall, running along x. */
export function woodpile(mesh: RuralMesh, x: number, z: number, long = 2.4, tall = 1.2): RuralMesh {
  mesh.box([x - long / 2, 0, z - 0.3], [x + long / 2, tall, z + 0.3], "log", { open: true });
  const ends = 7;
  for (let end = 0; end < ends; end++) {
    const across = x - long / 2 + (long * (end + 0.5)) / ends;
    for (const y of [0.25, 0.6, 0.95]) if (y < tall) mesh.face([[across - 0.13, y - 0.13, z + 0.31], [across + 0.13, y - 0.13, z + 0.31], [across + 0.13, y + 0.13, z + 0.31], [across - 0.13, y + 0.13, z + 0.31]], "log-end", end % 2 === 0 ? 1 : 0.86);
  }
  return mesh.box([x - long / 2 - 0.15, tall, z - 0.45], [x + long / 2 + 0.15, tall + 0.05, z + 0.45], "tar-boards");
}

export function flagpole(mesh: RuralMesh, x: number, z: number, tall = 9): RuralMesh {
  mesh.box([x - 0.25, 0, z - 0.25], [x + 0.25, 0.12, z + 0.25], "stone", { open: true });
  mesh.tube([x, 0, z], [x, tall, z], 0.06, 5, { radiusTo: 0.025 }, "trim");
  return mesh.tube([x, tall, z], [x, tall + 0.1, z], 0.06, 5, { cap: true }, "tractor-hub");
}

/** A picket run of low fence from one point to another. */
export function picketFence(mesh: RuralMesh, from: V3, to: V3, pickets: number, part: RuralPart = "trim"): RuralMesh {
  const [dx, dz] = [to[0] - from[0], to[2] - from[2]];
  const size = Math.hypot(dx, dz);
  const [ux, uz] = [dx / size, dz / size];
  mesh.beam([from[0], 0.6, from[2]], [to[0], 0.6, to[2]], 0.09, 0.03, part);
  mesh.beam([from[0], 0.25, from[2]], [to[0], 0.25, to[2]], 0.09, 0.03, part);
  for (let picket = 0; picket <= pickets; picket++) {
    const along = (size * picket) / pickets;
    const [x, z] = [from[0] + ux * along, from[2] + uz * along];
    mesh.face([[x - ux * 0.04, 0, z - uz * 0.04], [x + ux * 0.04, 0, z + uz * 0.04], [x + ux * 0.04, 0.82, z + uz * 0.04], [x, 0.9, z], [x - ux * 0.04, 0.82, z - uz * 0.04]], part);
  }
  return mesh;
}

/** A gravel drive laid on the ground, a flat strip for a plot with no road baked under it. */
export function gravelApron(mesh: RuralMesh, x0: number, z0: number, x1: number, z1: number): RuralMesh {
  return mesh.face([[x0, 0.03, z1], [x1, 0.03, z1], [x1, 0.03, z0], [x0, 0.03, z0]], "stone", 1.1);
}

export function wallLamp(mesh: RuralMesh, wall: WallFrame, along: number, y: number): RuralMesh {
  return mesh.box([...wall.at(along - 0.07, y, 0.02)], [...wall.at(along + 0.07, y + 0.22, 0.14)], "tractor-dark");
}
