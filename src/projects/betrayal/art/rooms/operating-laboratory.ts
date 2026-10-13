import * as THREE from "three";
import { chamberstick } from "../kit";
import { instrumentTray, LAB_SHELL, labBench, labGlass } from "../kit/laboratory";
import { solidLathe, vessel } from "../kit/vessel";
import { lightAnchor } from "../light-anchor";
import type { PaletteKey } from "../palette";
import { onWall, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, glow, group, lightMaterial } from "../shapes";
import { shiny, shinyBatch, SHINES } from "../shine";

/** The operating table's centre on the floor, turned across the top-left corner. */
const TABLE_AT: [x: number, z: number] = [-0.7, -0.7];
const TABLE_TURN = 45;
const TABLE = { length: 1.95, width: 0.62, top: 0.86 };
/** Where the lamp stands, behind the table towards the corner, and how far its arm reaches to hang the shade over the table. */
const LAMP_AT: [x: number, z: number] = [-1.8, -1.8];
const LAMP = { reach: Math.hypot(TABLE_AT[0] - LAMP_AT[0], TABLE_AT[1] - LAMP_AT[1]), pole: 2.62, shade: 1.98, radius: 0.32 };
/** Where the unseen figure stands, at the table's side towards the room, facing the table. */
const FIGURE = { feet: [-0.3, -0.3] as [number, number], turn: -135 };
/** The way its shadow falls across the floor, away from the lamp. */
const AWAY: [x: number, z: number] = [Math.SQRT1_2, Math.SQRT1_2];

const iron = () => shiny(flat("soot"), SHINES.iron);

/**
 * The operating table: a cast-iron pedestal on a broad foot, with a crank to
 * raise it, under a top padded in pale oilcloth, a headrest at one end, and
 * three leather straps across it, unbuckled and hanging. Long along x; the
 * side towards the room is +z.
 */
function operatingTable(): THREE.Group {
  const { length, width, top } = TABLE;
  const result = group(
    box([0.9, 0.06, 0.5], iron(), [0, 0, 0]),
    box([0.7, 0.05, 0.36], iron(), [0, 0.055, 0]),
    cylinder(0.1, top - 0.2, iron(), [0, 0.1, 0], { top: 0.075, sides: 8 }),
    box([0.5, 0.06, 0.4], iron(), [0, top - 0.14, 0]),
    // The frame under the pad.
    box([length, 0.07, width], iron(), [0, top - 0.08, 0]),
  );
  // The crank wheel on the column, turned to face the room.
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 4, 10), iron());
  wheel.position.set(0, 0.42, 0.12);
  result.add(wheel, box([0.025, 0.025, 0.06], iron(), [0, 0.41, 0.07]));
  const pad = flat("boneDark");
  result.add(box([length - 0.04, 0.06, width - 0.04], pad, [0, top - 0.01, 0]));
  // The headrest, a raised pad at the head (−x).
  result.add(box([0.32, 0.07, width - 0.12], flat("bone"), [-length / 2 + 0.2, top + 0.05, 0]));
  const leather = batch();
  const buckles = batch();
  for (const x of [-0.25, 0.25, 0.7]) {
    // Each strap drapes over the far edge, crosses the pad, and hangs loose down the near side.
    leather.block([0.07, 0.006, width + 0.02], "woodDark", [x, top + 0.05, 0]);
    leather.block([0.07, 0.3, 0.008], "woodDark", [x, top - 0.24, -width / 2 - 0.014]);
    leather.block([0.07, 0.38, 0.008], "woodDark", [x + 0.01, top - 0.32, width / 2 + 0.014]);
    buckles.block([0.08, 0.06, 0.012], "stoneLight", [x, top - 0.06, -width / 2 - 0.02]);
  }
  result.add(leather.mesh(), shinyBatch(buckles, SHINES.silver));
  // A sheet folded at the foot.
  result.add(box([0.36, 0.06, width - 0.1], flat("bone"), [length / 2 - 0.24, top + 0.05, 0]));
  return result;
}

/**
 * The operating lamp on its stand: a cross foot on casters, a tall iron pole,
 * an arm reaching out over the table, and a deep enamelled shade whose mouth
 * burns a sickly green, the room's one strong light. The arm reaches along +z.
 */
function operatingLamp(): THREE.Group {
  const { reach, pole, shade, radius } = LAMP;
  const metal = iron();
  const result = group();
  for (const [k, turn] of [0, Math.PI / 2].entries()) {
    // The second bar of the cross a little lower and taller, so the two tops don't share a plane.
    const foot = box([0.7, 0.05 + k * 0.01, 0.07], metal, [0, 0.06 - k * 0.005, 0]);
    foot.rotation.y = turn + Math.PI / 4;
    result.add(foot);
  }
  for (const [x, z] of [[0.24, 0.24], [-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24]]) result.add(cylinder(0.03, 0.06, metal, [x, 0, z], { sides: 6 }));
  result.add(cylinder(0.035, pole, metal, [0, 0.1, 0], { top: 0.025, sides: 6 }));
  // The arm: out from the top of the pole, then a drop to the shade.
  result.add(box([0.05, 0.05, reach + 0.05], metal, [0, pole, reach / 2 - 0.02]));
  result.add(box([0.04, pole - shade - 0.42, 0.04], metal, [0, shade + 0.4, reach]));
  // The counterweight behind the pole.
  result.add(cylinder(0.07, 0.12, metal, [0, pole - 0.06, -0.12], { sides: 8 }));
  // Dark enamel: the lamp burns inches from the shade's inside, and a pale lining there would
  // throw that light back round the room as blotchy bounce.
  const enamel = shiny(flat("sootLight"), SHINES.glazedChina);
  // A deep, open shade hung mouth down, the light up inside it: the shade casts its shadow, so the
  // lamp throws a cone of light on the table and the floor round it, and leaves the walls dark.
  const dome = vessel([[0.07, 0], [0.13, 0.08], [0.24, 0.22], [radius, 0.4]], enamel, { wall: 0.014, depth: 0.37, sides: 16 });
  dome.rotation.x = Math.PI;
  dome.position.set(0, shade + 0.4, reach);
  const bulb = cylinder(0.06, 0.07, glow("wraithLight"), [0, shade + 0.22, reach], { sides: 10 });
  // A ring of green light round the mouth, so the lamp reads as burning from above too.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.004, 0.014, 4, 18).rotateX(Math.PI / 2), glow("wraithLight"));
  rim.position.set(0, shade + 0.004, reach);
  for (const part of [bulb, rim]) part.userData.noShadow = true;
  result.add(dome, bulb, rim);
  result.add(lightAnchor({ colour: "wraithLight", intensity: 26, range: 10, flicker: 0.06, signal: 2, kind: "lamp" }, [0, shade + 0.2, reach]));
  return result;
}

/**
 * Someone standing at the table under the lamp, leaning in over it with
 * their hands out, who isn't there: a plain figure, legs, body, arms and
 * head, that only the bake sees (`bakeOnly`). It is never drawn, but it
 * stops the lamp's light like anything else, so its shadow falls across the
 * table and long over the floor. It faces +z.
 */
function unseenFigure(): THREE.Group {
  const nothing = flat("void");
  const lean = new THREE.Group();
  lean.rotation.x = 0.12;
  lean.position.y = 0.82;
  lean.add(
    solidLathe([[0.15, 0], [0.18, 0.12], [0.19, 0.32], [0.21, 0.48], [0.12, 0.54], [0.05, 0.56], [0.05, 0.62]], nothing, 10),
    new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8).scale(0.9, 1.15, 1).translate(0, 0.73, 0.02), nothing),
  );
  for (const side of [-1, 1]) {
    // Each arm from the shoulder down and out towards the table, the hand over its edge.
    const arm = box([0.08, 0.08, 0.5], nothing, [0, -0.04, 0.22]);
    arm.position.set(side * 0.2, 0.46, 0);
    arm.rotation.x = 0.55;
    arm.rotation.y = -side * 0.12;
    lean.add(arm);
  }
  const figure = group(lean);
  for (const side of [-1, 1]) figure.add(cylinder(0.07, 0.86, nothing, [side * 0.09, 0, 0], { top: 0.08, sides: 8 }));
  figure.traverse((part) => (part.userData.bakeOnly = true));
  return figure;
}

/** A two-tier steel trolley on casters, the instruments laid out on its top tray and spare bottles and a basin below. Long along x. */
function instrumentTrolley(): THREE.Group {
  const steel = batch();
  const [l, w] = [0.62, 0.4];
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    steel.block([0.025, 0.82, 0.025], "stone", [(x * (l - 0.03)) / 2, 0.05, (z * (w - 0.03)) / 2]);
    steel.block([0.04, 0.05, 0.04], "soot", [(x * (l - 0.03)) / 2, 0, (z * (w - 0.03)) / 2]);
  }
  steel.block([l + 0.01, 0.02, w + 0.01], "stoneLight", [0, 0.86, 0]);
  steel.block([l + 0.01, 0.02, w + 0.01], "stoneLight", [0, 0.3, 0]);
  const result = group(shinyBatch(steel, SHINES.silver));
  const tray = instrumentTray({ length: 0.5, width: 0.3 });
  tray.position.set(0, 0.88, 0);
  result.add(tray);
  const bottles: [x: number, z: number, fluid: PaletteKey, kind: "bottle" | "conical"][] = [
    [-0.2, -0.08, "wraith", "bottle"],
    [-0.08, 0.06, "bloodDark", "bottle"],
    [0.12, -0.05, "boneDark", "conical"],
  ];
  for (const [x, z, fluid, kind] of bottles) {
    const bottle = labGlass(kind, { fill: 0.6, fluid, lid: kind === "bottle" ? "stopper" : null });
    bottle.position.set(x, 0.32, z);
    result.add(bottle);
  }
  const basin = vessel([[0.08, 0], [0.12, 0.03], [0.14, 0.07]], shiny(flat("boneLight"), SHINES.glazedChina), { wall: 0.008, depth: 0.06, sides: 12 });
  basin.position.set(0.17, 0.32, 0.06);
  result.add(basin);
  return result;
}

/** What stands on the bench along the top wall: bottles and flasks, jars, a rack of tubes, a pestle and mortar. Faces +z, its back at z = 0, base on the slate. */
function benchGlass(): THREE.Group {
  const result = group();
  const pieces: [kind: Parameters<typeof labGlass>[0], x: number, z: number, fluid: PaletteKey, fill: number, scale?: number, lid?: PaletteKey | "stopper"][] = [
    ["jar", -0.82, 0.17, "wraith", 0.8, 0.9, "stone"],
    ["jar", -0.62, 0.15, "wraithDark", 0.85, 1.1, "brass"],
    ["bottle", -0.42, 0.2, "bloodDark", 0.7, 1.2, "stopper"],
    ["bottle", -0.32, 0.12, "boneDark", 0.4, 1, "stopper"],
    ["flask", -0.05, 0.25, "wraith", 0.35],
    ["conical", 0.12, 0.3, "verdigris", 0.3],
    ["beaker", 0.25, 0.42, "boneDark", 0.5],
    ["bottle", 0.72, 0.14, "wraith", 0.6, 1.3, "stopper"],
    ["bottle", 0.85, 0.2, "ember", 0.5, 1, "stopper"],
  ];
  for (const [kind, x, z, fluid, fill, scale, lid] of pieces) {
    const piece = labGlass(kind, { fluid, fill, scale, lid });
    piece.position.set(x, 0, z);
    result.add(piece);
  }
  const mortar = vessel([[0.05, 0], [0.065, 0.04], [0.07, 0.07]], flat("stoneLight"), { wall: 0.012, depth: 0.05, sides: 10 });
  mortar.position.set(0.45, 0, 0.3);
  result.add(mortar);
  const pestle = cylinder(0.015, 0.14, flat("stoneLight"), [0, 0, 0], { top: 0.02, sides: 6 });
  pestle.rotation.z = 0.5;
  pestle.position.set(0.47, 0.05, 0.3);
  result.add(pestle);
  return result;
}

/** A glass-fronted cabinet of bottles hung on the wall above the bench, from 1.35 m: shelves behind a framed glass door. Faces +z, its back at z = 0, base at y = 0. */
function wallCabinet(): THREE.Group {
  const [w, h, d] = [1.1, 0.85, 0.26];
  const wood = batch();
  wood.block([w, 0.04, d], "woodDark", [0, 0, d / 2]);
  wood.block([w, 0.04, d], "woodDark", [0, h - 0.04, d / 2]);
  for (const x of [-1, 1]) wood.block([0.04, h - 0.08, d], "woodDark", [x * (w / 2 - 0.02), 0.04, d / 2]);
  wood.block([w - 0.08, h - 0.08, 0.02], "wood", [0, 0.04, 0.01]);
  wood.block([w - 0.08, 0.025, d - 0.04], "woodDark", [0, 0.42, d / 2]);
  const result = group(wood.mesh());
  const shelf: [number, PaletteKey][] = [[-0.38, "wraith"], [-0.22, "bloodDark"], [-0.08, "boneDark"], [0.1, "wraithDark"], [0.28, "verdigris"], [0.4, "ember"]];
  for (const [i, y] of [0.04, 0.445].entries()) {
    for (const [x, fluid] of shelf) {
      if ((x * 10 + i) % 3 === 0) continue;
      const bottle = labGlass("bottle", { fluid, fill: 0.6, scale: 1.1 + i * 0.2 - Math.abs(x) * 0.3, lid: "stopper" });
      bottle.position.set(x + i * 0.04, y, d / 2);
      result.add(bottle);
    }
  }
  // The glass door's frame and a thin sheet of glass, shining, in front of the shelves.
  const frame = batch();
  frame.block([w - 0.05, 0.05, 0.03], "woodMid", [0, 0.02, d + 0.015]);
  frame.block([w - 0.05, 0.05, 0.03], "woodMid", [0, h - 0.07, d + 0.015]);
  // The stiles a little shallower than the rails, so their faces stand apart.
  for (const x of [-1, 0, 1]) frame.block([0.05, h - 0.09, 0.024], "woodMid", [x * (w / 2 - 0.045), 0.02, d + 0.015]);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, h - 0.1), shiny(lightMaterial(0.06), SHINES.glass));
  pane.position.set(0, h / 2, d + 0.004);
  pane.userData.noShadow = true;
  result.add(frame.mesh(), pane);
  return result;
}

/** A washstand: an iron tripod holding an enamel basin, a jug beside it on the floor and a towel over the rail. */
function washstand(): THREE.Group {
  const metal = iron();
  const result = group();
  for (let k = 0; k < 3; k++) {
    const angle = (k / 3) * Math.PI * 2;
    const leg = box([0.025, 0.82, 0.025], metal, [Math.cos(angle) * 0.17, 0, Math.sin(angle) * 0.17]);
    result.add(leg);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.012, 4, 12).rotateX(Math.PI / 2), metal);
  ring.position.y = 0.8;
  result.add(ring);
  const basin = vessel([[0.1, 0], [0.16, 0.04], [0.2, 0.09]], shiny(flat("boneLight"), SHINES.glazedChina), { wall: 0.01, depth: 0.075, sides: 12 });
  basin.position.y = 0.76;
  result.add(basin);
  // A towel hung over the rail.
  result.add(box([0.22, 0.32, 0.015], flat("bone"), [0, 0.5, 0.2]));
  const jug = vessel([[0.06, 0], [0.09, 0.08], [0.07, 0.2], [0.08, 0.24]], shiny(flat("boneLight"), SHINES.glazedChina), { wall: 0.008, depth: 0.16, sides: 10 });
  jug.position.set(0.32, 0, 0.05);
  result.add(jug);
  return result;
}

/** A plain iron drain grate let into the floor under the table. */
function drain(): THREE.Group {
  const grate = batch();
  grate.block([0.3, 0.012, 0.3], "void", [0, 0.002, 0]);
  for (let k = -2; k <= 2; k++) grate.block([0.025, 0.016, 0.28], "sootLight", [k * 0.055, 0.002, 0]);
  return group(grate.mesh());
}

/** A round steel stool on three legs, pushed back from the table. */
function stool(): THREE.Group {
  const metal = iron();
  const result = group(cylinder(0.17, 0.04, flat("woodDark"), [0, 0.58, 0], { sides: 10 }));
  for (let k = 0; k < 3; k++) {
    const angle = (k / 3) * Math.PI * 2 + 0.4;
    const leg = box([0.025, 0.6, 0.025], metal, [0, 0, 0]);
    leg.rotation.set(Math.sin(angle) * 0.12, 0, -Math.cos(angle) * 0.12);
    leg.position.set(Math.cos(angle) * 0.13, 0, Math.sin(angle) * 0.13);
    result.add(leg);
  }
  result.add(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.01, 4, 10).rotateX(Math.PI / 2).translate(0, 0.22, 0), metal));
  return result;
}

/** A galvanised pail standing by the table. */
function pail(): THREE.Group {
  return group(vessel([[0.11, 0], [0.12, 0.02], [0.14, 0.28]], shiny(flat("stone"), SHINES.pewter), { wall: 0.008, depth: 0.25, sides: 10 }));
}

/**
 * The Operating Laboratory: an iron operating table across the corner, its
 * straps undone, under a standing lamp whose deep shade burns a sickly
 * green; and on the floor beside the table, thrown long across the tiles
 * away from the lamp, the shadow of someone standing there, though there is
 * no one.
 */
export const OPERATING_LABORATORY: RoomDefinition = {
  id: "operating-laboratory",
  ...LAB_SHELL,
  props: [
    { build: operatingTable, at: TABLE_AT, turn: TABLE_TURN },
    // The drain at the table's foot, clear of its pedestal.
    { build: drain, at: [TABLE_AT[0] + 0.46, TABLE_AT[1] - 0.46], turn: TABLE_TURN },
    { build: operatingLamp, at: LAMP_AT, turn: 45 },
    { build: unseenFigure, at: FIGURE.feet, turn: FIGURE.turn },
    { build: instrumentTrolley, at: [-2.2, 0.55], turn: 70 },
    { build: stool, at: [0.35, -1.75] },
    { build: pail, at: [-1.9, 0.0] },
    // Along the top wall: the bench and its glass, a candle for working by, and the cabinet hung above.
    { build: () => labBench({ length: 2.1, depth: 0.7 }), name: "labBench", ...onWall("top", 1.45, { out: 0.36 }) },
    { build: benchGlass, ...onWall("top", 1.45, { y: 0.92, out: 0.01 }) },
    { build: () => chamberstick({ height: 0.1, intensity: 1.6, range: 5 }), name: "chamberstick", ...onWall("top", 2.25, { y: 0.92, out: 0.4 }) },
    { build: wallCabinet, ...onWall("top", 1.45, { y: 1.4, out: 0.01 }) },
    // The washstand against the left wall, near the bottom door.
    { build: washstand, ...onWall("left", -1.6, { out: 0.32 }) },
    { build: () => labGlass("carboy", { fluid: "wraithDark", fill: 0.55 }), name: "carboy", at: [-2.4, 2.35] },
  ],
  focus: [-0.5, 0.7, -0.5],
  prime: [1.4, -0.75],
  // Where the unseen figure stands and its shadow falls, so no explorer stands in either.
  keepClear: [{ from: FIGURE.feet, to: [FIGURE.feet[0] + AWAY[0] * 2.2, FIGURE.feet[1] + AWAY[1] * 2.2], radius: 0.4 }],
};
