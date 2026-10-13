import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { ball, chain, ellipsoid, figureMaterial, form, intersect, mergeAll, painted, plinth, ring, rod, roundBox, sculpt, shaped, stretched, surfaceAt, union, type Solid, type Vec3 } from "../forms";
import { group } from "../shapes";
import { BASE_TOP, idleBursts, joins, leg, legJoints, miniatureHeight, soleEnds, STANDING, stride, walks, type Gait, type StrideRig, type Walking } from "./figure";
import { aimGrip, blendPose, buildArm, fist, gripAt, handParts, hasHands, holdIn, holding, poseArm, poseHand, reachWrist, RELAXED, type Prop } from "./hands";
import { skinOf, skinShade } from "./skin";
import { declareParts, figureParts } from "../figure-parts";

/*
 * Jenny LeClerc: a quiet 21-year-old who lives in the library and plays
 * soccer, whose only real friend is Caitlyn, and whose greatest fear is being
 * trapped in a crowd or lost out in the open. Read at a glance: a slim young
 * woman of middle height in a long mustard cardigan open over a cream
 * top, a long dark-brown ponytail swinging behind her, a green library book
 * hugged to her chest in her left arm, slim blue jeans and white sneakers.
 * She faces +z; her right hand is on −x.
 *
 * She takes Flash's adult build, slimmed and shortened to her 5'7", and the
 * shared arms, hands, legs and stride.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const SKIN = skinOf("jenny-leclerc");

/** 5'7" at the miniature's scale, to the top of her hair. */
const TOP = BASE_TOP + miniatureHeight(5, 7);
/** The legs swing from the hips, at the waist. */
const WAIST = 0.69;
const HIP = WAIST - BASE_TOP;
/** A soccer player's light, quick step, a little shorter than a tall man's, with some spring in it. */
const JENNY_WALK: Walking = { step: 0.56, hop: 0.022 };
const ARM_SWING = 0.34;
/** The neck's pivot: the head and its hair stand 0.352 above it. */
const NECK = TOP - 0.352;
const SHOULDER: [number, number] = [0.185, 1.085];
const UPPER_ARM = 0.26;
/** From the elbow to the wrist. */
const FOREARM = 0.21;
/** Her hands, this many times an ordinary adult's. */
const HAND = 0.9;
const LEG_X = 0.062;
/** The ankle, in the shoe, and the leg's two bones from the hip down to it. */
const ANKLE = BASE_TOP + 0.058;
const THIGH = 0.277;
const SHIN = 0.277;
/** Where the ponytail is tied, at the back of her head, in the neck's frame. */
const TIE: Vec3 = [0, 0.285, -0.112];

/** Everything on the side of `boundary` its sign says is above, within a box: for hair down to a hairline. */
function above(boundary: (x: number, z: number) => number, min: Vec3, max: Vec3): Solid {
  return { distance: (x, y, z) => boundary(x, z) - y, min, max };
}

/** The head on its neck, in the neck's frame: a young oval face with a fine
 *  nose, brown eyes under thin dark brows, her ears showing, and dark-brown
 *  hair swept from a side parting across her brow and pulled back to the tie. */
function head(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0, -0.03, -0.01], [0, 0.12, 0], 0.047, 0.043), SKIN)
    .add(ellipsoid([0, 0.222, -0.012], [0.098, 0.118, 0.112]), SKIN, 0.04)
    .add(ellipsoid([0, 0.152, 0.022], [0.078, 0.088, 0.094]), SKIN, 0.05)
    .add(ellipsoid([0, 0.212, 0.088], [0.07, 0.016, 0.026]), SKIN, 0.02)
    .add(rod([0, 0.198, 0.108], [0, 0.163, 0.126], 0.01, 0.017), SKIN, 0.012);
  for (const side of [-1, 1]) {
    const x = side * 0.036;
    shape.add(ellipsoid([side * 0.096, 0.178, -0.004], [0.014, 0.03, 0.021]), SKIN, 0.008);
    // Eyes sunk under the brow: white, a brown iris, a dark pupil and a glint.
    shape.carve(ball([x, 0.186, 0.115], 0.018), { blend: 0.008 });
    shape.add(ball([x, 0.186, 0.098], 0.017), "boneLight");
    shape.paint(ball([x, 0.186, 0.115], 0.0095), "woodMid");
    shape.paint(ball([x, 0.186, 0.117], 0.0052), "void");
    shape.paint(ball([x - side * 0.004, 0.19, 0.116], 0.0035), "boneLight");
    // A dark lash line along each upper lid.
    shape.paint((px, py, pz) => (Math.hypot(px - x, py - 0.186, pz - 0.1) < 0.022 && py > 0.194 && pz > 0.104 ? -1 : 1), "soot");
    shape.add(chain([[side * 0.014, 0.215, 0.113], [side * 0.037, 0.221, 0.111], [side * 0.06, 0.215, 0.099]], [0.0068, 0.0064, 0.005]), "woodMid", 0.004);
  }
  // The hair: a cap over the skull, down to a hairline at her brow, above her ears, and low at the nape.
  const hairline = (x: number, z: number) =>
    0.256 - 0.04 * THREE.MathUtils.smoothstep(Math.abs(x), 0.05, 0.1) - 0.13 * THREE.MathUtils.smoothstep(-z, 0, 0.1);
  shape
    .add(intersect(ellipsoid([0, 0.226, -0.014], [0.107, 0.127, 0.122]), above(hairline, [-0.12, 0.08, -0.15], [0.12, 0.36, 0.13])), "wood", 0.006)
    // Gathered at the back towards the tie.
    .add(ellipsoid([-0.1, 0.218, -0.03], [0.024, 0.042, 0.06]), "wood", 0.03)
    .add(ellipsoid([0.1, 0.218, -0.03], [0.024, 0.042, 0.06]), "wood", 0.03)
    // Loose locks fallen from the ponytail, framing her face down to the jaw.
    .add(chain([[-0.098, 0.25, 0.05], [-0.097, 0.19, 0.06], [-0.086, 0.125, 0.058]], [0.02, 0.017, 0.012]), "wood", 0.02)
    .add(chain([[0.098, 0.25, 0.04], [0.099, 0.19, 0.05], [0.09, 0.13, 0.05]], [0.018, 0.015, 0.011]), "wood", 0.02)
    .add(ellipsoid([0, 0.255, -0.085], [0.08, 0.075, 0.055]), "wood", 0.03)
    .paint(ellipsoid([0, 0.125, 0.113], [0.018, 0.0065, 0.012]), "bloodLight")
    .paint(ellipsoid([0, 0.112, 0.112], [0.012, 0.004, 0.01]), skinShade(SKIN));
  return shape.geometry(0.006);
}

/** The ponytail, from its tie high on the back of her head: a cream scrunchie, and a long, soft tail of hair arching back and falling down behind her. */
function ponytail(): THREE.BufferGeometry {
  return sculpt()
    .add(ring([0, 0.002, -0.014], 0.024, 0.011, [1.35, 0, 0]), "bone")
    .add(
      chain(
        [
          [0, 0.004, 0.006],
          [0, 0.016, -0.05],
          [0, -0.04, -0.098],
          [0, -0.13, -0.114],
          [0, -0.22, -0.1],
          [0, -0.29, -0.072],
        ],
        [0.022, 0.032, 0.037, 0.033, 0.024, 0.009],
      ),
      "wood",
      0.014,
    )
    .geometry(0.006);
}

/** How far the cardigan hangs open either side of the middle, at a height in the hips' frame: wider towards the hem. */
const opening = (y: number) => 0.024 + (0.44 - y) * 0.1;

/** The cardigan from the hem up, built from the waist: a slim figure, a
 *  little wider at the hips than the waist, the mustard knit open down
 *  the front over a cream top with a round neck, its button bands standing
 *  proud, a ribbed hem; and below the hem, the seat of her jeans, which her
 *  thighs swing from. */
function cardigan(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, -0.03, 0], [0.124, 0.075, 0.092]), "moon")
    .add(roundBox([0, 0.09, 0], [0.12, 0.09, 0.086], 0.065), "brass", 0.02)
    .add(ellipsoid([0, 0.27, 0], [0.158, 0.155, 0.098]), "brass", 0.08);
  for (const side of [-1, 1]) shape.add(ellipsoid([side * 0.052, 0.255, 0.058], [0.052, 0.05, 0.045]), "brass", 0.05);
  // The shoulders reach out over the tops of the sleeves, so a sleeve's round top sits inside one and never shows as a ball.
  for (const side of [-1, 1]) shape.add(rod([side * 0.04, 0.412, -0.01], [side * 0.18, 0.381, -0.004], 0.044, 0.05), "brass", 0.06);
  shape
    .add(stretched(ring([0, 0.022, 0], 0.122, 0.013), [0, 0.022, 0], [1.04, 1, 0.78]), "woodLight", 0.008)
    .paint((x, y, z) => (z > 0.03 && y > 0.03 && y < 0.44 && Math.abs(x) < opening(y) ? -1 : 1), "bone")
    .add(stretched(ring([0, 0.44, -0.008], 0.066, 0.016), [0, 0.44, -0.008], [1.08, 1, 0.95]), "bone", 0.008);
  // The button bands: the cardigan's edges stand proud either side of the opening, buttons down her right.
  for (const side of [-1, 1]) {
    const points = [0.04, 0.2, 0.4].map((y): Vec3 => {
      const x = side * (opening(y) + 0.008);
      return [x, y, surfaceAt(shape.distance, x, y) - 0.004];
    });
    shape.add(chain(points, [0.012, 0.012, 0.012]), "brass", 0.01);
  }
  for (const y of [0.1, 0.19, 0.28]) {
    const x = -(opening(y) + 0.012);
    shape.add(ball([x, y, surfaceAt(shape.distance, x, y) + 0.001], 0.009), "boneDark");
  }
  return shape.geometry(0.011);
}

/** The upper arm from the shoulder to the elbow: a knit sleeve, tapering to the elbow, where it ends inside the forearm's top. */
function upperArm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.005, 0], [0, -UPPER_ARM, 0], 0.042, 0.034), "brass")
    .geometry(0.01);
}

/** The forearm from the elbow to the wrist: the sleeve, a ribbed cuff, and
 *  the wrist inside it. Its rounded top covers the upper arm's narrower end
 *  however far the elbow bends. */
function forearm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0], [0, -FOREARM + 0.03, 0], 0.04, 0.035), "brass")
    .add(ring([0, -FOREARM + 0.028, 0], 0.031, 0.014), "woodLight", 0.004)
    .add(rod([0, -FOREARM + 0.05, 0], [0, -FOREARM + 0.016, 0.002], 0.019, 0.017), SKIN)
    .geometry(0.008);
}

/** A jeans leg from the hip to the knee, tapering to the knee, where it ends inside the shin's top. */
function thigh(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0.025, 0], [0, -THIGH, 0.004], 0.054, 0.04), "moon")
    .geometry(0.012);
}

/** A slim jeans leg from the knee to the shoe, its end inside the shoe. */
function shin(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0.004], [0, -SHIN + 0.005, -0.004], 0.045, 0.032), "moon")
    .geometry(0.01);
}

/** A white sneaker on the base: a low toe, a green flash down its side, a pale grey sole. */
function shoe(x: number) {
  const shape = sculpt()
    .add(ellipsoid([x, BASE_TOP + 0.028, 0.08], [0.044, 0.03, 0.074]), "boneLight")
    .add(ellipsoid([x, BASE_TOP + 0.033, -0.028], [0.042, 0.037, 0.052]), "boneLight", 0.04)
    .add(rod([x, BASE_TOP + 0.038, -0.014], [x, BASE_TOP + 0.06, -0.01], 0.031), "boneLight", 0.02)
    .carve(roundBox([x, BASE_TOP - 0.1, 0], [0.2, 0.1, 0.3], 0))
    .paint((px, y, z) => (Math.abs(px - x) > 0.03 && y > BASE_TOP + 0.016 && y < BASE_TOP + 0.03 && z > -0.04 && z < 0.08 ? -1 : 1), "verdigris")
    .paint((_, y) => (y < BASE_TOP + 0.012 ? -1 : 1), "stoneLight");
  return { geometry: shape.geometry(0.009), ...soleEnds(shape.distance, x) };
}

/** The book's size: across, tall and thick. Held things are oversized, so it reads at the house's distance. */
const BOOK = { width: 0.15, height: 0.21, thick: 0.042 };

/** A closed hardback, standing, its front cover facing +z, its spine on +x
 *  and its pages' fore-edge on −x: green boards over a cream block of pages,
 *  a brass band across the cover. */
function book(): THREE.BufferGeometry {
  const { width, height, thick } = BOOK;
  const board = 0.006;
  const parts = [-1, 1].map((face) => {
    const cover = painted(new RoundedBoxGeometry(width, height, board, 2, 0.002), "verdigris");
    cover.translate(0, 0, face * (thick / 2 - board / 2));
    return cover;
  });
  const spine = painted(new THREE.CylinderGeometry(thick / 2, thick / 2, height, 12), "verdigris");
  spine.translate(width / 2 - thick / 2, 0, 0);
  const pages = painted(new RoundedBoxGeometry(width - 0.012, height - 0.012, thick - 2 * board + 0.002, 2, 0.003), "bone");
  pages.translate(-0.004, 0, 0);
  const band = painted(new THREE.BoxGeometry(width * 0.62, 0.022, 0.002), "brass");
  band.translate(-0.008, 0.045, thick / 2 + 0.0005);
  const solid = union(roundBox([0, 0, 0], [width / 2, height / 2, thick / 2], 0.003), rod([width / 2 - thick / 2, -height / 2, 0], [width / 2 - thick / 2, height / 2, 0], thick / 2));
  return shaped(mergeAll([...parts, spine, pages, band]), solid);
}

/** Where the book is held, in its own frame: her hand flat on the front
 *  cover, its fingers round the fore-edge, a little below the middle. The
 *  edge runs along the grip's axis, upwards; her fingers point across the
 *  cover towards it. */
/** How round her hand curls at the book: wider than the book is thick, so her fingers wrap its fore-edge loosely while her palm and wrist stay out in front of the cover. */
const BOOK_HOLD = 0.035;
const BOOK_GRIP = new THREE.Matrix4()
  .makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0))
  .setPosition(-BOOK.width / 2 + 0.02, -0.025, 0.004);

/** Her book as a prop, held at its fore-edge. */
function heldBook(geometry: THREE.BufferGeometry, mesh: (geometry: THREE.BufferGeometry, name: string) => THREE.Mesh): Prop {
  const pages = mesh(geometry, "book");
  BOOK_GRIP.clone().invert().decompose(pages.position, pages.quaternion, pages.scale);
  return { object: group(pages), handle: BOOK_HOLD, carry: "hang" };
}

/** Every part's geometry, meshed once on first use and shared: none of it depends on the seed. */
function meshParts() {
  return {
    head: head(),
    ponytail: ponytail(),
    cardigan: cardigan(),
    book: book(),
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
/** Its parts, meshed once a session (ahead of time in a worker, in the house) and shared by every copy. */
export const JENNY_PARTS = figureParts("jenny", meshParts);
declareParts(jenny, [JENNY_PARTS]);

const UP = new THREE.Vector3(0, 1, 0);

/** A placement in the chest's frame: where the book stands, turned by `turn`. */
function placed(at: THREE.Vector3, turn: THREE.Euler): THREE.Matrix4 {
  return new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(turn), new THREE.Vector3(1, 1, 1));
}

/** Jenny LeClerc as a miniature on a round base, 5'7" at the house's scale.
 *  She breathes and shifts her weight, her book hugged to her chest; now and
 *  then she tips her book out and glances down at it, as if to find her place; and
 *  now and then, as though the house had filled with people, she hugs the
 *  book tight, hunches her shoulders and looks quickly one way and the other.
 *  She walks with a light, quick step, her ponytail bouncing. Her left arm
 *  holds the book; her right hand is free to hold anything else. */
export function jenny(seed = "jenny", gait: Gait = STANDING): THREE.Group {
  const parts = JENNY_PARTS.get();
  const material = figureMaterial();
  const mesh = (geometry: THREE.BufferGeometry, name: string) => {
    const made = form(material, geometry);
    made.name = name;
    return made;
  };

  const face = mesh(parts.head, "head");
  const hair = mesh(parts.ponytail, "ponytail");
  const tail = group(hair);
  tail.position.set(...TIE);
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
  holdIn(left.hand, heldBook(parts.book, mesh));

  // The book hugged to her left breast, her forearm across its front; held tight, higher and closer; tipped out to look at.
  const outward = new THREE.Vector3(1, -0.3, 0.6);
  const hugs = gripAt(left, placed(new THREE.Vector3(0.055, 0.25, 0.152), new THREE.Euler(-0.1, 0.45, 0.06)).multiply(BOOK_GRIP), outward);
  const clutches = gripAt(left, placed(new THREE.Vector3(0.045, 0.27, 0.148), new THREE.Euler(-0.14, 0.5, 0.04)).multiply(BOOK_GRIP), outward);
  const peeks = gripAt(left, placed(new THREE.Vector3(0.04, 0.2, 0.22), new THREE.Euler(0.55, 0.9, 0.04)).multiply(BOOK_GRIP), outward);

  const hangs = reachWrist(right, right.at.clone().add(new THREE.Vector3(-0.04, -0.44, 0.05)), new THREE.Vector3(-0.3, 0, -1));
  const carries = reachWrist(right, right.at.clone().add(new THREE.Vector3(0, -0.28, 0.21)), new THREE.Vector3(-0.2, 0, -1));

  const trunk = mesh(parts.cardigan, "cardigan");
  const chest = group(trunk, neck, left.shoulder, right.shoulder);
  const hips = group(chest);
  hips.position.y = WAIST - BASE_TOP;

  const legs = ([-1, 1] as const).map((side, i) => {
    const { geometry, heel, toe } = parts.shoes[i];
    const name = side < 0 ? "right" : "left";
    const shoe = group(mesh(geometry, `${name} shoe`));
    return leg(mesh(parts.thigh, `${name} thigh`), mesh(parts.shin, `${name} shin`), shoe, new THREE.Vector3(side * LEG_X, HIP, 0), THIGH, SHIN, {
      ankle: new THREE.Vector3(side * LEG_X, ANKLE, -0.012),
      heel,
      toe,
    });
  }) as unknown as StrideRig["legs"];
  const body = group(legs[0].hip, legs[1].hip, hips);
  body.position.y = BASE_TOP;

  const figure = walks(group(mesh(parts.base, "base"), body, legs[0].shoe, legs[1].shoe), JENNY_WALK);
  hasHands(figure, { right: right.hand, left: left.hand });
  joins(figure, [
    { parts: [face, trunk], at: neck, radius: 0.1 },
    { parts: [hair, face], at: tail, radius: 0.06 },
    { parts: [left.shoulder.children[0], trunk], at: left.shoulder, radius: 0.1 },
    { parts: [right.shoulder.children[0], trunk], at: right.shoulder, radius: 0.11 },
    ...left.joints,
    ...right.joints,
    ...legs.flatMap((one) => legJoints(one, trunk, 0.13, 0.1, 0.085)),
  ]);

  // Her left arm holds the book, so only her right arm swings: freely when
  // empty or hanging something at her side, little when she carries it upright.
  const swinging = { limb: right, side: -1 as const, swing: ARM_SWING };
  const rig: StrideRig = { walking: JENNY_WALK, legs, body, rest: BASE_TOP, arms: [swinging], chest, lean: 0.07 };

  const rng = createRng(seed);
  const breathPhase = rng.next() * Math.PI * 2;
  const swayPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;
  const bursts = idleBursts(figure, seed, offset, {
    peek: { every: 12, lasts: 3.4, chance: 0.6 },
    crowd: { every: 10, lasts: 2.6, chance: 0.5 },
  });

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const breath = Math.sin((seconds / 3.6) * Math.PI * 2 + breathPhase);
    const sway = Math.sin((seconds / 8) * Math.PI * 2 + swayPhase);
    const moving = gait(clock);
    const running = moving.running ? moving.amount : 0;
    const still = 1 - moving.amount;
    const held = right.hand.held;
    const { peek, crowd } = bursts(clock);
    // The fear plays walking and running too; the peek wants her standing.
    const afraid = crowd.amount;
    const peeking = peek.amount * still * (1 - afraid);

    body.rotation.z = sway * 0.018;
    hips.rotation.z = sway * -0.01;
    chest.rotation.z = sway * -0.012;
    chest.rotation.x = breath * -0.012 + afraid * 0.06 * still + peeking * 0.04;
    trunk.scale.set(1 + breath * 0.012, 1, 1 + breath * 0.012);
    // Hunched, her shoulders drawn up round her ears.
    const hunch = afraid * 0.018;
    left.shoulder.position.y = left.at.y + breath * 0.004 + hunch;
    right.shoulder.position.y = right.at.y + breath * 0.004 + hunch;

    const glance = Math.sin(crowd.progress * Math.PI * 2) * (crowd.pick < 0.5 ? -1 : 1);
    neck.rotation.y = afraid * glance * 0.7;
    neck.rotation.x = 0.04 + peeking * 0.36 + afraid * 0.08;
    neck.rotation.z = sway * 0.012;

    poseArm(left, hugs, afraid > 0 ? clutches : peeks, Math.max(afraid, peeking));
    poseHand(left.hand, holding(left.hand, RELAXED));
    const upright = held?.carry === "upright";
    const rest = upright ? carries : hangs;
    poseArm(right, rest, rest, 0);
    const empty = blendPose(RELAXED, fist(right.hand), Math.max(running, afraid) * 0.7);
    poseHand(right.hand, held ? holding(right.hand, RELAXED) : empty);
    swinging.swing = upright ? ARM_SWING * 0.3 : ARM_SWING;

    const step = stride(rig, moving);
    if (upright) aimGrip(right.hand, figure, UP, 1);

    // The ponytail hangs as her head nods, swings as she turns and bounces with her step.
    tail.rotation.x = 0.04 + Math.abs(step) * 0.18 * moving.amount + running * 0.3;
    tail.rotation.z = -neck.rotation.z - sway * 0.03 + step * 0.1;
    tail.rotation.y = -neck.rotation.y * 0.25;
  });
}
