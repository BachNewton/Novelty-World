import { Vector3, type Color } from "three";
import { clamp, float, If, length, max, mix, select, smoothstep, vec2, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { DeerCoatLook } from "../../deer/coat-look";
import { EAR, EAR_SHAPE, HIP, NOSE, SKULL } from "../../deer/rig";
import { ANTLER_PART } from "../../deer/sculpt";
import { coatInputs, coatMaterial, earCup, noise3, paintedEye, paintEye, type Coat, type CoatPattern, type CoatValues } from "../animals/coat-material";
import { COAT_SEASON, heldOr } from "../animals/coat-season";

/*
 * A roe deer's coat, on the shared coat: its summer fox-red, going
 * grey-brown in its winter coat, paler beneath; the rump patch (a small buff
 * one in summer, a big white one in winter); the black nose with the white
 * band round the muzzle under it and the white chin; in winter a white patch
 * on the throat; dark-rimmed big ears; large dark eyes; and on a buck,
 * antlers ridged dark at their bases and pale at the tips.
 */

interface DeerCoat extends CoatValues {
  redColour: Color;
  sandy: Color;
  winterColour: Color;
  whiteColour: Color;
  dark: Color;
  antler: Color;
  eye: Color;
  innerEar: Color;
  red: number;
  /** A winter held of its own, or below 0 to follow the year's. */
  winter: number;
  marks: Vector3;
}

const input = coatInputs<DeerCoat>();
const u = {
  red: input.colour("redColour"),
  sandy: input.colour("sandy"),
  winterColour: input.colour("winterColour"),
  white: input.colour("whiteColour"),
  dark: input.colour("dark"),
  antler: input.colour("antler"),
  eye: input.colour("eye"),
  innerEar: input.colour("innerEar"),
  redness: input.float("red"),
  heldWinter: input.float("winter"),
  marks: input.vec("marks"),
};

const winter = select(u.heldWinter.lessThan(0), COAT_SEASON.uWinter, u.heldWinter);
const HIP_Z = HIP[2];

const isAntler = (coat: Coat) => coat.part.greaterThan(ANTLER_PART - 0.5);

function hide({ p, head }: Coat): Node<"vec3"> {
  const leg = select(head, float(0), smoothstep(0.22, 0.12, p.y));
  const coat = mix(mix(u.sandy, u.red, u.redness), u.winterColour, winter);
  const under = select(head, float(0), smoothstep(0.27, 0.23, p.y).mul(float(1).sub(leg)));
  const paler = mix(coat, mix(coat, u.white, 0.5), under.mul(0.6));
  // The legs are a darker, greyer brown than the body, down to the hooves.
  const legged = mix(paler, mix(u.winterColour, u.dark, 0.25), leg.mul(0.7));
  const colour = legged.mul(noise3(p.mul(vec3(140, 40, 70)).add(u.marks)).mul(0.16).add(0.92)).toVar();
  If(head.not(), () => {
    // The rump patch round the tail: small and buff in summer, big and white in winter.
    const rump = smoothstep(winter.mul(0.03).add(0.045), winter.mul(0.03).add(0.035), length(vec2(p.x.mul(1.4), p.y.sub(0.3)))).mul(smoothstep(HIP_Z - 0.02, HIP_Z - 0.06, p.z));
    colour.assign(mix(colour, mix(mix(u.sandy, u.white, 0.6), u.white, winter), rump));
    // In winter, a white patch on the throat.
    const throat = smoothstep(0.016, 0.008, length(vec2(p.x.mul(1.6), p.y.sub(0.38)))).mul(smoothstep(0.19, 0.205, p.z)).mul(winter);
    colour.assign(mix(colour, u.white, throat.mul(0.9)));
  });
  return colour;
}

/** Ridged and dark at the base, pale at the tines' tips. */
function antler({ p }: Coat): Node<"vec3"> {
  const up = clamp(p.y.sub(SKULL[1] + 0.02).div(0.1), 0, 1);
  return mix(u.antler.mul(0.65), u.antler.mul(1.35), smoothstep(0.55, 1, up)).mul(noise3(p.mul(vec3(60, 600, 60))).mul(0.3).add(0.85));
}

function face(coat: Coat, colour: Node<"vec3">, glint: Node<"float">): void {
  If(isAntler(coat).not(), () => {
    const { p } = coat;
    const q = p.sub(vec3(...SKULL));
    colour.assign(mix(colour, mix(u.innerEar, u.white, 0.4), earCup(coat, EAR, EAR_SHAPE)));
    // The black nose, the white band behind it, and the white chin.
    const fromNose = p.sub(vec3(...NOSE));
    const nose = smoothstep(0.016, 0.011, length(fromNose.mul(vec3(1, 1, 0.8))));
    const band = smoothstep(0.024, 0.018, length(fromNose.mul(vec3(1, 1.1, 0.8)))).mul(float(1).sub(nose));
    const chin = smoothstep(-0.022, -0.03, q.y).mul(smoothstep(0.04, 0.06, q.z));
    colour.assign(mix(mix(colour, u.white, max(band, chin)), u.dark, nose));
    for (const side of [1, -1]) {
      const centre = [SKULL[0] + 0.024 * side, SKULL[1] + 0.008, SKULL[2] + 0.024] as const;
      paintEye(colour, glint, paintedEye(coat, { centre, forward: [0.8 * side, 0.1, 0.55], radius: 0.0095, pupil: [0.8, 0.7], open: 0.8, side }, u.eye));
    }
  });
}

const DEER_COAT: CoatPattern = { name: "hearthwood-deer-coat", fur: (coat) => select(isAntler(coat), antler(coat), hide(coat)), face, sheen: 0.22 };

/** A roe deer's coat material, in the year's coat or one held at a winter of its own. */
export function deerCoatMaterial(look: DeerCoatLook, held: number | undefined, atmosphere: AtmosphereUniforms) {
  const c = look.colours;
  return coatMaterial<DeerCoat>(
    DEER_COAT,
    {
      blink: 0,
      pupil: themeColor(c.dark),
      glint: themeColor(c.glint),
      redColour: themeColor(c.red),
      sandy: themeColor(c.sandy),
      winterColour: themeColor(c.winter),
      whiteColour: themeColor(c.white),
      dark: themeColor(c.dark),
      antler: themeColor(c.antler),
      eye: themeColor(c.eye),
      innerEar: themeColor(c.innerEar),
      red: look.red,
      winter: heldOr(held),
      marks: new Vector3(...look.marks),
    },
    atmosphere,
  );
}
