import * as THREE from "three";
import { createRng, uniform } from "@/shared/lib/seeded-random";
import type { Edge } from "../../types";
import { animated } from "../animate";
import { pitHaze, pitShell } from "../kit";
import { lightAnchor } from "../light-anchor";
import { paletteHex, RAMPS, type PaletteKey } from "../palette";
import { CUT_HEIGHT, DOOR_HEIGHT, onWall, type PropPlacement, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, glow, group, lathe, lightMaterial, pixelPlane } from "../shapes";
import { panelling, pixelTexture, svgTexture, TEXELS_PER_METRE, type PixelLegend } from "../textures";

const hex = paletteHex;

/** The slots in the cab floor along the left and right walls, where the
 *  pulley wheels turn half sunk into the dark of the shaft. */
const SLOT = { x: [2.2, 2.62] as [number, number], z: [-1.0, 1.0] as [number, number], depth: 1.1 };
const SLOT_MID = (SLOT.x[0] + SLOT.x[1]) / 2;
const WHEEL = { radius: 0.74, rim: 0.06, axle: 0.1 };

/** Where the control column stands, and the sigil ring is laid around it. */
const COLUMN: [number, number] = [0.6, 0.45];

/** Riveted iron tread plate in one-metre plates: the cab floor is a machine's,
 *  not the house's. */
function treadPlate(): THREE.Texture {
  const size = TEXELS_PER_METRE;
  const rng = createRng("mystic-elevator:plate");
  const rows: string[] = [];
  for (let y = 0; y < size; y++) {
    let row = "";
    for (let x = 0; x < size; x++) {
      const cellX = x % 4;
      const cellY = y % 4;
      const flip = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      let c = rng.next() < 0.06 ? "w" : "p";
      if (x === 0 || y === 0) c = "s";
      else if (x === 1 || y === 1) c = "h";
      else if ((x === 3 || x === size - 2) && y % 6 === 3) c = "r";
      else if ((y === 3 || y === size - 2) && x % 6 === 3) c = "r";
      else if (x > 4 && y > 4 && x < size - 4 && y < size - 4) {
        if (flip ? cellY === 2 && cellX >= 1 && cellX <= 2 : cellX === 2 && cellY >= 1 && cellY <= 2) c = "d";
        else if (flip ? cellY === 3 && cellX === 2 : cellX === 3 && cellY === 2) c = "s";
      }
      row += c;
    }
    rows.push(row);
  }
  return pixelTexture(rows, { p: "ash", w: "stoneDark", s: "soot", h: "stoneDark", r: "stone", d: "stone" }, true);
}

/** The dial's face, in pixels: the four floors as dice pips (4 for any floor,
 *  then upper, ground and basement), and at the bottom the red ring of the
 *  roll that names no floor. */
function dialFace(): THREE.Texture {
  const size = 26;
  const centre = (size - 1) / 2;
  const grid: string[][] = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const r = Math.hypot(x - centre, y - centre);
      if (r > 11.6) return ".";
      if (r > 10.4) return "o";
      if (r > 9.4) return "i";
      return "f";
    }),
  );
  const put = (x: number, y: number, c: string) => {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) grid[y + dy][x + dx] = c;
  };
  const marks: [angle: number, pips: [number, number][]][] = [
    [-90, [[-2, -2], [1, -2], [-2, 1], [1, 1]]],
    [-30, [[-2, -2], [-0.5, -0.5], [1, 1]]],
    [30, [[-2, -2], [1, 1]]],
    [90, [[-0.5, -0.5]]],
  ];
  for (const [angle, pips] of marks) {
    const a = THREE.MathUtils.degToRad(angle);
    const cx = centre + Math.sin(a) * 6.5;
    const cy = centre - Math.cos(a) * 6.5;
    for (const [px, py] of pips) put(Math.round(cx + px), Math.round(cy + py), "m");
    const tx = Math.round(centre + Math.sin(a) * 9.9);
    const ty = Math.round(centre - Math.cos(a) * 9.9);
    grid[ty][tx] = "m";
  }
  const zeroY = Math.round(centre + 6.5);
  const zeroX = Math.round(centre);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dy)) === 2 && Math.abs(dx) + Math.abs(dy) < 4;
      if (ring) grid[zeroY + dy][zeroX + dx] = "z";
    }
  }
  const legend: PixelLegend = { o: "bruise", i: "bruiseLight", f: "bruiseDark", m: "violet", z: "scarlet" };
  return pixelTexture(
    grid.map((row) => row.join("")),
    legend,
  );
}

/**
 * The lift's control column, an iron pedestal under a brass drum like a
 * ship's engine telegraph, its dial on both faces glowing violet. The needle
 * has swung down past the floors to the red mark of the drop. Faces +z.
 */
function controlColumn(): THREE.Group {
  const iron = flat("sootLight");
  const brass = flat("brass");
  const pedestal = lathe(
    [
      [0, 0],
      [0.32, 0],
      [0.32, 0.07],
      [0.24, 0.1],
      [0.13, 0.18],
      [0.09, 0.85],
      [0.14, 0.9],
      [0.14, 1.06],
      [0, 1.06],
    ],
    iron,
    10,
  );
  const collar = cylinder(0.15, 0.06, brass, [0, 0.86, 0], { sides: 10 });
  const foot = cylinder(0.34, 0.03, brass, [0, 0.06, 0], { top: 0.3, sides: 10 });

  const radius = 0.42;
  const depth = 0.16;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 20).rotateX(Math.PI / 2), iron);
  const head = group(drum);
  const face = dialFace();
  for (const turn of [0, Math.PI]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.01, 0.03, 4, 20), brass);
    rim.position.z = depth / 2;
    const dial = pixelPlane(face, { lit: false, alpha: true });
    dial.material = glow("violet", face);
    dial.position.z = depth / 2 + 0.01;
    dial.userData.noShadow = true;
    const needle = group(
      box([0.035, 0.27, 0.02], flat("boneLight"), [0, -0.27, 0]),
      new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8).rotateX(Math.PI / 2), brass),
    );
    needle.position.z = depth / 2 + 0.035;
    needle.rotation.z = 0.12;
    const facing = group(rim, dial, needle);
    facing.rotation.y = turn;
    head.add(facing);
  }
  head.add(box([0.1, 0.1, 0.1], brass, [0, radius - 0.04, 0]), cylinder(0.035, 0.12, brass, [0, radius + 0.06, 0], { sides: 6 }));
  head.position.y = 1.06 + radius - 0.04;
  head.rotation.x = -0.32;
  return group(pedestal, collar, foot, head, lightAnchor({ colour: "violet", intensity: 9, range: 8, flicker: 0.08 }, [0, 1.75, 0.7]));
}

function svg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;
}

/** The sigil ring laid in light on the floor around the column: two circles,
 *  and between them the five marks of the dial. Light, not paint. */
function sigil(): THREE.Group {
  const size = 72;
  const c = size / 2;
  const marks = [-90, -30, 30, 90, 180]
    .map((angle) => {
      const a = THREE.MathUtils.degToRad(angle);
      const x = c + Math.sin(a) * 30;
      const y = c - Math.cos(a) * 30;
      const colour = angle === 180 ? "scarlet" : "violet";
      return `<rect x="${(x - 2).toFixed(1)}" y="${(y - 2).toFixed(1)}" width="4" height="4" fill="${hex(colour)}" transform="rotate(45 ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    })
    .join("");
  const art = svg(
    size,
    size,
    `<rect width="${size}" height="${size}" fill="${hex("void")}"/>
<circle cx="${c}" cy="${c}" r="34" fill="none" stroke="${hex("violet")}" stroke-width="2"/>
<circle cx="${c}" cy="${c}" r="26" fill="none" stroke="${hex("bruiseLight")}" stroke-width="1.5"/>
<circle cx="${c}" cy="${c}" r="12" fill="none" stroke="${hex("bruise")}" stroke-width="1"/>${marks}`,
  );
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size / TEXELS_PER_METRE, size / TEXELS_PER_METRE), lightMaterial(0.8, { map: svgTexture(art, size, size) }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.012;
  plane.userData.noShadow = true;
  return group(plane);
}

/**
 * A great iron pulley wheel turning slowly in its floor slot, its axle on
 * two bearing blocks, half of it sunk into the shaft. `side` is the wall it
 * stands by (−1 left, +1 right). `cable` lays a cable over it.
 */
function pulley(side: -1 | 1, cable: boolean): THREE.Group {
  const iron = flat("stoneDark");
  const dark = flat("brass");
  const { radius, rim, axle } = WHEEL;
  const wheel = group(new THREE.Mesh(new THREE.TorusGeometry(radius, rim, 4, 28).rotateY(Math.PI / 2), flat("stone")));
  for (let i = 0; i < 6; i++) {
    const spoke = box([0.05, radius, 0.06], iron, [0, 0, 0]);
    spoke.rotation.x = (i * Math.PI) / 3;
    wheel.add(spoke);
  }
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 8).rotateZ(Math.PI / 2), dark));
  wheel.traverse((child) => {
    child.userData.noShadow = true;
  });
  const turning = animated(group(wheel), (seconds) => {
    wheel.rotation.x = side * seconds * 0.35;
  });
  turning.position.y = axle;

  const result = group(turning);
  result.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6).rotateZ(Math.PI / 2).translate(0, axle, 0), dark));
  for (const dx of [-0.32, 0.32]) {
    result.add(box([0.11, axle + 0.07, 0.24], iron, [dx, 0, 0]), box([0.12, 0.03, 0.26], flat("brass"), [dx, axle + 0.06, 0]));
  }
  if (cable) {
    const over = radius + rim + 0.03;
    const rope = flat("stoneDark");
    const arc = new THREE.Mesh(new THREE.TorusGeometry(over, 0.022, 4, 20, Math.PI).rotateY(Math.PI / 2), rope);
    arc.position.y = axle;
    result.add(arc);
    for (const z of [-over, over]) result.add(box([0.044, SLOT.depth - 0.1, 0.044], rope, [0, axle - SLOT.depth + 0.1, z]));
  }
  return result;
}

/** The slot's dark: the shaft below the cab floor, with a violet haze rising out of it. */
function slotShaft(): THREE.Group {
  const [w, d] = [SLOT.x[1] - SLOT.x[0], SLOT.z[1] - SLOT.z[0]];
  return group(
    pitShell({ x: [-w / 2, w / 2], z: [-d / 2, d / 2], bottom: -SLOT.depth }),
    pitHaze({ x: [-w / 2 + 0.01, w / 2 - 0.01], z: [-d / 2 + 0.01, d / 2 - 0.01], y: -0.35, colour: "bruiseLight", opacity: 0.55 }),
  );
}

/** A brass lip around a floor slot, standing just proud of the plate. */
function slotLip(): THREE.Group {
  const b = batch();
  const w = SLOT.x[1] - SLOT.x[0];
  const d = SLOT.z[1] - SLOT.z[0];
  const lip = 0.05;
  b.block([w + lip * 2 + 0.01, 0.02, lip], "brass", [0, 0, -d / 2 - lip / 2]);
  b.block([w + lip * 2 + 0.01, 0.02, lip], "brass", [0, 0, d / 2 + lip / 2]);
  b.block([lip, 0.02, d], "brass", [-w / 2 - lip / 2, 0, 0]);
  b.block([lip, 0.02, d], "brass", [w / 2 + lip / 2, 0, 0]);
  return group(b.mesh());
}

/** One wall's floor slot, wheel and dark, as placed pieces. */
function wheelBay(side: -1 | 1, cable: boolean): PropPlacement[] {
  const at: [number, number] = [side * SLOT_MID, 0];
  const wall = side < 0 ? "left" : "right";
  return [
    { build: () => pulley(side, cable), name: `pulley ${wall}`, at },
    { build: slotShaft, name: `slot shaft ${wall}`, at },
    { build: slotLip, name: `slot lip ${wall}`, at },
  ];
}

/** Half of the cab's scissor gate, folded open beside the doorway: a stack of
 *  brass bars between two tracks. Built from `from` to `to` in height, so the
 *  part above the cut height can hang with the wall. Faces +z. */
function foldedGate(from: number, to: number): THREE.Group {
  const b = batch();
  const height = DOOR_HEIGHT;
  const bars = 7;
  const width = 0.32;
  for (let i = 0; i < bars; i++) {
    const x = -width / 2 + (i * width) / (bars - 1);
    const y0 = Math.max(from, 0.04);
    const y1 = Math.min(to, height - 0.04);
    if (y1 > y0) b.block([0.025, y1 - y0, 0.03], i % 2 ? "brass" : "woodMid", [x, y0 - from, 0.05 + (i % 2) * 0.03]);
  }
  if (from === 0) b.block([width + 0.06, 0.04, 0.12], "soot", [0, 0, 0.07]);
  if (to >= height) b.block([width + 0.06, 0.05, 0.12], "brass", [0, height - 0.04 - from, 0.07]);
  return group(b.mesh());
}

function gate(along: number): PropPlacement[] {
  return [
    { build: () => foldedGate(0, CUT_HEIGHT), name: "folded gate", ...onWall("top", along) },
    { build: () => foldedGate(CUT_HEIGHT, DOOR_HEIGHT), name: "folded gate top", ...onWall("top", along, { y: CUT_HEIGHT }) },
  ];
}

/** The cab's lamp over the door: a bulb under a brass shade on a bracket, failing. Faces +z. */
function cageLamp(): THREE.Group {
  const brass = flat("brass");
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), glow("amber"));
  bulb.position.set(0, -0.08, 0.26);
  const shade = cylinder(0.13, 0.1, brass, [0, -0.06, 0.26], { top: 0.04, sides: 8 });
  bulb.userData.noShadow = true;
  shade.userData.noShadow = true;
  return group(
    box([0.14, 0.14, 0.03], brass, [0, -0.07, 0.015]),
    box([0.035, 0.035, 0.26], brass, [0, 0.02, 0.13]),
    shade,
    bulb,
    lightAnchor({ colour: "amber", intensity: 1.8, range: 6, flicker: 0.35 }, [0, -0.25, 0.5]),
  );
}

/** A brass handrail on brackets along a cab wall. Faces +z. */
function handrail(): THREE.Group {
  const b = batch();
  const length = 1.9;
  b.block([length, 0.04, 0.04], "brass", [0, 0, 0.09]);
  for (const x of [-length / 2 + 0.1, 0, length / 2 - 0.1]) b.block([0.03, 0.03, 0.09], "brass", [x, 0.005, 0.045]);
  return group(b.mesh());
}

/** The cab's bench seat along a wall, buttoned in faded violet. Faces +z. */
function cabBench(): THREE.Group {
  const b = batch();
  const width = 1.7;
  b.block([width, 0.1, 0.44], "woodDark", [0, 0, 0.22]);
  b.block([width - 0.04, 0.26, 0.4], "wood", [0, 0.1, 0.2]);
  b.block([width - 0.2, 0.18, 0.02], "woodMid", [0, 0.14, 0.405]);
  // The seat's top stops a little under the cut wall's, so the two never share a plane.
  b.block([width, 0.085, 0.46], "bruise", [0, 0.36, 0.23]);
  b.block([width - 0.06, 0.02, 0.4], "bruiseDark", [0, 0.443, 0.23]);
  b.block([width, 0.405, 0.1], "bruise", [0, 0.445, 0.06]);
  for (let i = 0; i < 6; i++) b.block([0.04, 0.04, 0.02], "bruiseDark", [-width / 2 + 0.2 + i * 0.26, 0.64, 0.115]);
  return group(b.mesh());
}

/** The operator's stool, knocked over on its side: a round violet seat on an
 *  iron post with three feet. */
function toppledStool(): THREE.Group {
  const iron = flat("sootLight");
  const stool = group(
    cylinder(0.025, 0.62, iron, [0, 0.02, 0], { sides: 6 }),
    cylinder(0.18, 0.08, flat("bruise"), [0, 0.62, 0], { sides: 10 }),
    cylinder(0.16, 0.03, iron, [0, 0.59, 0], { sides: 10 }),
  );
  for (let i = 0; i < 3; i++) {
    // Each foot a little higher than the last, so where they cross at the hub their faces never share a plane.
    const foot = box([0.03, 0.03, 0.24], iron, [0, i * 0.002, 0.12]);
    const holder = group(foot);
    holder.rotation.y = (i * Math.PI * 2) / 3;
    stool.add(holder);
  }
  stool.rotation.z = Math.PI / 2 - 0.12;
  stool.position.set(0.32, 0.22, 0);
  return group(stool);
}

/** The cut cable, lying where it fell in loose coils, its end frayed. */
function cableCoil(): THREE.Group {
  const rope = flat("stoneDark");
  const rng = createRng("mystic-elevator:coil");
  const result = group();
  for (let i = 0; i < 4; i++) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(uniform(rng, 0.22, 0.32), 0.025, 4, 16), rope);
    loop.rotation.x = Math.PI / 2 + uniform(rng, -0.08, 0.08);
    loop.position.set(uniform(rng, -0.05, 0.05), 0.025 + i * 0.045, uniform(rng, -0.05, 0.05));
    result.add(loop);
  }
  const tail = box([0.05, 0.05, 0.7], rope, [0, 0, 0.35]);
  const run = group(tail);
  run.position.set(0.28, 0, 0.05);
  run.rotation.y = 0.5;
  result.add(run);
  for (const [i, [turn, length]] of [[-0.5, 0.12], [0, 0.16], [0.45, 0.1], [0.9, 0.08]].entries()) {
    const strand = box([0.012, 0.012, length], flat("stone"), [0, 0, length / 2]);
    const fray = group(strand);
    // Each strand a little higher than the last, so where they splay from the end their tops never share a plane, all
    // under the plane of the house's choice glow.
    fray.position.set(0.28 + Math.sin(0.5) * 0.7, 0.012 + i * 0.0015, 0.05 + Math.cos(0.5) * 0.7);
    fray.rotation.y = 0.5 + turn;
    result.add(fray);
  }
  return result;
}

/** A leather valise left standing on end by the bench, its owner gone. */
function valise(): THREE.Group {
  const b = batch();
  b.block([0.5, 0.36, 0.2], "blood", [0, 0, 0]);
  b.block([0.51, 0.03, 0.21], "bloodDark", [0, 0.28, 0]);
  b.block([0.04, 0.37, 0.205], "bloodDark", [-0.17, 0, 0]);
  b.block([0.04, 0.37, 0.205], "bloodDark", [0.17, 0, 0]);
  b.block([0.05, 0.04, 0.06], "brass", [-0.08, 0.36, 0]);
  b.block([0.05, 0.04, 0.06], "brass", [0.08, 0.36, 0]);
  b.block([0.21, 0.03, 0.04], "woodDark", [0, 0.4, 0]);
  return group(b.mesh());
}

/** A furled umbrella dropped on the floor, lying along x. */
function umbrella(): THREE.Group {
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.86, 5).rotateZ(Math.PI / 2), flat("soot"));
  shaft.position.y = 0.04;
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.5, 6).rotateZ(Math.PI / 2), flat("soot"));
  canopy.position.set(0.12, 0.045, 0);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 4, 8, Math.PI).rotateX(Math.PI / 2), flat("woodMid"));
  handle.position.set(-0.43, 0.014, 0.05);
  return group(shaft, canopy, handle);
}

const SIDES: [Edge, -1 | 1][] = [["left", -1], ["right", 1]];

/** The Mystic Elevator: a panelled lift car on an iron floor, its two pulley
 *  wheels turning in slots onto the dark shaft, and at its heart a brass
 *  telegraph column whose violet dial has swung to the drop. */
export const MYSTIC_ELEVATOR: RoomDefinition = {
  id: "mystic-elevator",
  floor: treadPlate,
  wall: () => panelling({ ramp: RAMPS.wood, panelPx: 20, seed: "mystic-elevator" }),
  wainscot: () => panelling({ ramp: ["void", "soot", "sootLight", "ash"] as readonly PaletteKey[], panelPx: 32, seed: "mystic-elevator-kick" }),
  trim: "brass",
  floorOpenings: SIDES.map(([, side]) => ({
    x: (side < 0 ? [-SLOT.x[1], -SLOT.x[0]] : SLOT.x) as [number, number],
    z: SLOT.z,
  })),
  props: [
    { build: sigil, at: COLUMN },
    { build: controlColumn, at: COLUMN },
    ...wheelBay(-1, true),
    ...wheelBay(1, false),
    ...gate(-0.86),
    ...gate(0.86),
    { build: cageLamp, ...onWall("top", 0, { y: 2.75 }) },
    ...SIDES.map(([edge]) => ({ build: handrail, ...onWall(edge, 0, { y: 0.95 }) })),
    { build: cabBench, ...onWall("bottom", -0.5) },
    { build: toppledStool, at: [-1.55, 1.2], turn: 30 },
    { build: cableCoil, at: [1.4, 1.55], turn: -20 },
    { build: valise, at: [-1.05, 2.4], turn: 12 },
    { build: umbrella, at: [-0.45, 1.75], turn: -35 },
  ],
  lights: SIDES.map(([, side]) => ({ at: [side * SLOT_MID, -0.15, 0] as [number, number, number], colour: "violet" as const, intensity: 4, range: 5 })),
  focus: [COLUMN[0], 1.2, COLUMN[1]],
  pawn: [-1.0, -1.0],
  spots: [[1.6, 0.35], [-2.3, -2.1], [-0.35, 0.6], [2.3, -1.8], [0.7, -1.2]],
  overflow: [[-1.6, 0.5], [-1.1, -2.1], [1.0, -1.95], [-0.6, 1.35], [0.1, -1.7], [-1.6, -0.5]],
};
