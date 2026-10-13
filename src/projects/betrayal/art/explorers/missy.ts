import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { ball, chain, drum, ellipsoid, figureMaterial, form, loft, mergeAll, onSurface, plinth, ring, rod, roundBox, sculpt, stretched, type Distance, type Section, type Solid, type Vec3 } from "../forms";
import { group } from "../shapes";
import { BASE_TOP, idleBursts, joins, leg, legJoints, miniatureHeight, soleEnds, STANDING, stride, walks, type Gait, type StrideRig, type Walking } from "./figure";
import { aimGrip, between, blendPose, buildArm, fist, handParts, hasHands, holding, OPEN, poseArm, poseHand, pointHand, reachWrist, RELAXED, type Arm, type ArmPose } from "./hands";
import { skinOf } from "./skin";
import { declareParts, figureParts } from "../figure-parts";

/*
 * Missy Dubourde: a nine-year-old who swims and wants to be a doctor, knows
 * Peter from school and Father Rhinehardt from Sunday school, and whose
 * greatest fear is dead things coming back to life to hunt her. Read at a
 * glance: a girl a head taller than Zoe, in a burnt-orange zip hoodie with
 * its hood bunched behind her neck, a toy-doctor's stethoscope round her
 * neck, a high honey-blonde ponytail with teal swim goggles pushed up on her
 * head, denim shorts, bare knees, white socks and teal sneakers. She faces
 * +z; her right hand is on −x.
 *
 * She takes the children's build Zoe and Peter share (a big head, a small
 * body), between their heights, and the shared arms, hands, legs and stride.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const SKIN = skinOf("missy-dubourde");
/** Her hoodie, its ribbing, her shorts, and the teal of her goggles, scrunchie and sneakers. */
const HOODIE = "ember";
const RIBBING = "brick";
const DENIM = "moon";
const TEAL = "tide";
const HAIR = "brass";

/** 4'2" at the miniature's scale. */
const TOP = BASE_TOP + miniatureHeight(4, 2);
const WAIST = 0.52;
const LEG = WAIST - BASE_TOP;
/** A girl's quick, light step, about her leg's length: between Zoe's patter and Peter's lope. */
const MISSY_WALK: Walking = { step: 0.43, hop: 0.028 };
const ARM_SWING = 0.45;
/** The neck's pivot, the head above it as big as a child's. */
const NECK = TOP - 0.305;
const SHOULDER: [number, number] = [0.135, 0.77];
const UPPER_ARM = 0.165;
/** From the elbow to the wrist. */
const FOREARM = 0.13;
/** Her hands, this many times an adult's. */
const HAND = 0.62;
const LEG_X = 0.062;
/** The ankle, in the sneaker, and the leg's two bones from the hip down to it. */
const ANKLE = BASE_TOP + 0.045;
const THIGH = 0.198;
const SHIN = 0.198;
/** Where her ponytail is tied, high on the back of her head, in the neck's frame. */
const PONYTAIL_TIE: Vec3 = [0, 0.255, -0.142];
/** How far back her ponytail hangs at rest. */
const PONYTAIL_HANG = 0.5;

/** A solid cut to the hair's side of the hairline: low at the nape, over the ears at the sides, high at the forehead. */
function above(solid: Solid): Solid {
  return {
    distance: (x, y, z) => {
      const line = 0.08 + 0.135 * THREE.MathUtils.smoothstep(z, -0.11, 0.1);
      return Math.max(solid.distance(x, y, z), (line - y) * 0.7);
    },
    min: solid.min,
    max: solid.max,
  };
}

/** The head on its neck: a big round head with full cheeks and a small
 *  button nose, kept smooth and simple as the other children's, blue eyes
 *  (white, an iris and a glint) under fair brows, and a smile; her honey hair pulled
 *  smoothly back to a high tie, and teal swim goggles pushed up on top. */
function head(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0, -0.04, 0], [0, 0.06, 0], 0.038, 0.036), SKIN)
    .add(ellipsoid([0, 0.16, 0], [0.117, 0.125, 0.118]), SKIN, 0.03)
    .add(ellipsoid([0, 0.098, 0.028], [0.094, 0.085, 0.094]), SKIN, 0.05)
    .add(ball([0, 0.11, 0.13], 0.015), SKIN, 0.012);
  for (const side of [-1, 1]) {
    shape.add(ellipsoid([side * 0.116, 0.125, 0], [0.015, 0.028, 0.02]), SKIN, 0.01);
    shape.carve(ball([side * 0.042, 0.13, 0.124], 0.02), { blend: 0.008 });
    shape.add(ball([side * 0.042, 0.129, 0.102], 0.022), "boneLight");
    shape.paint(ball([side * 0.042, 0.128, 0.123], 0.012), "moon");
    shape.paint(ball([side * 0.042, 0.128, 0.125], 0.006), "void");
    shape.paint(ball([side * 0.037, 0.135, 0.124], 0.004), "boneLight");
    // Dark lashes along the top of each eye.
    shape.paint(ellipsoid([side * 0.044, 0.145, 0.118], [0.022, 0.0042, 0.02]), "soot");
    shape.paint(ellipsoid([side * 0.044, 0.168, 0.112], [0.022, 0.005, 0.03]), "woodLight");
  }
  shape
    // A small smile, curving up at its corners.
    .paint((x, y, z) => (z > 0.09 && Math.abs(x) < 0.023 ? Math.abs(y - 0.079 - 30 * x * x) - 0.0042 : 1), "blood")
    // Her hair, pulled back smooth over the skull from a hairline high at the forehead, a side-swept front, and the gathered bump at the tie.
    .add(above(ellipsoid([0, 0.17, -0.01], [0.128, 0.135, 0.13])), HAIR, 0.006)
    .add(rod([0.065, 0.272, 0.065], [-0.07, 0.232, 0.096], 0.022, 0.012), HAIR, 0.014)
    .add(ellipsoid([0, 0.25, -0.112], [0.05, 0.046, 0.04]), HAIR, 0.025)
    // Loose locks that slipped the tie, framing her face in front of her ears.
    .add(chain([[-0.1, 0.205, 0.07], [-0.112, 0.15, 0.072], [-0.106, 0.098, 0.068]], [0.017, 0.013, 0.007]), HAIR, 0.012)
    .add(chain([[0.1, 0.205, 0.07], [0.112, 0.15, 0.072], [0.106, 0.098, 0.068]], [0.017, 0.013, 0.007]), HAIR, 0.012)
    // Fair streaks combed back from her forehead to the tie, catching the light from above.
    .paint((x, y, z) => (y > 0.12 && Math.abs(Math.sin((x / (Math.hypot(x, y - PONYTAIL_TIE[1], z - PONYTAIL_TIE[2]) + 0.03)) * 15)) > 0.9 ? -1 : 1), "gold")
    // The goggles' strap round her head, high at the front, and the two lenses on her forehead with a bridge between.
    .add(ring([0, 0.205, -0.012], 0.123, 0.0085, [-0.245, 0, 0]), TEAL, 0.004);
  for (const side of [-1, 1]) {
    shape.add(ellipsoid([side * 0.04, 0.24, 0.1], [0.03, 0.022, 0.017]), TEAL, 0.006);
    shape.paint(ellipsoid([side * 0.04, 0.24, 0.116], [0.021, 0.014, 0.012]), "tideLight");
  }
  return shape.add(rod([-0.012, 0.238, 0.113], [0.012, 0.238, 0.113], 0.006), TEAL, 0.004).geometry(0.0075);
}

/** Her ponytail hanging from its tie: a teal scrunchie, and a tapering tail of hair that flicks out at its end. */
function ponytail(): THREE.BufferGeometry {
  return sculpt()
    .add(ring([0, -0.008, 0], 0.024, 0.012), TEAL)
    .add(chain([[0, -0.01, 0], [0, -0.07, -0.012], [0, -0.13, -0.004], [0, -0.17, 0.012]], [0.03, 0.036, 0.025, 0.012]), HAIR, 0.01)
    .geometry(0.006);
}

/** The hoodie from the shorts' seat up, built from the waist (the hips' pivot):
 *  a zip front, a kangaroo pocket, a ribbed hem, the hood bunched behind her
 *  neck, and shoulders reaching out over the tops of her sleeves; and below
 *  the hem, the seat of her shorts, which her thighs swing from. */
function hoodie() {
  const pocket = roundBox([0, 0.07, 0.075], [0.066, 0.034, 0.03], 0.012);
  const shape = sculpt()
    .add(ellipsoid([0, -0.015, 0], [0.108, 0.068, 0.078]), DENIM)
    .add(roundBox([0, 0.085, 0], [0.104, 0.095, 0.074], 0.065), HOODIE, 0.02)
    .add(roundBox([0, 0.19, 0], [0.1, 0.075, 0.077], 0.06), HOODIE, 0.05);
  for (const side of [-1, 1]) shape.add(rod([side * 0.04, 0.24, -0.004], [side * 0.148, 0.252, 0], 0.042, 0.05), HOODIE, 0.045);
  return (
    shape
      // The ribbed hem.
      .add(stretched(ring([0, 0.004, 0], 0.102, 0.02), [0, 0.004, 0], [1.06, 1, 0.78]), RIBBING, 0.008)
      // The hood, bunched behind her neck, and the collar round it.
      .add(ellipsoid([0, 0.278, -0.07], [0.088, 0.05, 0.042]), HOODIE, 0.03)
      .add(stretched(ring([0, 0.3, -0.004], 0.048, 0.013), [0, 0.3, -0.004], [1, 1, 0.92]), HOODIE, 0.01)
      .paint((x, y, z) => (Math.abs(x) < 0.0045 && z > 0.03 && y > 0.02 && y < 0.305 ? -1 : 1), "stoneLight")
      .paint((x, y, z) => (z > 0.03 ? Math.abs(pocket.distance(x, y, z)) - 0.004 : 1), RIBBING)
  );
}

/** How thick her stethoscope's tube is, and how clear of the hoodie it lies. */
const TUBE = { radius: 0.0065, gap: 0.006 };

/** Lays a tube's spine on a surface: each point moved to the surface and lifted off it along its normal by `lift`. */
function laid(surface: Distance, points: readonly Vec3[], lift: number): Vec3[] {
  const e = 0.001;
  return points.map((point) => {
    const [x, y, z] = onSurface(surface, point, 0.1);
    const normal = new THREE.Vector3(
      surface(x + e, y, z) - surface(x - e, y, z),
      surface(x, y + e, z) - surface(x, y - e, z),
      surface(x, y, z + e) - surface(x, y, z - e),
    ).normalize();
    return [x + normal.x * lift, y + normal.y * lift, z + normal.z * lift];
  });
}

/** A path with `between` more points evenly along each of its runs. */
function densified(points: readonly Vec3[], between = 3): Vec3[] {
  return points.flatMap((point, i) => {
    const next = points[i + 1] as Vec3 | undefined;
    if (!next) return [point];
    return Array.from({ length: between + 1 }, (_, k): Vec3 => {
      const t = k / (between + 1);
      return [point[0] + (next[0] - point[0]) * t, point[1] + (next[1] - point[1]) * t, point[2] + (next[2] - point[2]) * t];
    });
  });
}

/** Her toy-doctor's stethoscope, round her neck on the hoodie: the dark tube
 *  over the back of her hood and down both sides of her chest, the silver
 *  earpieces at her left and the chestpiece's disc at her right. */
function stethoscope(): THREE.BufferGeometry {
  const surface = hoodie().distance;
  const lift = TUBE.radius + TUBE.gap;
  // Laid every few centimetres, so the tube's straight runs between points never cut in where the hood curves.
  const spine = laid(
    surface,
    densified([
      [-0.05, 0.15, 0.08],
      [-0.058, 0.21, 0.08],
      [-0.068, 0.27, 0.06],
      [-0.07, 0.315, 0.01],
      [-0.05, 0.31, -0.085],
      [0, 0.3, -0.105],
      [0.05, 0.31, -0.085],
      [0.07, 0.315, 0.01],
      [0.068, 0.27, 0.06],
      [0.058, 0.21, 0.08],
      [0.052, 0.17, 0.08],
    ]),
    lift,
  );
  const tube = loft(spine.map((at): Section => ({ at, radius: TUBE.radius, colour: "soot" })), { sides: 8 });
  const [ex, ey, ez] = spine[spine.length - 1];
  const prongs = [-1, 1].map((side) =>
    loft(
      [
        { at: [ex, ey + 0.004, ez] as Vec3, radius: 0.0045, colour: "stoneLight" as const },
        { at: [ex + side * 0.014, ey - 0.03, ez + 0.006] as Vec3, radius: 0.004, colour: "stoneLight" as const },
        { at: [ex + side * 0.016, ey - 0.045, ez + 0.006] as Vec3, radius: 0.0055, colour: "stoneLight" as const },
      ],
      { sides: 8 },
    ),
  );
  const [cx, cy, cz] = laid(surface, [[-0.05, 0.13, 0.08]], 0.009 + TUBE.gap)[0];
  const chestpiece = sculpt().add(drum([cx, cy, cz], 0.021, 0.008, 0.004, [Math.PI / 2, 0, 0]), "stoneLight").geometry(0.004);
  return mergeAll([tube, ...prongs, chestpiece]);
}

/** An orange hoodie sleeve from the shoulder, set in under the hoodie's, tapering to the elbow, where it ends inside the forearm's top. */
function upperArm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.01, 0], [0, -UPPER_ARM, 0], 0.04, 0.031), HOODIE)
    .geometry(0.0065);
}

/** The forearm from the elbow to the wrist: the sleeve, a ribbed cuff, and a thin wrist. */
function forearm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0], [0, -FOREARM + 0.03, 0], 0.035, 0.03), HOODIE)
    .add(ring([0, -FOREARM + 0.03, 0], 0.025, 0.01), RIBBING, 0.005)
    .add(rod([0, -FOREARM + 0.045, 0], [0, -FOREARM + 0.012, 0.002], 0.018, 0.016), SKIN)
    .geometry(0.0055);
}

/** A denim shorts leg from the hip, with a rolled cuff, and the bare thigh below it down to the knee, where it ends inside the shin's top. */
function thigh(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.085, 0.002], [0, -THIGH, 0.003], 0.037, 0.03), SKIN)
    .add(rod([0, -0.015, 0], [0, -0.095, 0.002], 0.043, 0.049), DENIM, 0.01)
    .add(ring([0, -0.093, 0.002], 0.045, 0.009), DENIM, 0.006)
    .paint((x, y, z) => (y < -0.083 && y > -0.106 && Math.hypot(x, z - 0.002) > 0.041 ? -1 : 1), "moonDark")
    .geometry(0.007);
}

/** A bare knee and shin, and a white ankle sock down into the sneaker. */
function shin(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0.003], [0, -SHIN + 0.008, -0.002], 0.034, 0.026), SKIN)
    .paint((_, y) => (y < -0.15 ? -1 : 1), "boneLight")
    .geometry(0.006);
}

/** A teal canvas sneaker on the base: a white sole and toe cap, white laces, and a collar round the ankle. */
function shoe(x: number) {
  const shape = sculpt()
    .add(ellipsoid([x, BASE_TOP + 0.022, 0.05], [0.038, 0.027, 0.062]), TEAL)
    .add(ellipsoid([x, BASE_TOP + 0.026, -0.01], [0.037, 0.031, 0.044]), TEAL, 0.03)
    .add(rod([x, BASE_TOP + 0.03, -0.008], [x, BASE_TOP + 0.058, -0.006], 0.037, 0.035), TEAL, 0.02)
    .add(ring([x, BASE_TOP + 0.06, -0.006], 0.032, 0.0065), "boneLight", 0.004)
    .carve(roundBox([x, BASE_TOP - 0.1, 0], [0.2, 0.1, 0.3], 0))
    .paint((_, y, z) => (y < BASE_TOP + 0.013 || (z > 0.085 && y < BASE_TOP + 0.03) ? -1 : 1), "boneLight")
    .paint((xx, y, z) => (z > 0.03 && Math.abs(xx - x) < 0.012 && y > BASE_TOP + 0.034 && y < BASE_TOP + 0.052 ? -1 : 1), "boneLight")
    .paint((_, y) => (y < BASE_TOP + 0.004 ? -1 : 1), "soot");
  return { geometry: shape.geometry(0.0065), ...soleEnds(shape.distance, x) };
}

/** Every part's geometry, meshed once on first use and shared: none of it depends on the seed. */
function meshParts() {
  return {
    head: head(),
    ponytail: ponytail(),
    hoodie: hoodie().geometry(0.009),
    stethoscope: stethoscope(),
    upperArm: upperArm(),
    forearm: forearm(),
    /** The right hand, then the left. */
    hands: [handParts(-1, HAND, SKIN), handParts(1, HAND, SKIN)],
    thigh: thigh(),
    shin: shin(),
    shoes: [shoe(-LEG_X), shoe(LEG_X)],
    base: plinth(0.36, 0.34, BASE_TOP, "boneDark"),
  };
}
/** Her parts, meshed once a session (ahead of time in a worker, in the house) and shared by every copy. */
export const MISSY_PARTS = figureParts("missy", meshParts);
declareParts(missy, [MISSY_PARTS]);

const UP = new THREE.Vector3(0, 1, 0);

const smooth = THREE.MathUtils.smoothstep;
/** A bump easing up from 0 to 1 between `a` and `b`, holding, and back down between `c` and `d`. */
const bump = (t: number, a: number, b: number, c: number, d: number) => smooth(t, a, b) - smooth(t, c, d);

/** Missy Dubourde as a miniature on a round base, 4'2" at the house's scale.
 *  She breathes and shifts from foot to foot; now and then she stretches
 *  both arms high, like a swimmer on the blocks; and now and then she starts back, fists to her chest,
 *  staring at the floor as if something there had stirred, and glances over
 *  her shoulder. She walks with a quick, light step. Her right hand is free
 *  to hold anything; the stretch waits while it does. */
export function missy(seed = "missy", gait: Gait = STANDING): THREE.Group {
  const parts = MISSY_PARTS.get();
  const material = figureMaterial();
  const mesh = (geometry: THREE.BufferGeometry, name: string) => {
    const made = form(material, geometry);
    made.name = name;
    return made;
  };

  const face = mesh(parts.head, "head");
  const tail = group(mesh(parts.ponytail, "ponytail"));
  tail.position.set(...PONYTAIL_TIE);
  const neck = group(face, tail);
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
  const hangs = (of: Arm) => reachWrist(of, wristAt(of, [of.hand.side * 0.06, -0.272, 0.02]), bend);
  const rightHangs = hangs(right);
  const leftHangs = hangs(left);
  const rightCarries = reachWrist(right, wristAt(right, [-0.1, -0.1, 0.22]), new THREE.Vector3(-0.3, 0, -1));
  const rightHolds = reachWrist(right, wristAt(right, [-0.08, -0.268, 0.06]), bend);
  // The stretch: both arms straight up in a V, fingers to the ceiling.
  const stretches = (of: Arm) => {
    const side = of.hand.side;
    return pointHand(reachWrist(of, new THREE.Vector3(side * 0.29, 0.49, 0), new THREE.Vector3(side, 0, -0.3)), new THREE.Vector3(side * 0.6, 1, 0));
  };
  const rightStretches = stretches(right);
  const leftStretches = stretches(left);
  // On the way up and down, both arms pass out level at her sides, so neither swings up across her front.
  const spreads = (of: Arm) => reachWrist(of, new THREE.Vector3(of.hand.side * 0.39, 0.27, 0.05), new THREE.Vector3(0, -0.3, -1));
  const rightSpreads = spreads(right);
  const leftSpreads = spreads(left);
  /** An arm from `rest` up into the stretch, `amount` of the way: out to the side, then up. */
  const raised = (rest: ArmPose, spread: ArmPose, up: ArmPose, amount: number) =>
    amount < 0.5 ? between(rest, spread, amount * 2) : between(spread, up, amount * 2 - 1);
  // Startled, she draws both fists to her chest.
  const cowers = (of: Arm) => reachWrist(of, new THREE.Vector3(of.hand.side * 0.06, 0.165, 0.16), new THREE.Vector3(of.hand.side, -1, -0.3));
  const rightCowers = cowers(right);
  const leftCowers = cowers(left);

  const trunk = mesh(parts.hoodie, "hoodie");
  const tubing = mesh(parts.stethoscope, "stethoscope");
  const chest = group(trunk, tubing, neck, left.shoulder, right.shoulder);
  const hips = group(chest);
  hips.position.y = WAIST - BASE_TOP;

  const legs = ([-1, 1] as const).map((side, i) => {
    const { geometry, heel, toe } = parts.shoes[i];
    const name = side < 0 ? "right" : "left";
    const shoe = group(mesh(geometry, `${name} shoe`));
    return leg(mesh(parts.thigh, `${name} thigh`), mesh(parts.shin, `${name} shin`), shoe, new THREE.Vector3(side * LEG_X, LEG, 0), THIGH, SHIN, {
      ankle: new THREE.Vector3(side * LEG_X, ANKLE, -0.007),
      heel,
      toe,
    });
  }) as unknown as StrideRig["legs"];
  const body = group(legs[0].hip, legs[1].hip, hips);
  body.position.y = BASE_TOP;

  const figure = walks(group(mesh(parts.base, "base"), body, legs[0].shoe, legs[1].shoe), MISSY_WALK);
  hasHands(figure, { right: right.hand, left: left.hand });
  joins(figure, [
    { parts: [face, trunk], at: neck, radius: 0.09 },
    { parts: [tail, face], at: tail, radius: 0.06 },
    // The stethoscope lies over the back of her hood, and her hoodie's shoulders reach out over the tops of her sleeves.
    { parts: [left.shoulder.children[0], trunk], at: left.shoulder, radius: 0.09 },
    { parts: [right.shoulder.children[0], trunk], at: right.shoulder, radius: 0.09 },
    ...left.joints,
    ...right.joints,
    ...legs.flatMap((one) => legJoints(one, trunk, 0.13, 0.09, 0.085)),
  ]);
  const swings = {
    right: { limb: right, side: -1 as const, swing: ARM_SWING, pump: 1 },
    left: { limb: left, side: 1 as const, swing: ARM_SWING, pump: 1 },
  };
  const rig: StrideRig = { walking: MISSY_WALK, legs, body, rest: BASE_TOP, arms: [swings.right, swings.left], chest, lean: 0.05 };

  const rng = createRng(seed);
  const breathPhase = rng.next() * Math.PI * 2;
  const swayPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;
  const bursts = idleBursts(figure, seed, offset, {
    risen: { every: 10, lasts: 2.8, chance: 0.5 },
    stretch: { every: 12, lasts: 3.2, chance: 0.55 },
  });

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const moving = gait(clock);
    const running = moving.running ? moving.amount : 0;
    const still = 1 - moving.amount;
    const breath = Math.sin((seconds / 3.2) * Math.PI * 2 + breathPhase);
    const sway = Math.sin((seconds / 4.2) * Math.PI * 2 + swayPhase);

    const { risen, stretch } = bursts(clock);
    const held = right.hand.held;
    const upright = held?.carry === "upright";
    const fear = risen.amount * (1 - running);
    const calm = 1 - fear;
    const reaching = held ? 0 : still * calm * stretch.amount;

    // Startled, she stares down at the floor ahead, then glances back over her shoulder.
    const r = risen.progress;
    const stare = fear * bump(r, 0, 0.12, 0.45, 0.6);
    const glance = fear * bump(r, 0.5, 0.65, 0.85, 1) * (risen.pick < 0.5 ? -1 : 1);

    rig.rest = BASE_TOP - 0.012 * fear;
    body.rotation.z = sway * 0.03 * calm;
    chest.rotation.z = sway * -0.02 * calm;
    chest.rotation.x = breath * -0.018 - fear * 0.07 - reaching * 0.05;
    chest.rotation.y = glance * 0.25;
    trunk.scale.set(1 + breath * 0.018, 1, 1 + breath * 0.02);
    const lift = breath * 0.004 + fear * 0.02;
    left.shoulder.position.y = left.at.y + lift;
    right.shoulder.position.y = right.at.y + lift;

    neck.rotation.x = stare * 0.38 - reaching * 0.22 - 0.03;
    neck.rotation.y = glance * 0.85;
    neck.rotation.z = sway * -0.02 * calm;

    const rightRests = upright ? rightCarries : held ? rightHolds : rightHangs;
    const rightPose = between(raised(rightRests, rightSpreads, rightStretches, reaching), rightCowers, held ? 0 : fear);
    const leftPose = between(raised(leftHangs, leftSpreads, leftStretches, reaching), leftCowers, fear);
    poseArm(right, rightPose, rightPose, 1);
    poseArm(left, leftPose, leftPose, 1);
    const clench = Math.max(running * 0.7, fear);
    const rightEmpty = blendPose(blendPose(RELAXED, fist(right.hand), clench), OPEN, reaching);
    poseHand(right.hand, holding(right.hand, rightEmpty));
    poseHand(left.hand, blendPose(blendPose(RELAXED, fist(left.hand), clench), OPEN, reaching));
    swings.right.swing = upright ? ARM_SWING * 0.2 : ARM_SWING;
    swings.right.pump = held ? 0.4 : 1;

    const bounce = Math.abs(stride(rig, moving));
    if (upright) aimGrip(right.hand, figure, UP, 1);
    // Her ponytail hangs back from its tie, kept down by its weight as her head and chest tip, and bounces as she goes.
    const tipped = neck.rotation.x + chest.rotation.x;
    tail.rotation.x = PONYTAIL_HANG - Math.min(tipped, 0) * 0.8 + Math.max(tipped, 0) * 0.2 + bounce * 0.2 * moving.amount;
    tail.rotation.z = -neck.rotation.y * 0.15;
  });
}
