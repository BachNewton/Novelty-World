import { Vector3, type Color } from "three";
import { abs, attribute, length, max, mix, select, smoothstep, step, vec2, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import { typed } from "../../art/tsl";
import type { HedgehogCoatLook } from "../../hedgehogs/coat-look";
import { NOSE, NOSE_RADII, SKULL } from "../../hedgehogs/rig";
import { coatInputs, coatMaterial, noise3, paintedEye, paintEye, type Coat, type CoatPattern, type CoatValues } from "../animals/coat-material";

/*
 * A hedgehog's coat, on the shared coat: the mantle's spines, each banded
 * dark and pale and tipped cream, drawn as fine streaks raked back along the
 * body over the sculpture's own bristling cones (their tips read paler,
 * their roots darker); the soft brown fur of the face, belly and legs, a
 * darker mask round the eyes, beady black eyes and a shining nose.
 */

interface HedgehogCoat extends CoatValues {
  band: Color;
  tip: Color;
  fur: Color;
  furPale: Color;
  mask: Color;
  nose: Color;
  eye: Color;
  darkness: number;
  tips: number;
  face: number;
  marks: Vector3;
}

const input = coatInputs<HedgehogCoat>();
const u = {
  band: input.colour("band"),
  tip: input.colour("tip"),
  fur: input.colour("fur"),
  furPale: input.colour("furPale"),
  mask: input.colour("mask"),
  nose: input.colour("nose"),
  eye: input.colour("eye"),
  darkness: input.float("darkness"),
  tips: input.float("tips"),
  face: input.float("face"),
  marks: input.vec("marks"),
};

const occlusion = typed<"float">(attribute("aOcclusion", "float"));

/** How much a point lies on the mantle of spines rather than the fur. */
function spineAmount({ p, head }: Coat): Node<"float"> {
  const onHead = smoothstep(0.016, 0.026, p.y.sub(SKULL[1])).mul(smoothstep(0.075, 0.065, p.z)).mul(0.9);
  return select(head, onHead, smoothstep(0.047, 0.054, p.y).mul(smoothstep(0.078, 0.06, p.z)));
}

/** Fine streaks raked back along the body, each a spine banded dark, pale and dark again, tipped cream. */
function spines({ p }: Coat): Node<"vec3"> {
  const along = noise3(p.mul(vec3(700, 700, 110)).add(u.marks));
  const banded = noise3(p.mul(vec3(450, 450, 70)).add(u.marks.yzx));
  const dark = u.band.mul(mix(1.45, 0.7, u.darkness));
  // Mostly the spines' dark bands, with their pale middles showing through in streaks.
  const striped = mix(dark, mix(dark, u.tip, 0.55), smoothstep(0.45, 0.75, banded).mul(mix(0.5, 1, u.tips)));
  // A scatter of cream tips over it all, thicker where the spines stand out.
  const tipped = mix(striped, u.tip, smoothstep(0.62, 0.8, along).mul(mix(0.45, 0.9, u.tips)));
  return tipped.mul(mix(0.7, 1.1, occlusion));
}

function fur(coat: Coat): Node<"vec3"> {
  const { p, head } = coat;
  const soft = mix(u.fur, u.furPale, u.face.mul(0.8)).mul(noise3(p.mul(vec3(200, 80, 120)).add(u.marks)).sub(0.5).mul(0.18).add(1));
  // The legs and feet darker, the belly palest.
  const furred = select(head, soft, mix(soft, u.fur.mul(0.6), smoothstep(0.03, 0.01, p.y)));
  const spined = spineAmount(coat);
  return mix(furred, spines(coat), spined);
}

function face(coat: Coat, colour: Node<"vec3">, glint: Node<"float">): void {
  const { p } = coat;
  const q = p.sub(vec3(...SKULL));
  // The dark mask over the eyes and down the snout's sides.
  const mask = smoothstep(0.014, 0.006, length(vec2(abs(q.x).sub(0.014), q.y.sub(0.004)))).mul(step(0.012, q.z));
  const snout = smoothstep(0.03, 0.06, q.z).mul(smoothstep(0.004, 0.012, abs(q.x).add(0.004))).mul(0.5);
  colour.assign(mix(colour, u.mask, max(mask, snout).mul(0.85)));
  const nose = smoothstep(1.25, 1.05, length(p.sub(vec3(...NOSE)).div(vec3(...NOSE_RADII))));
  colour.assign(mix(colour, u.nose, nose));
  const shine = smoothstep(0.0025, 0.0008, length(p.sub(vec3(NOSE[0], NOSE[1] + NOSE_RADII[1] * 0.6, NOSE[2] + NOSE_RADII[2] * 0.6)))).mul(nose);
  glint.assign(max(glint, shine.mul(0.6)));
  for (const side of [1, -1]) {
    const centre = [SKULL[0] + 0.0165 * side, SKULL[1] + 0.006, SKULL[2] + 0.022] as const;
    paintEye(colour, glint, paintedEye(coat, { centre, forward: [0.62 * side, 0.15, 0.78], radius: 0.0046, pupil: [0.95, 0.95], open: 0.95, side }, u.eye));
  }
}

const HEDGEHOG_COAT: CoatPattern = { name: "hearthwood-hedgehog-coat", fur, face, sheen: 0.18 };

/** A hedgehog's coat material: every hedgehog shares one compiled pipeline, each with its own values. */
export function hedgehogCoatMaterial(look: HedgehogCoatLook, atmosphere: AtmosphereUniforms) {
  const c = look.colours;
  return coatMaterial<HedgehogCoat>(
    HEDGEHOG_COAT,
    {
      blink: 0,
      pupil: themeColor(c.nose),
      glint: themeColor(c.glint),
      band: themeColor(c.band),
      tip: themeColor(c.tip),
      fur: themeColor(c.fur),
      furPale: themeColor(c.furPale),
      mask: themeColor(c.mask),
      nose: themeColor(c.nose),
      eye: themeColor(c.eye),
      darkness: look.darkness,
      tips: look.tips,
      face: look.face,
      marks: new Vector3(...look.marks),
    },
    atmosphere,
  );
}
