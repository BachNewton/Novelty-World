import * as THREE from "three";
import { sculpt, type Solid } from "../forms";
import { figureParts } from "../figure-parts";
import type { FaceFit } from "../explorers/figure";
import { group } from "../shapes";
import { SHINES } from "../shine";
import { assembled, piece, wornModel } from "./item";

/*
 * The Mask (omen): a masquerade half-mask of glazed white porcelain, its
 * wings swept up past the temples, gilt rims round its eye holes and a violet
 * tear painted under each eye, worn over the eyes. Its one-second read is a
 * pale band with swept-up wings across a figure's face, two dark eyes in it:
 * nothing else white sits on a face, and the wings carry it past the head's
 * outline, so it reads as a mask, not a pale face, from the house's distance.
 *
 * It is sculpted once, round a reference face, and fitted to each figure's
 * (`FaceFit`): scaled by how far apart their eyes are, so its eye holes sit
 * on their eyes, and set forward just clear of whatever their face holds out
 * over its footprint (a nose's bridge, a brow, spectacles, a fringe).
 */

/** Half the distance between the reference face's eyes, which the eye holes are cut round. */
const APART = 0.043;
/** The face it is sculpted round, and shown at on its plate: no head, only the eyes' place. */
const REFERENCE: FaceFit = { eyes: new THREE.Vector3(0, 0.188, 0.151), apart: APART, front: () => -Infinity };

/** How the mask curves round the face, its thickness, and the gap behind it, in metres at the reference. */
const CURVE = { across: 6, up: 2 };
const THICK = 0.0065;
const GAP = 0.005;
/** The gilt rims round the eye holes: how thick a bead, and how far out from the hole's edge it runs. */
const RIM = { radius: 0.0024, out: 0.0012 };

/** The mask's back face, in its own frame (its origin between the eyes, on that face): curving back round the face. */
const behind = (x: number, y: number) => -CURVE.across * x * x - CURVE.up * y * y;

/** Roughly the distance to an ellipse in the face's plane, rotated by `turn`. */
function oval(x: number, y: number, [cx, cy]: readonly [number, number], [rx, ry]: readonly [number, number], turn = 0): number {
  const [dx, dy] = [x - cx, y - cy];
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const [u, v] = [dx * c + dy * s, -dx * s + dy * c];
  return (Math.hypot(u / rx, v / ry) - 1) * Math.min(rx, ry);
}

/** The mask's outline on the face, its distance (negative inside): a band across the eyes with its wings swept up past
 *  the temples, and a notch over the nose. */
function outline(x: number, y: number): number {
  const side = Math.sign(x) || 1;
  const band = oval(x, y, [0, 0.004], [0.088, 0.033]);
  const wing = oval(x, y, [side * 0.076, 0.034], [0.046, 0.021], side * 0.55);
  const notch = oval(x, y, [0, -0.04], [0.018, 0.024]);
  return Math.max(Math.min(band, wing), -notch);
}

/** An eye hole: an almond, its outer corner lifted. */
function eyeHole(x: number, y: number): number {
  const side = Math.sign(x) || 1;
  return oval(x, y, [side * APART, 0.001], [0.021, 0.0105], side * 0.14);
}

/** How steep the mask's back is at a point, so its shell keeps its thickness where it curves round the temples. */
const steepness = (x: number, y: number) => Math.hypot(2 * CURVE.across * x, 2 * CURVE.up * y);

const BOUNDS: Pick<Solid, "min" | "max"> = { min: [-0.14, -0.065, -0.13], max: [0.14, 0.095, 0.02] };

/** The porcelain: a shell over the face, cut to its outline, its eyes cut out. */
const porcelain: Solid = {
  ...BOUNDS,
  distance: (x, y, z) => {
    const k = Math.hypot(1, steepness(x, y));
    const shell = (Math.abs(z - behind(x, y) - (THICK * k) / 2) - (THICK * k) / 2) / k;
    return Math.max(shell, outline(x, y), -eyeHole(x, y));
  },
};

/** A painted tear under each eye: a small violet diamond on the porcelain's face. */
const tears: Solid = {
  ...BOUNDS,
  distance: (x, y, z) => {
    const side = Math.sign(x) || 1;
    const [dx, dy] = [Math.abs(x - side * APART), Math.abs(y + 0.021)];
    return Math.max(dx / 0.0045 + dy / 0.0085 - 1, Math.abs(z - behind(x, y)) - 0.03);
  },
};

/** The gilt rims: a bead round each eye hole's edge, lying on the porcelain's face. */
const rims: Solid = {
  ...BOUNDS,
  distance: (x, y, z) => {
    const k = Math.hypot(1, steepness(x, y));
    const face = behind(x, y) + THICK * k;
    return Math.hypot(eyeHole(x, y) - RIM.out, (z - face) / k) - RIM.radius;
  },
};

const PARTS = figureParts("item:mask", () => ({
  porcelain: sculpt().add(porcelain, "boneLight").paint(tears, "violet").geometry(0.0022),
  gilt: sculpt().add(rims, "gold").geometry(0.0012),
}));

/** Where the mask sits on a face: how far forward its back must be, between the eyes, to clear the face over all of it. */
function forward(fit: FaceFit, scale: number): number {
  let most = fit.eyes.z + GAP * scale;
  for (let x = BOUNDS.min[0]; x <= BOUNDS.max[0]; x += 0.003) {
    for (let y = BOUNDS.min[1]; y <= BOUNDS.max[1]; y += 0.003) {
      if (outline(x, y) > 0.004) continue;
      most = Math.max(most, fit.front(x * scale, fit.eyes.y + y * scale) + (GAP - behind(x, y)) * scale);
    }
  }
  return most;
}

/** The mask on a face, in the head's frame: scaled to the eyes, its holes on them, set just clear of the face. */
function mask(fit: FaceFit): THREE.Group {
  const parts = PARTS.get();
  const porcelainPart = piece(parts.porcelain, "mask", SHINES.glazedChina);
  const giltPart = piece(parts.gilt, "mask rims", SHINES.gilt);
  const model = assembled(
    "mask",
    [porcelainPart, giltPart],
    [-1, 1].map((side) => ({ between: [porcelainPart, giltPart], at: [side * APART, 0, 0], radius: 0.03 })),
  );
  const scale = fit.apart / APART;
  model.scale.setScalar(scale);
  const worn = group(model);
  worn.position.set(0, fit.eyes.y, forward(fit, scale));
  return worn;
}

export const MASK = wornModel({
  card: "mask",
  parts: [PARTS],
  worn: { slot: "face", reference: REFERENCE, build: mask },
  // On the floor it lies tipped back on its wings, its face up towards the camera.
  plate: { lie: new THREE.Euler(-1.1, 0, 0), spin: 0.4 },
});
