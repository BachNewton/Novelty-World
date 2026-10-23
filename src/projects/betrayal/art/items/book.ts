import * as THREE from "three";
import { ball, drum, ellipsoid, loft, mergeAll, ring, roundBox, sculpt, type Section } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, FACE_UP, itemModel, onPlate, piece } from "./item";

/*
 * The Book (omen): an old grimoire, the kind that teaches what it shouldn't.
 * A thick tome bound in dark violet leather over bevelled boards, a rounded
 * spine with raised bands across it, brass corners and a brass clasp holding
 * it shut, and on its front cover a brass eye in a ring. It is a girdle
 * book, as old books carried about were: its leather runs on past the foot
 * of its back board into a tail, knotted at the end, to carry it by. It
 * reads as a book by its block, its pale page edges and its corners, and as
 * the occult one by its violet; it is told from the Spirit Board, the other
 * flat thing held up, by its thickness and its pale edges against the
 * board's broad warm wood. Held upright by its tail, the book standing on
 * the fist, its cover to the front: gripped by the tail, nothing of the book
 * passes through the hand, and it stands clear of the body and the other
 * hand.
 */

/** The book over the fist: its foot and head, its spine (towards the body, +x) and fore-edge, the book standing out over the back of the hand, clear of anything held before the chest, and how thick it is through z. */
const TOME = { foot: 0.054, head: 0.24, spine: 0.02, fore: -0.135, thick: 0.062, board: 0.008 };
/** The book stands a little forward of the fist, clear of a figure's own things close to its chest. */
const FORWARD = 0.012;
/** The tail: its width where it leaves the foot of the back board, its radius in the fist, and the knot under the fist. */
const TAIL = { wide: 0.024, radius: 0.0115, knot: -0.058 };

const middle = (TOME.foot + TOME.head) / 2;
const half = (TOME.head - TOME.foot) / 2;
const across = (TOME.spine + TOME.fore) / 2;
const wide = (TOME.spine - TOME.fore) / 2;
const face = TOME.thick / 2 - TOME.board / 2;

/** The leather: the two boards, the rounded spine with its raised bands, and the cover's sunk panel. */
function bindingGeometry(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(drum([TOME.spine - 0.004, middle, FORWARD], TOME.thick / 2, half, 0.008), "bruise")
    .add(roundBox([across, middle, FORWARD + face], [wide, half, TOME.board / 2], 0.004), "bruise", 0.004)
    .add(roundBox([across, middle, FORWARD - face], [wide, half, TOME.board / 2], 0.004), "bruise", 0.004);
  // The spine's raised bands, across its back.
  for (const t of [0.2, 0.45, 0.7]) shape.add(ring([TOME.spine - 0.004, TOME.foot + (TOME.head - TOME.foot) * t, FORWARD], TOME.thick / 2 + 0.001, 0.0045), "bruiseDark", 0.003);
  // A sunk panel framing the front cover, darker than the leather round it.
  shape.carve(roundBox([across - 0.006, middle, FORWARD + TOME.thick / 2 + 0.0035], [wide * 0.72, half * 0.8, 0.0045], 0.003), { colour: "bruiseDark", blend: 0.002 });
  return shape.geometry(0.0026);
}

/** The tail: the leather running on from the foot of the back board, narrowing down through the fist to a knot under it. */
function tailGeometry(): THREE.BufferGeometry {
  const band = (y: number, x: number, z: number, width: number, depth: number): Section => ({ at: [x, y, z], radius: [width, depth], colour: "bruise" });
  const strap = loft(
    [
      band(TOME.foot + 0.02, across + 0.01, FORWARD - face, TAIL.wide, 0.004),
      band(TOME.foot - 0.004, across + 0.01, FORWARD - face + 0.002, TAIL.wide * 0.9, 0.0055),
      band(0.03, 0.004, 0.002, TAIL.radius * 1.15, TAIL.radius * 0.8),
      band(0, 0, 0, TAIL.radius, TAIL.radius),
      band(TAIL.knot + 0.012, 0, 0, TAIL.radius * 0.9, TAIL.radius * 0.9),
    ],
    { side: [1, 0, 0] },
  );
  return mergeAll([strap, sculpt().add(ball([0, TAIL.knot, 0], TAIL.radius * 1.55), "bruiseDark").geometry(0.0022)]);
}

/** The block of pages between the boards, its edges pale, a little in from the boards' edges. */
function pagesGeometry(): THREE.BufferGeometry {
  const inner = TOME.thick / 2 - TOME.board + 0.002;
  return sculpt()
    .add(roundBox([across - 0.002, middle, FORWARD], [wide - 0.008, half - 0.007, inner], 0.003), "boneLight")
    .geometry(0.003);
}

/** The brass: a cap on each outer corner of both boards, the clasp across the fore-edge, and the eye in a ring on the cover. */
function brassGeometry(): THREE.BufferGeometry {
  const shape = sculpt();
  for (const y of [TOME.foot + 0.006, TOME.head - 0.006])
    for (const z of [face, -face]) shape.add(roundBox([TOME.fore + 0.008, y, FORWARD + z], [0.012, 0.012, TOME.board / 2 + 0.0018], 0.003), "gold");
  // The clasp: a strap over the fore-edge from the back board to a catch on the front one.
  shape
    .add(roundBox([TOME.fore - 0.001, middle, FORWARD], [0.0035, 0.014, TOME.thick / 2 + 0.002], 0.0025), "gold")
    .add(roundBox([TOME.fore + 0.012, middle, FORWARD + TOME.thick / 2 + 0.001], [0.016, 0.012, 0.0028], 0.0025), "gold", 0.002);
  // The eye on the cover: a ring round an almond, its pupil a boss.
  const eye: [number, number, number] = [across - 0.006, middle + 0.008, FORWARD + TOME.thick / 2 + 0.0005];
  shape
    .add(ring(eye, 0.036, 0.0035, [Math.PI / 2, 0, 0]), "gold")
    .add(ellipsoid([eye[0], eye[1], eye[2] - 0.001], [0.028, 0.012, 0.004]), "gold")
    .add(ball([eye[0], eye[1], eye[2] + 0.001], 0.007), "goldLight", 0.002);
  return shape.geometry(0.0022);
}

const PARTS = figureParts("item:book", () => ({ binding: bindingGeometry(), tail: tailGeometry(), pages: pagesGeometry(), brass: brassGeometry() }));

/** The book, by its tail, or (on the floor, where the tail would only shrink it to fit the plate) with its tail tucked away. */
function book(tailed: boolean): THREE.Group {
  const parts = PARTS.get();
  const binding = piece(parts.binding, "book binding");
  const pages = piece(parts.pages, "book pages");
  const brass = piece(parts.brass, "book brass", SHINES.tarnishedBrass);
  const corner = (part: THREE.Mesh, y: number, z: number) => ({ between: [part, brass] as [THREE.Mesh, THREE.Mesh], at: [TOME.fore + 0.008, y, FORWARD + z] as THREE.Vector3Tuple, radius: 0.03 });
  const seams: Parameters<typeof assembled>[2] = [
    { between: [binding, pages], at: [across, middle, FORWARD], radius: 0.2 },
    // The corners' caps fold over the boards and the page block's corners alike.
    ...[TOME.foot + 0.006, TOME.head - 0.006].flatMap((y) => [face, -face].flatMap((z) => [corner(binding, y, z), corner(pages, y, z)])),
    { between: [binding, brass], at: [TOME.fore, middle, FORWARD], radius: 0.05 },
    { between: [pages, brass], at: [TOME.fore, middle, FORWARD], radius: 0.05 },
    { between: [binding, brass], at: [across, middle, FORWARD + face], radius: 0.07 },
  ];
  if (!tailed) return assembled("book", [binding, pages, brass], seams);
  const tail = piece(parts.tail, "book tail");
  return assembled("book", [binding, tail, pages, brass], [...seams, { between: [binding, tail], at: [across + 0.01, TOME.foot, FORWARD - face], radius: 0.045 }]);
}

export const BOOK = itemModel({
  card: "book",
  parts: [PARTS],
  held: () => ({ object: book(true), handle: TAIL.radius, carry: "upright" }),
  plate: FACE_UP,
  floor: () => onPlate(book(false), FACE_UP),
});
