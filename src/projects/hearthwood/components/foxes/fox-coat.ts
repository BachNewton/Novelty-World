import { Vector3, type Color } from "three";
import { abs, clamp, float, If, length, max, mix, select, smoothstep, step, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { FoxCoatLook } from "../../foxes/coat-look";
import { EAR, EAR_SHAPE, HIP, MOUTH_Y, NOSE, NOSE_RADII, SHOULDER, SKULL, TAIL_ROOT } from "../../foxes/rig";
import { coatInputs, coatMaterial, earCup, fbm, noise3, paintedEye, paintEye, type Coat, type CoatPattern, type CoatValues } from "../animals/coat-material";

/*
 * A fox's coat, on the shared coat (`../animals/coat-material.ts`): the red
 * (paler on the flanks, deepest along the back, grizzled on the brush), the
 * white of the throat, chest and lips spreading down the belly, the dark
 * socks, the black backs of the ears and the white tip of the tail; a cross
 * fox's dark cross over the shoulders, legs and belly; a silver fox's black
 * frosted with silver. Then the face: amber eyes with a slit pupil, the dark
 * mark from eye to muzzle, the black nose, the mouth, the tongue and the
 * cream inside of the ears.
 */

interface FoxCoat extends CoatValues {
  red: Color;
  ginger: Color;
  whiteColour: Color;
  dark: Color;
  frost: Color;
  eye: Color;
  nose: Color;
  innerEar: Color;
  tongue: Color;
  mouth: Color;
  phase: number;
  depth: number;
  bib: number;
  socks: number;
  marks: Vector3;
}

const input = coatInputs<FoxCoat>();
const u = {
  red: input.colour("red"),
  ginger: input.colour("ginger"),
  white: input.colour("whiteColour"),
  dark: input.colour("dark"),
  frost: input.colour("frost"),
  eye: input.colour("eye"),
  nose: input.colour("nose"),
  innerEar: input.colour("innerEar"),
  tongue: input.colour("tongue"),
  mouth: input.colour("mouth"),
  phase: input.float("phase"),
  depth: input.float("depth"),
  bib: input.float("bib"),
  socks: input.float("socks"),
  marks: input.vec("marks"),
};

const HIP_Z = HIP[2];
const SHOULDER_Z = SHOULDER[2];

interface Where {
  p: Node<"vec3">;
  q: Node<"vec3">;
  head: Node<"bool">;
  tail: Node<"bool">;
  leg: Node<"float">;
  along: Node<"float">;
  streaks: Node<"float">;
  /** A cross fox or a silver one. */
  cross: Node<"bool">;
}

function where(coat: Coat): Where {
  const { p, head } = coat;
  const tail = head.not().and(p.z.lessThan(TAIL_ROOT[2] - 0.015)).and(p.y.greaterThan(0.19)).toVar();
  return {
    p,
    q: p.sub(vec3(...SKULL)).toVar(),
    head,
    tail,
    leg: select(head.or(tail), float(0), smoothstep(0.17, 0.05, p.y)).toVar(),
    along: clamp(float(TAIL_ROOT[2]).sub(p.z).div(0.3), 0, 1).toVar(),
    streaks: noise3(p.mul(vec3(150, 40, 70)).add(u.marks)).toVar(),
    cross: u.phase.greaterThan(0.5),
  };
}

/** How white a point is: the throat and chest, down the belly as far as the bib reaches, the lips, chin and cheeks, the tail's tip. */
function whiteAmount({ p, q, head, tail, leg, along }: Where): Node<"float"> {
  const edge = fbm(p.mul(18).add(u.marks)).sub(0.5).mul(0.02);
  const chin = smoothstep(MOUTH_Y + 0.002, MOUTH_Y - 0.004, p.y.add(edge.mul(0.3)));
  const lip = smoothstep(MOUTH_Y + 0.008, MOUTH_Y + 0.003, p.y.sub(max(float(0.06).sub(q.z), 0).mul(0.12)))
    .mul(smoothstep(0.004, 0.01, abs(q.x)))
    .mul(step(0.02, q.z));
  const cheek = smoothstep(-0.008, -0.022, q.y.add(edge)).mul(smoothstep(0.018, 0.03, abs(q.x))).mul(smoothstep(-0.03, 0, q.z));
  const throat = smoothstep(SHOULDER_Z - 0.01, SHOULDER_Z + 0.03, p.z.add(edge)).mul(smoothstep(0.27, 0.22, p.y.add(abs(p.x).mul(0.5))));
  // The bib's white runs back under the belly between the legs.
  const under = smoothstep(0.19, 0.16, p.y.add(abs(p.x).mul(0.4)).add(edge)).mul(smoothstep(HIP_Z + 0.02, float(1).sub(u.bib).mul(0.14).add(HIP_Z + 0.1), p.z));
  const body = max(throat, under.mul(u.bib)).mul(float(1).sub(leg));
  return select(head, max(max(chin, lip), cheek), select(tail, smoothstep(0.86, 0.9, along.add(edge)), body));
}

/** How dark a point is: the socks up the legs, the backs of the ears, and a cross fox's cross over the shoulders and down the back. */
function darkAmount(coat: Coat, { p, q, head, tail, leg, along, streaks, cross }: Where): Node<"float"> {
  const edge = fbm(p.mul(14).add(u.marks.zyx)).sub(0.5).mul(0.04);
  const dark = float(0).toVar();
  If(head, () => {
    const inner = earCup(coat, EAR, EAR_SHAPE);
    const ears = smoothstep(EAR[1] + 0.008, EAR[1] + 0.03, p.y).mul(float(1).sub(inner));
    // The dark tear line from the eye's front corner down the side of the muzzle.
    const tear = smoothstep(0.006, 0.002, abs(q.y.add(0.004).add(q.z.sub(0.045).mul(0.35))))
      .mul(smoothstep(0.004, 0.012, abs(q.x)))
      .mul(smoothstep(0.04, 0.05, q.z))
      .mul(smoothstep(0.08, 0.06, q.z));
    const crossFace = select(cross, smoothstep(0.03, 0.07, q.z).mul(0.6).mul(smoothstep(-0.01, 0.01, q.y)), float(0));
    dark.assign(max(max(ears, tear.mul(0.75)), crossFace));
  })
    .ElseIf(tail, () => {
      // A few dark guard hairs along the top of the brush, and a darker band before its white tip.
      const guard = smoothstep(TAIL_ROOT[1], TAIL_ROOT[1] + 0.03, p.y).mul(0.25).mul(streaks);
      const ring = smoothstep(0.7, 0.82, along).mul(smoothstep(0.9, 0.84, along)).mul(0.35);
      dark.assign(max(guard, ring).add(select(cross, float(0.35), float(0))));
    })
    .Else(() => {
      const socks = smoothstep(float(1).sub(u.socks.mul(0.85)), float(1.05).sub(u.socks.mul(0.85)), leg.add(edge));
      // Darker down the front of the forelegs, as a fox's legs are.
      const front = smoothstep(0.3, 0.6, leg).mul(step(SHOULDER_Z - 0.05, p.z)).mul(step(0, p.z.sub(SHOULDER_Z - 0.025))).mul(0.6);
      dark.assign(max(socks, front));
      If(cross, () => {
        const spine = smoothstep(0.03, 0.01, abs(p.x).add(edge.mul(0.5))).mul(smoothstep(0.25, 0.29, p.y));
        const shoulders = smoothstep(0.035, 0.015, abs(p.z.sub(SHOULDER_Z - 0.01)).add(edge)).mul(smoothstep(0.2, 0.26, p.y));
        const belly = smoothstep(0.2, 0.15, p.y).mul(0.8);
        dark.assign(max(dark, max(max(spine, shoulders), max(belly, smoothstep(0.1, 0.5, leg)))));
      });
    });
  return dark;
}

function fur(coat: Coat): Node<"vec3"> {
  const at = where(coat);
  const { p, head, tail, leg, streaks } = at;
  const underside = select(head, float(0), smoothstep(0.24, 0.18, p.y).mul(float(1).sub(leg.mul(0.5))));
  const top = select(head, smoothstep(0, 0.03, p.y.sub(SKULL[1])), smoothstep(0.25, 0.3, p.y.sub(abs(p.x).mul(0.3))));
  const paler = mix(mix(u.ginger, u.red, u.depth), mix(u.ginger, u.white, 0.25), underside.mul(0.6));
  const red = mix(paler, paler.mul(0.82), top.mul(0.7));
  // The brush is grizzled: its hairs tipped dark and pale.
  const brushed = select(tail, mix(red, mix(red.mul(0.75), u.ginger, streaks), 0.4), red);
  const silver = u.phase.greaterThan(1.5);
  const colour = vec3(0).toVar();
  If(silver, () => {
    // A silver fox: black all over, each guard hair tipped silver, a fine even frosting thickest over the back and haunches.
    const hairs = noise3(p.mul(vec3(420, 160, 260)).add(u.marks)).mul(0.6).add(noise3(p.mul(900).add(u.marks.yzx)).mul(0.4));
    const frost = smoothstep(0.35, 0.9, hairs)
      .mul(select(head, float(0.2), float(0.45)))
      .mul(float(1).sub(leg))
      .mul(select(tail, float(0.6), float(1)));
    colour.assign(mix(u.dark, u.frost, frost.mul(top.mul(0.6).add(0.4))));
  }).Else(() => {
    colour.assign(mix(brushed, u.dark, clamp(darkAmount(coat, at), 0, 1)));
  });
  const grained = colour.mul(streaks.sub(0.5).mul(0.08).add(1));
  const whiteShare = select(silver, select(tail, float(1), float(0.35)), float(1));
  return mix(grained, u.white, whiteAmount(at).mul(whiteShare));
}

function face(coat: Coat, colour: Node<"vec3">, glint: Node<"float">): void {
  If(coat.part.lessThan(1.5), () => {
    const { p } = coat;
    const q = p.sub(vec3(...SKULL));
    colour.assign(mix(colour, mix(u.innerEar, colour, 0.15), earCup(coat, EAR, EAR_SHAPE)));
    const corner = smoothstep(0.07, 0.035, q.z);
    const mouth = smoothstep(0.0028, 0.001, abs(p.y.sub(MOUTH_Y).sub(corner.mul(0.005)))).mul(step(0.03, q.z)).mul(step(abs(q.x), 0.026));
    colour.assign(mix(colour, u.mouth, mouth));
    const nose = smoothstep(1.25, 1.08, length(p.sub(vec3(...NOSE)).div(vec3(...NOSE_RADII))));
    colour.assign(mix(colour, u.nose, nose));
    const shine = smoothstep(0.003, 0.001, length(p.sub(vec3(NOSE[0], NOSE[1] + NOSE_RADII[1] * 0.7, NOSE[2] + NOSE_RADII[2] * 0.5)))).mul(nose);
    glint.assign(max(glint, shine.mul(0.5)));
    // The eyes: almond, amber, with a fox's upright slit of a pupil.
    for (const side of [1, -1]) {
      const centre = [SKULL[0] + 0.0195 * side, SKULL[1] + 0.005, SKULL[2] + 0.041] as const;
      paintEye(colour, glint, paintedEye(coat, { centre, forward: [0.42 * side, 0.08, 0.9], radius: 0.0088, pupil: [0.28, 0.85], open: 0.72, side }, u.eye));
    }
  });
}

function furOrTongue(coat: Coat): Node<"vec3"> {
  return select(coat.part.greaterThan(1.5), u.tongue.mul(float(1).sub(smoothstep(0.002, 0, abs(coat.p.x)).mul(0.25))), fur(coat));
}

const FOX_COAT: CoatPattern = { name: "hearthwood-fox-coat", fur: furOrTongue, face, sheen: 0.3 };

/** A fox's coat material: every fox shares one compiled pipeline, each with its own values. */
export function foxCoatMaterial(look: FoxCoatLook, atmosphere: AtmosphereUniforms) {
  const c = look.colours;
  return coatMaterial<FoxCoat>(
    FOX_COAT,
    {
      blink: 0,
      pupil: themeColor(c.pupil),
      glint: themeColor(c.glint),
      red: themeColor(c.red),
      ginger: themeColor(c.ginger),
      whiteColour: themeColor(c.white),
      dark: themeColor(c.dark),
      frost: themeColor(c.frost),
      eye: themeColor(c.eye),
      nose: themeColor(c.nose),
      innerEar: themeColor(c.innerEar),
      tongue: themeColor(c.tongue),
      mouth: themeColor(c.mouth),
      phase: look.phase,
      depth: look.depth,
      bib: look.bib,
      socks: look.socks,
      marks: new Vector3(...look.marks),
    },
    atmosphere,
  );
}
