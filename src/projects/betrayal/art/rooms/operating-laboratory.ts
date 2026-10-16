import * as THREE from "three";
import { chamberstick } from "../kit";
import { instrumentTray, LAB_SHELL, labBench, labGlass } from "../kit/laboratory";
import { vessel } from "../kit/vessel";
import { lightAnchor } from "../light-anchor";
import type { PaletteKey } from "../palette";
import { onWall, type RoomDefinition, WALL_HEIGHT } from "../room";
import { batch, box, cylinder, flat, glow, group, lightMaterial } from "../shapes";
import { shiny, shinyBatch, SHINES } from "../shine";

/** The operating table's centre on the floor, turned across the top-left corner. */
const TABLE_AT: [x: number, z: number] = [-0.7, -0.7];
const TABLE_TURN = 45;
const TABLE = { length: 1.95, width: 0.7, top: 0.86 };
/**
 * Where the lamp's light hangs, in the table's own frame (x along it, the head at −x; +z towards the
 * room): high over the table's far edge, so the surgeon standing on the near side is seen from in front
 * and above, and his shadow keeps a small head on square shoulders rather than one swollen blot.
 */
const LIGHT: [x: number, y: number, z: number] = [0.2, 3, -0.4];
const LAMP = { radius: 0.34, depth: 0.24, tilt: 0.3 };

/** A point in the table's frame, on the room's floor. */
function fromTable([x, z]: [number, number]): [x: number, z: number] {
  const turn = (TABLE_TURN * Math.PI) / 180;
  return [TABLE_AT[0] + x * Math.cos(turn) + z * Math.sin(turn), TABLE_AT[1] - x * Math.sin(turn) + z * Math.cos(turn)];
}

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
 * The operating lamp, hung from the ceiling on a rod over the table's far
 * edge: a deep enamelled shade, tipped on its knuckle towards the room,
 * whose mouth burns a sickly green, the room's one strong light.
 * Built round its light, so it is placed in the table's frame.
 */
function operatingLamp(): THREE.Group {
  const { radius, depth, tilt } = LAMP;
  const metal = iron();
  const shade = group();
  // Dark enamel: the lamp burns inches from the shade's inside, and a pale lining there would
  // throw that light back round the room as blotchy bounce.
  const enamel = shiny(flat("sootLight"), SHINES.glazedChina);
  // A deep, open shade hung mouth down, the light up inside it: the shade casts its shadow, so the
  // lamp throws a cone of light on the table and the floor round it, and leaves the walls dark.
  const dome = vessel([[0.07, 0], [0.13, 0.08], [0.25, 0.22], [radius, 0.4]], enamel, { wall: 0.014, depth: 0.37, sides: 16 });
  dome.rotation.x = Math.PI;
  dome.position.y = 0.4 - depth;
  const bulb = cylinder(0.06, 0.07, glow("wraithLight"), [0, 0.02, 0], { sides: 10 });
  // A ring of green light round the mouth, so the lamp reads as burning from above too.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.004, 0.014, 4, 18).rotateX(Math.PI / 2), glow("wraithLight"));
  rim.position.y = 0.004 - depth;
  for (const part of [bulb, rim]) part.userData.noShadow = true;
  shade.add(dome, bulb, rim);
  shade.add(lightAnchor({ colour: "wraithLight", intensity: 50, range: 12, flicker: 0.06, signal: 2, kind: "lamp" }, [0, 0, 0]));
  shade.rotation.x = -tilt;
  // The knuckle on the shade's crown, and the rod from it straight up to the ceiling.
  const crown = new THREE.Vector3(0, 0.4 - depth, 0).applyEuler(shade.rotation);
  const result = group(shade, cylinder(0.04, 0.07, metal, [crown.x, crown.y - 0.02, crown.z], { sides: 8 }));
  result.add(cylinder(0.016, WALL_HEIGHT - LIGHT[1] - crown.y, metal, [crown.x, crown.y, crown.z], { sides: 6 }));
  result.position.set(...LIGHT);
  return result;
}

type Point = [x: number, y: number, z: number];

/** A rounded limb from `a` to `b`. */
function limb(a: Point, b: Point, radius: number, material: THREE.Material): THREE.Mesh {
  const from = new THREE.Vector3(...a);
  const along = new THREE.Vector3(...b).sub(from);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, along.length(), 3, 8), material);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.clone().normalize());
  mesh.position.copy(from).addScaledVector(along, 0.5);
  return mesh;
}

/** An egg of the given radii at `at`, tipped forward by `lean` about x. */
function blob(at: Point, radii: Point, material: THREE.Material, lean = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9).scale(...radii), material);
  mesh.position.set(...at);
  mesh.rotation.x = lean;
  return mesh;
}

/**
 * A long amputation knife held in a fist at `grip`, its blade pointing
 * along `towards`, turned so its flat faces the lamp and its shadow shows
 * the whole blade: a straight back, a curved edge to the point, a guard.
 */
function knife(grip: Point, towards: Point, material: THREE.Material): THREE.Group {
  const outline = new THREE.Shape();
  outline.moveTo(-0.02, 0.015);
  outline.lineTo(0.035, 0.015);
  outline.quadraticCurveTo(0.035, 0.12, -0.02, 0.18);
  outline.closePath();
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.008, bevelEnabled: false }).translate(0, 0, -0.004), material);
  const result = group(blade, box([0.09, 0.016, 0.016], material, [0.005, 0, 0]), box([0.026, 0.11, 0.024], material, [0, -0.1, 0]));
  const along = new THREE.Vector3(...towards).normalize();
  const toLight = new THREE.Vector3(...LIGHT).sub(new THREE.Vector3(...grip)).normalize();
  const across = new THREE.Vector3().crossVectors(along, toLight).normalize();
  const facing = new THREE.Vector3().crossVectors(across, along);
  result.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, along, facing));
  result.position.set(...grip);
  return result;
}

/**
 * The patient no one can see, lying on its back on the table: head on the
 * headrest, the far arm along its side, the near one slipped off the edge
 * and hanging, the legs apart and one knee drawn up as it struggles. Its
 * shadow lies on the lit pad, a body with a gap at the waist and between
 * the legs. In the table's frame.
 */
function patient(material: THREE.Material): THREE.Mesh[] {
  const y = TABLE.top + 0.05;
  return [
    blob([-0.75, y + 0.12, -0.02], [0.105, 0.09, 0.085], material),
    limb([-0.66, y + 0.1, 0], [-0.58, y + 0.1, 0], 0.045, material),
    limb([-0.52, y + 0.1, -0.17], [-0.52, y + 0.1, 0.17], 0.055, material),
    blob([-0.38, y + 0.1, 0], [0.15, 0.1, 0.18], material),
    blob([-0.16, y + 0.08, 0], [0.12, 0.08, 0.12], material),
    blob([0.02, y + 0.08, 0], [0.12, 0.09, 0.16], material),
    // The far arm along its side, strapped, a gap between it and the waist.
    limb([-0.52, y + 0.08, -0.22], [-0.27, y + 0.06, -0.25], 0.042, material),
    limb([-0.27, y + 0.06, -0.25], [-0.02, y + 0.05, -0.25], 0.036, material),
    blob([0.06, y + 0.05, -0.25], [0.06, 0.025, 0.035], material),
    // The near arm fallen off the edge, the hand hanging open towards the floor.
    limb([-0.52, y + 0.08, 0.22], [-0.46, y - 0.02, 0.43], 0.042, material),
    limb([-0.46, y - 0.02, 0.43], [-0.42, y - 0.3, 0.47], 0.036, material),
    blob([-0.41, y - 0.38, 0.48], [0.035, 0.07, 0.02], material),
    // The legs, the near one's knee drawn up.
    limb([0.1, y + 0.08, -0.08], [0.45, y + 0.07, -0.1], 0.062, material),
    limb([0.45, y + 0.07, -0.1], [0.8, y + 0.05, -0.13], 0.048, material),
    blob([0.84, y + 0.1, -0.13], [0.04, 0.07, 0.04], material),
    limb([0.1, y + 0.08, 0.08], [0.37, y + 0.26, 0.11], 0.062, material),
    limb([0.37, y + 0.26, 0.11], [0.68, y + 0.05, 0.13], 0.048, material),
    blob([0.72, y + 0.1, 0.13], [0.04, 0.07, 0.04], material),
  ];
}

/**
 * The surgeon no one can see, standing at the near side of the table over
 * the patient: the left hand pins the patient's chest, and the right holds a
 * long knife raised beside the head, about to come down. Made to cast a
 * shadow that reads: a small head on a neck, square shoulders, a narrow
 * waist, legs braced apart, the raised arm clear of the head. In the
 * table's frame, facing the table (−z).
 */
function surgeon(material: THREE.Material): THREE.Object3D[] {
  const [x, z] = [-0.05, 0.72];
  const lean = -0.1;
  const up = (along: number): Point => [x, 0.95 + along * Math.cos(lean), z + along * Math.sin(lean)];
  const shoulders = up(0.48);
  const leftShoulder: Point = [x - 0.18, shoulders[1], shoulders[2]];
  const rightShoulder: Point = [x + 0.18, shoulders[1], shoulders[2]];
  const leftElbow: Point = [x - 0.42, 1.28, z - 0.12];
  const rightElbow: Point = [x + 0.4, 1.58, z];
  const fist: Point = [x + 0.3, 1.84, z - 0.02];
  return [
    // Legs braced apart.
    limb([x - 0.09, 0.93, z], [x - 0.15, 0.5, z + 0.02], 0.07, material),
    limb([x - 0.15, 0.5, z + 0.02], [x - 0.2, 0.09, z + 0.04], 0.055, material),
    box([0.1, 0.08, 0.24], material, [x - 0.21, 0, z - 0.02]),
    limb([x + 0.09, 0.93, z], [x + 0.15, 0.5, z - 0.02], 0.07, material),
    limb([x + 0.15, 0.5, z - 0.02], [x + 0.2, 0.09, z - 0.04], 0.055, material),
    box([0.1, 0.08, 0.24], material, [x + 0.21, 0, z - 0.1]),
    blob(up(0.02), [0.16, 0.11, 0.11], material, lean),
    blob(up(0.19), [0.12, 0.1, 0.095], material, lean),
    blob(up(0.35), [0.18, 0.15, 0.12], material, lean),
    limb(leftShoulder, rightShoulder, 0.06, material),
    limb(up(0.5), up(0.61), 0.036, material),
    blob(up(0.7), [0.08, 0.105, 0.095], material, lean),
    // The left arm reaching down to pin the patient's chest.
    limb(leftShoulder, leftElbow, 0.048, material),
    limb(leftElbow, [-0.36, 1.1, 0.08], 0.042, material),
    blob([-0.37, 1.09, 0.02], [0.05, 0.03, 0.07], material),
    // The right arm raised beside the head, the fist gripping the knife.
    limb(rightShoulder, rightElbow, 0.048, material),
    limb(rightElbow, fist, 0.036, material),
    blob(fist, [0.06, 0.06, 0.06], material),
    knife(fist, [0.45, 0.9, 0], material),
  ];
}

/**
 * The two no one can see: a patient held down on the table and a surgeon
 * standing over it with a knife raised. Only the bake sees them
 * (`bakeOnly`): they are never drawn, but they stop the lamp's light like
 * anything else, so the patient's shadow lies on the lit pad and the
 * surgeon's falls long across the floor. In the table's frame.
 */
function unseenOperation(): THREE.Group {
  const nothing = flat("void");
  const result = group(...patient(nothing), ...surgeon(nothing));
  result.traverse((part) => (part.userData.bakeOnly = true));
  return result;
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
 * straps undone, under a hanging lamp whose deep shade burns a sickly green;
 * and in its light, though no one is there, the shadow of a patient lying on
 * the table and, thrown long across the tiles, the shadow of a surgeon
 * standing over it with a knife raised.
 */
export const OPERATING_LABORATORY: RoomDefinition = {
  id: "operating-laboratory",
  ...LAB_SHELL,
  props: [
    { build: operatingTable, at: TABLE_AT, turn: TABLE_TURN },
    // The drain at the table's foot, clear of its pedestal.
    { build: drain, at: [TABLE_AT[0] + 0.46, TABLE_AT[1] - 0.46], turn: TABLE_TURN },
    { build: operatingLamp, at: TABLE_AT, turn: TABLE_TURN },
    { build: unseenOperation, at: TABLE_AT, turn: TABLE_TURN },
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
  prime: [1.8, -1.6],
  // Where the surgeon stands and his shadow falls, so no explorer stands on it.
  keepClear: [{ from: fromTable([-0.1, 0.9]), to: fromTable([0.4, 2.6]), radius: 0.7 }],
};
