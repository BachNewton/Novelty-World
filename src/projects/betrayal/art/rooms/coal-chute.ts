import * as THREE from "three";
import { createRng, pick, type Rng } from "@/shared/lib/seeded-random";
import { chamberstick, cobweb, crate, pitHaze, pitShell } from "../kit";
import { lightAnchor } from "../light-anchor";
import { paletteHex, type PaletteKey } from "../palette";
import { INNER, onWall, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, group, pixelPlane, projectUvs, type Batch } from "../shapes";
import { shiny, shinyBatch, SHINES } from "../shine";
import { bricks, flagstones, panelling, pixelTexture, plaster } from "../textures";

/** The chute's mouth in the floor, in room metres: an explorer drops in over its near (−z) lip and slides away towards +z. */
const X0 = -0.3;
const X1 = 0.8;
const CX = (X0 + X1) / 2;
const Z0 = 0.45;
const Z1 = 1.75;
/** Where the slide ends in a lip, inside the mouth, and drops off into the shaft beyond it, open above to the room. */
const ZLIP = 1.0;
/** How far down the shaft's sides go, glowing more and more with the amber from below. */
const SHAFT_FOOT = -2.9;
/** The slide's fall per metre, and its face's height at the mouth. */
const SLOPE = 0.62;
const LIP_Y = -0.04;
/** The lining's thickness, standing just inside the floor's edge. */
const LINING = 0.04;
/** The iron apron at the lip, where an explorer stands to drop. */
const APRON = 0.75;
/** The kerb round the mouth's other three sides. */
const KERB = 0.07;

/** The slide's face at `z`. */
function slideY(z: number): number {
  return LIP_Y - SLOPE * (z - Z0);
}

type Grade = [y: number, colour: PaletteKey, strength: number][];

/** The slide's iron by depth: the room's dim light at the mouth, then a dull ember towards its lip from the light
 *  coming up past it. */
const SLIDE_LIGHT: Grade = [
  [0, "ash", 0.55],
  [-0.1, "ember", 0.25],
  [-0.45, "ember", 0.8],
];

/** The shaft's brick sides by depth: the room's dim light at the mouth, black for the first half metre down, then the
 *  amber of the room below welling up, brighter the deeper it goes, as the Chasm's gulf glows. */
const SHAFT_LIGHT: Grade = [
  [0, "ash", 0.5],
  [-0.14, "void", 1],
  [-0.5, "void", 1],
  [-0.85, "ember", 0.6],
  [-1.4, "amber", 1.1],
  [SHAFT_FOOT, "flame", 1.3],
];

function graded(grade: Grade, y: number): THREE.Color {
  const below = grade.findIndex(([at]) => at < y);
  const lower = below === -1 ? grade.length - 1 : below;
  const upper = Math.max(0, (below === -1 ? grade.length : below) - 1);
  const [y1, c1, s1] = grade[lower];
  const [y0, c0, s0] = grade[upper];
  const t = y0 === y1 ? 0 : (y0 - y) / (y0 - y1);
  return new THREE.Color(paletteHex(c0)).multiplyScalar(s0).lerp(new THREE.Color(paletteHex(c1)).multiplyScalar(s1), t);
}

/** A box of the chute's lining, finely divided so its light can grade with depth, coloured by where each corner lies. */
function liningPiece(size: [number, number, number], at: [number, number, number], grade: Grade, { tilt = 0, strength = 1 } = {}): THREE.BufferGeometry {
  const [w, h, d] = size;
  const geometry = new THREE.BoxGeometry(w, h, d, 1, Math.max(1, Math.ceil(h / 0.08)), Math.max(1, Math.ceil(d / 0.08)));
  geometry.rotateX(tilt).translate(...at);
  const position = geometry.getAttribute("position");
  const colours: number[] = [];
  for (let i = 0; i < position.count; i++) colours.push(...graded(grade, position.getY(i)).multiplyScalar(strength).toArray());
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  return geometry;
}

/**
 * The chute itself, below the floor: a short sheet-iron slide falling away
 * from the near edge of the mouth to a lip, and past the lip a brick shaft
 * dropping straight down into black, with the amber of the room below
 * welling up out of it. The lining carries its own light, graded by depth,
 * rather than taking the house's fill, which would light it as brightly as
 * the floor and flatten the drop into a tray; nothing ends the shaft but the
 * shell's black, in the background's colour, which also hides it all from
 * outside the room. A few lumps of coal lie where they stuck on the slide.
 */
function chute(): THREE.Group {
  const slide: THREE.BufferGeometry[] = [];
  const walls: THREE.BufferGeometry[] = [];
  const angle = Math.atan(SLOPE);
  const run = ZLIP - Z0;
  const length = run / Math.cos(angle);
  const inside: [number, number] = [X0 + LINING, X1 - LINING];
  const width = inside[1] - inside[0];
  // The slide plate, its face on the slope, its top edge just under the apron's nose.
  const along = (z: number, lift: number): [number, number, number] => [CX, slideY(z) + lift / Math.cos(angle), z];
  const plate = 0.03;
  slide.push(liningPiece([width, plate, length], along(Z0 + run / 2, -plate / 2), SLIDE_LIGHT, { tilt: angle }));
  // The seams where its sheets are lapped, dark ribs across it.
  for (const z of [Z0 + 0.18, Z0 + 0.38]) slide.push(liningPiece([width - 0.02, 0.014, 0.04], along(z, 0.004), SLIDE_LIGHT, { tilt: angle, strength: 0.4 }));
  // Its lip: the plate's end rolled under, catching the light from below.
  slide.push(liningPiece([width - 0.01, 0.05, 0.04], [CX, slideY(ZLIP) - 0.045, ZLIP - 0.01], SLIDE_LIGHT, { strength: 1.2 }));
  // The brick cheeks either side, and the shaft's far side, all the way down.
  for (const x of [X0 + LINING / 2, X1 - LINING / 2]) walls.push(liningPiece([LINING, -0.005 - SHAFT_FOOT, Z1 - Z0], [x, (SHAFT_FOOT - 0.005) / 2, (Z0 + Z1) / 2], SHAFT_LIGHT, { strength: 0.6 }));
  // The far side is left plain, so its glow reads as light coming up the dark rather than as a wall facing the slide.
  slide.push(liningPiece([width, -0.005 - SHAFT_FOOT, LINING], [CX, (SHAFT_FOOT - 0.005) / 2, Z1 - LINING / 2], SHAFT_LIGHT, { strength: 0.25 }));
  const brick = bricks({ ramp: ["stoneDark", "stone", "stoneLight"], mortar: "ash", seed: "coal-chute-cheeks" });
  for (const piece of walls) projectUvs(piece, brick);
  const meshes = [
    ...slide.map((piece) => new THREE.Mesh(piece, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }))),
    ...walls.map((piece) => new THREE.Mesh(piece, new THREE.MeshBasicMaterial({ map: brick, vertexColors: true, fog: false }))),
  ];
  // Lumps of coal stuck where they fell on the slide, dark against its glow.
  const lumps = batch();
  const rng = createRng("coal-chute-slide");
  for (let i = 0; i < 4; i++) {
    const z = Z0 + 0.12 + rng.next() * (run - 0.22);
    const x = inside[0] + 0.08 + rng.next() * (width - 0.16);
    const size = 0.05 + rng.next() * 0.05;
    lumps.add(
      [size, size * 0.7, size],
      pick(rng, ["void", "soot", "void"] as const),
      new THREE.Matrix4().compose(new THREE.Vector3(x, slideY(z) + size * 0.3, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, rng.next() * 3, 0)), new THREE.Vector3(1, 1, 1)),
    );
  }
  const coal = lumps.mesh();
  const haze = (z: [number, number], y: number, opacity: number) => pitHaze({ x: inside, z, y, colour: "amber", opacity });
  const shaft: [number, number] = [ZLIP + 0.02, Z1 - LINING - 0.02];
  const shell = pitShell({ x: [X0 - 0.06, X1 + 0.06], z: [Z0 - 0.06, Z1 + 0.06], bottom: SHAFT_FOOT - 0.3 });
  const result = group(...meshes, coal, haze(shaft, -0.6, 0.2), haze(shaft, -0.9, 0.35), haze(shaft, -1.3, 0.5), shell);
  // The lamp of the room below, far down the shaft: its light comes up past the lip and out of the mouth.
  result.add(lightAnchor({ colour: "amber", intensity: 6, range: 4.5, kind: "glow" }, [CX, -2.0, (ZLIP + Z1) / 2]));
  // Its light in the mouth itself, rising onto the lid, the coal and whoever stands at the lip.
  result.add(lightAnchor({ colour: "amber", intensity: 5.5, range: 3.5, kind: "glow" }, [CX, -0.12, (ZLIP + Z1) / 2]));
  for (const mesh of [...meshes, coal]) mesh.userData.noShadow = true;
  return result;
}

/** The iron frame of the mouth, flush on the floor: a worn apron plate at the near lip, rolled over its edge, where an
 *  explorer steps to drop, and a low kerb round the other three sides with the lid's hinge straps. */
function chuteFrame(): THREE.Group {
  const b = batch();
  const [left, right] = [X0 - KERB, X1 + KERB];
  b.block([right - left, 0.014, APRON], "stone", [CX, 0, Z0 - APRON / 2]);
  // The apron's border, a little proud of its plate.
  b.block([right - left - 0.01, 0.022, 0.05], "ash", [CX, 0, Z0 - APRON + 0.03]);
  for (const x of [left + 0.03, right - 0.03]) b.block([0.05, 0.022, APRON - 0.105], "ash", [x, 0, Z0 - APRON + 0.055 + (APRON - 0.105) / 2]);
  // The nose rolled over the lip, into the mouth.
  b.block([X1 - X0 - 0.01, 0.07, 0.05], "sootLight", [CX, -0.055, Z0 + 0.025]);
  for (const x of [X0 - KERB / 2, X1 + KERB / 2]) b.block([KERB, 0.022, Z1 - Z0 + KERB], "ash", [x, 0, (Z0 + Z1 + KERB) / 2]);
  b.block([X1 - X0, 0.022, KERB], "ash", [CX, 0, Z1 + KERB / 2]);
  return group(shinyBatch(b, SHINES.iron));
}

/** The lid's hinge line, along x, just off the floor beyond the mouth's far edge. */
const HINGE: [y: number, z: number] = [0.045, Z1 + 0.04];
/** How far the lid is thrown open, past upright, resting back on its stay. */
const LID_OPEN = (145 * Math.PI) / 180;
const LID: [width: number, length: number] = [X1 - X0 + 0.06, 1.0];

/**
 * The chute's iron lid, thrown open on its hinges and resting back on a stay:
 * a plate that would cover the mouth, braced across its outside, with a drop
 * ring to lift it by. Built at the hinge, it would lie shut towards −z.
 */
function hatchLid(): THREE.Group {
  const iron = shiny(flat("stone"), SHINES.iron);
  const brace = shiny(flat("ash"), SHINES.iron);
  const [width, length] = LID;
  const lid = group(box([width, 0.03, length], iron, [0, 0, -length / 2]));
  // The braces and the ring, on the outside (the top when shut).
  for (const x of [-width / 2 + 0.06, width / 2 - 0.06]) lid.add(box([0.05, 0.025, length - 0.04], brace, [x, 0.028, -length / 2]));
  lid.add(box([width - 0.1, 0.025, 0.05], brace, [0, 0.029, -length + 0.06]));
  const diagonal = box([0.05, 0.022, Math.hypot(width - 0.16, length - 0.12)], brace, [0, 0.03, 0]);
  diagonal.rotation.y = Math.atan2(width - 0.16, length - 0.12);
  diagonal.position.z = -length / 2;
  lid.add(diagonal);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 5, 10), brace);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.06, -length + 0.16);
  lid.add(ring);
  lid.rotation.x = LID_OPEN;
  lid.position.set(0, HINGE[0], 0);
  const knuckles = group();
  for (const x of [-width / 2 + 0.12, width / 2 - 0.12]) {
    const knuckle = cylinder(0.03, 0.16, brace, [0, -0.08, 0], { sides: 6 });
    knuckle.rotation.z = Math.PI / 2;
    knuckle.position.set(x, HINGE[0], 0);
    knuckles.add(knuckle);
  }
  // The stay, an iron bar from a floor plate up to the lid's outside, partway along it.
  const reach = 0.55;
  const outside = 0.03;
  const x = width / 2 - 0.12;
  const under = new THREE.Vector3(x, HINGE[0] + outside * Math.cos(LID_OPEN) + reach * Math.sin(LID_OPEN), outside * Math.sin(LID_OPEN) - reach * Math.cos(LID_OPEN));
  const foot = new THREE.Vector3(x, 0.012, under.z + 0.28);
  const stay = cylinder(0.014, foot.distanceTo(under), brace, [0, 0, 0], { sides: 5 });
  stay.geometry.translate(0, -foot.distanceTo(under) / 2, 0);
  stay.position.copy(foot).add(under).multiplyScalar(0.5);
  stay.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), under.clone().sub(foot).normalize());
  return group(lid, knuckles, stay, box([0.1, 0.012, 0.1], brace, [x, 0, foot.z]));
}

/** A lump of coal lying tumbled on the floor at (x, z): tipped every way, and just bedded in, so no face of it lies level. */
function floorLump(b: Batch, rng: Rng, x: number, z: number, size: number, colours: readonly PaletteKey[]): void {
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler((rng.next() - 0.5) * 0.8, rng.next() * 3, (rng.next() - 0.5) * 0.8));
  const extent = new THREE.Vector3(size / 2, size * 0.35, size / 2);
  let low = Infinity;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) low = Math.min(low, new THREE.Vector3(sx * extent.x, sy * extent.y, sz * extent.z).applyQuaternion(rotation).y);
  b.add([size, size * 0.7, size], pick(rng, colours), new THREE.Matrix4().compose(new THREE.Vector3(x, -low - 0.004, z), rotation, new THREE.Vector3(1, 1, 1)));
}

/** A heap of coal spilled from the chute's side, sloping down to the kerb. */
function coalHeap(): THREE.Group {
  const rng = createRng("coal-chute-heap");
  const radius = 0.62;
  const height = 0.5;
  const lumps = batch();
  for (let i = 0; i < 60; i++) {
    const r = Math.sqrt(rng.next()) * radius;
    const a = rng.next() * Math.PI * 2;
    const size = 0.06 + rng.next() * 0.07;
    const y = Math.max(height * (1 - r / radius) - size * 0.3, 0);
    lumps.add(
      [size, size * 0.75, size],
      pick(rng, ["sootLight", "ash", "stoneDark", "ash"] as const),
      new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r, y + size * 0.37, Math.sin(a) * r * 0.8), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.next() * 3, (rng.next() - 0.5) * 0.4)), new THREE.Vector3(1, 1, 1)),
    );
  }
  const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 8).scale(1, 1, 0.8).translate(0, height / 2, 0), flat("ash"));
  return group(cone, shinyBatch(lumps, SHINES.iron));
}

/** Loose coal strewn over the floor from the heap towards the mouth. */
function strewnCoal(): THREE.Group {
  const rng = createRng("coal-chute-strewn");
  const lumps = batch();
  for (let i = 0; i < 22; i++) {
    const t = rng.next();
    const x = Math.max(0.03, 0.05 + 0.6 * t + (rng.next() - 0.5) * 0.3);
    const z = (rng.next() - 0.5) * 0.9 * (0.4 + t);
    const size = 0.04 + rng.next() * 0.05;
    floorLump(lumps, rng, x, z, size, ["sootLight", "ash", "stoneDark"]);
  }
  return group(shinyBatch(lumps, SHINES.iron));
}

/** A full hessian sack of coal laid on its side, slumped flat; it runs along x. */
function sackShape(length: number, width: number, height: number): THREE.Mesh {
  const geometry = new THREE.IcosahedronGeometry(0.5, 1).scale(length, height, width);
  // Flatten its underside onto the floor, as a full sack settles.
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) position.setY(i, Math.max(position.getY(i), -height * 0.32) + height * 0.32);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, flat("woodLight"));
}

/** Two full sacks of coal, one laid across the other. */
function sacks(): THREE.Group {
  const lower = sackShape(0.85, 0.5, 0.36);
  const upper = sackShape(0.78, 0.46, 0.32);
  upper.position.set(0.05, 0.22, 0.05);
  upper.rotation.y = 0.5;
  const ties = [lower, upper].map((sack, i) => {
    const tie = cylinder(0.05, 0.07, flat("woodDark"), [0, 0, 0], { sides: 6 });
    tie.rotation.z = Math.PI / 2;
    tie.position.set(i === 0 ? 0.44 : 0.4, 0.16, 0);
    sack.add(tie);
    return sack;
  });
  return group(...ties);
}

/** An open-topped plank coal bunker, backed against a wall, half full; its low front faces +z. */
function bunker(): THREE.Group {
  const b = batch();
  const [w, d] = [1.2, 0.78];
  const back = 0.82;
  const front = 0.46;
  b.block([w, back, 0.05], "woodMid", [0, 0, -d / 2 + 0.025]);
  b.block([w, front, 0.05], "woodLight", [0, 0, d / 2 - 0.025]);
  for (const x of [-w / 2 + 0.025, w / 2 - 0.025]) b.block([0.05, back, d - 0.1], "woodMid", [x, 0, 0]);
  // Corner posts, a little proud of the boards.
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) for (const z of [-d / 2 + 0.03, d / 2 - 0.03]) b.block([0.07, z > 0 ? front + 0.04 : back + 0.04, 0.07], "wood", [x, 0, z]);
  // The coal inside, heaped higher at the back.
  const rng = createRng("coal-chute-bunker");
  b.block([w - 0.12, 0.36, d - 0.12], "sootLight", [0, 0, 0]);
  for (let i = 0; i < 26; i++) {
    const size = 0.06 + rng.next() * 0.06;
    const z = (rng.next() - 0.5) * (d - 0.2);
    b.add([size, size * 0.75, size], pick(rng, ["sootLight", "ash", "stoneDark"] as const), new THREE.Matrix4().compose(new THREE.Vector3((rng.next() - 0.5) * (w - 0.24), 0.36 + (0.12 - z * 0.2) * rng.next(), z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.next() * 3, 0.2)), new THREE.Vector3(1, 1, 1)));
  }
  return group(b.mesh());
}

/** The floor the dust lies on, in room metres: clear of the walls' dressing. */
const DRAUGHT: { x: [number, number]; z: [number, number] } = { x: [-2.0, 2.7], z: [-1.6, 2.7] };

/** Rows of the dust on the floor, drawn in long dark streaks from every side to the mouth, as if the chute breathes
 *  in; transparent over the mouth and its frame. */
function draughtRows(): string[] {
  const [columns, count] = [Math.round((DRAUGHT.x[1] - DRAUGHT.x[0]) * 32), Math.round((DRAUGHT.z[1] - DRAUGHT.z[0]) * 32)];
  const rng = createRng("coal-chute-draught");
  const streaks = Array.from({ length: 70 }, () => ({ angle: rng.next() * Math.PI * 2, reach: 1.0 + rng.next() * 1.2, width: 0.012 + rng.next() * 0.02 }));
  const centre: [number, number] = [CX, (Z0 + Z1) / 2];
  const rows: string[] = [];
  for (let r = 0; r < count; r++) {
    let row = "";
    for (let c = 0; c < columns; c++) {
      const x = DRAUGHT.x[0] + (c + 0.5) / 32;
      const z = DRAUGHT.z[0] + (r + 0.5) / 32;
      const overFrame = x > X0 - KERB - 0.02 && x < X1 + KERB + 0.02 && z > Z0 - APRON - 0.02 && z < Z1 + KERB + 0.02;
      const [dx, dz] = [x - centre[0], z - centre[1]];
      const distance = Math.hypot(dx, dz);
      const angle = Math.atan2(dz, dx);
      let mark = ".";
      if (!overFrame) {
        for (const { angle: a, reach, width } of streaks) {
          const turn = Math.atan2(Math.sin(angle - a), Math.cos(angle - a));
          // Each streak narrows to the mouth, as dust drawn along it would.
          const half = width * Math.min(1, distance / 0.9);
          // Solid along most of its length, then breaking up towards its far end.
          if (Math.abs(turn) * distance < half && distance < reach && (distance < reach * 0.65 || rng.next() < (reach - distance) / (reach * 0.35))) {
            mark = distance < 0.9 && rng.next() < 0.5 ? "b" : "a";
            break;
          }
        }
      }
      row += mark;
    }
    rows.push(row);
  }
  return rows;
}

/** The dust drawn in streaks across the floor to the chute's mouth, laid flat just above the stones. */
function draught(): THREE.Group {
  const plane = pixelPlane(pixelTexture(draughtRows(), { a: "stoneDark", b: "ash" }), { alpha: true });
  plane.rotation.x = -Math.PI / 2;
  plane.position.set((DRAUGHT.x[0] + DRAUGHT.x[1]) / 2, 0.006, (DRAUGHT.z[0] + DRAUGHT.z[1]) / 2);
  plane.userData.noShadow = true;
  return group(plane);
}

/** A crate stood on end by the wall, a chamberstick burning low on it. */
function candleCrate(): THREE.Group {
  const stand = crate([0.48, 0.6, 0.42], "wood");
  const light = chamberstick({ height: 0.07, intensity: 1.5, range: 5.5, lift: 0.2 });
  light.position.y = 0.6;
  return group(stand, light);
}

/** The Coal Chute: a service room at the end of the ground floor, where an
 *  iron hatch in the floor stands thrown open on a sheet-iron slide that
 *  falls away under the floor, the amber of the room below coming up it, and
 *  the coal dust on every side of it lies in streaks drawn into its mouth. */
export const COAL_CHUTE: RoomDefinition = {
  id: "coal-chute",
  floor: () => flagstones({ ramp: ["ash", "stoneDark", "stoneDark", "stone"], mortar: "sootLight", stonePx: 14, seed: "coal-chute" }),
  wall: () => plaster({ ramp: ["stoneDark", "stone", "stone"], seed: "coal-chute" }),
  wainscot: () => panelling({ ramp: ["soot", "verdigrisDark", "verdigrisDark"], panelPx: 10, seed: "coal-chute", glints: false }),
  wallMarks: [{ edge: "right", along: 1.0, y: 0.95, size: [1.8, 1.3], change: { recolour: { bone: "boneDark", boneDark: "stoneDark", stoneDark: "ash" } }, shape: "oval", soft: 0.35, seed: "coal-chute-grime" }],
  trim: "soot",
  floorOpenings: [{ x: [X0, X1], z: [Z0, Z1] }],
  props: [
    { build: chute, at: [0, 0] },
    { build: chuteFrame, at: [0, 0], contacts: [{ with: "chute", because: "the apron's nose rolls over the lip onto the head of the slide" }] },
    { build: hatchLid, at: [CX, HINGE[1]] },
    { build: draught, at: [0, 0] },
    { build: coalHeap, at: [1.75, 1.05] },
    { build: strewnCoal, at: [X1 + KERB + 0.05, 0.55], contacts: [{ with: "coalHeap", because: "the strewn coal runs out from the heap's foot" }] },
    { build: sacks, at: [2.05, 2.3], turn: 10 },
    { build: bunker, ...onWall("left", -1.75, { out: 0.45 }) },
    { build: candleCrate, ...onWall("left", 1.3, { out: 0.28 }) },
    { build: () => cobweb({ form: "slung" }), name: "cobweb", at: [-(INNER - 0.29), INNER - 0.29], y: 3.05, turn: 135, walls: ["left", "bottom"] },
  ],
  focus: [CX, 0, 1.0],
  prime: [-1.55, 0.35],
  // The apron at the lip is where an explorer stands to drop: others keep off it, and out of the line to the mouth.
  keepClear: [{ from: [CX, Z0 - APRON / 2], to: [CX, Z0 - APRON / 2], radius: 0.4 }],
};
