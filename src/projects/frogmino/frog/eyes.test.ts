import { describe, expect, it } from "vitest";
import type { Rotation, TetrominoKind } from "../types";
import { TUNING } from "../tuning";
import type { Vec3 } from "../vehicles/parts";
import { FROG_LOOKS, FROG_VARIANTS } from "./look";
import { frogModel, partMiddle, pupilCentre, type FrogEye, type FrogPart } from "./model";
import { DAZED_EYES, EYES_SHUT, PUPIL_ORBIT, pupilScale, type PupilOrbit } from "./motion";

// The eyes' parts are balls inside balls, which the face scanner leaves out.
// Two curved surfaces of different paints that run alongside each other, or
// cross at a shallow angle, flicker through each other where the depth buffer
// and the balls' facets can't tell which is in front: that was the white
// clipping through the lid. So wherever a white or a pupil meets another
// paint's surface and can be seen, the two must cross steeply.

const KINDS: readonly TetrominoKind[] = ["I", "O", "T", "S", "Z", "J", "L"];
const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];

// Closer than this, two surfaces count as meeting.
const NEAR = 0.004;
// Surfaces that meet must cross at least this steeply.
const STEEPEST_GRAZE = Math.cos((30 * Math.PI) / 180);
const SAMPLES = 40;

const plus = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const minus = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const times = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec3): Vec3 => times(a, 1 / Math.hypot(...a));

interface Field {
  name: string;
  // Signed distance from the surface, negative inside, and the outward
  // normal there.
  at: (p: Vec3) => { distance: number; normal: Vec3 };
}

interface Ball {
  centre: Vec3;
  radii: Vec3;
}

const ballOf = (part: FrogPart): Ball => ({ centre: partMiddle(part), radii: times(minus(part.max, part.min), 0.5) });

// A ball scaled by `scale` about `about`, as the eyeball sinks into its bump.
const sunk = (ball: Ball, about: Vec3, scale: number): Ball => ({
  centre: plus(about, times(minus(ball.centre, about), scale)),
  radii: times(ball.radii, scale),
});

function ballField(name: string, { centre, radii }: Ball): Field {
  return {
    name,
    at(p) {
      const q = minus(p, centre);
      const f = (q[0] / radii[0]) ** 2 + (q[1] / radii[1]) ** 2 + (q[2] / radii[2]) ** 2 - 1;
      const gradient: Vec3 = [(2 * q[0]) / radii[0] ** 2, (2 * q[1]) / radii[1] ** 2, (2 * q[2]) / radii[2] ** 2];
      const length = Math.hypot(...gradient);
      return { distance: f / length, normal: times(gradient, 1 / length) };
    },
  };
}

function boxField(name: string, { min, max }: FrogPart): Field {
  const distance = (p: Vec3): number => {
    const outside = [0, 1, 2].map((i) => Math.max(min[i] - p[i], p[i] - max[i]));
    const beyond = Math.hypot(...outside.map((d) => Math.max(d, 0)));
    return beyond > 0 ? beyond : Math.max(...outside);
  };
  return {
    name,
    at(p) {
      const h = 1e-5;
      const d = distance(p);
      const slope = (nudge: Vec3): number => (distance(plus(p, nudge)) - d) / h;
      return { distance: d, normal: unit([slope([h, 0, 0]), slope([0, h, 0]), slope([0, 0, h])]) };
    },
  };
}

function surface({ centre, radii }: Ball): { point: Vec3; normal: Vec3 }[] {
  const found: { point: Vec3; normal: Vec3 }[] = [];
  for (let i = 1; i < SAMPLES; i++) {
    const theta = (Math.PI * i) / SAMPLES;
    for (let j = 0; j < 2 * SAMPLES; j++) {
      const phi = (Math.PI * j) / SAMPLES;
      const along: Vec3 = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
      const point = plus(centre, [along[0] * radii[0], along[1] * radii[1], along[2] * radii[2]]);
      found.push({ point, normal: unit([along[0] / radii[0], along[1] / radii[1], along[2] / radii[2]]) });
    }
  }
  return found;
}

// One eye in a pose: its eyeball sunk by `scale`, its pupil on `orbit` and
// shrunk as the lid closes over it; null once it has gone.
interface EyeState {
  white: Ball;
  pupil: Ball | null;
  skin: Field[];
}

function eyeState(eye: FrogEye, head: FrogPart[], scale: number, orbit: PupilOrbit | null): EyeState {
  const pupil: Ball = { centre: pupilCentre(eye, orbit), radii: times(ballOf(eye.pupil).radii, pupilScale(scale)) };
  return {
    white: sunk(ballOf(eye.white), eye.centre, scale),
    pupil: pupilScale(scale) > 0 ? sunk(pupil, eye.centre, scale) : null,
    skin: [ballField("bump", ballOf(eye.bump)), ...head.map((part, i) => boxField(`head box ${String(i)}`, part))],
  };
}

const hiddenBy = (p: Vec3, fields: readonly Field[]): boolean => fields.some((field) => field.at(p).distance < -NEAR);

// Where a part's surface meets another paint's, out in the open, and runs
// alongside it rather than crossing it steeply.
function grazes(name: string, part: Ball, others: readonly Field[], occluders: readonly Field[]): string[] {
  const found = new Set<string>();
  for (const { point, normal } of surface(part)) {
    for (const other of others) {
      const at = other.at(point);
      if (Math.abs(at.distance) > NEAR) continue;
      if (hiddenBy(point, occluders.filter((field) => field !== other))) continue;
      if (Math.abs(dot(normal, at.normal)) > STEEPEST_GRAZE) found.add(`${name} grazes ${other.name}`);
    }
  }
  return [...found];
}

// Every distinct eye: each variant's eyes, wherever across their cell the
// poses put them.
const EYES = FROG_VARIANTS.flatMap((variant) => {
  const { markings, pupil } = FROG_LOOKS[variant];
  const seen = new Map<string, { name: string; eye: FrogEye; head: FrogPart[] }>();
  for (const kind of KINDS) {
    for (const rotation of ROTATIONS) {
      for (const cell of frogModel(kind, rotation, { markings, pupil }).cells) {
        for (const eye of cell.eyes) {
          const key = `${(eye.centre[0] - cell.cell.col).toFixed(3)} ${String(eye.gaze[0] > 0)}`;
          if (!seen.has(key)) seen.set(key, { name: `${variant} ${kind}${String(rotation)} ${key}`, eye, head: cell.body });
        }
      }
    }
  }
  return [...seen.values()];
});

const DAZED_ORBITS: PupilOrbit[] = [0, 0.5, 1].flatMap((share) =>
  Array.from({ length: 8 }, (_, k) => ({ angle: (Math.PI * k) / 4, radius: share * PUPIL_ORBIT })),
);

describe.each(EYES)("the eye $name", ({ eye, head }) => {
  it("crosses the white out of the lid steeply, open and dazed, so it never clips", () => {
    const problems: string[] = [];
    for (const [scale, orbits] of [
      [1, [null]],
      [DAZED_EYES, DAZED_ORBITS],
    ] as const) {
      for (const orbit of orbits) {
        const { white, pupil, skin } = eyeState(eye, head, scale, orbit);
        if (pupil === null) throw new Error("The pupil is gone with the eye open");
        const whiteField = ballField("white", white);
        const pupilField = ballField("pupil", pupil);
        problems.push(...grazes("white", white, skin, [...skin, pupilField]));
        problems.push(...grazes("pupil", pupil, [...skin, whiteField], [...skin, whiteField]));
      }
    }
    expect([...new Set(problems)]).toEqual([]);
  });

  it("shows a pupil only over its white, however far the eye is shut or the pupil rolled", () => {
    const states = [
      ...Array.from({ length: 21 }, (_, k) => [EYES_SHUT + ((1 - EYES_SHUT) * k) / 20, null] as const),
      ...DAZED_ORBITS.map((orbit) => [DAZED_EYES, orbit] as const),
    ];
    const bare: string[] = [];
    for (const [scale, orbit] of states) {
      const { white, pupil, skin } = eyeState(eye, head, scale, orbit);
      if (pupil === null) continue;
      const whiteField = ballField("white", white);
      for (const { point } of surface(pupil)) {
        if (hiddenBy(point, [...skin, whiteField])) continue;
        // The white under this bit of pupil, straight in toward its middle.
        const under = plus(white.centre, times(unit(minus(point, white.centre)), white.radii[0]));
        if (hiddenBy(under, skin)) bare.push(`eye ${scale.toFixed(2)} open, orbit ${JSON.stringify(orbit)}`);
      }
    }
    expect([...new Set(bare)]).toEqual([]);
  });

  it("hides the white and the pupil wholly in the lid when shut", () => {
    const { white, pupil, skin } = eyeState(eye, head, EYES_SHUT, null);
    expect(pupil).toBeNull();
    expect(surface(white).filter(({ point }) => !hiddenBy(point, skin))).toEqual([]);
  });

  it("looks out and ahead down the road, away from the gameplay camera", () => {
    const outward = Math.sign(partMiddle(eye.white)[0] - eye.centre[0]);
    const toCamera = unit([0, TUNING.cameraHeight, TUNING.cameraFollow]);
    expect(Math.sign(eye.gaze[0])).toBe(outward);
    expect(eye.gaze[2]).toBeLessThan(0);
    expect(dot(eye.gaze, toCamera)).toBeLessThan(-0.3);
  });
});
