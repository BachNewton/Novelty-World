import { type BufferGeometry, CylinderGeometry, SphereGeometry } from "three";
import { paint, type Piece } from "./painted";
import type { Palette } from "./palette";

/*
 * A stick to throw for a dog: a forked twig about as long as Elliott's
 * forearm, a little crooked, in its bark, with the pale wood showing where
 * a strip of bark has come away and at its broken ends. It lies along +z
 * with its middle at its origin, its fork reaching out to +x, and is drawn
 * through the shared solid material.
 */

/** How long the stick is, end to end, in metres, and how thick at its butt. */
export const STICK_LENGTH = 0.6;
const RADIUS = 0.021;

/** The stick's gentle crook: how far its middle sits off the line between its ends. */
const crook = (z: number) => Math.sin((z / STICK_LENGTH + 0.5) * Math.PI) * 0.018;

/** A length of the stick's shaft, from one point along it to another, tapering towards the tip. */
function shaft(from: number, to: number, inset = 0): BufferGeometry {
  const taper = (z: number) => RADIUS * (1 - 0.4 * (z / STICK_LENGTH + 0.5)) - inset;
  const piece = new CylinderGeometry(taper(to), taper(from), to - from, 7, 4);
  piece.rotateX(Math.PI / 2);
  piece.translate(0, 0, (from + to) / 2);
  const p = piece.getAttribute("position");
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + crook(p.getZ(i)));
  piece.computeVertexNormals();
  return piece;
}

/** The fork: a twig out to one side from a third of the way along. */
function fork(): BufferGeometry {
  const length = 0.19;
  const twig = new CylinderGeometry(0.006, 0.011, length, 5, 2);
  twig.translate(0, length / 2, 0);
  twig.rotateX(Math.PI / 2);
  twig.rotateY(0.62);
  twig.translate(crook(0.08) + 0.008, 0.004, 0.08);
  return twig;
}

/** A broken end, the pale wood across it. */
function end(z: number, radius: number): BufferGeometry {
  const cap = new CylinderGeometry(radius, radius, 0.006, 7);
  cap.rotateX(Math.PI / 2);
  cap.translate(crook(z), 0, z);
  return cap;
}

export function fetchStickGeometry(palette: Palette): BufferGeometry {
  const t = palette.things;
  const half = STICK_LENGTH / 2;
  const knot = new SphereGeometry(0.014, 6, 4);
  knot.scale(1, 0.8, 1.3);
  knot.translate(crook(-0.14) - 0.013, 0.006, -0.14);
  const pieces: Piece[] = [
    { geometry: shaft(-half, -0.02), colour: t.bark, shading: 0.35 },
    // Where a strip of bark has come away, the wood beneath shows pale.
    { geometry: shaft(-0.03, 0.05, 0.002), colour: t["broom-handle"], shading: 0.2 },
    { geometry: shaft(0.04, half), colour: t.bark, shading: 0.35 },
    { geometry: fork(), colour: t.bark, shading: 0.3 },
    { geometry: knot, colour: t.bark },
    { geometry: end(-half, RADIUS * 0.96), colour: t["broom-handle"] },
    { geometry: end(half, RADIUS * 0.58), colour: t["broom-handle"] },
  ];
  return paint(pieces);
}
