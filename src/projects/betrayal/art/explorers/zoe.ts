import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { ball, chain, ellipsoid, figureMaterial, form, plinth, ring, rod, roundBox, sculpt, stretched, type Solid } from "../forms";
import { group } from "../shapes";
import { BASE_TOP, burst, joins, leg, legJoints, legPoints, miniatureHeight, soleEnds, STANDING, stride, walks, type Gait, type StrideRig, type Swept, type Walking } from "./figure";
import { atLeast, hangsCloth, heavyCloth, type ClothTiming } from "./cloth";
import { aimGrip, between, blendPose, buildArm, fist, handParts, hasHands, holding, holdIn, poseArm, poseHand, reachWrist, RELAXED, turnIn, type Arm } from "./hands";
import { skinOf } from "./skin";
import { declareParts, figureParts } from "../figure-parts";
import { windOf } from "../wind";
import { clothMoment, clothNet, clothOnClock, clothSheet, hingedPanels, simulatesCloth, type ClothBody, type SheetLook } from "./cloth-sim";
import { clothTrial, type ClothTrial } from "./cloth-trial";

/*
 * Zoe Ingstrom: an eight-year-old who hums little tunes, loves her dolls and
 * is afraid of the boogeyman. Read at a glance: the smallest figure in the
 * house, a big round head with a straight fringe and two copper pigtails, a
 * pleated bell of yellow dress over white socks and red shoes, and a rag doll
 * dangling from her hand. She faces +z; her right hand is on −x.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const SKIN = skinOf("zoe-ingstrom");

const TOP = BASE_TOP + miniatureHeight(3, 9);
const WAIST = 0.47;
const LEG = WAIST - BASE_TOP;
/** A child's short step: at the house's one pace, a quick patter. */
const ZOE_WALK: Walking = { step: 0.4, hop: 0.03 };
const ARM_SWING = 0.5;
/** Where the original's head sat, so the neck pivot and the pigtails' ties stay where they were. */
const HEAD_RADIUS = 0.1225;
const NECK = TOP - 0.31;
const PIGTAIL_TIE: [number, number, number] = [HEAD_RADIUS + 0.01, 0.2, -0.03];
const SHOULDER: [number, number] = [0.125, 0.665];
const UPPER_ARM = 0.14;
/** From the elbow to the wrist. */
const FOREARM = 0.11;
/** Her hands, this many times an adult's. */
const HAND = 0.55;
const LEG_X = 0.05;
/** The ankle, in the shoe, and the leg's two bones from the hip down to it. */
const ANKLE = BASE_TOP + 0.04;
const THIGH = 0.176;
const SHIN = 0.176;

/** The head on its neck: a big round head with full cheeks, rosy, round eyes
 *  (white, a brown iris and a glint, so they read as a child's and not as two
 *  holes), a small smile, a straight fringe and hair to the neck behind. */
function head(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0, -0.04, 0], [0, 0.06, 0], 0.04, 0.038), SKIN)
    .add(ellipsoid([0, 0.16, 0], [0.122, 0.13, 0.122]), SKIN, 0.03)
    .add(ellipsoid([0, 0.1, 0.03], [0.1, 0.085, 0.098]), SKIN, 0.05)
    .add(ball([0, 0.105, 0.13], 0.015), SKIN, 0.012);
  for (const side of [-1, 1]) {
    shape.add(ellipsoid([side * 0.12, 0.12, 0], [0.016, 0.03, 0.022]), SKIN, 0.01);
    shape.carve(ball([side * 0.044, 0.126, 0.128], 0.021), { blend: 0.008 });
    shape.add(ball([side * 0.044, 0.125, 0.105], 0.023), "boneLight");
    shape.paint(ball([side * 0.044, 0.124, 0.127], 0.0125), "woodMid");
    shape.paint(ball([side * 0.044, 0.124, 0.129], 0.0065), "void");
    shape.paint(ball([side * 0.039, 0.132, 0.128], 0.0045), "boneLight");
    shape.paint(ellipsoid([side * 0.07, 0.088, 0.1], [0.022, 0.013, 0.03]), "bloodLight");
  }
  return shape
    .paint(ellipsoid([0, 0.064, 0.112], [0.02, 0.006, 0.03]), "blood")
    .add(ellipsoid([0, 0.17, -0.012], [0.134, 0.14, 0.134]), "woodLight", 0.01)
    .add(roundBox([0, 0.178, 0.1], [0.1, 0.03, 0.025], 0.02), "woodLight", 0.02)
    .add(ellipsoid([0, 0.1, -0.055], [0.12, 0.1, 0.09]), "woodLight", 0.03)
    .geometry(0.008);
}

/** A pigtail hanging from its tie: the red tie, and a tapering bunch of hair. */
function pigtail(): THREE.BufferGeometry {
  return sculpt()
    .add(ring([0, -0.03, 0], 0.026, 0.014), "bloodLight")
    .add(chain([[0, -0.02, 0], [0, -0.09, 0.006], [0, -0.165, 0]], [0.032, 0.04, 0.02]), "woodLight", 0.01)
    .geometry(0.006);
}

/** The bodice from the waist up: a Peter Pan collar, buttons, and a red sash tied in a bow behind. */
function bodice(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, 0.1, 0], [0.098, 0.13, 0.07]), "gold")
    .add(rod([-0.075, 0.18, 0], [0.075, 0.18, 0], 0.042), "gold", 0.05)
    .add(stretched(ring([0, 0.01, 0], 0.094, 0.026), [0, 0.01, 0], [1, 1, 0.78]), "bloodLight", 0.004)
    .add(ring([0, 0.207, 0], 0.045, 0.016), "boneLight", 0.004)
    .add(ball([0, 0.02, -0.082], 0.018), "bloodLight", 0.004);
  for (const side of [-1, 1]) {
    shape.add(ellipsoid([side * 0.034, 0.197, 0.052], [0.038, 0.012, 0.028]), "boneLight", 0.004);
    shape.add(ellipsoid([side * 0.042, 0.025, -0.088], [0.04, 0.026, 0.014]), "bloodLight", 0.006);
    shape.add(rod([side * 0.012, 0.01, -0.09], [side * 0.032, -0.07, -0.142], 0.011, 0.008), "bloodLight", 0.004);
  }
  for (const y of [0.07, 0.12, 0.16]) shape.add(ball([0, y, 0.069], 0.008), "boneLight");
  return shape.geometry(0.008);
}

/** The skirt's shape: from the waist (its top, at the hips' pivot) down to the hem, its radius at the waist and at its widest, and the cloth's thickness. */
const SKIRT = { top: 0, hem: -0.19, petticoat: -0.205, waist: 0.098, width: 0.215, cloth: 0.014 };

/** The skirt's radius at a height, in the hips' frame, before the dress is scaled or its pleats fold in. */
function skirtRadius(y: number): number {
  const t = THREE.MathUtils.clamp((SKIRT.top - y) / (SKIRT.top - SKIRT.hem), 0, 1);
  return SKIRT.waist + (SKIRT.width - SKIRT.waist) * (1 - (1 - t) ** 2);
}

/** The bell of the skirt, from the waist down: round, as the original's lathe, so the dress's z
 *  scale and twirl flare carry over; twelve pleats deepening to the hem, and a scalloped petticoat.
 *  Both are hollow, a cloth's thickness, so her legs swing inside them. */
function skirt(cell = 0.006): THREE.BufferGeometry {
  const { top, hem, cloth } = SKIRT;
  const surface = (x: number, y: number, z: number) => {
    const t = THREE.MathUtils.clamp((top - y) / (top - hem), 0, 1);
    const pleat = 1 + 0.06 * t * Math.cos(12 * Math.atan2(z, x));
    return (Math.hypot(x, z) - skirtRadius(y) * pleat) * 0.85;
  };
  const bell: Solid = {
    distance: (x, y, z) => {
      const side = surface(x, y, z);
      return Math.max(side, -side - cloth, y - top, hem - y);
    },
    min: [-0.24, hem - 0.01, -0.24],
    max: [0.24, top + 0.01, 0.24],
  };
  const petticoat: Solid = {
    distance: (x, y, z) => {
      const out = Math.hypot(x, z) - (0.207 + 0.006 * Math.cos(28 * Math.atan2(z, x)));
      return Math.max(out, -out - cloth, y + 0.17, -0.205 - y);
    },
    min: [-0.22, -0.21, -0.22],
    max: [0.22, -0.16, 0.22],
  };
  return sculpt().add(bell, "gold").paint((x, y, z) => surface(x, y, z) + cloth * 0.6, "brass").add(petticoat, "boneLight", 0.004).geometry(cell);
}
/** A puffed yellow sleeve over a thin bare upper arm. */
function upperArm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.02, 0], [0, -UPPER_ARM, 0], 0.026, 0.019), SKIN)
    .add(ellipsoid([0, -0.035, 0], [0.052, 0.05, 0.054]), "gold", 0.01)
    .add(ring([0, -0.075, 0], 0.036, 0.009), "boneLight", 0.004)
    .geometry(0.0055);
}

/** A thin bare forearm, from the elbow to the wrist. */
function forearm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0], [0, -FOREARM + 0.008, 0.002], 0.023, 0.017), SKIN)
    .geometry(0.0055);
}

/** Her rag doll, hanging from its raised arm at the origin, where Zoe holds
 *  it, its body out to +x, away from her skirt: woolly hair, button eyes, a
 *  white dress with a red sash. */
function doll(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0.004, -0.004, 0], [0.02, -0.06, 0], 0.011, 0.012), "bone")
    .add(ball([0.035, -0.068, 0], 0.033), "bone", 0.008)
    .add(ellipsoid([0.035, -0.05, -0.006], [0.038, 0.025, 0.034]), "woodDark", 0.006)
    .add(rod([0.035, -0.1, 0], [0.035, -0.19, 0], 0.026, 0.044), "boneLight", 0.012)
    .add(stretched(ring([0.035, -0.17, 0], 0.04, 0.01), [0.035, -0.17, 0], [1, 1, 0.9]), "bloodLight", 0.003)
    .add(rod([0.062, -0.105, 0], [0.078, -0.16, 0.004], 0.011, 0.01), "bone", 0.006);
  for (const x of [0.022, 0.05]) {
    shape.add(rod([x, -0.18, 0], [x, -0.25, 0.004], 0.012, 0.011), "bone", 0.006);
    shape.paint(ball([x, -0.07, 0.033], 0.007), "void");
  }
  return shape.geometry(0.006);
}

/** A white sock from the hip to the knee, hanging from the hip. */
function thigh(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0.02, 0], [0, -THIGH, 0.002], 0.033, 0.025), "boneLight")
    .geometry(0.007);
}

/** A white sock from the knee into the shoe. */
function shin(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0.002], [0, -SHIN + 0.005, 0], 0.029, 0.024), "boneLight")
    .geometry(0.007);
}

/** A red strapped shoe on the base, with a dark sole. */
function shoe(x: number) {
  const shape = sculpt()
    .add(ellipsoid([x, BASE_TOP + 0.02, 0.045], [0.036, 0.026, 0.055]), "blood")
    .add(ellipsoid([x, BASE_TOP + 0.024, -0.01], [0.034, 0.03, 0.04]), "blood", 0.03)
    .add(ring([x, BASE_TOP + 0.042, 0.022], 0.03, 0.006, [0, 0, Math.PI / 2]), "bloodDark", 0.003)
    .carve(roundBox([x, BASE_TOP - 0.1, 0], [0.2, 0.1, 0.3], 0))
    .paint((_, y) => (y < BASE_TOP + 0.008 ? -1 : 1), "soot");
  return { geometry: shape.geometry(0.006), ...soleEnds(shape.distance, x) };
}

/** Every part's geometry, meshed once on first use and shared: none of it depends on the seed. */
function meshParts() {
  return {
    head: head(),
    pigtail: pigtail(),
    bodice: bodice(),
    skirt: skirt(),
    upperArm: upperArm(),
    forearm: forearm(),
    /** The right hand, then the left. */
    hands: [handParts(-1, HAND, SKIN), handParts(1, HAND, SKIN)],
    doll: doll(),
    thigh: thigh(),
    shin: shin(),
    shoes: [shoe(-LEG_X), shoe(LEG_X)],
    base: plinth(0.36, 0.34, BASE_TOP, "boneDark"),
  };
}
/** Its parts, meshed once a session (ahead of time in a worker, in the house) and shared by every copy. */
export const ZOE_PARTS = figureParts("zoe", meshParts);
declareParts(zoe, [ZOE_PARTS]);

const UP = new THREE.Vector3(0, 1, 0);
/** The doll held out in front of her, on the way to her chest, and clutched there: turned to lie across it, its head by her left hand. */
const HELD_OUT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const CRADLED = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 3));
/** The middles of a shoe's heel and toe, as built (x set per foot): what a kicked-up foot pushes the skirt with. */
const SHOE_POINTS = [new THREE.Vector3(0, BASE_TOP + 0.024, -0.02), new THREE.Vector3(0, BASE_TOP + 0.022, 0.015), new THREE.Vector3(0, BASE_TOP + 0.02, 0.05)];

/** The skirt's depth front to back, as a scale of its width, as it hangs. */
const REST_DEPTH = 0.8;
/** The furthest it billows, front to back: past this a bell of skirt reads as a disc. */
const BILLOW_MOST = 1.45;
/** How far short of its furthest billow the skirt starts to ease into it. */
const BILLOW_EASE = 0.12;

/** How much room the skirt leaves round her legs as it billows, so it never comes near to shoving them. */
const SKIRT_ROOM = 0.006;
/** The skirt's weight: it billows out for a leg this long before it arrives, holds this long after, and moves smoothly between. */
const SKIRT_SWING: ClothTiming = { ahead: 0.06, behind: 0.08, soften: 0.06 };

/** The simulated skirt on trial (see `cloth-trial.ts`): six rigid panels hinged round the waist, each two pleats
 *  wide, or a net 12 round by 6 down. */
const SKIRT_PANELS = 6;
const NET = { around: 12, down: 6 };
/** How the trial skirts move: the panels' spring, the net's starch, how much of her turns they feel, how far they
 *  may stray, damped and caught by the air. */
const PANEL_FEEL = { frequency: 1.5, follow: 3, inertia: 0.35, drag: 0.8, swing: 0.1, room: 0.06, roomAtTop: 0.018 };
const NET_FEEL = { frequency: 1.2, follow: 3, inertia: 0.35, drag: 0.6, swing: 0.1, room: 0.05, roomAtTop: 0.017, weight: 1 };
/** Where panel `k`'s middle lies round her, as a share of a turn: its seams fall in the pleats' folds, out of sight. */
const panelMiddle = (k: number) => 1 / 24 + k / SKIRT_PANELS;
/** How far, as a share of a turn, each panel reaches past its seams under its neighbours', so no gap opens as they swing apart. */
const PANEL_OVERLAP = 0.025;
/** Every other panel is this much smaller, tucked under its neighbours' edges, so where they overlap they never fight. */
const PANEL_TUCK = 0.985;

/** The simulated skirt's depth front to back, as a scale of its width, at its waist: round enough there for her
 *  thighs to swing up under it, and still inside her sash. It flattens to `REST_DEPTH` at the hem. */
const WAIST_DEPTH = 0.95;

/** The simulated skirt's depth, a share `along` of the way down it. */
const depthAt = (along: number) => WAIST_DEPTH + (REST_DEPTH - WAIST_DEPTH) * along;

/** The skirt as it hangs, in the hips' frame: its depth front to back baked in, round at the waist. */
function hangingSkirt(skirt: THREE.BufferGeometry): THREE.BufferGeometry {
  const hanging = skirt.clone();
  const position = hanging.getAttribute("position") as THREE.BufferAttribute;
  const normal = hanging.getAttribute("normal") as THREE.BufferAttribute;
  // z' = z·depth(y), whose normals take the inverse transpose: the depth's slope down the skirt tilts them.
  const slope = (REST_DEPTH - WAIST_DEPTH) / SKIRT.petticoat;
  for (let i = 0; i < position.count; i++) {
    const [y, z] = [position.getY(i), position.getZ(i)];
    const along = THREE.MathUtils.clamp(y / SKIRT.petticoat, 0, 1);
    const depth = depthAt(along);
    const sloped = along > 0 && along < 1 ? slope : 0;
    position.setZ(i, z * depth);
    normal.setXYZ(i, normal.getX(i), normal.getY(i) - (normal.getZ(i) * z * sloped) / depth, normal.getZ(i) / depth);
  }
  hanging.normalizeNormals();
  return hanging;
}

/** Where a point of the skirt lies round her and down it: its turn round the waist as a share of a whole turn (on
 *  the round skirt, before its depth is baked in), and its share of the way from the waist to the petticoat's hem. */
function skirtPlace(x: number, y: number, z: number): { round: number; along: number } {
  const along = THREE.MathUtils.clamp(y / SKIRT.petticoat, 0, 1);
  const turn = Math.atan2(z / depthAt(along), x) / (Math.PI * 2);
  return { round: turn - Math.floor(turn), along };
}

/** A point on the skirt's surface, round it and down it as `skirtPlace` measures, in the hips' frame. */
function onSkirt(round: number, along: number): THREE.Vector3 {
  const y = SKIRT.petticoat * along;
  const r = skirtRadius(y);
  const turn = round * Math.PI * 2;
  return new THREE.Vector3(r * Math.cos(turn), y, r * Math.sin(turn) * depthAt(along));
}

/** The skirt cut into its panels, each with the triangles whose middles lie within its share of the turn (and its
 *  overlap), every other one tucked in; in the hips' frame, as it hangs. Cut once, from the skirt's own mesh. */
let cutPanels: THREE.BufferGeometry[] | undefined;
function skirtPanels(skirt: THREE.BufferGeometry): THREE.BufferGeometry[] {
  if (cutPanels) return cutPanels;
  const hanging = hangingSkirt(skirt);
  const attributes = ["position", "normal", "color"].map((name) => hanging.getAttribute(name) as THREE.BufferAttribute);
  const position = attributes[0];
  const kept: number[][] = Array.from({ length: SKIRT_PANELS }, () => []);
  for (let t = 0; t < position.count; t += 3) {
    const middle = [0, 1, 2].map((axis) => (position.getComponent(t, axis) + position.getComponent(t + 1, axis) + position.getComponent(t + 2, axis)) / 3);
    const { round } = skirtPlace(middle[0], middle[1], middle[2]);
    for (let k = 0; k < SKIRT_PANELS; k++) {
      const off = Math.abs(((round - panelMiddle(k) + 1.5) % 1) - 0.5);
      if (off <= 0.5 / SKIRT_PANELS + PANEL_OVERLAP) kept[k].push(t);
    }
  }
  cutPanels = kept.map((triangles, k) => {
    const panel = new THREE.BufferGeometry();
    for (const [n, name] of ["position", "normal", "color"].entries()) {
      const from = attributes[n];
      const values = new Float32Array(triangles.length * 9);
      triangles.forEach((t, i) => {
        for (let corner = 0; corner < 3; corner++) for (let axis = 0; axis < 3; axis++) values[(i * 3 + corner) * 3 + axis] = from.getComponent(t + corner, axis);
      });
      panel.setAttribute(name, new THREE.BufferAttribute(values, 3));
    }
    if (k % 2 === 1) panel.scale(PANEL_TUCK, 1, PANEL_TUCK);
    return panel;
  });
  hanging.dispose();
  return cutPanels;
}

/** The trial's panels: hinged at the waist, at the middle of each panel's top, swinging from there to its hem. */
function skirtPanelBody() {
  const middles = Array.from({ length: SKIRT_PANELS }, (_, k) => panelMiddle(k));
  return hingedPanels(
    {
      hinges: middles.map((round) => onSkirt(round, 0)),
      hems: middles.map((round) => onSkirt(round, 1)),
      reach: (0.5 / SKIRT_PANELS + PANEL_OVERLAP) * Math.PI * 2,
      // The bell curves out from the line between its waist and hem, most halfway down.
      bulge: (k, along) => (SKIRT.width - SKIRT.waist) * along * (1 - along) * Math.hypot(Math.cos(middles[k] * Math.PI * 2), Math.sin(middles[k] * Math.PI * 2) * depthAt(along)),
    },
    PANEL_FEEL,
  );
}

/** The trial's net: its points on the skirt as it hangs, a row at a time from the waist. */
function skirtNetShape() {
  const { around, down } = NET;
  const rest = new Float64Array(around * down * 3);
  for (let j = 0; j < down; j++) for (let i = 0; i < around; i++) rest.set(onSkirt(i / around, j / (down - 1)).toArray(), (j * around + i) * 3);
  return { rest, around, down, closed: true, outward: 1 as const, round: true };
}

/** Where the petticoat shows below the bell, as a share of the way down the net. */
const PETTICOAT_FROM = SKIRT.hem / SKIRT.petticoat;

/** The net skirt's look: the bell's twelve pleats deepening to the hem, gold outside and brass inside, and the
 *  scalloped petticoat a little inside it below. */
const NET_LOOK: SheetLook = {
  across: 72,
  down: 20,
  thickness: 0.012,
  inset: (u, v) => {
    if (v > PETTICOAT_FROM) return SKIRT.width - 0.207 - 0.006 * Math.cos(28 * u * Math.PI * 2);
    const y = SKIRT.petticoat * v;
    return -skirtRadius(y) * 0.06 * THREE.MathUtils.clamp(y / SKIRT.hem, 0, 1) * Math.cos(12 * u * Math.PI * 2);
  },
  colour: (_, v, inside) => (inside ? "brass" : v > PETTICOAT_FROM ? "boneLight" : "gold"),
};

/** The legs' radii as the simulated skirt sees them: thigh, shin and foot. */
const LEG_RADII = { thigh: 0.034, shin: 0.03, foot: 0.04 };
/** How much of the thigh, from the hip down, lies inside her hips rather than under the skirt. */
const THIGH_HIDDEN = 0.05;

/** Points down a rig's legs and round its shoes, as posed now, in the frame of hips placed by `hips` in its body. */
function sweptBy(by: StrideRig, hips: THREE.Matrix4): Swept[] {
  const intoHips = hips.clone().invert();
  const intoBody = by.body.matrix.clone().invert();
  return by.legs.flatMap((one) => {
    one.shoe.updateMatrix();
    const shoe = SHOE_POINTS.map((at) => ({ at: at.clone().setX(one.ankle.x).applyMatrix4(one.shoe.matrix).applyMatrix4(intoBody), radius: 0.05 }));
    return [...legPoints(one, 0.044, 0.036, { from: 0.1 }), ...shoe].map(({ at, radius }) => ({ at: at.applyMatrix4(intoHips), radius }));
  });
}

/** How far the skirt must stretch front to back, as a scale of its depth,
 *  for every swept point above its hem to lie inside it: a raised knee or a
 *  heel kicked up behind billows it out. */
function billowFor(points: readonly Swept[]): number {
  let scale = REST_DEPTH;
  for (const { at, radius } of points) {
    // How near the point is to the skirt's height: one coming up from below (or down from above) billows it gradually, fully by the time it reaches it.
    const within =
      THREE.MathUtils.smoothstep(at.y + radius - SKIRT.petticoat, -0.1, 0) * THREE.MathUtils.smoothstep(SKIRT.top - at.y + radius, -0.03, 0);
    if (within === 0) continue;
    const inside = skirtRadius(THREE.MathUtils.clamp(at.y, SKIRT.hem, SKIRT.top)) * 0.94 - SKIRT.cloth / 0.85;
    // The skirt stretches front to back only, so a point off to the side needs it stretched further.
    const depth = Math.sqrt(Math.max(inside * inside - at.x * at.x, (inside * 0.3) ** 2));
    scale = Math.max(scale, REST_DEPTH + ((Math.abs(at.z) + radius) / depth - REST_DEPTH) * within);
  }
  return scale;
}

/** Zoe Ingstrom as a miniature on a round base, 3'9" at the house's scale.
 *  She hums, nodding and swaying to a quick tune; now and then she twirls to
 *  see her skirt fly out, and now and then she clutches her doll and peeks
 *  behind her for the boogeyman. She walks with a quick patter of short steps,
 *  her pigtails bouncing. Her left hand holds her doll by its arm; her right
 *  hand is free to hold anything else. */
export function zoe(seed = "zoe", gait: Gait = STANDING, { cloth = clothTrial() }: { cloth?: ClothTrial } = {}): THREE.Group {
  const parts = ZOE_PARTS.get();
  const material = figureMaterial();
  const mesh = (geometry: THREE.BufferGeometry, name: string) => {
    const made = form(material, geometry);
    made.name = name;
    return made;
  };

  const pigtails = [-1, 1].map((side) => {
    const tail = group(mesh(parts.pigtail, side < 0 ? "right pigtail" : "left pigtail"));
    tail.position.set(side * PIGTAIL_TIE[0], PIGTAIL_TIE[1], PIGTAIL_TIE[2]);
    return tail;
  });
  const face = mesh(parts.head, "head");
  const neck = group(face, ...pigtails);
  neck.position.y = NECK - WAIST;

  const limb = (side: -1 | 1) =>
    buildArm(
      mesh,
      { upperArm: parts.upperArm, forearm: parts.forearm, hand: parts.hands[side < 0 ? 0 : 1] },
      side,
      new THREE.Vector3(side * SHOULDER[0], SHOULDER[1] - WAIST, 0),
      UPPER_ARM,
      FOREARM,
      HAND,
    );
  const left = limb(1);
  const right = limb(-1);
  const bend = new THREE.Vector3(0, 0, -1);
  const wristAt = (of: Arm, offset: [number, number, number]) => of.at.clone().add(new THREE.Vector3(...offset));
  const leftHangs = reachWrist(left, wristAt(left, [0.15, -0.16, 0.08]), bend);
  const rightHangs = reachWrist(right, wristAt(right, [-0.1, -0.2, 0.06]), bend);
  const leftLifts = reachWrist(left, new THREE.Vector3(0.27, 0.02, 0.17), new THREE.Vector3(1, -0.6, -0.4));
  const leftHugs = reachWrist(left, new THREE.Vector3(0.1, 0.14, 0.19), new THREE.Vector3(1, -0.5, -0.3));
  const leftOut = reachWrist(left, wristAt(left, [0.21, -0.1, 0]), bend);
  const rightOut = reachWrist(right, wristAt(right, [-0.19, -0.13, 0]), bend);
  const rightCarries = reachWrist(right, wristAt(right, [-0.15, 0.01, 0.19]), new THREE.Vector3(-0.3, 0, -1));
  // A thing hanging from her hand is held out from her skirt.
  const rightHolds = reachWrist(right, wristAt(right, [-0.17, -0.15, 0.1]), bend);

  // The doll hangs from her fist by its arm, whichever way her hand turns.
  const dangling = group(mesh(parts.doll, "doll"));
  dangling.position.z = 0.012 * HAND;
  holdIn(left.hand, { object: group(dangling), handle: 0.011, carry: "hang" });

  const top = mesh(parts.bodice, "bodice");
  const chest = group(top, neck, left.shoulder, right.shoulder);
  // On trial, the skirt is simulated: rigid panels on hinges round her waist, or a net whose mesh is rebuilt from its points.
  const dress = group();
  let simulated: { body: ClothBody; show: (intoAnchor: THREE.Matrix4) => void } | null = null;
  if (cloth === "panels") {
    const body = skirtPanelBody();
    const pivots = skirtPanels(parts.skirt).map((geometry, k) => {
      const panel = mesh(geometry, `skirt panel ${k}`);
      const hinge = onSkirt(panelMiddle(k), 0);
      panel.position.copy(hinge).negate();
      const pivot = group(panel);
      pivot.position.copy(hinge);
      return pivot;
    });
    dress.add(...pivots);
    const [origins, turns, turn] = [new Float64Array(SKIRT_PANELS * 3), new Float64Array(SKIRT_PANELS * 9), new THREE.Matrix4()];
    simulated = {
      body,
      show: (intoAnchor) => {
        body.pose(intoAnchor, origins, turns);
        pivots.forEach((pivot, k) => {
          pivot.position.fromArray(origins, k * 3);
          const t = turns.subarray(k * 9, k * 9 + 9);
          pivot.quaternion.setFromRotationMatrix(turn.set(t[0], t[1], t[2], 0, t[3], t[4], t[5], 0, t[6], t[7], t[8], 0, 0, 0, 0, 1));
        });
      },
    };
  } else if (cloth === "net") {
    const shape = skirtNetShape();
    const body = clothNet(shape, NET_FEEL);
    const sheet = clothSheet(body, shape, NET_LOOK);
    dress.add(mesh(sheet.geometry, "skirt"));
    simulated = { body, show: sheet.follow };
  } else {
    dress.add(mesh(parts.skirt, "skirt"));
    dress.scale.z = REST_DEPTH;
  }
  const hips = group(dress, chest);
  hips.position.y = WAIST - BASE_TOP;

  const legs = ([-1, 1] as const).map((side, i) => {
    const { geometry, heel, toe } = parts.shoes[i];
    const name = side < 0 ? "right" : "left";
    const shoe = group(mesh(geometry, `${name} shoe`));
    return leg(mesh(parts.thigh, `${name} thigh`), mesh(parts.shin, `${name} shin`), shoe, new THREE.Vector3(side * LEG_X, LEG, 0), THIGH, SHIN, {
      ankle: new THREE.Vector3(side * LEG_X, ANKLE, -0.005),
      heel,
      toe,
    });
  }) as unknown as StrideRig["legs"];
  const body = group(legs[0].hip, legs[1].hip, hips);
  body.position.y = BASE_TOP;
  // The same legs again, never shown, walked a moment ahead of hers or behind: where the skirt makes room for them.
  const unseen = ([-1, 1] as const).map((side, i) => {
    const { geometry, heel, toe } = parts.shoes[i];
    return leg(group(), group(), group(new THREE.Mesh(geometry)), new THREE.Vector3(side * LEG_X, LEG, 0), THIGH, SHIN, {
      ankle: new THREE.Vector3(side * LEG_X, ANKLE, -0.005),
      heel,
      toe,
    });
  }) as unknown as StrideRig["legs"];
  const unseenBody = group(unseen[0].hip, unseen[1].hip);
  unseenBody.position.y = BASE_TOP;
  const standing = group(body, legs[0].shoe, legs[1].shoe);

  const figure = walks(group(mesh(parts.base, "base"), standing), ZOE_WALK);
  hasHands(figure, { right: right.hand, left: left.hand });
  hangsCloth(figure, [dress]);
  if (simulated) simulatesCloth(figure, simulated.body);
  joins(figure, [
    { parts: [face, top], at: neck, radius: 0.07 },
    ...pigtails.map((tail) => ({ parts: [tail, face] as const, at: tail, radius: 0.06 })),
    // Her puffed sleeves sit deep in the bodice's shoulders.
    { parts: [left.shoulder.children[0], top], at: left.shoulder, radius: 0.085 },
    { parts: [right.shoulder.children[0], top], at: right.shoulder, radius: 0.085 },
    // The sash and its bow sit over the skirt's top, at the waist.
    { parts: [dress, top], at: hips, radius: 0.17 },
    ...left.joints,
    ...right.joints,
    ...legs.flatMap((one) => legJoints(one, top, 0.12, 0.07, 0.06)),
  ]);
  // The doll arm swings less: she keeps it close, and clutches it running.
  const swings = { right: { limb: right, side: -1 as const, swing: ARM_SWING, pump: 1 }, left: { limb: left, side: 1 as const, swing: ARM_SWING * 0.6 } };
  const rig: StrideRig = { walking: ZOE_WALK, legs, body, rest: BASE_TOP, arms: [swings.right, swings.left], chest, lean: 0.05, lifts: 0.35 };
  const unseenChest = group();
  const unseenRig: StrideRig = { ...rig, legs: unseen, body: unseenBody, arms: [], chest: unseenChest };
  hips.updateMatrix();
  const hanging = hips.matrix.clone();
  const billow = simulated ? null : heavyCloth(1, gait, (moving, _clock, out) => {
    unseenChest.rotation.x = 0;
    stride(unseenRig, moving);
    out[0] = billowFor(sweptBy(unseenRig, hanging).map(({ at, radius }) => ({ at, radius: radius + SKIRT_ROOM })));
  }, SKIRT_SWING);
  const [billowNow, billowed] = [new Float32Array(1), new Float32Array(1)];
  // The simulated skirt hangs from her hips, round her thighs, shins and feet.
  const moment = clothMoment(legs.length * 3);
  const swing = simulated && clothOnClock(simulated.body, moment.capsules.length, simulated.show);

  const rng = createRng(seed);
  const tunePhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const moving = gait(clock);
    const running = moving.running ? moving.amount : 0;
    const tune = Math.sin((seconds / 1.8) * Math.PI * 2 + tunePhase);
    const breath = Math.sin((seconds / 3) * Math.PI * 2);
    const scared = burst(seconds, `${seed}:boogeyman`, { every: 8, lasts: 3, chance: 0.55 });
    const twirl = burst(seconds, `${seed}:twirl`, { every: 11, lasts: 2.2, chance: 0.6 });
    const held = right.hand.held;
    // She twirls only with her right hand free.
    const twirling = held ? 0 : 1 - moving.amount;
    const spinning = twirl.amount * (1 - scared.amount) * twirling;
    const humming = 1 - scared.amount;
    const upright = held?.carry === "upright";

    standing.rotation.y = THREE.MathUtils.smootherstep(twirl.progress, 0, 1) * Math.PI * 2 * (twirl.pick < 0.5 ? -1 : 1) * (1 - scared.amount) * twirling;
    const flare = 1 + 0.3 * spinning * Math.sin(Math.PI * twirl.progress);

    body.rotation.z = tune * 0.035 * humming;
    chest.rotation.z = tune * -0.02 * humming;
    chest.rotation.x = breath * -0.015 + scared.amount * 0.12;
    top.scale.set(1 + breath * 0.015, 1, 1 + breath * 0.015);

    neck.rotation.z = tune * -0.14 * humming;
    neck.rotation.y = scared.amount * (scared.pick < 0.5 ? -1 : 1) * 1.0;
    neck.rotation.x = -0.04 - spinning * 0.15;

    // Scared, or running, she clutches her doll to her chest in her left arm,
    // lifting it out in front of her, clear of her skirt, then gathering it in.
    // Twirling, she flings her arms out.
    const clutching = Math.max(scared.amount, running);
    const leftRests = between(leftHangs, leftOut, spinning);
    poseArm(left, leftRests, leftLifts, THREE.MathUtils.smoothstep(clutching, 0, 0.5));
    if (clutching > 0.5) poseArm(left, leftLifts, leftHugs, THREE.MathUtils.smoothstep(clutching, 0.5, 1));
    poseArm(right, upright ? rightCarries : held ? rightHolds : rightHangs, rightOut, held ? 0 : spinning);
    poseHand(right.hand, holding(right.hand, blendPose(RELAXED, fist(right.hand), running * 0.7)));
    swings.right.swing = upright ? ARM_SWING * 0.2 : ARM_SWING;
    // A thing held at her side swings with her arm, but she doesn't pump it running.
    swings.right.pump = held ? 0.4 : 1;
    swings.left.swing = ARM_SWING * 0.6 * (1 - clutching);

    const bounce = Math.abs(stride(rig, moving));
    if (upright) aimGrip(right.hand, figure, UP, 1);
    for (const [i, tail] of pigtails.entries()) {
      const side = i === 0 ? -1 : 1;
      tail.rotation.z = side * (0.75 + spinning * 0.6 + bounce * 0.25) + tune * 0.12 * humming;
    }

    if (swing) {
      // Her simulated skirt swings from her hips as she moves, round her legs and in the room's air.
      standing.updateWorldMatrix(true, true);
      moment.anchor.copy(hips.matrixWorld);
      legs.forEach((one, i) => {
        const [thigh, shin, foot] = moment.capsules.slice(i * 3, i * 3 + 3);
        thigh.b.setFromMatrixPosition(one.knee.matrixWorld);
        // The thigh's top is inside her hips, under the waistband: the skirt meets it only below.
        thigh.a.setFromMatrixPosition(one.hip.matrixWorld).lerp(thigh.b, THIGH_HIDDEN);
        shin.a.copy(thigh.b);
        shin.b.setFromMatrixPosition(one.ankleMark.matrixWorld);
        foot.a.copy(SHOE_POINTS[0]).setX(one.ankle.x).applyMatrix4(one.shoe.matrixWorld);
        foot.b.copy(SHOE_POINTS[2]).setX(one.ankle.x).applyMatrix4(one.shoe.matrixWorld);
        [thigh.radius, shin.radius, foot.radius] = [LEG_RADII.thigh, LEG_RADII.shin, LEG_RADII.foot];
      });
      windOf(figure)(clock, moment.wind);
      moment.floor = figure.matrixWorld.elements[13] + BASE_TOP;
      swing(clock, moment);
    } else if (billow) {
      // Her skirt billows out in front of a raised knee, and behind a heel kicked
      // back: ahead of them, falling back after, never letting one through as they are now.
      hips.updateMatrix();
      billowNow[0] = billowFor(sweptBy(rig, hips.matrix));
      billow(clock, billowNow, billowed);
      // It eases into its furthest billow rather than stopping dead at it.
      dress.scale.set(flare, 1, Math.max(REST_DEPTH * flare, -atLeast(-billowed[0], -BILLOW_MOST, BILLOW_EASE)));
    }

    // The doll hangs straight down from her fist, swaying to the tune; she clutches it across her chest when scared.
    const hanging = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tune * 0.08 * humming + spinning * 1.1));
    hanging.slerp(HELD_OUT, THREE.MathUtils.smoothstep(clutching, 0, 0.5));
    if (clutching > 0.5) hanging.slerpQuaternions(HELD_OUT, CRADLED, THREE.MathUtils.smoothstep(clutching, 0.5, 1));
    dangling.quaternion.copy(turnIn(dangling.parent ?? dangling, standing).invert().multiply(hanging));
  });
}
