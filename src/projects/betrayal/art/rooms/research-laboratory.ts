import * as THREE from "three";
import { createRng, pick } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { instrumentTray, LAB_SHELL, labBench, labGlass, labGlassMaterial } from "../kit/laboratory";
import { flame } from "../kit/flame";
import { solidLathe } from "../kit/vessel";
import { lightAnchor } from "../light-anchor";
import { paletteHex, type PaletteKey } from "../palette";
import { CUT_HEIGHT, onWall, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, glow, group, lightMaterial } from "../shapes";
import { shiny, shinyBatch, SHINES } from "../shine";

const SEED = "research-laboratory";

/** The island bench, long along z, standing free in the left half of the room. */
const ISLAND = { at: [-1.4, 0.1] as [number, number], length: 2.3, depth: 0.85, height: 0.92 };
/** Where the bell jar's pedestal stands, and the heights of its parts. */
const JAR_AT: [x: number, z: number] = [1.3, -0.6];
const JAR = { plinth: 0.8, base: 0.04, radius: 0.27, wall: 0.55, crown: 0.25 };

const iron = () => shiny(flat("soot"), SHINES.iron);
const brass = () => shiny(flat("brass"), SHINES.tarnishedBrass);

/** A geometry tinted all over in one palette colour, for light that takes its colour from vertices. */
function tinted(geometry: THREE.BufferGeometry, colour: PaletteKey): THREE.BufferGeometry {
  const { r, g, b } = new THREE.Color(paletteHex(colour));
  const count = geometry.getAttribute("position").count;
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colours.set([r, g, b], i * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return geometry;
}

/**
 * The bell jar on its pedestal: a turned, polished column with a brass ring
 * on top, and over it a tall dome of glass in which something is held, a
 * slow knot of violet light that lights the room. Round, so it faces
 * every way.
 */
function bellJar(): THREE.Group {
  const { plinth, base, radius, wall, crown } = JAR;
  const wood = shiny(flat("woodDark"), SHINES.polishedWood);
  const pedestal = solidLathe(
    [[0.26, 0], [0.26, 0.05], [0.18, 0.08], [0.09, 0.12], [0.06, 0.3], [0.075, 0.5], [0.055, 0.7], [0.1, plinth - 0.05]],
    wood,
    12,
  );
  // Its top in dark, matte slate: polished wood this near the light would burn white.
  const top = cylinder(radius + 0.06, 0.05, flat("soot"), [0, plinth - 0.05, 0], { top: radius + 0.06, sides: 14 });
  top.userData.noShadow = true;
  const ring = cylinder(radius + 0.03, base, brass(), [0, plinth, 0], { sides: 14 });
  // The pedestal's top and the ring hold the light, so they cast no shadow: the floor round the foot is lit violet.
  ring.userData.noShadow = true;
  const floor = plinth + base;
  const profile: [number, number][] = [[radius, 0], [radius, wall]];
  for (let k = 1; k <= 6; k++) {
    const a = (k / 6) * (Math.PI / 2);
    profile.push([radius * Math.cos(a), wall + crown * Math.sin(a)]);
  }
  const dome = new THREE.Mesh(
    tinted(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 16), "bruiseLight"),
    shiny(lightMaterial(0.22, { vertexColors: true }), SHINES.glass),
  );
  dome.position.y = floor;
  dome.userData.noShadow = true;
  const knob = solidLathe([[0.03, 0], [0.04, 0.02], [0.02, 0.05], [0.035, 0.07], [0, 0.09]], brass(), 8);
  knob.position.y = floor + wall + crown - 0.004;
  knob.userData.noShadow = true;
  const result = group(pedestal, top, ring, dome, knob);
  result.add(lightAnchor({ colour: "violet", intensity: 4.5, range: 10, flicker: 0.12, signal: 1, kind: "glow" }, [0, floor + 0.6, 0]));
  return result;
}

/**
 * What is held under the bell jar: a slow knot of violet light, a bright core
 * with veils wound round it, turning and rising and sinking as if it breathed.
 * It lights nothing itself (the jar's light does), and casts no shadow.
 */
function presence(): THREE.Group {
  const floor = JAR.plinth + JAR.base;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8).scale(1, 1.5, 1), glow("violet"));
  core.position.y = floor + 0.3;
  const veils = [0, 1, 2].map((k) => {
    const veil = new THREE.Mesh(tinted(new THREE.SphereGeometry(0.13 - k * 0.018, 12, 8).scale(1, 1.9, 0.7), "violet"), lightMaterial(0.32 - k * 0.06, { vertexColors: true }));
    veil.userData.noShadow = true;
    return veil;
  });
  core.userData.noShadow = true;
  const knot = group(core, ...veils);
  return animated(knot, (seconds) => {
    knot.rotation.y = seconds * 0.5;
    veils.forEach((veil, k) => {
      const turn = seconds * (0.7 + k * 0.25) + (k * Math.PI * 2) / 3;
      veil.position.set(Math.cos(turn) * 0.06, floor + 0.22 + k * 0.09 + Math.sin(seconds * 0.9 + k) * 0.03, Math.sin(turn) * 0.06);
      veil.rotation.z = Math.sin(turn) * 0.4;
    });
    core.position.y = floor + 0.3 + Math.sin(seconds * 0.9) * 0.02;
  });
}

/** Shards of glass on the floor at the pedestal's foot, where the bell jar has begun to give: flat slivers, shining. Built round the pedestal's centre. */
function shards(): THREE.Group {
  const rng = createRng(`${SEED}:shards`);
  const result = group();
  const material = labGlassMaterial();
  for (let k = 0; k < 7; k++) {
    const shape = new THREE.Shape();
    const size = 0.03 + rng.next() * 0.05;
    shape.moveTo(0, 0);
    shape.lineTo(size, size * (0.2 + rng.next() * 0.4));
    shape.lineTo(size * (0.2 + rng.next() * 0.5), size * (0.8 + rng.next()));
    const sliver = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false }).rotateX(-Math.PI / 2), material);
    const angle = 0.6 + rng.next() * 1.4;
    const out = 0.34 + rng.next() * 0.35;
    sliver.position.set(Math.cos(angle) * out, 0.002, Math.sin(angle) * out);
    sliver.rotation.y = rng.next() * Math.PI * 2;
    result.add(sliver);
  }
  return result;
}

/** A spirit lamp: a squat glass font with a brass collar and a small flame, the light the bench's work is done by. */
function spiritLamp(): THREE.Group {
  const font = solidLathe([[0.03, 0], [0.045, 0.02], [0.04, 0.045], [0.018, 0.055]], labGlassMaterial(), 10);
  const burning = flame("candle");
  burning.position.y = 0.084;
  burning.scale.setScalar(0.75);
  const result = group(font, cylinder(0.018, 0.02, brass(), [0, 0.054, 0], { sides: 8 }), cylinder(0.004, 0.012, flat("soot"), [0, 0.074, 0], { sides: 3 }), burning);
  result.traverse((child) => (child.userData.noShadow = true));
  return result;
}

/** A retort stand: an iron foot and rod, a ring holding a round flask of something brewing over a spirit lamp. Base at y = 0. */
function retortStand(fluid: PaletteKey): THREE.Group {
  const metal = iron();
  const result = group(box([0.2, 0.015, 0.14], metal, [0, 0, 0]), cylinder(0.007, 0.55, metal, [-0.08, 0.015, 0], { sides: 5 }));
  result.add(box([0.085, 0.012, 0.012], metal, [-0.0325, 0.2, 0]));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 4, 10).rotateX(Math.PI / 2), metal);
  ring.position.set(0.02, 0.205, 0);
  result.add(ring);
  const flask = labGlass("flask", { fill: 0.42, fluid });
  flask.position.set(0.02, 0.17, 0);
  const lamp = spiritLamp();
  lamp.position.set(0.02, 0.015, 0);
  // The flask and its ring sit over the flame, so they cast no shadow, or they would smother its light.
  for (const part of [flask, ring]) part.traverse((child) => (child.userData.noShadow = true));
  result.add(flask, lamp, lightAnchor({ colour: "amber", intensity: 4, range: 7, flicker: 0.15, kind: "candle" }, [0.02, 0.16, 0.04]));
  return result;
}

/** A retort on its own stand, its long neck reaching down into a receiving flask. The neck runs towards +x. Base at y = 0. */
function retort(): THREE.Group {
  const metal = iron();
  const result = group(box([0.12, 0.012, 0.12], metal, [0, 0, 0]), cylinder(0.006, 0.12, metal, [0, 0.012, 0], { sides: 5 }));
  const bulb = solidLathe([[0.02, 0], [0.06, 0.03], [0.075, 0.07], [0.06, 0.11], [0.025, 0.135], [0, 0.14]], labGlassMaterial(), 12);
  bulb.position.y = 0.12;
  const fluid = solidLathe([[0.02, 0], [0.058, 0.028], [0.072, 0.06], [0, 0.06]], shiny(flat("bloodDark"), SHINES.glass), 12);
  fluid.position.y = 0.122;
  const neck = cylinder(0.022, 0.36, labGlassMaterial(), [0, 0, 0], { top: 0.008, sides: 8 });
  neck.rotation.z = -1.95;
  neck.position.set(0.02, 0.24, 0);
  const receiver = labGlass("flask", { fill: 0.2, fluid: "bloodDark", scale: 0.9 });
  receiver.position.set(0.36, 0, 0);
  result.add(bulb, fluid, neck, receiver);
  return result;
}

/** A wooden rack of test tubes, some filled, one gap. Long along x. */
function tubeRack(): THREE.Group {
  const wood = batch();
  wood.block([0.26, 0.02, 0.07], "woodMid", [0, 0, 0]);
  wood.block([0.26, 0.018, 0.07], "woodMid", [0, 0.09, 0]);
  for (const x of [-0.12, 0.12]) wood.block([0.02, 0.07, 0.065], "wood", [x, 0.02, 0]);
  const result = group(wood.mesh());
  const fluids: (PaletteKey | null)[] = ["wraith", "bloodDark", null, "verdigris", "boneDark", "ember"];
  fluids.forEach((fluid, i) => {
    if (!fluid) return;
    const tube = labGlass("tube", { fill: 0.4 + (i % 3) * 0.15, fluid });
    tube.position.set(-0.09 + i * 0.036, 0.02, 0);
    result.add(tube);
  });
  return result;
}

/** A brass microscope on its iron foot, its tube tilted towards the eye. Faces +z. */
function microscope(): THREE.Group {
  const metal = brass();
  const result = group(
    box([0.1, 0.02, 0.12], iron(), [0, 0, 0]),
    cylinder(0.013, 0.13, metal, [0, 0.02, -0.03], { sides: 6 }),
    box([0.08, 0.008, 0.08], iron(), [0, 0.09, 0.01]),
  );
  const tube = cylinder(0.02, 0.17, metal, [0, 0, 0], { sides: 8 });
  tube.rotation.x = -0.35;
  tube.position.set(0, 0.11, -0.01);
  result.add(tube, box([0.02, 0.03, 0.02], metal, [0, 0.12, -0.03]));
  return result;
}

/** A pile of notebooks and loose sheets of notes. */
function notes(seed: string): THREE.Group {
  const rng = createRng(`${SEED}:notes:${seed}`);
  const b = batch();
  let y = 0;
  for (let k = 0; k < 3; k++) {
    const h = 0.025 + rng.next() * 0.02;
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rng.next() - 0.5) * 0.5);
    b.add([0.2, h, 0.15], pick(rng, ["woodMid", "bloodDark", "verdigrisDark", "bruiseDark"] as PaletteKey[]), new THREE.Matrix4().compose(new THREE.Vector3(0, y + h / 2, 0), turn, new THREE.Vector3(1, 1, 1)));
    y += h + 0.002;
  }
  for (let k = 0; k < 3; k++) {
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.next() * 1.2);
    b.add([0.21, 0.004, 0.29], "bone", new THREE.Matrix4().compose(new THREE.Vector3(0.22 + k * 0.03, 0.002 + k * 0.005, (rng.next() - 0.5) * 0.1), turn, new THREE.Vector3(1, 1, 1)));
  }
  return group(b.mesh());
}

/** How high the reagent rack's shelf stands over the slate, and its uprights' places along the bench. */
const RACK = { shelf: 0.95, posts: [-1.1, 1.1] };

/**
 * A reagent rack over the island bench, the way a laboratory works by night:
 * two iron uprights from the slate, a shelf of bottles across their tops,
 * and two brass lamps hung under it, throwing their amber straight down on
 * the apparatus. Open below the shelf, so the bench shows from every side.
 * In the bench's frame (long along x), base on the slate.
 */
function reagentRack(): THREE.Group {
  const metal = iron();
  const result = group();
  for (const x of RACK.posts) result.add(cylinder(0.018, RACK.shelf + 0.02, metal, [x, 0, 0], { sides: 6 }));
  result.add(box([2.36, 0.03, 0.26], shiny(flat("woodDark"), SHINES.polishedWood), [0, RACK.shelf, 0]));
  const fluids: PaletteKey[] = ["wraith", "bloodDark", "boneDark", "verdigris", "ember", "wraithDark", "bruise"];
  for (let k = 0; k < 11; k++) {
    if (k === 4 || k === 8) continue;
    const bottle = labGlass("bottle", { fluid: fluids[k % fluids.length], fill: 0.6, scale: 1 + (k % 3) * 0.15, lid: "stopper" });
    bottle.position.set(-1.0 + k * 0.2, RACK.shelf + 0.03, (k % 2) * 0.05 - 0.02);
    result.add(bottle);
  }
  for (const x of [-0.5, 0.45]) {
    const lamp = group(
      cylinder(0.008, 0.16, metal, [0, RACK.shelf - 0.16, 0], { sides: 4 }),
      solidLathe([[0.13, 0], [0.11, 0.04], [0.05, 0.11], [0.02, 0.13]], brass(), 12),
      new THREE.Mesh(new THREE.CircleGeometry(0.11, 12).rotateX(Math.PI / 2).translate(0, 0.006, 0), glow("amber")),
      flame("oilLamp").translateY(-0.06),
    );
    // The shade hangs below its rod; its parts hold the light, so they cast no shadow.
    for (const part of lamp.children.slice(1)) part.position.y += RACK.shelf - 0.29;
    lamp.traverse((part) => (part.userData.noShadow = true));
    lamp.position.x = x;
    lamp.add(lightAnchor({ colour: "amber", intensity: 3.5, range: 6, flicker: 0.05, kind: "lamp" }, [0, RACK.shelf - 0.42, 0]));
    result.add(lamp);
  }
  return result;
}

/** Everything on the island bench's slate, in the bench's frame (long along x, the room side +z), base on the slate. */
function benchApparatus(): THREE.Group {
  const result = group();
  const place = (piece: THREE.Object3D, x: number, z: number, turn = 0) => {
    piece.position.set(x, 0, z);
    piece.rotation.y = turn;
    result.add(piece);
  };
  place(retortStand("ember"), -0.85, 0.05);
  place(retort(), -0.5, -0.12);
  place(labGlass("conical", { fill: 0.3, fluid: "verdigris" }), -0.55, 0.22);
  place(labGlass("beaker", { fill: 0.6, fluid: "boneDark", scale: 1.2 }), -0.2, 0.25);
  place(tubeRack(), 0.15, 0.22);
  place(instrumentTray({ length: 0.42, width: 0.26 }), 0.25, -0.16, 0.1);
  place(microscope(), 0.7, 0.18, -0.3);
  place(notes("bench"), 0.78, -0.18, 0.4);
  place(labGlass("jar", { fill: 0.85, fluid: "wraithDark", scale: 0.8, lid: "brass" }), 0.92, 0.05);
  return result;
}

/** Specimen jars in a row along x, `length` long, of mixed sizes and murky fluids, a gap or two, and none where an upright stands (`posts`, as x). Base at y = 0. */
function specimenRow(length: number, seed: string, posts: readonly number[]): THREE.Group {
  const rng = createRng(`${SEED}:specimens:${seed}`);
  const result = group();
  const fluids: PaletteKey[] = ["wraithDark", "wraith", "boneDark", "verdigrisDark", "verdigris", "woodLight"];
  for (let x = -length / 2 + 0.08; x < length / 2 - 0.08; ) {
    const scale = 0.55 + rng.next() * 0.55;
    if (rng.next() < 0.12) {
      x += 0.14;
      continue;
    }
    if (posts.some((post) => post > x - 0.05 && post < x + 0.16 * scale + 0.05)) {
      x += 0.05;
      continue;
    }
    const jar = labGlass("jar", { scale, fill: 0.75 + rng.next() * 0.2, fluid: pick(rng, fluids), lid: rng.next() < 0.5 ? "brass" : "stone" });
    jar.position.set(x + 0.08 * scale, 0, (rng.next() - 0.5) * 0.05);
    result.add(jar);
    x += 0.16 * scale + 0.03 + rng.next() * 0.03;
  }
  return result;
}

const SHELF = { length: 2.1, depth: 0.34 };
/** Where the shelving's uprights stand, as x. */
const POSTS = [-SHELF.length / 2 + 0.03, 0, SHELF.length / 2 - 0.03];

/** The low part of the specimen shelving, below the cut height: a plinth and a bottom shelf of big jars. Faces +z, its back at z = 0. */
function specimenBase(): THREE.Group {
  const b = batch();
  const { length, depth } = SHELF;
  b.block([length, 0.06, depth], "woodDark", [0, 0, depth / 2]);
  b.block([length, 0.035, depth], "wood", [0, CUT_HEIGHT - 0.04, depth / 2]);
  for (const x of POSTS) b.block([0.05, CUT_HEIGHT - 0.1, depth - 0.02], "woodDark", [x, 0.06, depth / 2 - 0.01]);
  const jars = specimenRow(length - 0.1, "base", POSTS);
  jars.position.set(0, 0.06, depth / 2);
  return group(b.mesh(), jars);
}

/** The shelving above the cut height, hung on the wall: uprights and three shelves of specimens. Its base at the cut height; faces +z. */
function specimenShelves(): THREE.Group {
  const b = batch();
  const { length, depth } = SHELF;
  const top = 2.1 - CUT_HEIGHT;
  for (const x of POSTS) b.block([0.05, top, depth - 0.02], "woodDark", [x, 0, depth / 2 - 0.01]);
  const result = group();
  [0.42, 0.84, 1.26].forEach((y, i) => {
    b.block([length, 0.035, depth], "wood", [0, y, depth / 2]);
    const jars = specimenRow(length - 0.1, `above-${i}`, POSTS);
    jars.position.set(0, y + 0.035, depth / 2);
    result.add(jars);
  });
  b.block([length + 0.04, 0.04, depth + 0.02], "woodDark", [0, top, depth / 2 + 0.01]);
  result.add(b.mesh());
  return result;
}

/** A tall laboratory stool, its seat polished by use. */
function stool(): THREE.Group {
  const metal = iron();
  const result = group(cylinder(0.16, 0.04, shiny(flat("woodMid"), SHINES.polishedWood), [0, 0.66, 0], { sides: 10 }));
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) result.add(box([0.025, 0.66, 0.025], metal, [x * 0.1, 0, z * 0.1]));
  const rail = batch();
  rail.block([0.22, 0.015, 0.015], "soot", [0, 0.24, 0.1]);
  rail.block([0.22, 0.015, 0.015], "soot", [0, 0.24, -0.1]);
  result.add(shinyBatch(rail, SHINES.iron));
  return result;
}

/** A crate of packed straw holding three bottles, set down by the shelves. */
function bottleCrate(): THREE.Group {
  const b = batch();
  b.block([0.45, 0.28, 0.32], "woodMid", [0, 0, 0]);
  b.block([0.41, 0.02, 0.28], "brass", [0, 0.265, 0]);
  const result = group(b.mesh());
  for (const [x, fluid] of [[-0.12, "wraith"], [0.0, "boneDark"], [0.13, "verdigris"]] as [number, PaletteKey][]) {
    const bottle = labGlass("bottle", { fill: 0.7, fluid, scale: 1.3, lid: "stopper" });
    bottle.position.set(x, 0.12, 0);
    result.add(bottle);
  }
  return result;
}

/**
 * The Research Laboratory: a long island bench crowded with apparatus, a
 * flask brewing over a spirit lamp, shelves of specimens in murky jars; and
 * on a pedestal of its own a tall bell jar, in which a presence has been
 * caught, a knot of violet light, turning, and lighting the room.
 * Glass lies on the floor at the pedestal's foot: the jar has begun to give.
 */
export const RESEARCH_LABORATORY: RoomDefinition = {
  id: "research-laboratory",
  ...LAB_SHELL,
  props: [
    { build: () => labBench({ length: ISLAND.length, depth: ISLAND.depth, height: ISLAND.height, doubleSided: true }), name: "labBench", at: ISLAND.at, turn: 90 },
    { build: benchApparatus, at: ISLAND.at, y: ISLAND.height, turn: 90 },
    { build: reagentRack, at: ISLAND.at, y: ISLAND.height, turn: 90 },
    { build: bellJar, at: JAR_AT },
    { build: presence, at: JAR_AT },
    { build: shards, at: JAR_AT },
    { build: stool, at: [-0.7, 0.75] },
    // The specimen shelving along the right wall, split at the cut height.
    { build: specimenBase, ...onWall("right", 1.2, { out: 0.01 }) },
    { build: specimenShelves, ...onWall("right", 1.2, { y: CUT_HEIGHT, out: 0.01 }) },
    { build: bottleCrate, at: [2.35, -2.35], turn: 20 },
    { build: () => labGlass("carboy", { fluid: "verdigrisDark", fill: 0.6 }), name: "carboy", at: [-2.4, -2.4] },
  ],
  focus: [JAR_AT[0], 1.1, JAR_AT[1]],
  prime: [0.7, 0.9],
  // Round the bell jar, so no figure stands between it and the room.
  keepClear: [{ from: [JAR_AT[0] - 0.35, JAR_AT[1] + 0.1], to: [JAR_AT[0] - 0.35, JAR_AT[1] + 0.1], radius: 0.6 }],
};
