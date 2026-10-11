import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { clothMoment, clothNet, hingedPanels, STEP, type ClothBody, type ClothMoment } from "./cloth-sim";

/*
 * The shared simulated cloth, on a plain bell skirt with no figure: left
 * alone it settles still; whipped round far harder than any figure turns it
 * stays finite and near where it hangs; and the same moments always give the
 * same cloth.
 */

const AROUND = 12;
const DOWN = 6;
const FEEL = { frequency: 1.2, follow: 3, inertia: 0.35, drag: 0.6, swing: 0.1, room: 0.03, roomAtTop: 0.015 };

/** A point on a plain bell, round it (0 to 1) and down it (0 to 1), hung from the origin. */
function onBell(round: number, along: number): THREE.Vector3 {
  const r = 0.1 + 0.12 * (1 - (1 - along) ** 2);
  return new THREE.Vector3(r * Math.cos(round * Math.PI * 2), -0.2 * along, r * Math.sin(round * Math.PI * 2));
}

const BODIES: Record<string, () => ClothBody> = {
  net: () => {
    const rest = new Float64Array(AROUND * DOWN * 3);
    for (let j = 0; j < DOWN; j++) for (let i = 0; i < AROUND; i++) rest.set(onBell(i / AROUND, j / (DOWN - 1)).toArray(), (j * AROUND + i) * 3);
    return clothNet({ rest, around: AROUND, down: DOWN, closed: true, outward: 1, round: true }, { ...FEEL, weight: 1 });
  },
  panels: () => {
    const middles = Array.from({ length: 6 }, (_, k) => k / 6);
    return hingedPanels(
      { hinges: middles.map((m) => onBell(m, 0)), hems: middles.map((m) => onBell(m, 1)), reach: 0.7, bulge: (_, along) => 0.12 * along * (1 - along) },
      FEEL,
    );
  },
};

/** The anchor at a moment of a violent loop: running 4 m/s round a 0.3 m circle (over 5 g), spinning the other way. */
function whipped(seconds: number, moment: ClothMoment) {
  const turn = (seconds * 4) / 0.3;
  moment.anchor.compose(new THREE.Vector3(0.3 * Math.cos(turn), 0.5 + 0.05 * Math.sin(seconds * 20), 0.3 * Math.sin(turn)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -turn * 1.5), new THREE.Vector3(1, 1, 1));
  return moment;
}

/** Steps a body through `seconds` of moments, starting from rest. */
function run(body: ClothBody, seconds: number, at: (seconds: number, moment: ClothMoment) => ClothMoment) {
  const [from, to] = [at(0, clothMoment(0)), clothMoment(0)];
  body.reset(from);
  for (let k = 1; k * STEP <= seconds; k++) {
    at(k * STEP, to);
    body.step(from, to);
    from.anchor.copy(to.anchor);
  }
  return to;
}

/** The furthest any point is from where it hangs at a moment. */
function furthestFromHanging(body: ClothBody, rest: readonly THREE.Vector3[], anchor: THREE.Matrix4): number {
  let most = 0;
  rest.forEach((point, k) => {
    const hanging = point.clone().applyMatrix4(anchor);
    most = Math.max(most, hanging.distanceTo(new THREE.Vector3().fromArray(body.points, k * 3)));
  });
  return most;
}

const restOf: Record<string, () => THREE.Vector3[]> = {
  net: () => Array.from({ length: AROUND * DOWN }, (_, k) => onBell((k % AROUND) / AROUND, Math.floor(k / AROUND) / (DOWN - 1))),
  panels: () => Array.from({ length: 6 }, (_, k) => [onBell(k / 6, 0), onBell(k / 6, 1)]).flat(),
};

describe("simulated cloth", () => {
  for (const [name, make] of Object.entries(BODIES)) {
    it(`settles still, hanging (${name})`, () => {
      const body = make();
      const still = (_: number, moment: ClothMoment) => moment;
      run(body, 3, still);
      const before = Float64Array.from(body.points);
      const moment = clothMoment(0);
      body.step(moment, moment);
      const fastest = Math.max(...before.map((value, i) => Math.abs(body.points[i] - value) / STEP));
      expect(fastest, "fastest point, m/s").toBeLessThan(0.001);
      expect(furthestFromHanging(body, restOf[name](), moment.anchor), "sag from the sculpted shape, m").toBeLessThan(0.05);
    });

    it(`stays near where it hangs, whipped round (${name})`, () => {
      const body = make();
      const moment = run(body, 2, whipped);
      expect(body.points.every(Number.isFinite)).toBe(true);
      expect(furthestFromHanging(body, restOf[name](), moment.anchor), "furthest from where it hangs, m").toBeLessThanOrEqual(FEEL.swing + 1e-9);
    });

    it(`is the same, run after run (${name})`, () => {
      const [a, b] = [make(), make()];
      run(a, 1, whipped);
      run(b, 1, whipped);
      expect(Array.from(a.points)).toEqual(Array.from(b.points));
    });
  }
});
