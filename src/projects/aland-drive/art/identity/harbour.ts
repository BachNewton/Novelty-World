import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { runMotion } from "../street/paint";
import { house, houseFar, lettering, letteredWidth, plate, ring } from "./kit";
import { IdentityMesh, identityModel, type IdentityPart, type Motion } from "./mesh";

/*
 * Things that say where the sea is. None portrays a particular structure: Åland's
 * real lights differ one from another, so the lighthouse is the type (a slim tapered
 * tower banded in red and white, 16 m to the lantern) and a placement scales it to a
 * real one's height. A kummel is the whitewashed stone cairn the Nordic charts mark;
 * a wooden daymark is the Finnish type, white to seaward (+z) and red elsewhere.
 */

const LIGHT_SWAP_M = 420;
const LIGHT_REACH_M = 8000;

/** A lighthouse on a concrete foot. +z holds its door. */
export function buildLighthouse(): RoadsideModel {
  const [foot, top, gallery] = [1.1, 16, 16.15];
  const radiusAt = (y: number) => 2.25 + ((y - foot) / (top - foot)) * (1.35 - 2.25);
  const bands: readonly [number, number, IdentityPart][] = [[foot, 5.8, "whitewash"], [5.8, 10.6, "flag-red"], [10.6, top, "whitewash"]];
  const sides = 12;
  const near = new IdentityMesh()
    .tube([0, -0.4, 0], [0, foot, 0], 3.1, sides, { radiusTo: 2.8, cap: true, shadeFrom: 0.85 }, "concrete");
  for (const [from, to, part] of bands) near.tube([0, from, 0], [0, to, 0], radiusAt(from), sides, { radiusTo: radiusAt(to), shadeFrom: 0.97, shadeTo: 1.03 }, part);
  // A door up its steps, and three slit windows climbing the stair inside.
  const front = radiusAt(foot) + 0.04;
  plate(near, [-0.48, foot, front], [0.96, 0, 0], [0, 2.1, 0], "trim");
  plate(near, [-0.4, foot, front + 0.02], [0.8, 0, 0], [0, 1.96, 0], "hull-green");
  near.box([-0.8, 0, 2.8], [0.8, foot, 3.8], "concrete", { open: true, shadeTop: 1.08 });
  for (const y of [4.6, 8.4, 12.2]) plate(near, [-0.2, y, radiusAt(y) + 0.05], [0.4, 0, 0], [0, 0.85, 0], "glass");
  near
    .tube([0, top, 0], [0, gallery, 0], 2, sides, { cap: true, shadeFrom: 0.8 }, "steel-dark")
    .tube([0, gallery, 0], [0, gallery + 0.45, 0], 1, 8, { cap: false }, "steel-dark")
    .tube([0, gallery + 0.45, 0], [0, gallery + 1.75, 0], 0.98, 8, { radiusTo: 0.98 }, "lantern-glass")
    .tube([0, gallery + 0.9, 0], [0, gallery + 1.4, 0], 0.32, 6, { cap: true }, "lamp")
    .tube([0, gallery + 1.75, 0], [0, gallery + 2.5, 0], 1.14, 8, { radiusTo: 0.14, shadeFrom: 0.95, shadeTo: 1.1 }, "flag-red")
    .tube([0, gallery + 2.5, 0], [0, gallery + 3.05, 0], 0.05, 3, { radiusTo: 0.01 }, "steel-dark");
  for (let post = 0; post < sides; post++) {
    const [a, b] = [(post / sides) * 2 * Math.PI, ((post + 1) / sides) * 2 * Math.PI];
    const at = (angle: number, y: number): V3 => [Math.cos(angle) * 1.95, y, Math.sin(angle) * 1.95];
    near.beam(at(a, gallery), at(a, gallery + 1), 0.05, 0.05, "steel-dark");
    near.beam(at(a, gallery + 1), at(b, gallery + 1), 0.05, 0.05, "steel-dark");
  }
  const far = new IdentityMesh()
    .tube([0, -0.4, 0], [0, foot, 0], 3, 4, { cap: true }, "concrete");
  for (const [from, to, part] of bands) far.tube([0, from, 0], [0, to, 0], radiusAt(from), 5, { radiusTo: radiusAt(to) }, part);
  far.tube([0, top, 0], [0, gallery + 1.75, 0], 1.7, 5, { radiusTo: 1, shadeFrom: 0.6 }, "steel-dark").tube([0, gallery + 1.75, 0], [0, gallery + 2.5, 0], 1.14, 5, { radiusTo: 0.1, cap: true }, "flag-red");
  return identityModel(near, far, LIGHT_SWAP_M, LIGHT_REACH_M);
}

/** A kummel: a whitewashed cairn of field stones, tapering, about 3 m. */
export function buildKummel(): RoadsideModel {
  const near = new IdentityMesh();
  const courses = [[-0.1, 1.5], [0.8, 1.2], [1.6, 0.9], [2.4, 0.62], [3.1, 0.42]] as const;
  for (let course = 0; course + 1 < courses.length; course++) {
    const [[from, radius], [to, radiusTo]] = [courses[course], courses[course + 1]];
    near.tube([0.04 * course, from, -0.03 * course], [0.05 * course, to, -0.02 * course], radius, 7, { radiusTo, shadeFrom: 0.84 + course * 0.05, shadeTo: 0.92 + course * 0.04, cap: course === courses.length - 2 }, "whitewash");
  }
  // The field stones of its foot, not all whitewashed any more.
  for (let stone = 0; stone < 6; stone++) {
    const angle = stone * 1.05 + 0.3;
    near.lump([Math.cos(angle) * 1.5, -0.05, Math.sin(angle) * 1.5], 0.3 + (stone % 3) * 0.07, 0.36, 4, stone + 2, { top: stone % 2 === 0 ? "whitewash" : "rock", under: "rock" });
  }
  const far = new IdentityMesh().tube([0, -0.1, 0], [0, 3.2, 0], 1.5, 4, { radiusTo: 0.35, cap: true }, "whitewash");
  return identityModel(near, far, 140, 3000);
}

/** A sjömärke of boards: an open four-legged frame, boarded in its top half, a square topmark above. Its +z looks out to sea. */
export function buildWoodenDaymark(): RoadsideModel {
  const [high, base, skirt] = [7.2, 2.4, 3.2];
  const half = (y: number) => base * (1 - y / (high + 1));
  const near = new IdentityMesh();
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const;
  for (const [a, b] of corners) near.tube([a * base, -0.1, b * base], [a * half(high), high, b * half(high)], 0.1, 4, { radiusTo: 0.07 }, "pile");
  const sidesOf: readonly [V3, V3, IdentityPart][] = [[[1, 0, 1], [-1, 0, 1], "whitewash"], [[-1, 0, 1], [-1, 0, -1], "flag-red"], [[-1, 0, -1], [1, 0, -1], "flag-red"], [[1, 0, -1], [1, 0, 1], "flag-red"]];
  for (const [a, b, part] of sidesOf) {
    const at = ([x, , z]: V3, y: number): V3 => [x * half(y), y, z * half(y)];
    near.face([at(a, skirt), at(b, skirt), at(b, high), at(a, high)], part, part === "whitewash" ? 1 : 0.95);
    near.beam(at(a, 1.4), at(b, 1.4), 0.08, 0.1, "pile");
  }
  near.box([-0.55, high, -0.05], [0.55, high + 1.1, 0.05], "flag-red", {});
  near.tube([0, high - 0.1, 0.1], [0, high + 1.35, 0.1], 0.05, 3, { cap: true }, "pile");
  const far = new IdentityMesh()
    .tube([0, skirt, 0], [0, high, 0], half(skirt) * 1.41, 4, { radiusTo: half(high) * 1.41, cap: true }, "flag-red")
    .tube([0, -0.1, 0], [0, skirt, 0], 0.5, 3, {}, "pile");
  return identityModel(near, far, 160, 3000);
}

/** A hut on a quay's edge with its stacked floats, along a shed's long side. */
export function buildFishingHut(paint: "tarred" | "red" = "tarred"): RoadsideModel {
  const wall: IdentityPart = paint === "red" ? "red-boards" : "tar-boards";
  const shape = { x: [-2.4, 2.4], z: [-1.7, 1.7], eave: 2, ridge: 3, wall, roof: "roof", gable: wall } as const;
  const near = house(new IdentityMesh(), shape);
  plate(near, [-1.5, 0, 1.72], [1.1, 0, 0], [0, 1.8, 0], "grey-boards");
  plate(near, [0.3, 0.9, 1.72], [0.7, 0, 0], [0, 0.6, 0], "trim");
  plate(near, [0.36, 0.96, 1.74], [0.58, 0, 0], [0, 0.48, 0], "glass");
  // Floats drying on the wall on a line, a lifebuoy by the door, a barrel.
  near.beam([-0.2, 1.75, 1.76], [2.3, 1.75, 1.76], 0.02, 0.02, "rope");
  for (let hung = 0; hung < 4; hung++) near.box([0.05 + hung * 0.55, 1.45, 1.74], [0.3 + hung * 0.55, 1.73, 1.84], hung % 2 === 0 ? "float" : "float-white", { shadeTop: 1.1 });
  ring(near, [-2, 1.3, 1.74], 0.26, 0.09, 8, "float");
  near.tube([2.1, 0, 2.2], [2.1, 0.8, 2.2], 0.28, 6, { radiusTo: 0.26, cap: true, shadeTo: 1.05 }, "timber-grey");
  const far = houseFar(new IdentityMesh(), shape);
  return identityModel(near, far, 110, 900);
}

/** A net in a heap on a pallet with its floats, as left on a quay. */
export function buildNetHeap(): RoadsideModel {
  const near = new IdentityMesh().box([-0.6, 0, -0.5], [0.6, 0.12, 0.5], "timber-grey", { open: true, shadeTop: 1.05 });
  near.lump([0, 0.12, 0], 0.5, 0.62, 7, 11, { top: "rope", under: "steel-dark" });
  for (const [x, z] of [[-0.3, 0.3], [0.1, 0.42], [0.42, 0.1], [0.25, -0.3], [-0.38, -0.2]] as const) near.box([x - 0.07, 0.34, z - 0.07], [x + 0.07, 0.46, z + 0.07], "float");
  const far = new IdentityMesh().tube([0, 0, 0], [0, 0.7, 0], 0.6, 4, { radiusTo: 0.25, cap: true }, "rope");
  return identityModel(near, far, 40, 240);
}

/** One section of the wire a cable ferry hauls itself along: a run, placed with `runSections`, so a slip of sag along +x. */
export const FERRY_CABLE_M = 20;

export function buildFerryCable(): RoadsideModel {
  const sagged = (x: number) => -0.15 - 0.12 * (1 - ((x - FERRY_CABLE_M / 2) / (FERRY_CABLE_M / 2)) ** 2);
  const mesh = new IdentityMesh();
  for (let step = 0; step < 4; step++) {
    const [a, b] = [(step / 4) * FERRY_CABLE_M, ((step + 1) / 4) * FERRY_CABLE_M];
    mesh.beam([a, sagged(a), 0], [b, sagged(b), 0], 0.05, 0.05, "pipe");
  }
  return identityModel(mesh, null, 800, 800, runMotion as unknown as Motion);
}

/** A small cable ferry, for later: an open car deck with a ramp each end and a wheelhouse up on one side, hauled along a wire. Its origin is on the water, the way across along +x. */
export function buildCableFerry(): RoadsideModel {
  const [long, wide, deck] = [18, 6.6, 0.9];
  const hullSide = (mesh: IdentityMesh) => {
    mesh.box([-long / 2, -0.7, -wide / 2], [long / 2, deck, wide / 2], "hull-blue", { open: true, shadeTop: 0.9 });
    return mesh;
  };
  const near = hullSide(new IdentityMesh({ afloat: true }));
  near.face([[-long / 2, deck + 0.01, -2.6], [long / 2, deck + 0.01, -2.6], [long / 2, deck + 0.01, 2.6], [-long / 2, deck + 0.01, 2.6]], "deck-paint");
  for (const z of [-2.7, 2.7]) near.face([[-long / 2, deck + 0.02, z - 0.06], [long / 2, deck + 0.02, z - 0.06], [long / 2, deck + 0.02, z + 0.06], [-long / 2, deck + 0.02, z + 0.06]], "ramp-yellow");
  for (let dash = 0; dash < 7; dash++) {
    const x = -7 + dash * 2.34;
    near.face([[x, deck + 0.02, -0.06], [x + 1.2, deck + 0.02, -0.06], [x + 1.2, deck + 0.02, 0.06], [x, deck + 0.02, 0.06]], "trim");
  }
  // Ramps at both ends, hinged at the deck and lifted clear of the water.
  for (const end of [-1, 1]) {
    const [hinge, tipX, tipY] = [(end * long) / 2, (end * (long + 5)) / 2, deck + 0.85];
    near.face([[hinge, deck, -2.9], [hinge, deck, 2.9], [tipX, tipY, 2.9], [tipX, tipY, -2.9]], "ramp-yellow");
    near.face([[tipX, tipY, -2.9], [tipX, tipY, 2.9], [tipX, tipY - 0.2, 2.9], [tipX, tipY - 0.2, -2.9]], "steel-dark");
    for (const z of [-3, 3]) {
      near.face([[hinge, deck, z], [tipX, tipY, z], [tipX, tipY - 0.2, z], [hinge, deck - 0.2, z]], "steel-dark", 0.9);
      near.beam([hinge - end * 0.4, deck + 2.2, z], [tipX - end * 0.3, tipY + 0.05, z], 0.04, 0.04, "steel");
      near.tube([hinge - end * 0.4, deck, z], [hinge - end * 0.4, deck + 2.3, z], 0.09, 4, { cap: true }, "steel-dark");
    }
  }
  // Side rails: posts and two bars down each side.
  for (const z of [-wide / 2 + 0.06, wide / 2 - 0.06]) {
    for (const y of [deck + 0.55, deck + 1.05]) near.beam([-long / 2 + 0.3, y, z], [long / 2 - 0.3, y, z], 0.05, 0.05, "hull-white");
    for (let post = 0; post < 7; post++) {
      const x = -8.6 + post * 2.87;
      near.beam([x, deck, z], [x, deck + 1.05, z], 0.05, 0.05, "hull-white");
    }
  }
  // The wheelhouse on legs over the +z rail, cars passing under its side.
  const [hx, hz, floor] = [0, wide / 2 - 0.55, deck + 2.4];
  for (const [x, z] of [[-1, -0.45], [1, -0.45], [-1, 0.55], [1, 0.55]] as const) near.tube([hx + x, deck, hz + z], [hx + x, floor, hz + z], 0.07, 4, {}, "hull-white");
  near
    .box([hx - 1.3, floor - 0.04, hz - 0.65], [hx + 1.3, floor + 1, hz + 0.7], "hull-white", { shadeTop: 1.05 })
    .box([hx - 1.3, floor + 1, hz - 0.65], [hx + 1.3, floor + 1.75, hz + 0.7], "lantern-glass", { open: true, shadeTop: 1 })
    .box([hx - 1.5, floor + 1.75, hz - 0.85], [hx + 1.5, floor + 1.87, hz + 0.9], "hull-white", { shadeTop: 1.05 })
    .tube([hx, floor + 1.87, hz], [hx, floor + 2.8, hz], 0.05, 3, { cap: true }, "steel-dark");
  // The sheaves the wire runs over, port and starboard of the wheelhouse.
  for (const x of [-long / 2 + 0.6, long / 2 - 0.6]) near.box([x - 0.35, deck, -wide / 2 + 0.05], [x + 0.35, deck + 0.45, -wide / 2 + 0.55], "steel-dark", {});
  const far = hullSide(new IdentityMesh({ afloat: true }))
    .box([hx - 1.3, deck, hz - 0.65], [hx + 1.3, floor + 1.8, hz + 0.7], "hull-white", { open: true, shadeTop: 1.05 });
  for (const end of [-1, 1]) far.face([[(end * long) / 2, deck, -2.9], [(end * long) / 2, deck, 2.9], [(end * (long + 5)) / 2, deck + 0.85, 2.9], [(end * (long + 5)) / 2, deck + 0.85, -2.9]], "ramp-yellow");
  return identityModel(near, far, 240, 2400, (_, [, y]) => ({ kind: "hull", metres: Math.max(0, y + 0.5) * 0.015 }));
}

const TOWER_M = 12;

/** A timber viewing tower: four legged, braced, a zig-zag stair and a roofed top. */
export function buildViewingTower(): RoadsideModel {
  const [foot, head] = [2.4, 1.6];
  const half = (y: number) => foot + (y / TOWER_M) * (head - foot);
  const near = new IdentityMesh();
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const;
  corners.forEach(([a, b]) => near.tube([a * foot, -0.2, b * foot], [a * head, TOWER_M + 2.4, b * head], 0.14, 4, { radiusTo: 0.1 }, "timber"));
  const levels = [0, 3, 6, 9, TOWER_M];
  for (let level = 0; level + 1 < levels.length; level++) {
    const [low, high] = [levels[level], levels[level + 1]];
    corners.forEach(([a, b], side) => {
      const [c, d] = corners[(side + 1) % 4];
      near.beam([a * half(high), high, b * half(high)], [c * half(high), high, d * half(high)], 0.09, 0.14, "timber");
      if (level % 2 === (side + 1) % 2) near.beam([a * half(low), low, b * half(low)], [c * half(high), high, d * half(high)], 0.07, 0.11, "timber-grey");
    });
    // A stair flight up inside, turning each landing.
    const [y, x0, x1] = [low + 0.05, level % 2 === 0 ? -1.2 : 1.2, level % 2 === 0 ? 1.2 : -1.2];
    const side = level % 2 === 0 ? 0.55 : -0.55;
    near.face([[x0, y, side + 0.4], [x1, high, side + 0.4], [x1, high, side - 0.4], [x0, y, side - 0.4]], "timber-pale", 0.95);
    near.beam([x0, y + 0.95, side + 0.42], [x1, high + 0.95, side + 0.42], 0.05, 0.05, "timber-grey");
  }
  const top = half(TOWER_M) + 0.35;
  near.box([-top, TOWER_M, -top], [top, TOWER_M + 0.12, top], "timber-pale", { shadeTop: 1.12 });
  const eave = TOWER_M + 2.35;
  near.face([[-top - 0.4, eave, top + 0.4], [top + 0.4, eave, top + 0.4], [0, eave + 1.3, 0]], "roof", 1.05);
  near.face([[top + 0.4, eave, top + 0.4], [top + 0.4, eave, -top - 0.4], [0, eave + 1.3, 0]], "roof", 0.98);
  near.face([[top + 0.4, eave, -top - 0.4], [-top - 0.4, eave, -top - 0.4], [0, eave + 1.3, 0]], "roof", 0.92);
  near.face([[-top - 0.4, eave, -top - 0.4], [-top - 0.4, eave, top + 0.4], [0, eave + 1.3, 0]], "roof", 0.96);
  const railAt = [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const;
  railAt.forEach(([a, b], side) => {
    const [c, d] = railAt[(side + 1) % 4];
    for (const y of [TOWER_M + 0.55, TOWER_M + 1.08]) near.beam([a * top, y, b * top], [c * top, y, d * top], 0.06, 0.09, "timber-pale");
  });
  const far = new IdentityMesh();
  far.tube([0, -0.2, 0], [0, TOWER_M, 0], foot * 1.41, 4, { radiusTo: head * 1.41 }, "timber");
  far.tube([0, TOWER_M, 0], [0, eave, 0], head * 1.41, 4, { shadeFrom: 0.55 }, "pile");
  far.tube([0, eave, 0], [0, eave + 1.3, 0], (top + 0.4) * 1.41, 4, { radiusTo: 0.05 }, "roof");
  return identityModel(near, far, 200, 2400);
}

/** A wooden viewpoint platform: a raised deck with rails and a stair, its bench and a small board facing the view, +z. */
export function buildViewpointPlatform(): RoadsideModel {
  const [wide, depth, high] = [5, 3.4, 1.9];
  const near = new IdentityMesh();
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]] as const) near.beam([(x * wide) / 2, -0.1, (z * depth) / 2], [(x * wide) / 2, high + 1.05, (z * depth) / 2], 0.13, 0.13, "timber");
  near.box([-wide / 2 - 0.05, high - 0.12, -depth / 2 - 0.05], [wide / 2 + 0.05, high, depth / 2 + 0.05], "timber-pale", { shadeTop: 1.12 });
  for (const y of [high + 0.5, high + 1]) {
    near.beam([-wide / 2, y, depth / 2], [wide / 2, y, depth / 2], 0.07, 0.1, "timber-pale");
    near.beam([-wide / 2, y, depth / 2], [-wide / 2, y, -depth / 2], 0.07, 0.1, "timber-pale");
    near.beam([wide / 2, y, depth / 2], [wide / 2, y, -depth / 2], 0.07, 0.1, "timber-pale");
    near.beam([-wide / 2, y, -depth / 2], [-0.6, y, -depth / 2], 0.07, 0.1, "timber-pale");
  }
  // A stair up the back, an opening in the rail at its head.
  near.face([[0.6, high, -depth / 2], [-0.6, high, -depth / 2], [-0.6, 0, -depth / 2 - 2.6], [0.6, 0, -depth / 2 - 2.6]], "timber-pale", 1.05);
  for (let tread = 1; tread < 7; tread++) {
    const share = tread / 7;
    near.beam([-0.62, high * share, -depth / 2 - 2.6 * (1 - share)], [0.62, high * share, -depth / 2 - 2.6 * (1 - share)], 0.26, 0.05, "timber", 0.92, 1.1);
  }
  near.box([-1.5, high + 0.42, -1.3], [0, high + 0.48, -0.92], "timber", { open: true, shadeTop: 1.1 });
  for (const x of [-1.4, -0.1]) near.beam([x, high, -1.1], [x, high + 0.42, -1.1], 0.06, 0.28, "timber-grey");
  const word = "UTSIKT";
  near.beam([1.3, high, 1.45], [1.3, high + 1.2, 1.45], 0.08, 0.08, "timber-grey");
  plate(near, [0.8, high + 0.86, 1.33], [1, 0, 0], [0, 0.46, 0], "sign-white");
  lettering(near, word, [1.3 - letteredWidth(word, 0.12) / 2, high + 1.03, 1.34], 0.12, "sign-ink");
  const far = new IdentityMesh()
    .box([-wide / 2, 0, -depth / 2], [wide / 2, high, depth / 2], "timber-grey", { open: true, shadeTop: 1.12 })
    .face([[-wide / 2, high + 1, depth / 2], [wide / 2, high + 1, depth / 2], [wide / 2, high + 0.5, depth / 2], [-wide / 2, high + 0.5, depth / 2]], "timber-pale");
  return identityModel(near, far, 100, 900);
}
