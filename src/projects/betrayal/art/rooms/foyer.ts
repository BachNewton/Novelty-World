import * as THREE from "three";
import { animated } from "../animate";
import { candle, table } from "../kit";
import { lightAnchor } from "../light-anchor";
import { WALL_HEIGHT, onWall, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, glow, group, lathe } from "../shapes";
import { runner, SUITE } from "./starting-tile";

const CHANDELIER_ARMS = 6;

/**
 * A brass chandelier hung from the ceiling on a chain, its origin at the
 * ceiling. It hangs out of true and sways a little, though nothing stirs the
 * air.
 */
function chandelier(): THREE.Group {
  const brass = flat("brass");
  const swing = group();
  const links = batch();
  for (let i = 0; i < 9; i++) {
    const across = i % 2 === 0;
    links.block([across ? 0.06 : 0.02, 0.08, across ? 0.02 : 0.06], "brass", [0, -0.08 * (i + 1), 0]);
  }
  swing.add(links.mesh());
  const body = group(
    lathe(
      [
        [0, 0],
        [0.05, 0.02],
        [0.13, 0.08],
        [0.1, 0.16],
        [0.04, 0.2],
        [0.035, 0.42],
        [0.07, 0.46],
        [0.03, 0.5],
        [0, 0.52],
      ],
      brass,
      8,
    ),
  );
  const radius = 0.6;
  for (let i = 0; i < CHANDELIER_ARMS; i++) {
    const angle = (i / CHANDELIER_ARMS) * Math.PI * 2;
    const arm = box([radius, 0.025, 0.025], brass, [radius / 2, 0.1, 0]);
    const cup = cylinder(0.045, 0.04, brass, [radius, 0.1, 0], { top: 0.06, sides: 6 });
    const taper = candle({ height: 0.12, light: false });
    taper.position.set(radius, 0.14, 0);
    const drop = new THREE.Mesh(new THREE.OctahedronGeometry(0.025, 0), flat("boneLight"));
    drop.scale.y = 2;
    drop.position.set(radius * 0.7, 0.04, 0);
    const spoke = group(arm, cup, taper, drop);
    spoke.rotation.y = angle;
    body.add(spoke);
  }
  for (const [ringRadius, y] of [[radius, 0.1], [radius * 0.55, 0.32]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, 0.03, 4, 18), brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    body.add(ring);
  }
  for (let i = 0; i < CHANDELIER_ARMS / 2; i++) {
    const taper = candle({ height: 0.1, light: false });
    const angle = ((i + 0.5) / (CHANDELIER_ARMS / 2)) * Math.PI * 2;
    taper.position.set(Math.cos(angle) * radius * 0.55, 0.34, Math.sin(angle) * radius * 0.55);
    body.add(taper);
  }
  body.position.y = -0.72 - 0.52;
  swing.add(body);
  swing.traverse((child) => {
    child.userData.noShadow = true;
  });
  swing.add(lightAnchor({ colour: "amber", intensity: 9, range: 10, flicker: 0.1 }, [0, -1.0, 0]));
  swing.position.y = WALL_HEIGHT;
  return group(
    animated(swing, (seconds) => {
      swing.rotation.z = 0.13 + 0.02 * Math.sin(seconds * 0.8);
      swing.rotation.x = 0.03 * Math.sin(seconds * 0.55 + 1);
    }),
  );
}

/** A tall hall mirror, shrouded in black crape as a house in mourning covers
 *  its mirrors. Its back is against the wall; its origin is its bottom edge. */
function shroudedMirror(): THREE.Group {
  const frame = flat("brass");
  const w = 0.8;
  const h = 1.1;
  const cloth = batch();
  cloth.block([w + 0.06, h - 0.1, 0.03], "soot", [0, 0.06, 0.07]);
  const folds = [0.05, 0.08, 0.04, 0.09, 0.06];
  folds.forEach((drop, i) => {
    const x = -w / 2 + 0.08 + i * ((w - 0.16) / (folds.length - 1));
    cloth.block([0.09, h - 0.1 + drop, 0.035], i % 2 === 0 ? "sootLight" : "void", [x, 0.06 - drop, 0.085]);
  });
  cloth.block([w + 0.12, 0.08, 0.06], "sootLight", [0, h - 0.07, 0.07]);
  return group(
    box([w + 0.12, h + 0.12, 0.05], frame, [0, -0.06, 0.025]),
    box([w, h, 0.02], flat("moonDark"), [0, 0, 0.05]),
    cloth.mesh(),
    box([0.04, 0.05, 0.03], frame, [0, h + 0.06, 0.03]),
  );
}

/** A glass-chimneyed oil lamp, turned low. */
function oilLamp(): THREE.Group {
  const brass = flat("brass");
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.18, 6), glow("amber"));
  chimney.position.y = 0.3;
  const result = group(
    lathe([[0, 0], [0.08, 0], [0.04, 0.04], [0.035, 0.1], [0.09, 0.15], [0.07, 0.21], [0, 0.21]], brass, 8),
    chimney,
  );
  result.traverse((child) => {
    child.userData.noShadow = true;
  });
  result.add(lightAnchor({ colour: "amber", intensity: 2, range: 5, flicker: 0.08 }, [0, 0.35, 0.2]));
  return result;
}

/** A turned coat stand, a long dark coat and a hat left on its pegs. */
function coatStand(): THREE.Group {
  const wood = flat("woodDark");
  const result = group(
    box([0.5, 0.05, 0.08], wood, [0, 0, 0]),
    box([0.08, 0.05, 0.5], wood, [0, 0, 0]),
    cylinder(0.035, 1.8, wood, [0, 0.05, 0], { sides: 6 }),
    cylinder(0.06, 0.06, flat("woodMid"), [0, 1.85, 0], { top: 0, sides: 6 }),
  );
  for (let i = 0; i < 4; i++) {
    const peg = box([0.2, 0.03, 0.03], flat("woodMid"), [0.1, 0, 0]);
    const holder = group(peg);
    holder.position.y = 1.68;
    holder.rotation.set(0, (i * Math.PI) / 2 + 0.4, 0.5);
    result.add(holder);
  }
  const coat = batch();
  coat.block([0.36, 0.12, 0.18], "bruiseDark", [0, 1.45, 0.13]);
  coat.block([0.42, 0.95, 0.16], "bruiseDark", [0, 0.5, 0.15]);
  coat.block([0.1, 0.8, 0.1], "bruise", [-0.17, 0.62, 0.19]);
  coat.block([0.1, 0.8, 0.1], "bruise", [0.17, 0.62, 0.19]);
  coat.block([0.04, 0.9, 0.02], "void", [0, 0.55, 0.235]);
  result.add(coat.mesh());
  const hat = group(cylinder(0.17, 0.015, flat("soot"), [0, 0, 0], { sides: 10 }), cylinder(0.1, 0.13, flat("soot"), [0, 0.015, 0], { sides: 10 }));
  hat.position.set(-0.15, 1.72, -0.1);
  hat.rotation.z = 0.5;
  result.add(hat);
  return result;
}

/** A potted palm, long dead, its fronds dried and drooping. */
function deadPalm(): THREE.Group {
  const result = group(
    cylinder(0.24, 0.42, flat("stoneDark"), [0, 0, 0], { top: 0.3, sides: 8 }),
    cylinder(0.27, 0.05, flat("stone"), [0, 0.42, 0], { sides: 8 }),
    cylinder(0.04, 0.5, flat("woodDark"), [0, 0.44, 0], { sides: 5 }),
  );
  const fronds = batch();
  const tilts = [0.9, 1.2, 0.7, 1.4, 1.0, 1.6, 0.8];
  tilts.forEach((tilt, i) => {
    const colour = i % 3 === 0 ? "boneDark" : "woodLight";
    const stem = new THREE.Matrix4()
      .makeTranslation(0, 0.92, 0)
      .multiply(new THREE.Matrix4().makeRotationY((i / tilts.length) * Math.PI * 2 + i * 0.3))
      .multiply(new THREE.Matrix4().makeRotationZ(-tilt));
    fronds.add([0.06, 0.4, 0.015], colour, stem.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.2, 0)));
    const tip = stem
      .multiply(new THREE.Matrix4().makeTranslation(0, 0.4, 0))
      .multiply(new THREE.Matrix4().makeRotationZ(-0.9 - tilt * 0.3))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0.2, 0));
    fronds.add([0.09, 0.42, 0.015], colour, tip);
  });
  result.add(fronds.mesh());
  return result;
}

/** The Foyer: a brass chandelier hung out of true over the red runner that
 *  carries the hall from the staircase to the front door. */
export const FOYER: RoomDefinition = {
  id: "foyer",
  ...SUITE,
  props: [
    { build: () => runner({ from: -3, to: 3 }), at: [0, 0] },
    { build: chandelier, at: [0, 0] },
    { build: () => table({ length: 1.2, width: 0.45, height: 0.82 }), ...onWall("top", -1.65, { out: 0.3 }) },
    { build: oilLamp, at: [-1.95, -2.5], y: 0.82 },
    { build: () => box([0.24, 0.015, 0.16], flat("brass")), at: [-1.45, -2.48], y: 0.82, turn: 10 },
    { build: () => box([0.09, 0.01, 0.06], flat("boneLight")), at: [-1.43, -2.47], y: 0.835, turn: -15 },
    { build: shroudedMirror, ...onWall("top", -1.65, { y: 1.25 }) },
    { build: coatStand, at: [2.15, 2.25], turn: -30 },
    { build: deadPalm, at: [-2.25, 2.2] },
    { build: () => table({ length: 0.8, width: 0.4, height: 0.5 }), ...onWall("top", 1.7, { out: 0.25 }) },
  ],
  focus: [0, 1.4, 0],
  pawn: [-1.0, 0.8],
};
