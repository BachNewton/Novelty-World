import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { BASE_TOP, burst, reach, STANDING, walks, type Gait } from "../explorers/figure";
import { cylinder, flat, group } from "../shapes";
import { paletteHex, type PaletteKey } from "../palette";
import { ghostly, monsterBase, type MonsterOptions } from "./base";

/*
 * The Spider of haunt 04: a giant spider, big enough to have eaten an explorer.
 * Read at a glance: eight long legs arched high above a low body, their knees
 * as high as a person's head, red-banded like a red-kneed tarantula, and a
 * bloated abdomen marked with the traitor's red chevrons. Eight red eyes glow
 * at the front. The traitor's red also smoulders faintly in its chitin, so its
 * shape holds in the darkest room. Every part is a rigid low-poly shape on a
 * pivot; the legs are posed by the explorers' reach, each foot planted on the
 * base. It faces +z, its eyes and fangs that way.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const BASE_RADIUS = 1.15;
/** The middle of the head-and-chest, where the legs join. */
const BODY_HEIGHT = 0.52;
const FEMUR = 0.8;
const TIBIA = 1.0;
/** The legs, front to back on the right side (+x); the left mirrors them. Each
 *  hip is on the body, and each foot rests on the base at an angle from
 *  straight ahead and a distance from the middle of the base. */
const LEGS = [
  { hip: 0.42, angle: 28, reach: 1.02 },
  { hip: 0.3, angle: 62, reach: 0.98 },
  { hip: 0.18, angle: 112, reach: 0.96 },
  { hip: 0.06, angle: 148, reach: 1.04 },
] as const;
const HIP_X = 0.2;
/** How far a planted foot travels back in one step of the scuttle: a step is half a cycle of either set of legs. */
const FOOT_TRAVEL = 0.27;

/** The traitor's red smouldering in its body, so it keeps its shape in the
 *  darkest room instead of going black; lit, it is only a red cast. */
function chitin(material: THREE.MeshLambertMaterial): THREE.MeshLambertMaterial {
  material.emissive.set(paletteHex("bloodDark"));
  material.emissiveIntensity = 0.38;
  return material;
}

/** A faceted ellipsoid: a low-poly gem of a body part, flat-shaded. */
function ovoid(radii: [number, number, number], material: THREE.Material, at: [number, number, number]): THREE.Mesh {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  geometry.scale(...radii);
  geometry.translate(...at);
  return new THREE.Mesh(geometry, material);
}

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  /** The hip, in the body's frame. */
  at: THREE.Vector3;
  /** The foot at rest, in the figure's frame. */
  foot: THREE.Vector3;
  side: -1 | 1;
  /** Which of the two sets of four it steps with. */
  set: 0 | 1;
}

/** A tapering piece of a limb hanging from its pivot, from `top` down to `bottom` (both ≤ 0), in one palette colour. */
function segment(top: number, bottom: number, radii: [top: number, bottom: number], colour: PaletteKey): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radii[0], radii[1], top - bottom, 6).toNonIndexed();
  geometry.translate(0, (top + bottom) / 2, 0);
  const { r, g, b } = new THREE.Color(paletteHex(colour));
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3).map((_, i) => [r, g, b][i % 3]), 3));
  return geometry;
}

/** Segments of different colours as one mesh, so a banded bone is one draw. */
function bone(material: THREE.Material, ...segments: THREE.BufferGeometry[]): THREE.Mesh {
  const merged = mergeGeometries(segments);
  for (const piece of segments) piece.dispose();
  return new THREE.Mesh(merged, material);
}

/** A leg: a thick upper segment from the hip, and a long lower one banded red
 *  below the knee and at the ankle, ending in a dark point. */
function leg(side: -1 | 1, index: number, material: THREE.Material): Leg {
  const { hip: hipZ, angle, reach: distance } = LEGS[index];
  const knee = group(
    bone(
      material,
      segment(0.05, -0.06, [0.095, 0.08], "sootLight"),
      segment(-0.06, -0.17, [0.08, 0.075], "bloodLight"),
      segment(-0.17, -TIBIA * 0.7, [0.075, 0.055], "ash"),
      segment(-TIBIA * 0.7, -TIBIA * 0.76, [0.058, 0.052], "bloodLight"),
      segment(-TIBIA * 0.76, -TIBIA, [0.052, 0.01], "sootLight"),
    ),
  );
  knee.position.y = -FEMUR;
  const hip = group(bone(material, segment(0.04, -FEMUR + 0.02, [0.1, 0.082], "ash")), knee);
  const at = new THREE.Vector3(side * HIP_X, 0, hipZ);
  hip.position.copy(at);
  const radians = (angle * Math.PI) / 180;
  const foot = new THREE.Vector3(side * Math.sin(radians) * distance, BASE_TOP, 0.12 + Math.cos(radians) * distance);
  // Alternate sets of four, as a spider walks: front-left with second-right, and so on.
  const set = ((index + (side === 1 ? 0 : 1)) % 2) as 0 | 1;
  return { hip, knee, at, foot, side, set };
}

/** Eight eyes in two rows across the front of the head, as one mesh. */
function eyes(material: THREE.Material): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const eye = (radius: number, x: number, y: number, z: number) => {
    const geometry = new THREE.IcosahedronGeometry(radius, 0);
    geometry.translate(x, y, z);
    parts.push(geometry);
  };
  for (const side of [-1, 1]) {
    eye(0.05, side * 0.055, 0.12, 0.62);
    eye(0.034, side * 0.15, 0.12, 0.56);
    eye(0.03, side * 0.08, 0.19, 0.55);
    eye(0.026, side * 0.17, 0.17, 0.48);
  }
  return new THREE.Mesh(mergeGeometries(parts), material);
}

const ABDOMEN = { centre: new THREE.Vector3(0, 0.2, -0.52), radii: new THREE.Vector3(0.46, 0.38, 0.6) };

/** The traitor's red down its back: chevrons pointing forward, smaller towards
 *  the tail, each sunk into the abdomen along its curve so only its face shows. */
function markings(material: THREE.Material): THREE.Mesh {
  const parts = [-0.35, 0.05, 0.45, 0.8].map((along, i) => {
    const size = 1 - i * 0.2;
    const [w, h, t] = [0.2 * size, 0.13 * size, 0.07 * size];
    const shape = new THREE.Shape([
      new THREE.Vector2(-w, -h),
      new THREE.Vector2(0, 0),
      new THREE.Vector2(w, -h),
      new THREE.Vector2(w, -h + t),
      new THREE.Vector2(0, t),
      new THREE.Vector2(-w, -h + t),
    ]);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
    // Lay it on the surface, pointing forward: `along` is the angle back from the top of the abdomen.
    geometry.translate(0, 0, -0.07);
    geometry.rotateX(-Math.PI / 2);
    const { centre, radii } = ABDOMEN;
    const point = new THREE.Vector3(0, centre.y + radii.y * Math.cos(along), centre.z - radii.z * Math.sin(along));
    const normal = new THREE.Vector3(0, (point.y - centre.y) / radii.y ** 2, (point.z - centre.z) / radii.z ** 2).normalize();
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal));
    geometry.translate(point.x, point.y, point.z);
    return geometry;
  });
  return new THREE.Mesh(mergeGeometries(parts), material);
}

/** One of the pair of fanged jaws under the eyes, hanging from its root. */
function jaw(side: -1 | 1, materials: { body: THREE.Material; fang: THREE.Material }): THREE.Group {
  const result = group(
    cylinder(0.035, 0.2, materials.body, [0, -0.2, 0], { top: 0.06, sides: 5 }),
    cylinder(0.004, 0.12, materials.fang, [0, -0.3, 0], { top: 0.03, sides: 4 }),
  );
  result.position.set(side * 0.06, 0.02, 0.6);
  result.rotation.x = 0.35;
  return result;
}

/** A feeler beside the jaws: two short segments. */
function palp(side: -1 | 1, material: THREE.Material): { root: THREE.Group; tip: THREE.Group } {
  const tip = group(cylinder(0.02, 0.2, material, [0, -0.2, 0], { top: 0.032, sides: 5 }));
  tip.position.y = -0.2;
  const root = group(cylinder(0.032, 0.22, material, [0, -0.21, 0], { top: 0.038, sides: 5 }), tip);
  root.position.set(side * 0.13, 0.02, 0.56);
  return { root, tip };
}

/**
 * The Spider on its broad base, its body at hip height to a person and its
 * knees above their head; about 2.2 m across the legs. Its idle: it breathes,
 * shifts one leg or another to a new hold, twitches its feelers, and now and
 * then rears up, lifting its two front legs to show its fangs. Stunned, it
 * drops onto the base with its legs curled in under it, as a spider does, and
 * its eyes go dark red. Moving, it scuttles: its legs step in two alternating
 * sets of four with the walk's stride, and its body runs low and level.
 */
export function spider(seed = "spider", gait: Gait = STANDING, { stunned = false }: MonsterOptions = {}): THREE.Group {
  const banded = chitin(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const materials = {
    leg: chitin(flat("ash")),
    body: chitin(flat("ash")),
    belly: chitin(flat("sootLight")),
    fang: flat("boneDark"),
  };
  const red = ghostly(stunned ? "blood" : "scarlet");

  const thorax = ovoid([0.27, 0.17, 0.34], materials.body, [0, 0.03, 0.27]);
  const abdomenPivot = group(ovoid(ABDOMEN.radii.toArray(), materials.belly, ABDOMEN.centre.toArray()), markings(red));
  abdomenPivot.position.set(0, 0.04, 0.0);
  abdomenPivot.rotation.x = -0.12;

  const legs: Leg[] = [];
  for (const side of [1, -1] as const) for (let i = 0; i < LEGS.length; i++) legs.push(leg(side, i, banded));
  const jaws = [jaw(1, materials), jaw(-1, materials)];
  const palps = [palp(1, materials.leg), palp(-1, materials.leg)];
  const body = group(thorax, abdomenPivot, eyes(red), ...jaws, ...palps.map((p) => p.root), ...legs.map((l) => l.hip));

  const figure = group(monsterBase(BASE_RADIUS, { rim: "soot" }), body);

  const rng = createRng(seed);
  const offset = rng.next() * 100;
  const breathPhase = rng.next() * Math.PI * 2;
  const toBody = new THREE.Matrix4();
  const target = new THREE.Vector3();
  const bend = new THREE.Vector3();

  // It scuttles level, without a miniature's hop, each foot planted for a whole step.
  return walks(animated(figure, (clock) => {
    const seconds = clock + offset;
    const breath = Math.sin((seconds / 3.1) * Math.PI * 2 + breathPhase);
    const stride = gait(clock);
    const rear = stunned ? 0 : burst(seconds, `${seed}:rear`, { every: 10, lasts: 3.2, chance: 0.65 }).amount * (1 - stride.amount);

    body.position.set(0, stunned ? 0.3 : BODY_HEIGHT + breath * 0.012 + rear * 0.12 - stride.amount * 0.08, stunned ? 0.05 : -rear * 0.12);
    body.rotation.x = stunned ? 0.08 : -rear * 0.32 + stride.amount * 0.04;
    body.rotation.z = stunned ? 0.06 : 0;
    abdomenPivot.scale.setScalar(1 + breath * 0.02);
    abdomenPivot.rotation.x = -0.12 + rear * 0.25 + (stunned ? 0.18 : 0);
    body.updateMatrix();
    toBody.copy(body.matrix).invert();

    legs.forEach((limb, i) => {
      if (stunned) {
        // Crumpled in towards the body, knees drawn up and feet tucked beneath, as a spider lies when struck.
        target.set(limb.foot.x - limb.at.x, 0, limb.foot.z - limb.at.z).setLength(0.42).add(limb.at);
        target.y = -0.18;
        bend.set(limb.side, 1.2, 0);
      } else {
        target.copy(limb.foot);
        if (rear > 0 && i % LEGS.length === 0) {
          // The front pair lifts high and forward over its head, the threat display.
          target.lerp(new THREE.Vector3(limb.side * 0.45, 1.55, 1.05), rear);
        }
        if (stride.amount > 0) {
          const cycle = stride.phase + limb.set * Math.PI;
          target.z += Math.sin(cycle) * FOOT_TRAVEL * stride.amount;
          target.y += Math.max(0, Math.cos(cycle)) * 0.16 * stride.amount;
        } else {
          const shift = burst(seconds, `${seed}:leg${i}`, { every: 4.5, lasts: 1, chance: 0.3 });
          target.y += Math.sin(shift.amount * Math.PI) * 0.12;
          target.x += (shift.pick - 0.5) * 0.12 * shift.amount * limb.side;
          target.z += (shift.pick - 0.5) * 0.14 * shift.amount;
        }
        target.applyMatrix4(toBody);
        bend.set(limb.side * 0.5, 1, limb.at.z * 0.5);
      }
      const posed = reach(limb.at, target, FEMUR, TIBIA, bend);
      limb.hip.quaternion.copy(posed.shoulder);
      limb.knee.quaternion.copy(posed.elbow);
    });

    // Feelers twitch, jaws work; rearing, the jaws spread.
    palps.forEach(({ root, tip }, i) => {
      const twitch = burst(seconds, `${seed}:palp${i}`, { every: 2.2, lasts: 0.6, chance: 0.6 }).amount;
      root.rotation.x = stunned ? 1.2 : 0.55 + twitch * 0.35 - rear * 0.3;
      root.rotation.z = (i ? -1 : 1) * 0.15;
      tip.rotation.x = stunned ? -1.4 : -0.9 + twitch * 0.3;
    });
    jaws.forEach((piece, i) => {
      piece.rotation.z = (i ? 1 : -1) * (0.05 + rear * 0.3 + (stunned ? 0 : Math.max(0, Math.sin(seconds * 3.7)) * 0.05));
    });
  }), { step: FOOT_TRAVEL * 2, hop: 0 });
}
