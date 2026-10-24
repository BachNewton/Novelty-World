import { Vector3, type Color } from "three";
import { abs, float, If, length, max, mix, select, smoothstep, step, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { SquirrelCoatLook } from "../../squirrels/coat-look";
import { EAR, EAR_SHAPE, NOSE, SKULL, TAIL_ROOT } from "../../squirrels/rig";
import { coatInputs, coatMaterial, earCup, noise3, paintedEye, type Coat, type CoatPattern, type CoatValues } from "../animals/coat-material";
import { COAT_SEASON, heldOr } from "../animals/coat-season";

/*
 * A red squirrel's coat, on the shared coat: its red (brighter or darker by
 * the squirrel, greying over the back and sides in its winter coat), the
 * cream of its belly, chest and chin, a pale ring round its big dark eyes,
 * darker tufted ears, and a tail of grizzled fur.
 */

interface SquirrelCoat extends CoatValues {
  red: Color;
  darkRed: Color;
  winterColour: Color;
  belly: Color;
  eye: Color;
  nose: Color;
  innerEar: Color;
  darkness: number;
  /** A winter held of its own, or below 0 to follow the year's. */
  winter: number;
  marks: Vector3;
}

const input = coatInputs<SquirrelCoat>();
const u = {
  red: input.colour("red"),
  darkRed: input.colour("darkRed"),
  winterColour: input.colour("winterColour"),
  belly: input.colour("belly"),
  eye: input.colour("eye"),
  nose: input.colour("nose"),
  innerEar: input.colour("innerEar"),
  darkness: input.float("darkness"),
  heldWinter: input.float("winter"),
  marks: input.vec("marks"),
};

const winter = select(u.heldWinter.lessThan(0), COAT_SEASON.uWinter, u.heldWinter);

function fur({ p, head }: Coat): Node<"vec3"> {
  const tail = head.not().and(p.z.lessThan(TAIL_ROOT[2] + 0.004));
  const streaks = noise3(p.mul(vec3(500, 160, 260)).add(u.marks));
  const red = mix(u.red, u.darkRed, u.darkness);
  const top = select(head, smoothstep(-0.005, 0.015, p.y.sub(SKULL[1])), smoothstep(0.065, 0.09, p.y));
  // The winter coat greys over the back and sides; the legs, face and tail keep more red.
  const greying = winter.mul(select(tail, float(0.35), select(head, float(0.45), float(0.75)))).mul(top.mul(0.4).add(0.6));
  const colour = mix(red, u.winterColour, greying).mul(streaks.sub(0.5).mul(select(tail, float(0.35), float(0.12))).add(1));
  const q = p.sub(vec3(...SKULL));
  const chin = smoothstep(-0.006, -0.014, q.y.add(max(float(0.02).sub(q.z), 0).mul(0.2))).mul(step(0, q.z));
  const under = smoothstep(0.058, 0.048, p.y.add(abs(p.x).mul(0.5))).mul(smoothstep(-0.07, -0.03, p.z));
  return mix(colour, u.belly, select(head, chin, select(tail, float(0), under)));
}

function face(coat: Coat, colour: Node<"vec3">, glint: Node<"float">): void {
  const { p } = coat;
  colour.assign(mix(colour, mix(u.innerEar, colour, 0.4), earCup(coat, EAR, EAR_SHAPE)));
  // The tufts are darker than the rest.
  colour.assign(mix(colour, u.darkRed.mul(0.6), smoothstep(EAR[1] + EAR_SHAPE.height * 0.6, EAR[1] + EAR_SHAPE.height + 0.006, p.y)));
  colour.assign(mix(colour, u.nose, smoothstep(0.0055, 0.0035, length(p.sub(vec3(...NOSE))))));
  // Each eye a dark iris in a pale ring.
  for (const side of [1, -1]) {
    const centre = [SKULL[0] + 0.0142 * side, SKULL[1] + 0.004, SKULL[2] + 0.016] as const;
    const forward = [0.75 * side, 0.1, 0.65] as const;
    const ring = paintedEye(coat, { centre, forward, radius: 0.0068, pupil: [0.95, 0.95], open: 0.9, side }, u.belly);
    const iris = paintedEye(coat, { centre, forward, radius: 0.0052, pupil: [0.92, 0.92], open: 0.9, side }, u.eye);
    If(iris.cover.greaterThan(0), () => {
      colour.assign(mix(colour, iris.colour, iris.cover));
      glint.assign(max(glint, iris.spark));
    }).Else(() => {
      colour.assign(mix(colour, ring.colour, ring.cover.mul(0.8)));
    });
  }
}

const SQUIRREL_COAT: CoatPattern = { name: "hearthwood-squirrel-coat", fur, face, sheen: 0.3 };

/** A red squirrel's coat material, in the year's coat or one held at a winter of its own. */
export function squirrelCoatMaterial(look: SquirrelCoatLook, held: number | undefined, atmosphere: AtmosphereUniforms) {
  const c = look.colours;
  return coatMaterial<SquirrelCoat>(
    SQUIRREL_COAT,
    {
      blink: 0,
      pupil: themeColor(c.eye),
      glint: themeColor(c.glint),
      red: themeColor(c.red),
      darkRed: themeColor(c.dark),
      winterColour: themeColor(c.winter),
      belly: themeColor(c.belly),
      eye: themeColor(c.eye),
      nose: themeColor(c.nose),
      innerEar: themeColor(c.innerEar),
      darkness: look.darkness,
      winter: heldOr(held),
      marks: new Vector3(...look.marks),
    },
    atmosphere,
  );
}
