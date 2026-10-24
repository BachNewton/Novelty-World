import { Vector3, type Color } from "three";
import { abs, clamp, float, length, mix, select, smoothstep, step, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { HareCoatLook } from "../../hares/coat-look";
import { EAR, EAR_SHAPE, NOSE, SKULL, TAIL_ROOT } from "../../hares/rig";
import { coatInputs, coatMaterial, earCup, fbm, noise3, paintedEye, paintEye, type Coat, type CoatPattern, type CoatValues } from "../animals/coat-material";
import { COAT_SEASON, heldOr } from "../animals/coat-season";

/*
 * A mountain hare's coat, on the shared coat: its summer grey-brown,
 * grizzled, paler down the flanks and white beneath; turning white with the
 * season, patchily, from the feet and belly up to the back and head last,
 * as a real hare moults; and all year the black tips of its ears and its
 * white scut. Big amber eyes, set at the sides of the head.
 */

interface HareCoat extends CoatValues {
  brown: Color;
  grey: Color;
  whiteColour: Color;
  tips: Color;
  eye: Color;
  nose: Color;
  innerEar: Color;
  warmth: number;
  /** How white it is held, or below 0 to follow the year's. */
  white: number;
  marks: Vector3;
}

const input = coatInputs<HareCoat>();
const u = {
  brown: input.colour("brown"),
  grey: input.colour("grey"),
  white: input.colour("whiteColour"),
  tips: input.colour("tips"),
  eye: input.colour("eye"),
  nose: input.colour("nose"),
  innerEar: input.colour("innerEar"),
  warmth: input.float("warmth"),
  heldWhite: input.float("white"),
  marks: input.vec("marks"),
};

const whiteness = select(u.heldWhite.lessThan(0), COAT_SEASON.uWhite, u.heldWhite);

function fur({ p, head }: Coat): Node<"vec3"> {
  const tail = head.not().and(p.z.lessThan(TAIL_ROOT[2] + 0.01)).and(p.y.greaterThan(0.1));
  const streaks = noise3(p.mul(vec3(300, 110, 180)).add(u.marks));
  const summer = mix(u.grey, u.brown, u.warmth);
  const pale = select(head, float(0), smoothstep(0.12, 0.08, p.y.add(abs(p.x).mul(0.3))));
  const grizzled = mix(summer, mix(summer, u.white, 0.55), pale).mul(streaks.mul(0.3).add(0.85));
  const belly = select(
    head,
    smoothstep(-0.012, -0.024, p.y.sub(SKULL[1])).mul(step(SKULL[2], p.z)),
    smoothstep(0.08, 0.055, p.y.add(abs(p.x).mul(0.5))).mul(smoothstep(-0.14, -0.08, p.z)),
  );
  const coat = mix(grizzled, u.white, select(tail, float(1), belly));
  // How readily a point turns white: the feet and belly first, then the flanks, the back and the head last.
  const readiness = select(head, smoothstep(0, -0.03, p.y.sub(SKULL[1])).mul(0.3).add(0.25), float(1).sub(clamp(p.y.sub(0.03).div(0.15), 0, 1).mul(0.8)));
  const moult = fbm(p.mul(45).add(u.marks)).sub(0.5).mul(0.5);
  const white = smoothstep(0, 0.08, whiteness.mul(1.3).sub(float(1).sub(readiness)).add(moult));
  return mix(coat, u.white.mul(streaks.mul(0.06).add(0.96)), clamp(white, 0, 1).mul(step(0.001, whiteness)));
}

function face(coat: Coat, colour: Node<"vec3">, glint: Node<"float">): void {
  const { p } = coat;
  colour.assign(mix(colour, mix(u.innerEar, colour, 0.45), earCup(coat, EAR, EAR_SHAPE).mul(0.8)));
  // The black tips of the ears, summer and winter.
  colour.assign(mix(colour, u.tips, smoothstep(EAR[1] + EAR_SHAPE.height * 0.66, EAR[1] + EAR_SHAPE.height * 0.74, p.y)));
  colour.assign(mix(colour, u.nose, smoothstep(0.0075, 0.005, length(p.sub(vec3(...NOSE)).mul(vec3(1, 1.3, 1)))).mul(0.8)));
  for (const side of [1, -1]) {
    const centre = [SKULL[0] + 0.026 * side, SKULL[1] + 0.008, SKULL[2] + 0.018] as const;
    paintEye(colour, glint, paintedEye(coat, { centre, forward: [0.9 * side, 0.1, 0.42], radius: 0.0085, pupil: [0.62, 0.62], open: 0.85, side }, u.eye));
  }
}

const HARE_COAT: CoatPattern = { name: "hearthwood-hare-coat", fur, face, sheen: 0.3 };

/** A mountain hare's coat material, as white as the year has turned it or held at a whiteness of its own. */
export function hareCoatMaterial(look: HareCoatLook, held: number | undefined, atmosphere: AtmosphereUniforms) {
  const c = look.colours;
  return coatMaterial<HareCoat>(
    HARE_COAT,
    {
      blink: 0,
      pupil: themeColor(c.tips),
      glint: themeColor(c.glint),
      brown: themeColor(c.brown),
      grey: themeColor(c.grey),
      whiteColour: themeColor(c.white),
      tips: themeColor(c.tips),
      eye: themeColor(c.eye),
      nose: themeColor(c.nose),
      innerEar: themeColor(c.innerEar),
      warmth: look.warmth,
      white: heldOr(held),
      marks: new Vector3(...look.marks),
    },
    atmosphere,
  );
}
