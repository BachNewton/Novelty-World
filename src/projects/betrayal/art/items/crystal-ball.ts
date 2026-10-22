import * as THREE from "three";
import { ball, drum, ring, rod, sculpt } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, itemModel, piece } from "./item";

/*
 * The Crystal Ball (omen): a seer's glass sphere on a short turned stand.
 * A big ball of pale, cold glass with a violet haze drifting through it, in
 * a brass cradle of three claws on a dark wooden stem with a foot. It reads
 * by the sphere held up over the fist, larger than the hand, and its violet
 * (the occult, not a light: the haze is in the glass, and the ball gives off
 * nothing); the Skull, the other round thing held up, is bone-pale and
 * carved, where this is smooth and cold. Held upright by its stem, the ball
 * over the fist.
 */

/** Along the stem, from the grip: its foot under the fist, the cradle, and the ball's middle over it. */
const STEM = { foot: -0.07, top: 0.075, radius: 0.015 };
const BALL = { radius: 0.08, cradle: 0.084 };
const centre = (): [number, number, number] => [0, BALL.cradle + BALL.radius * 0.82, 0];

/** How far a point on the ball lies outside a wisp of haze winding round it, `turn` round from the first. */
function wisp(x: number, y: number, z: number, turn: number): number {
  const angle = Math.atan2(z, x) + turn;
  const height = y / BALL.radius;
  const width = 0.05 + 0.045 * Math.sin(angle * 1.5 + turn);
  return Math.abs(height - 0.45 * Math.sin(angle + 0.8) - 0.12 * Math.sin(angle * 3)) - width;
}

/** The glass, pale moon blue, two wisps of violet haze winding through it. */
function glassGeometry(): THREE.BufferGeometry {
  const [cx, cy, cz] = centre();
  return sculpt()
    .add(ball([cx, cy, cz], BALL.radius), "moonLight")
    // Two wisps of violet haze winding round the glass, thick and thin by turns.
    .paint((x, y, z) => wisp(x - cx, y - cy, z - cz, 0), "violet")
    .paint((x, y, z) => wisp(x - cx, y - cy, z - cz, 2.4), "bruiseLight")
    .geometry(0.0035);
}

/** The brass cradle: a collar on the stem's top and three claws curling up round the ball's underside. */
function cradleGeometry(): THREE.BufferGeometry {
  const [, cy] = centre();
  const shape = sculpt()
    .add(drum([0, STEM.top - 0.006, 0], STEM.radius * 1.5, 0.008, 0.003), "gold")
    .add(ring([0, BALL.cradle + 0.004, 0], BALL.radius * 0.48, 0.0045), "gold", 0.004);
  for (let k = 0; k < 3; k++) {
    const angle = (k / 3) * Math.PI * 2 + Math.PI / 2;
    const [dx, dz] = [Math.cos(angle), Math.sin(angle)];
    const on = (r: number, y: number): [number, number, number] => [dx * r, y, dz * r];
    // Each claw rises from the collar, out along the ball's curve, its tip tucked in against the glass.
    const low = on(BALL.radius * 0.5, BALL.cradle + 0.004);
    const mid = on(Math.sqrt(BALL.radius ** 2 - (cy - BALL.cradle - 0.03) ** 2) + 0.004, BALL.cradle + 0.03);
    const tip = on(Math.sqrt(BALL.radius ** 2 - (cy - BALL.cradle - 0.065) ** 2) + 0.002, BALL.cradle + 0.065);
    shape
      .add(rod(on(STEM.radius, STEM.top - 0.004), low, 0.005, 0.0055), "gold", 0.004)
      .add(rod(low, mid, 0.0055, 0.0048), "gold", 0.004)
      .add(rod(mid, tip, 0.0048, 0.0032), "gold", 0.003);
  }
  return shape.carve(ball(centre(), BALL.radius + 0.0015)).geometry(0.0022);
}

/** The stem: a turned wooden handle in the fist, a ring of moulding under the cradle, and a round foot under the fist. */
function stemGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, STEM.foot + 0.012, 0], [0, STEM.top - 0.02, 0], STEM.radius, STEM.radius * 0.9), "woodDark")
    .add(ring([0, STEM.top - 0.012, 0], STEM.radius * 0.95, 0.004), "woodDark", 0.004)
    .add(drum([0, STEM.foot + 0.004, 0], STEM.radius * 1.65, 0.01, 0.006), "woodDark", 0.008)
    .geometry(0.0026);
}

const PARTS = figureParts("item:crystal-ball", () => ({ glass: glassGeometry(), cradle: cradleGeometry(), stem: stemGeometry() }));

function crystalBall(): THREE.Group {
  const parts = PARTS.get();
  const glass = piece(parts.glass, "crystal ball", SHINES.glass);
  const cradle = piece(parts.cradle, "crystal ball cradle", SHINES.brass);
  const stem = piece(parts.stem, "crystal ball stem");
  return assembled("crystal ball", [glass, cradle, stem], [
    { between: [cradle, stem], at: [0, STEM.top, 0], radius: 0.03 },
    { between: [glass, cradle], at: [0, BALL.cradle + 0.03, 0], radius: BALL.radius },
  ]);
}

/** Held up by its stem; on the floor it has rolled over onto its side. */
export const CRYSTAL_BALL = itemModel({
  card: "crystal-ball",
  parts: [PARTS],
  held: () => ({ object: crystalBall(), handle: STEM.radius, carry: "upright" }),
  plate: { lie: new THREE.Euler(0, 0, 1.1), spin: 0.6 },
});
