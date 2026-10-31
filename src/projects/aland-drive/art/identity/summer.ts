import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { hull, house, houseFar, lettering, letteredWidth, plate, ring, windowFacingZ, type HullStation } from "./kit";
import { IdentityMesh, identityModel, type IdentityPart, type Motion } from "./mesh";

/*
 * A calm Nordic summer: what people leave standing about a shore or a farm. Each
 * stands on its origin, its front to +z, and a yaw on `Placement` turns it.
 */

const SHORE_SWAP_M = 110;
const SHORE_REACH_M = 900;

/** A shore sauna: a tarred log hut with a stovepipe and its own step, the water to its front. */
export function buildSauna(): RoadsideModel {
  const shape = { x: [-1.9, 1.9], z: [-1.5, 1.5], eave: 2.1, ridge: 2.95, wall: "log-wall", roof: "roof" } as const;
  const near = house(new IdentityMesh(), shape);
  plate(near, [0.25, 0.2, 1.52], [0.8, 0, 0], [0, 1.7, 0], "timber-pale");
  windowFacingZ(near, -0.95, 1.35, 1.5, 0.5, 0.4);
  near
    .tube([1.1, 1.8, -0.6], [1.1, 3.7, -0.6], 0.09, 5, { cap: true }, "pipe")
    .tube([1.1, 3.7, -0.6], [1.1, 3.82, -0.6], 0.15, 5, { radiusTo: 0.05, cap: true, shadeFrom: 1.1 }, "pipe")
    .box([-0.6, 0, 1.5], [1.4, 0.2, 2.5], "timber-grey", { open: true, shadeTop: 1.12 })
    // A stack of birch by the gable, and the bucket that's always out.
    .tube([2.05, 0.15, -1.2], [2.05, 0.15, 1.1], 0.16, 4, {}, "birch-log")
    .tube([2.3, 0.15, -1.2], [2.3, 0.15, 1.1], 0.16, 4, {}, "birch-log")
    .tube([2.17, 0.42, -1.2], [2.17, 0.42, 1.1], 0.16, 4, { cap: true }, "birch-log")
    .tube([-0.35, 0.2, 2.15], [-0.35, 0.48, 2.15], 0.14, 5, { radiusTo: 0.17 }, "timber");
  const far = houseFar(new IdentityMesh(), shape).tube([1.1, 2.3, -0.6], [1.1, 3.8, -0.6], 0.12, 3, {}, "pipe");
  return identityModel(near, far, SHORE_SWAP_M, SHORE_REACH_M);
}

const NET_LONG_M = 5.2;

/** Nets drying over a rail on two trestles, along x. The cloth stirs. */
export function buildDryingNets(): RoadsideModel {
  const stir: Motion = (part, [, y]) => (part === "net" ? { kind: "cloth", metres: Math.max(0, 1.75 - y) * 0.05 } : { kind: "still" });
  const trestle = (mesh: IdentityMesh, x: number, sides: 3 | 4) => mesh
    .tube([x, 0, 0.5], [x, 1.9, 0], 0.05, sides, {}, "timber-grey")
    .tube([x, 0, -0.5], [x, 1.9, 0], 0.05, sides, {}, "timber-grey");
  const near = new IdentityMesh();
  for (const x of [0, NET_LONG_M]) trestle(near, x, 4);
  near.tube([-0.2, 1.82, 0], [NET_LONG_M + 0.2, 1.82, 0], 0.045, 4, { cap: true }, "timber-grey");
  const panels = [[0.1, 1.72, 0.15], [1.8, 1.72, 0.05], [3.5, 1.65, 0.12]] as const;
  for (const [x, wide, foot] of panels) {
    const to = x + wide;
    near.face([[x, 1.8, 0.05], [to, 1.8, 0.05], [to - 0.05, foot + 0.1, 0.16], [x + 0.08, foot, 0.14]], "net");
    near.face([[x, 1.8, -0.05], [to, 1.8, -0.05], [to - 0.1, foot + 0.2, -0.16], [x + 0.03, foot + 0.05, -0.14]], "net");
    for (let float = 0; float < 3; float++) {
      const [fx, fy] = [x + 0.3 + float * 0.55, 1.8];
      near.face([[fx - 0.07, fy, 0.08], [fx, fy + 0.07, 0.08], [fx + 0.07, fy, 0.08], [fx, fy - 0.07, 0.08]], "float");
    }
  }
  const far = new IdentityMesh();
  for (const x of [0, NET_LONG_M]) far.tube([x, 0, 0], [x, 1.9, 0], 0.08, 3, {}, "timber-grey");
  far.face([[0, 1.85, 0.08], [NET_LONG_M, 1.85, 0.08], [NET_LONG_M, 0.2, 0.08], [0, 0.2, 0.08]], "net");
  return identityModel(near, far, 70, 420, stir);
}

const ROWING_BOAT: readonly HullStation[] = [
  { x: -2.1, beam: 0.42, gunwale: 0.56, keel: 0.26 },
  { x: -1.3, beam: 0.68, gunwale: 0.5, keel: 0.1 },
  { x: 0, beam: 0.78, gunwale: 0.47, keel: 0.04 },
  { x: 1.3, beam: 0.56, gunwale: 0.52, keel: 0.1 },
  { x: 2.25, beam: 0.02, gunwale: 0.72, keel: 0.5 },
];

/** A rowing boat upturned on two logs for the winter that's never quite over, bow along +x. */
export function buildUpturnedBoat(paint: "tar" | "white" | "green" = "green"): RoadsideModel {
  const upper: IdentityPart = paint === "white" ? "hull-white" : paint === "green" ? "hull-green" : "hull-tar";
  const flip = ([x, y, z]: V3): V3 => [x, 1.02 - y, z];
  const logs = (mesh: IdentityMesh, sides: number) => {
    for (const x of [-1.05, 1.1]) mesh.tube([x, 0.14, -0.95], [x, 0.14, 0.95], 0.13, sides, { cap: true }, "birch-log");
    return mesh;
  };
  const near = hull(logs(new IdentityMesh(), 4), ROWING_BOAT, upper, upper, flip)
    .face([[-2.1, 0.46, -0.42], [-2.1, 0.46, 0.42], [-2.1, 0.76, 0]], upper, 0.86)
    .beam([-2.1, 0.77, 0], [-1.3, 0.93, 0], 0.09, 0.05, "pile")
    .beam([-1.3, 0.93, 0], [0, 0.99, 0], 0.09, 0.05, "pile")
    .beam([0, 0.99, 0], [1.3, 0.93, 0], 0.09, 0.05, "pile")
    .beam([1.3, 0.93, 0], [2.25, 0.54, 0], 0.09, 0.05, "pile");
  const far = hull(new IdentityMesh(), [ROWING_BOAT[0], ROWING_BOAT[2], ROWING_BOAT[4]], upper, upper, flip);
  return identityModel(near, far, 70, 480);
}

/** A folding deck chair: wooden frame, a striped canvas sling. */
function chair(mesh: IdentityMesh, x: number, z: number, y: number, turn: number): IdentityMesh {
  const at = (a: number, up: number, b: number): V3 => [x + a * Math.cos(turn) + b * Math.sin(turn), y + up, z + b * Math.cos(turn) - a * Math.sin(turn)];
  for (const side of [-0.27, 0.27]) {
    mesh.beam(at(side, 0, 0.55), at(side, 0.82, -0.4), 0.03, 0.03, "timber");
    mesh.beam(at(side, 0, -0.32), at(side, 0.38, 0.5), 0.03, 0.03, "timber");
  }
  const stripes: IdentityPart[] = ["chair-blue", "chair-white", "chair-blue"];
  stripes.forEach((part, stripe) => {
    const [from, to] = [-0.25 + (stripe * 0.5) / 3, -0.25 + ((stripe + 1) * 0.5) / 3];
    mesh.face([at(from, 0.82, -0.38), at(to, 0.82, -0.38), at(to, 0.22, 0.02), at(from, 0.22, 0.02)], part);
    mesh.face([at(from, 0.22, 0.02), at(to, 0.22, 0.02), at(to, 0.38, 0.48), at(from, 0.38, 0.48)], part);
  });
  return mesh;
}

/** A deck chair on its own. */
export function buildDeckChair(): RoadsideModel {
  return identityModel(chair(new IdentityMesh(), 0, 0, 0, 0), new IdentityMesh().face([[-0.27, 0.8, -0.4], [0.27, 0.8, -0.4], [0.27, 0.05, 0.5], [-0.27, 0.05, 0.5]], "chair-blue"), 45, 200);
}

/** A red summer cottage with white corners, a deck on the front and two chairs out on it. */
export function buildCottage(): RoadsideModel {
  const shape = { x: [-3.6, 3.6], z: [-2.5, 2.5], eave: 2.5, ridge: 4, wall: "red-boards", roof: "roof", overhang: 0.35 } as const;
  const deckY = 0.42;
  const near = house(new IdentityMesh(), shape);
  for (const [x, z] of [[-3.6, 2.5], [3.6, 2.5], [-3.6, -2.5], [3.6, -2.5]] as const) near.box([x - 0.07, 0, z - 0.07], [x + 0.07, 2.5, z + 0.07], "trim", { open: true });
  near.beam([-3.75, 2.46, 2.53], [3.75, 2.46, 2.53], 0.12, 0.07, "trim");
  plate(near, [-0.45, deckY, 2.52], [0.9, 0, 0], [0, 1.95, 0], "door");
  plate(near, [-0.56, deckY, 2.51], [1.12, 0, 0], [0, 2.06, 0], "trim");
  windowFacingZ(near, -2.2, 1.55, 2.5, 1.1, 0.9);
  windowFacingZ(near, 2.2, 1.55, 2.5, 1.1, 0.9);
  windowFacingZ(near, 0, 1.45, -2.5, 1, 0.8, -1);
  near
    .box([1.7, 3.3, -0.25], [2.2, 4.6, 0.25], "whitewash", { open: true, shadeTop: 0.6 })
    // The deck, its posts and a rail on the two open sides.
    .box([-3.8, 0, 2.5], [3.8, deckY, 5], "timber-grey", { open: true, shadeTop: 1.15 });
  for (const x of [-3.7, 0, 3.7]) near.beam([x, deckY, 4.92], [x, deckY + 0.86, 4.92], 0.07, 0.07, "timber-pale");
  near.beam([-3.75, deckY + 0.86, 4.92], [-1, deckY + 0.86, 4.92], 0.1, 0.05, "timber-pale");
  near.beam([1, deckY + 0.86, 4.92], [3.75, deckY + 0.86, 4.92], 0.1, 0.05, "timber-pale");
  // Two treads down where the rail breaks.
  near.box([-0.8, 0, 5], [0.8, 0.28, 5.35], "timber-grey", { open: true, shadeTop: 1.1 });
  near.box([-0.8, 0, 5.35], [0.8, 0.14, 5.7], "timber-grey", { open: true, shadeTop: 1.1 });
  chair(near, -2.1, 3.9, deckY, 0.35);
  chair(near, -1.1, 4, deckY, -0.2);
  const far = houseFar(new IdentityMesh(), shape).box([-3.8, 0, 2.5], [3.8, deckY, 5], "timber-grey", { open: true, shadeTop: 1.15 });
  return identityModel(near, far, 150, 1100);
}

/** A bonfire stack, not yet lit: logs on end against each other, brush on top and heaped at the foot. */
export function buildBonfireStack(): RoadsideModel {
  const near = new IdentityMesh();
  const spokes = 11;
  for (let spoke = 0; spoke < spokes; spoke++) {
    const angle = (spoke / spokes) * 2 * Math.PI;
    const reach = 1.5 + ((spoke * 7) % 5) * 0.09;
    const foot: V3 = [Math.cos(angle) * reach, 0, Math.sin(angle) * reach];
    const top: V3 = [Math.cos(angle + 0.4) * 0.16, 3.2 + (spoke % 3) * 0.2, Math.sin(angle + 0.4) * 0.16];
    near.tube(foot, top, 0.085, 3, { radiusTo: 0.05 }, spoke % 2 === 0 ? "birch-log" : "bark");
  }
  near.lump([0, 0, 0], 1.3, 0.75, 6, 3, { top: "brush", under: "soil" });
  // Brush thrust in at the top and the skirt, its twigs out at all angles.
  for (let twig = 0; twig < 12; twig++) {
    const angle = twig * 2.4;
    const height = 0.5 + (twig % 4) * 0.9;
    const reach = 1.25 - height * 0.28;
    near.spike([Math.cos(angle) * reach * 0.5, height, Math.sin(angle) * reach * 0.5], [Math.cos(angle) * (reach + 0.8), height + 0.45, Math.sin(angle) * (reach + 0.8)], 0.1, "brush", 0.9 + (twig % 3) * 0.1);
  }
  const far = new IdentityMesh().tube([0, 0, 0], [0, 3.4, 0], 1.45, 4, { radiusTo: 0.1 }, "brush");
  return identityModel(near, far, 80, 700);
}

/** One apple on a tree or in a crate: two triangles either way, an apple from any side. */
function apple(mesh: IdentityMesh, [x, y, z]: V3, radius: number, part: IdentityPart): IdentityMesh {
  return mesh
    .face([[x - radius, y, z], [x, y + radius, z], [x + radius, y, z], [x, y - radius, z]], part)
    .face([[x, y, z - radius], [x, y + radius, z], [x, y, z + radius], [x, y - radius, z]], part, 0.88);
}

const CRATE_W = 0.3;
const CRATE_L = 0.5;
const CRATE_H = 0.3;

/** A slatted crate, at a corner of the model's choosing, with or without its apples. */
function crate(mesh: IdentityMesh, [x, y, z]: V3, full: boolean, fruit: IdentityPart = "apple-red"): IdentityMesh {
  const [w, l, h] = [CRATE_W, CRATE_L, CRATE_H];
  mesh.face([[x - l / 2, y, z - w / 2], [x + l / 2, y, z - w / 2], [x + l / 2, y, z + w / 2], [x - l / 2, y, z + w / 2]], "timber", 0.8);
  for (const side of [-1, 1]) {
    for (const row of [0, 1]) {
      const [low, high] = [y + 0.03 + row * 0.14, y + 0.13 + row * 0.14];
      mesh.face([[x - l / 2, low, z + (side * w) / 2], [x + l / 2, low, z + (side * w) / 2], [x + l / 2, high, z + (side * w) / 2], [x - l / 2, high, z + (side * w) / 2]], "timber", 1);
    }
    mesh.face([[x + (side * l) / 2, y, z - w / 2], [x + (side * l) / 2, y, z + w / 2], [x + (side * l) / 2, y + h, z + w / 2], [x + (side * l) / 2, y + h, z - w / 2]], "timber-pale", 0.92);
  }
  if (full) {
    mesh.face([[x - l / 2, y + h - 0.03, z - w / 2], [x + l / 2, y + h - 0.03, z - w / 2], [x + l / 2, y + h - 0.03, z + w / 2], [x - l / 2, y + h - 0.03, z + w / 2]], fruit, 0.7);
    for (const [a, b] of [[-0.14, -0.06], [0, 0.07], [0.15, -0.05], [-0.07, 0.08], [0.1, 0.08]] as const) apple(mesh, [x + a, y + h, z + b], 0.05, fruit);
  }
  return mesh;
}

/** A stack of two full crates and one empty, for the end of a row. */
export function buildAppleCrates(): RoadsideModel {
  const near = crate(crate(crate(new IdentityMesh(), [0, 0, 0], true), [0.56, 0, 0.04], true, "apple-green"), [0.25, CRATE_H, 0.02], false);
  const far = new IdentityMesh().box([-0.25, 0, -0.15], [0.81, 0.6, 0.19], "timber", { open: true, shadeTop: 1.1 });
  return identityModel(near, far, 40, 240);
}

/** A three-legged picker's ladder, the third leg splayed out behind, standing clear of any tree. */
export function buildOrchardLadder(): RoadsideModel {
  const tall = 3;
  const near = new IdentityMesh();
  for (const side of [-1, 1]) near.beam([side * 0.32, 0, 0.5], [side * 0.05, tall, -0.2], 0.05, 0.08, "timber");
  near.beam([0, 0, -1.15], [0, tall - 0.1, -0.22], 0.05, 0.08, "timber-grey");
  for (let rung = 1; rung < 8; rung++) {
    const share = rung / 8;
    const half = 0.32 + (0.05 - 0.32) * share;
    const [y, z] = [tall * share, 0.5 - 0.7 * share];
    near.beam([-half, y, z], [half, y, z], 0.035, 0.035, "timber-pale");
  }
  const far = new IdentityMesh().face([[-0.3, 0, 0.5], [0.3, 0, 0.5], [0.06, tall, -0.2], [-0.06, tall, -0.2]], "timber");
  return identityModel(near, far, 35, 180);
}

/** An apple tree in a row: a short forked trunk, a low round head, pruned, with the fruit that shows from the road. */
export function buildAppleTree(seed: number, crop: "heavy" | "light" = "heavy"): RoadsideModel {
  const parts = { top: "leaf-lit", under: "leaf-under" } as const;
  const near = new IdentityMesh()
    .tube([0, 0, 0], [0.08, 1.05, 0.05], 0.13, 4, { radiusTo: 0.09 }, "bark")
    .tube([0.08, 1, 0.05], [-0.65, 1.9, 0.25], 0.08, 3, { radiusTo: 0.03 }, "bark")
    .tube([0.08, 1, 0.05], [0.7, 1.95, -0.2], 0.08, 3, { radiusTo: 0.03 }, "bark");
  near.lump([0, 1.15, 0], 1.75, 1.6, 7, seed * 7 + 1, parts);
  near.lump([0.35, 1.9, 0.3], 1.1, 1.25, 6, seed * 13 + 5, { top: "leaf-lit", under: "leaf" });
  near.lump([-0.5, 1.75, -0.35], 1, 1.15, 5, seed * 3 + 9, { top: "leaf", under: "leaf-under" });
  const count = crop === "heavy" ? 13 : 6;
  for (let fruit = 0; fruit < count; fruit++) {
    const angle = fruit * 2.4 + seed;
    const height = 1.25 + ((fruit * 5) % 7) * 0.2;
    const reach = 1.8 * Math.sqrt(1 - ((height - 1.3) / 1.6) ** 2);
    apple(near, [Math.cos(angle) * reach, height, Math.sin(angle) * reach], 0.11, fruit % 4 === 3 ? "apple-green" : "apple-red");
  }
  const far = new IdentityMesh()
    .tube([0, 0, 0], [0, 1.1, 0], 0.13, 3, {}, "bark")
    .tube([0, 1, 0], [0, 2.1, 0], 1.65, 5, { radiusTo: 1.5 }, "leaf-lit")
    .tube([0, 2.1, 0], [0, 3.05, 0], 1.5, 5, { radiusTo: 0.45, cap: true, shadeFrom: 1.05, shadeTo: 1.15 }, "leaf-lit");
  return identityModel(near, far, 90, 700, (part) => (part.startsWith("leaf") ? { kind: "leaf", metres: 0.03 } : { kind: "still" }));
}

/** The harvest's apple as a flat outline, centred on (x, y), facing +z. */
function appleBoard(mesh: IdentityMesh, x: number, y: number, z: number, size: number, part: IdentityPart): IdentityMesh {
  const outline: readonly (readonly [number, number])[] = [[0, 0.3], [0.3, 0.44], [0.6, 0.36], [0.74, 0.06], [0.66, -0.3], [0.42, -0.62], [0.16, -0.68], [0, -0.6], [-0.16, -0.68], [-0.42, -0.62], [-0.66, -0.3], [-0.74, 0.06], [-0.6, 0.36], [-0.3, 0.44]];
  mesh.face(outline.map(([a, b]) => [x + a * size, y + b * size, z]), part);
  mesh.beam([x, y + 0.26 * size, z + 0.01], [x + 0.08 * size, y + 0.66 * size, z + 0.01], 0.09 * size, 0.04 * size, "bark");
  mesh.face([[x + 0.1 * size, y + 0.46 * size, z + 0.01], [x + 0.32 * size, y + 0.72 * size, z + 0.01], [x + 0.56 * size, y + 0.7 * size, z + 0.01], [x + 0.36 * size, y + 0.46 * size, z + 0.01]], "leaf-lit");
  return mesh;
}

/** A harvest banner on a tall pole, hung from a cross-arm: yellow with the apple on it, the sign the harvest weekend is known by. The cloth stirs. */
export function buildHarvestFlag(): RoadsideModel {
  const [top, armM, clothM, low] = [5.4, 1.15, 1, 2.4];
  const stir: Motion = (part, [, y]) => (part === "flag-yellow" || part === "flag-red" || part === "apple-red" || part === "leaf-lit" || part === "bark" ? { kind: "hull", metres: Math.max(0, top - y) * 0.05 } : { kind: "still" });
  const cloth = (mesh: IdentityMesh, emblem: boolean) => {
    const [from, to] = [0.1, 0.1 + clothM];
    mesh.face([[from, top, 0], [to, top, 0], [to, low, 0], [from, low + 0.4, 0]], "flag-yellow");
    if (emblem) {
      mesh.face([[from, top - 0.02, 0.005], [to, top - 0.02, 0.005], [to, top - 0.22, 0.005], [from, top - 0.22, 0.005]], "flag-red");
      for (const side of [0.01, -0.01]) appleBoard(mesh, 0.6, top - 1.1, side, 0.62, "apple-red");
    }
    return mesh;
  };
  const near = cloth(new IdentityMesh(), true)
    .tube([0, -0.2, 0], [0, top + 0.35, 0], 0.05, 5, { radiusTo: 0.03, cap: true }, "trim")
    .beam([0, top + 0.02, 0], [armM, top + 0.02, 0], 0.04, 0.04, "trim");
  const far = cloth(new IdentityMesh(), false).tube([0, 0, 0], [0, top + 0.3, 0], 0.06, 3, {}, "trim");
  return identityModel(near, far, 80, 600, stir);
}

/** An apple-shaped road sign for an open farm, on one post, with an arrow and its words. Facing the road, +z. */
export function buildOpenFarmSign(way: "left" | "right" = "right"): RoadsideModel {
  const y = 1.75;
  const direction = way === "right" ? 1 : -1;
  const words = "ÖPPEN GÅRD";
  const tall = 0.075;
  const near = new IdentityMesh()
    .tube([0, -0.15, -0.04], [0, y + 0.4, -0.04], 0.05, 4, { cap: true }, "timber-grey");
  appleBoard(near, 0, y, 0, 0.72, "apple-red");
  // A white plate across the apple's middle carries the words; a hand-cut arrow rides under it.
  plate(near, [-0.48, y - 0.13, 0.008], [0.96, 0, 0], [0, 0.22, 0], "sign-white");
  lettering(near, words, [-letteredWidth(words, tall) / 2, y - 0.07, 0.014], tall, "sign-ink");
  const a = y - 0.28;
  near.face([[-0.2 * direction, a - 0.025, 0.012], [0.08 * direction, a - 0.025, 0.012], [0.08 * direction, a - 0.075, 0.012], [0.22 * direction, a, 0.012], [0.08 * direction, a + 0.075, 0.012], [0.08 * direction, a + 0.025, 0.012], [-0.2 * direction, a + 0.025, 0.012]], "sign-white");
  const far = new IdentityMesh().tube([0, 0, 0], [0, y, 0], 0.05, 3, {}, "timber-grey").tube([0, y - 0.45, 0], [0, y + 0.35, 0], 0.5, 4, { radiusTo: 0.45, cap: true }, "apple-red");
  return identityModel(near, far, 60, 360);
}

/** A roadside farm stall: a small roofed counter of apples and pancakes under a hand-painted board. */
export function buildFarmStall(): RoadsideModel {
  const [wide, depth, counter, eave] = [2.6, 1.3, 0.92, 2.2];
  const near = new IdentityMesh().box([-wide / 2, 0, -depth / 2], [wide / 2, counter, depth / 2], "grey-boards", { open: true, shadeTop: 1.12 });
  for (const [x, z] of [[-wide / 2, -depth / 2], [wide / 2, -depth / 2], [-wide / 2, depth / 2], [wide / 2, depth / 2]] as const) near.beam([x, counter, z], [x, z > 0 ? eave : eave + 0.3, z], 0.08, 0.08, "timber");
  near
    .face([[-wide / 2 - 0.3, eave - 0.04, depth / 2 + 0.3], [wide / 2 + 0.3, eave - 0.04, depth / 2 + 0.3], [wide / 2 + 0.3, eave + 0.34, -depth / 2 - 0.3], [-wide / 2 - 0.3, eave + 0.34, -depth / 2 - 0.3]], "red-boards", 1.05);
  // The board along the front eave.
  const boardBottom = eave - 0.42;
  plate(near, [-wide / 2 + 0.02, boardBottom, depth / 2 + 0.05], [wide - 0.04, 0, 0], [0, 0.4, 0], "sign-white");
  lettering(near, "ÄPPLEN", [-1.16, boardBottom + 0.09, depth / 2 + 0.06], 0.17, "shirt-red");
  lettering(near, "PANNKAKA", [-0.08, boardBottom + 0.12, depth / 2 + 0.06], 0.13, "sign-ink");
  // Crates of both apples, and a tray of the square-cut baked pancake with prune and cream on each piece.
  crate(near, [-0.92, counter, 0.2], true);
  crate(near, [-0.36, counter, 0.2], true, "apple-green");
  const [tx, tz] = [0.62, 0.15];
  near.box([tx - 0.5, counter, tz - 0.34], [tx + 0.5, counter + 0.05, tz + 0.34], "pancake-crust", { open: true, shadeTop: 0.95 });
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 3; column++) {
      const [x, z] = [tx - 0.32 + column * 0.32, tz - 0.15 + row * 0.3];
      near.face([[x - 0.145, counter + 0.056, z - 0.13], [x + 0.145, counter + 0.056, z - 0.13], [x + 0.145, counter + 0.056, z + 0.13], [x - 0.145, counter + 0.056, z + 0.13]], "pancake", 1.1);
      near.face([[x - 0.06, counter + 0.062, z], [x, counter + 0.062, z - 0.06], [x + 0.06, counter + 0.062, z], [x, counter + 0.062, z + 0.06]], column === 1 ? "cream" : "prune");
    }
  }
  const far = new IdentityMesh()
    .box([-wide / 2, 0, -depth / 2], [wide / 2, counter + 0.2, depth / 2], "grey-boards", { open: true, shadeTop: 1.1 })
    .face([[-wide / 2 - 0.3, eave, depth / 2 + 0.3], [wide / 2 + 0.3, eave, depth / 2 + 0.3], [wide / 2 + 0.3, eave + 0.3, -depth / 2 - 0.3], [-wide / 2 - 0.3, eave + 0.3, -depth / 2 - 0.3]], "red-boards", 1.05)
    .face([[-wide / 2, boardBottom, depth / 2 + 0.05], [wide / 2, boardBottom, depth / 2 + 0.05], [wide / 2, eave, depth / 2 + 0.05], [-wide / 2, eave, depth / 2 + 0.05]], "sign-white");
  return identityModel(near, far, 70, 500);
}

/** The classic picnic table with its two benches on one A-frame, the table along x. */
export function buildPicnicTable(): RoadsideModel {
  const [long, top, seat] = [1.9, 0.74, 0.44];
  const near = new IdentityMesh();
  for (const z of [-0.36, -0.12, 0.12, 0.36]) near.box([-long / 2, top, z - 0.11], [long / 2, top + 0.04, z + 0.11], "timber", { open: true, shadeTop: 1.1 });
  for (const z of [-0.74, 0.74]) near.box([-long / 2, seat, z - 0.13], [long / 2, seat + 0.04, z + 0.13], "timber", { open: true, shadeTop: 1.08 });
  for (const x of [-0.65, 0.65]) {
    near.beam([x, 0, 0.62], [x, top, -0.14], 0.04, 0.09, "timber-grey");
    near.beam([x, 0, -0.62], [x, top, 0.14], 0.04, 0.09, "timber-grey");
    near.beam([x, seat - 0.05, -0.9], [x, seat - 0.05, 0.9], 0.04, 0.08, "timber-grey");
  }
  const far = new IdentityMesh()
    .box([-long / 2, top - 0.05, -0.47], [long / 2, top + 0.04, 0.47], "timber", { open: true, shadeTop: 1.1 })
    .face([[-long / 2, seat, -0.87], [long / 2, seat, -0.87], [long / 2, seat, 0.87], [-long / 2, seat, 0.87]], "timber", 0.95)
    .face([[-0.65, 0, 0.62], [-0.65, 0, -0.62], [-0.65, top, -0.14], [-0.65, top, 0.14]], "timber-grey");
  return identityModel(near, far, 45, 280);
}

/** A bicycle along x, its foot on the origin. `detail` 1 is near; 0 is the plain one a rack holds. */
function bicycle(mesh: IdentityMesh, x: number, z: number, frame: IdentityPart, loaded: boolean, wheelSides: number): IdentityMesh {
  const r = 0.34;
  const at = (a: number, y: number, b = 0): V3 => [x + a, y, z + b];
  ring(mesh, at(-0.5, r), r, 0.04, wheelSides, "tyre");
  ring(mesh, at(0.52, r), r, 0.04, wheelSides, "tyre");
  const seat = at(-0.22, 0.86);
  const head = at(0.32, 0.92);
  const crank = at(-0.08, 0.34);
  const rod = (from: V3, to: V3) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const [nx, ny] = [(-(to[1] - from[1]) / length) * 0.016, ((to[0] - from[0]) / length) * 0.016];
    mesh.face([[from[0] + nx, from[1] + ny, from[2]], [to[0] + nx, to[1] + ny, to[2]], [to[0] - nx, to[1] - ny, to[2]], [from[0] - nx, from[1] - ny, from[2]]], frame);
  };
  for (const [from, to] of [[seat, crank], [crank, head], [seat, head], [crank, at(-0.5, r)], [seat, at(-0.5, r)], [head, at(0.52, r)], [head, at(0.34, 1.02)]] as const) rod(from, to);
  mesh.beam(at(0.34, 1.02, -0.24), at(0.34, 1.02, 0.24), 0.03, 0.03, "tyre");
  mesh.face([[x - 0.32, 0.9, z - 0.06], [x - 0.1, 0.9, z - 0.06], [x - 0.1, 0.9, z + 0.06], [x - 0.32, 0.9, z + 0.06]], "tyre");
  if (loaded) {
    mesh.face([[x - 0.68, 0.74, z - 0.1], [x - 0.3, 0.74, z - 0.1], [x - 0.3, 0.74, z + 0.1], [x - 0.68, 0.74, z + 0.1]], "steel-dark");
    for (const side of [-1, 1]) mesh.box([x - 0.66, 0.42, z + side * 0.1 - 0.05], [x - 0.34, 0.74, z + side * 0.1 + 0.05], "pannier", { open: true });
  }
  return mesh;
}


/** A person standing, from a few boxes and a head in a helmet. Their front is +z. */
function person(mesh: IdentityMesh, x: number, z: number, shirt: IdentityPart, hand: "down" | "out"): IdentityMesh {
  const [hip, shoulder, head] = [0.9, 1.42, 1.62];
  for (const side of [-1, 1]) {
    mesh.beam([x + side * 0.09, 0, z], [x + side * 0.09, hip, z], 0.12, 0.14, "trousers-dark");
    mesh.beam([x + side * 0.23, shoulder - 0.03, z], hand === "out" ? [x + side * 0.26, hip + 0.08, z + 0.32] : [x + side * 0.26, hip - 0.05, z + 0.02], 0.08, 0.08, side > 0 ? "skin" : shirt);
  }
  mesh.tube([x, hip - 0.04, z], [x, shoulder, z], 0.19, 4, { radiusTo: 0.2, cap: true }, shirt);
  mesh.tube([x, shoulder, z], [x, shoulder + 0.09, z], 0.06, 4, {}, "skin");
  mesh.tube([x, head - 0.11, z], [x, head + 0.05, z], 0.1, 5, { radiusTo: 0.1 }, "skin");
  mesh.tube([x, head + 0.03, z], [x, head + 0.17, z], 0.125, 5, { radiusTo: 0.04, cap: true }, "helmet");
  return mesh;
}

/** A cyclist stopped for the view, stood beside their loaded bike, or just stood. */
export function buildCyclist(pose: "with-bike" | "standing", shirt: IdentityPart = "shirt-yellow"): RoadsideModel {
  const near = person(new IdentityMesh(), 0, 0, shirt, pose === "with-bike" ? "out" : "down");
  if (pose === "with-bike") bicycle(near, 0.05, 0.42, "frame-blue", true, 7);
  const far = new IdentityMesh().tube([0, 0, 0], [0, 1.75, 0], 0.2, 3, { radiusTo: 0.1 }, shirt);
  if (pose === "with-bike") far.face([[-0.82, 0, 0.42], [0.86, 0, 0.42], [0.86, 0.95, 0.42], [-0.82, 0.95, 0.42]], "frame-blue");
  return identityModel(near, far, 45, 260);
}

/** A bicycle on its own, on its stand. */
export function buildBicycle(): RoadsideModel {
  const near = bicycle(new IdentityMesh(), 0, 0, "frame-red", false, 10);
  const far = new IdentityMesh().face([[-0.82, 0, 0], [0.86, 0, 0], [0.86, 0.95, 0], [-0.82, 0.95, 0]], "frame-red");
  return identityModel(near, far, 40, 220);
}

/** A touring rest stop's rack: a low timber rail with two loaded bikes leaning on it, along x. */
export function buildTouringRack(): RoadsideModel {
  const near = new IdentityMesh();
  for (const x of [-1.2, 1.2]) near.beam([x, 0, 0], [x, 0.78, 0], 0.09, 0.09, "timber-grey");
  near.beam([-1.3, 0.78, 0], [1.3, 0.78, 0], 0.09, 0.09, "timber-pale");
  bicycle(near, -0.62, 0.22, "frame-blue", false, 6);
  bicycle(near, 0.68, 0.22, "frame-red", false, 6);
  const far = new IdentityMesh()
    .face([[-1.3, 0.05, 0], [1.3, 0.05, 0], [1.3, 0.82, 0], [-1.3, 0.82, 0]], "timber-grey")
    .face([[-1.4, 0, 0.22], [1.5, 0, 0.22], [1.5, 0.9, 0.22], [-1.4, 0.9, 0.22]], "frame-blue");
  return identityModel(near, far, 45, 260);
}
