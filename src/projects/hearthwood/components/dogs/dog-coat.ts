import { Vector3, type Color } from "three";
import { abs, clamp, float, fract, If, length, max, mix, select, sin, smoothstep, step, vec2, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { DogCoatLook } from "../../dogs/coat-look";
import { EAR, HIP, MOUTH_Y, NOSE, NOSE_RADII, PRICK_EAR, SHOULDER, SKULL, TAIL_ROOT } from "../../dogs/rig";
import { coatInputs, coatMaterial, earCup, fbm, noise3, paintedEye, paintEye, type Coat, type CoatPattern, type CoatValues } from "../animals/coat-material";

/*
 * A dog's coat patterns, on the shared coat (`../animals/coat-material.ts`).
 * In order: where the eumelanin lies over the phaeomelanin for the coat's
 * pattern (solid, clear, a sable's shading, a wolf grey's bands, tan points
 * or a saddle), brindle's broken streaks and a mask over that, merle's torn
 * patchwork in the eumelanin, the white spotting, the grain of the fur, and
 * then the face: eyes, the nose leather, the mouth, the tongue and the inside
 * of the ears. Which pattern a dog has is the same for all its pixels, so
 * each dog pays only for its own.
 */

interface DogCoat extends CoatValues {
  eu: Color;
  merleGround: Color;
  ph: Color;
  whiteColour: Color;
  eyeLeft: Color;
  eyeRight: Color;
  nose: Color;
  innerEar: Color;
  tongue: Color;
  mouth: Color;
  pattern: number;
  brindle: number;
  mask: number;
  merle: number;
  white: number;
  shading: number;
  length: number;
  ears: number;
  marks: Vector3;
}

const input = coatInputs<DogCoat>();
const u = {
  eu: input.colour("eu"),
  merleGround: input.colour("merleGround"),
  ph: input.colour("ph"),
  white: input.colour("whiteColour"),
  eyeLeft: input.colour("eyeLeft"),
  eyeRight: input.colour("eyeRight"),
  nose: input.colour("nose"),
  innerEar: input.colour("innerEar"),
  tongue: input.colour("tongue"),
  mouth: input.colour("mouth"),
  pattern: input.float("pattern"),
  brindle: input.float("brindle"),
  mask: input.float("mask"),
  merle: input.float("merle"),
  whiteness: input.float("white"),
  shading: input.float("shading"),
  length: input.float("length"),
  ears: input.float("ears"),
  marks: input.vec("marks"),
};

const HIP_Z = HIP[2];
const SHOULDER_Z = SHOULDER[2];
const EAR_Y = EAR[1];

/** A soft band: 1 inside a stripe, 0 between. */
function band(s: Node<"float">, width: number): Node<"float"> {
  const edge = u.length.mul(0.1).add(0.14);
  return smoothstep(edge.add(width), edge.negate().add(width), abs(fract(s).sub(0.5)).mul(2));
}

interface Where {
  p: Node<"vec3">;
  q: Node<"vec3">;
  head: Node<"bool">;
  tail: Node<"bool">;
  leg: Node<"float">;
  along: Node<"float">;
  /** How near the top line a point on the body lies: 0 underneath, 1 along the back. */
  top: Node<"float">;
  /** Fine streaks along the hair, for shading that reads as fur rather than paint. */
  streaks: Node<"float">;
}

function where(coat: Coat): Where {
  const { p, head } = coat;
  const tail = head.not().and(p.z.lessThan(TAIL_ROOT[2] - 0.018)).and(p.y.greaterThan(0.205)).toVar();
  return {
    p,
    q: p.sub(vec3(...SKULL)).toVar(),
    head,
    tail,
    leg: select(head.or(tail), float(0), smoothstep(0.165, 0.05, p.y)).toVar(),
    along: clamp(float(TAIL_ROOT[2]).sub(p.z).div(0.25), 0, 1).toVar(),
    top: smoothstep(0.215, 0.3, p.y.sub(abs(p.x).mul(0.35))),
    streaks: noise3(p.mul(vec3(150, 38, 70)).add(u.marks)).toVar(),
  };
}

const tailTop = (p: Node<"vec3">, below: number, above: number) => smoothstep(TAIL_ROOT[1] + below, TAIL_ROOT[1] + above, p.y);

/** A sable: red with the hair tips dark along the back, over the head and ears and down the tail. */
function sable({ p, q, head, tail, leg, along, top, streaks }: Where): Node<"float"> {
  const tips = streaks.mul(0.5).add(0.5);
  const cap = smoothstep(0, 0.04, q.y.add(0.01)).mul(smoothstep(0.05, 0, q.z));
  const ears = smoothstep(EAR_Y - 0.005, EAR_Y + 0.04, p.y);
  const bridge = smoothstep(0.004, 0.014, q.y.add(0.004)).mul(smoothstep(0.03, 0.06, q.z)).mul(0.6);
  const onHead = max(max(cap.mul(0.7), ears), bridge).mul(tips);
  const onTail = tailTop(p, -0.01, 0.02).mul(0.7).add(smoothstep(0.8, 0.95, along));
  return select(head, onHead, select(tail, onTail, top.mul(tips).mul(float(1).sub(leg)))).mul(u.shading);
}

/** A wolf grey: banded hair, darkest in a saddle and cape over the back and shoulders and on the tail, pale on the legs, belly and cheeks, with a dark muzzle and ear tips. */
function wolfGrey({ p, q, head, tail, leg, along, streaks }: Where): Node<"float"> {
  const tips = streaks.mul(0.4).add(0.6);
  const muzzle = smoothstep(0.035, 0.07, q.z).mul(smoothstep(-0.03, 0, q.y)).mul(0.75);
  const cap = smoothstep(0, 0.035, q.y).mul(0.45);
  const ears = smoothstep(EAR_Y + 0.01, EAR_Y + 0.05, p.y);
  const cape = smoothstep(0.24, 0.31, p.y.add(sin(p.z.mul(40)).mul(0.02))).mul(0.85);
  return select(head, max(max(muzzle, cap), ears).mul(tips), select(tail, tailTop(p, -0.01, 0.02).mul(0.75).add(smoothstep(0.85, 0.95, along)), cape.mul(tips).mul(float(1).sub(leg))));
}

/** Black and tan: dark all over but the pips above the eyes, the cheeks and muzzle beneath, the throat and the forechest, the lower legs and under the tail. */
function tanPoints({ p, q, head, tail, leg, along }: Where): Node<"float"> {
  const pips = smoothstep(0.0095, 0.006, length(vec3(abs(q.x).sub(0.021), q.y.sub(0.021), q.z.sub(0.042).mul(0.5))));
  const lower = smoothstep(-0.006, -0.016, q.y.add(max(float(0.03).sub(q.z), 0).mul(0.25))).mul(smoothstep(-0.01, 0.02, q.z));
  const cheeks = smoothstep(0.022, 0.04, abs(q.x)).mul(smoothstep(-0.004, -0.02, q.y)).mul(smoothstep(-0.01, 0.01, q.z));
  const onTail = tailTop(p, -0.01, -0.025).mul(smoothstep(0.4, 0.1, along));
  const chest = smoothstep(SHOULDER_Z + 0.015, SHOULDER_Z + 0.04, p.z).mul(smoothstep(0.255, 0.215, p.y));
  const throat = smoothstep(0.17, 0.2, p.z).mul(smoothstep(0.3, 0.27, p.y)).mul(step(0.25, p.y));
  const legs = smoothstep(0.35, 0.6, leg);
  const vent = smoothstep(HIP_Z - 0.03, HIP_Z - 0.07, p.z).mul(smoothstep(0.24, 0.2, p.y));
  const tan = select(head, max(pips, max(lower, cheeks)), select(tail, onTail, max(max(chest, throat), max(legs, vent))));
  return float(1).sub(tan);
}

/** A saddle: the dark only over the back, the top of the neck and tail; tan everywhere else. */
function saddle(at: Where): Node<"float"> {
  const { p, q, head, tail, leg } = at;
  const edge = fbm(p.mul(20).add(u.marks)).sub(0.5).mul(0.03);
  const back = smoothstep(0.235, 0.255, p.y.add(edge)).mul(smoothstep(SHOULDER_Z + 0.08, SHOULDER_Z + 0.02, p.z)).mul(float(1).sub(leg));
  return select(head, smoothstep(0.01, 0.04, q.y.sub(q.z.mul(0.4))).mul(0.6).mul(tanPoints(at)), select(tail, tailTop(p, -0.005, 0.02), back));
}

/** Where the eumelanin lies for the dog's pattern, 0 to 1. */
function eumelaninAmount(at: Where): Node<"float"> {
  const eu = float(1).toVar();
  const pattern = u.pattern;
  If(pattern.greaterThan(0.5), () => {
    If(pattern.lessThan(1.5), () => {
      eu.assign(0);
    })
      .ElseIf(pattern.lessThan(2.5), () => {
        eu.assign(sable(at));
      })
      .ElseIf(pattern.lessThan(3.5), () => {
        eu.assign(wolfGrey(at));
      })
      .ElseIf(pattern.lessThan(4.5), () => {
        eu.assign(tanPoints(at));
      })
      .Else(() => {
        eu.assign(saddle(at));
      });
  });
  return eu;
}

/** Thin, broken streaks, not a tiger's stripes: many, uneven, fading in and out along their length. */
function brindle({ p, head, tail, leg, along }: Where): Node<"float"> {
  const warp = fbm(p.mul(14).add(u.marks)).sub(0.5).mul(2.4);
  const lengthwise = select(tail, along.mul(12), select(leg.greaterThan(0.3), p.y.mul(50), p.z.mul(48).add(p.y.mul(6))));
  const streak = band(lengthwise.add(warp), 0.36);
  return streak.mul(smoothstep(0.3, 0.6, noise3(p.mul(vec3(18, 50, 18)).add(u.marks.yzx)))).mul(select(head, float(0.4), float(0.6)));
}

function maskAmount({ p, q, head }: Where): Node<"float"> {
  const muzzle = smoothstep(0.022, 0.045, q.z);
  const eyes = smoothstep(0.016, 0.006, length(vec2(abs(q.x).sub(0.021), q.y.sub(0.006)))).mul(step(0.02, q.z));
  const ears = smoothstep(EAR_Y + 0.015, EAR_Y + 0.045, p.y);
  return select(head, max(max(muzzle, eyes), ears), float(0));
}

/**
 * How readily a point turns white as white spotting grows: a star on the
 * chest and the toes first, then the belly, the muzzle and the tail's tip,
 * the legs, a blaze and a collar round the neck, the sides, and last of all
 * the head's cap, the ears and the root of the tail.
 */
function whitePotential({ p, q, head, tail, leg, along }: Where): Node<"float"> {
  const muzzle = float(0.78).sub(length(q.sub(vec3(0, -0.03, 0.09)).mul(vec3(1, 1.3, 0.6))).mul(12));
  const blaze = float(0.6).sub(abs(q.x).mul(40)).sub(max(q.y.sub(0.01), 0).mul(4));
  const chin = float(0.72).sub(max(q.y.add(0.03), 0).mul(25));
  const ear = select(p.y.greaterThan(EAR_Y - 0.004), float(-0.45), float(0));
  const face = max(max(muzzle, blaze.mul(step(0.025, q.z))), chin).add(ear);
  const onTail = select(along.greaterThan(0.84), float(0.8), along.oneMinus().mul(-0.1).sub(0.2));
  const star = float(1).sub(length(vec2(p.x.mul(1.6), p.y.sub(0.2))).mul(9)).mul(smoothstep(SHOULDER_Z + 0.01, SHOULDER_Z + 0.05, p.z));
  const height = clamp(p.y.sub(0.15).div(0.17), 0, 1);
  const collar = smoothstep(0.17, 0.19, p.z).mul(0.62).mul(step(0.23, p.y));
  const body = max(max(float(0.9).sub(height.mul(1.1)).sub(abs(p.x).mul(4)), collar), star);
  const limbs = float(0.98).sub(smoothstep(0, 0.03, p.y).mul(0.12)).sub(p.y.mul(2));
  return select(head, face, select(tail, onTail, mix(body, limbs, leg)));
}

function whiteAmount(at: Where): Node<"float"> {
  const { p } = at;
  const amount = float(0).toVar();
  If(u.whiteness.greaterThan(0), () => {
    const threshold = float(1).sub(u.whiteness.mul(1.1));
    // Ragged edges, more so as the white spreads.
    const ragged = fbm(p.mul(7).add(u.marks.zyx)).sub(0.5).mul(0.55).add(noise3(p.mul(34).add(u.marks)).sub(0.5).mul(0.1));
    const edge = ragged.mul(mix(0.25, 1, smoothstep(0.05, 0.4, u.whiteness)));
    amount.assign(smoothstep(threshold.sub(0.012), threshold.add(0.012), whitePotential(at).add(edge)));
  });
  return amount;
}

function fur(coat: Coat): Node<"vec3"> {
  const at = where(coat);
  const { p, head, leg, streaks } = at;
  const underside = select(head, smoothstep(-0.015, -0.035, p.y.sub(SKULL[1])), smoothstep(0.21, 0.16, p.y).mul(float(1).sub(leg.mul(0.5))));
  // A wolf grey's light hair is pale, banded; a red coat pales underneath.
  const wolf = u.pattern.greaterThan(2.5).and(u.pattern.lessThan(3.5));
  const light = select(wolf, mix(u.ph, u.white, 0.45), u.ph);
  const ph = mix(light, mix(light, u.white, 0.5), underside.mul(0.5));
  const eu = eumelaninAmount(at).toVar();
  If(u.brindle.greaterThan(0.5), () => {
    eu.assign(max(eu, brindle(at).mul(0.85)));
  });
  If(u.mask.greaterThan(0.5), () => {
    eu.assign(max(eu, maskAmount(at)));
  });
  const dark = u.eu.toVar();
  If(u.merle.greaterThan(0.5), () => {
    const torn = fbm(p.mul(13).add(u.marks.mul(1.3))).add(noise3(p.mul(70).add(u.marks)).sub(0.5).mul(0.18));
    dark.assign(mix(u.merleGround, u.eu, smoothstep(0.56, 0.6, torn)));
  });
  const grain = streaks.sub(0.5).mul(u.length.mul(0.05).add(0.07)).add(1);
  return mix(mix(ph, dark, clamp(eu, 0, 1)).mul(grain), u.white, whiteAmount(at));
}

/** The face, painted on the head but not the tongue. */
function face(coat: Coat, colour: Node<"vec3">, glint: Node<"float">): void {
  If(coat.part.lessThan(1.5), () => paintFace(coat, colour, glint));
}

function paintFace(coat: Coat, colour: Node<"vec3">, glint: Node<"float">): void {
  const { p } = coat;
  const q = p.sub(vec3(...SKULL));
  // Only a pricked or folded ear stands up to show its cup.
  If(u.ears.lessThan(1.5), () => {
    colour.assign(mix(colour, mix(u.innerEar, colour, u.length.mul(0.15).add(0.25)), earCup(coat, EAR, PRICK_EAR)));
  });
  // The mouth: where the lips meet, curving up at its corner; opened, the jaw stretches it into the mouth's dark.
  const corner = smoothstep(0.075, 0.04, q.z);
  const mouth = smoothstep(0.0032, 0.0012, abs(p.y.sub(MOUTH_Y).sub(corner.mul(0.006)))).mul(step(0.035, q.z)).mul(step(abs(q.x), 0.03));
  colour.assign(mix(colour, u.mouth, mouth));
  // The nose leather, with its nostrils, and the line from it down to the mouth.
  const n = length(p.sub(vec3(...NOSE)).div(vec3(...NOSE_RADII)));
  const nose = smoothstep(1.22, 1.08, n);
  const nostrils = smoothstep(0.0032, 0.0018, length(vec2(abs(p.x.sub(NOSE[0])).sub(0.0055), p.y.sub(NOSE[1] - 0.0015).mul(1.4)))).mul(step(NOSE[2] + 0.004, p.z));
  const philtrum = smoothstep(0.0012, 0.0005, abs(q.x))
    .mul(step(MOUTH_Y, p.y))
    .mul(step(p.y, NOSE[1] - NOSE_RADII[1] * 0.8))
    .mul(step(NOSE[2] - 0.01, p.z));
  colour.assign(mix(colour, u.nose, max(nose, philtrum.mul(0.8))));
  colour.assign(mix(colour, coat.pupil, nostrils));
  // A wet nose catches the light.
  const shine = smoothstep(0.004, 0.0015, length(p.sub(vec3(NOSE[0], NOSE[1] + NOSE_RADII[1] * 0.7, NOSE[2] + NOSE_RADII[2] * 0.5)))).mul(nose);
  glint.assign(max(glint, shine.mul(0.5)));
  // The eyes: smaller than a cat's, with a round pupil and a dark iris.
  for (const [side, iris] of [
    [1, u.eyeLeft],
    [-1, u.eyeRight],
  ] as const) {
    const centre = [SKULL[0] + 0.0205 * side, SKULL[1] + 0.0065, SKULL[2] + 0.0465] as const;
    paintEye(colour, glint, paintedEye(coat, { centre, forward: [0.36 * side, 0.08, 0.93], radius: 0.0098, pupil: [0.8, 0.8], open: 0.88, side }, iris));
  }
}

/** The tongue, its own part of the sculpture: pink, with a groove down its middle. */
function furOrTongue(coat: Coat): Node<"vec3"> {
  return select(coat.part.greaterThan(1.5), u.tongue.mul(float(1).sub(smoothstep(0.0025, 0, abs(coat.p.x)).mul(0.25))), fur(coat));
}

const DOG_COAT: CoatPattern = { name: "hearthwood-dog-coat", fur: furOrTongue, face, sheen: u.length.mul(0.08).add(0.26) };

/** A dog's coat material: every dog shares one compiled pipeline, each with its own values. */
export function dogCoatMaterial(look: DogCoatLook, atmosphere: AtmosphereUniforms) {
  const c = look.colours;
  return coatMaterial<DogCoat>(
    DOG_COAT,
    {
      blink: 0,
      pupil: themeColor(c.pupil),
      glint: themeColor(c.glint),
      eu: themeColor(c.eumelanin),
      merleGround: themeColor(c.merle),
      ph: themeColor(c.phaeomelanin),
      whiteColour: themeColor(c.white),
      eyeLeft: themeColor(c.eyeLeft),
      eyeRight: themeColor(c.eyeRight),
      nose: themeColor(c.nose),
      innerEar: themeColor(c.innerEar),
      tongue: themeColor(c.tongue),
      mouth: themeColor(c.mouth),
      pattern: look.pattern,
      brindle: look.brindle,
      mask: look.mask,
      merle: look.merle,
      white: look.white,
      shading: look.shading,
      length: look.length,
      ears: look.ears,
      marks: new Vector3(...look.marks),
    },
    atmosphere,
  );
}
