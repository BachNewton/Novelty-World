import { Vector3, type Color } from "three";
import { abs, clamp, float, floor, fract, If, length, max, mix, select, smoothstep, step, vec2, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { CoatLook } from "../../cats/coat-look";
import { EAR, EAR_SHAPE, HIP, SHOULDER, SKULL, TAIL_ROOT } from "../../cats/rig";
import { coatInputs, coatMaterial, earCup, fbm, noise3, paintedEye, paintEye, type Coat, type CoatPattern, type CoatValues } from "../animals/coat-material";

/*
 * A cat's coat patterns, on the shared coat (`../animals/coat-material.ts`).
 * In order: the pigment (black or orange, with a tortie's patches between
 * them), the tabby pattern the agouti shows, the colourpoint's pale body, the
 * white spotting, and then the face: eyes, nose and the inside of the ears.
 * Branches on the coat's own values (which pattern, whether it is a tortie)
 * are the same for every pixel of a cat, so a cat pays only for the
 * markings it has.
 */

interface CatCoat extends CoatValues {
  eu: Color;
  euGround: Color;
  ph: Color;
  phGround: Color;
  whiteColour: Color;
  pointBody: Color;
  eyeLeft: Color;
  eyeRight: Color;
  nose: Color;
  innerEar: Color;
  orange: number;
  orangeShare: number;
  patchSize: number;
  agouti: number;
  pattern: number;
  white: number;
  pointed: number;
  longHair: number;
  marks: Vector3;
}

const input = coatInputs<CatCoat>();
const u = {
  eu: input.colour("eu"),
  euGround: input.colour("euGround"),
  ph: input.colour("ph"),
  phGround: input.colour("phGround"),
  white: input.colour("whiteColour"),
  pointBody: input.colour("pointBody"),
  eyeLeft: input.colour("eyeLeft"),
  eyeRight: input.colour("eyeRight"),
  nose: input.colour("nose"),
  innerEar: input.colour("innerEar"),
  orange: input.float("orange"),
  orangeShare: input.float("orangeShare"),
  patchSize: input.float("patchSize"),
  agouti: input.float("agouti"),
  pattern: input.float("pattern"),
  whiteness: input.float("white"),
  pointed: input.float("pointed"),
  longHair: input.float("longHair"),
  marks: input.vec("marks"),
};

const HIP_Z = HIP[2];
const SHOULDER_Z = SHOULDER[2];

/** One soft line: 1 within width of zero, softer for long hair. */
function line(s: Node<"float">, width: number): Node<"float"> {
  const edge = u.longHair.mul(0.5).add(0.5).mul(width);
  return smoothstep(edge.add(width), edge.mul(-0.5).add(width), abs(s));
}

/** A soft band: 1 inside a stripe, 0 between, its edge a little blurred (more for long hair). */
function band(s: Node<"float">, width: Node<"float"> | number): Node<"float"> {
  const edge = u.longHair.mul(0.18).add(0.12);
  const w = typeof width === "number" ? float(width) : width;
  return smoothstep(w.add(edge), w.sub(edge), abs(fract(s).sub(0.5)).mul(2));
}

/** Where a point lies on the cat, worked out once for every pattern. */
interface Where {
  p: Node<"vec3">;
  /** From the skull's centre. */
  q: Node<"vec3">;
  head: Node<"bool">;
  tail: Node<"bool">;
  /** How far down a leg: 0 at the body, 1 at the paw. */
  leg: Node<"float">;
  /** How far along the tail, root to tip. */
  along: Node<"float">;
}

function where(coat: Coat): Where {
  const { p, head } = coat;
  const tail = head.not().and(p.z.lessThan(TAIL_ROOT[2] + 0.01)).and(p.y.greaterThan(0.16)).toVar();
  return {
    p,
    q: p.sub(vec3(...SKULL)).toVar(),
    head,
    tail,
    leg: select(head.or(tail), float(0), smoothstep(0.155, 0.02, p.y)).toVar(),
    along: clamp(float(TAIL_ROOT[2]).sub(p.z).div(0.3), 0, 1).toVar(),
  };
}

/** 1 on a tabby's dark markings, 0 on its ground. */
function tabby({ p, q, head, tail, leg, along }: Where): Node<"float"> {
  const marks = u.marks;
  const ticked = u.pattern.greaterThan(2.5);
  const stripe = float(0).toVar();
  const warp = fbm(p.mul(18).add(marks)).sub(0.5).mul(0.9).toVar();
  If(head, () => {
    // The M on the forehead: short stripes up from the brow.
    const forehead = smoothstep(0, 0.02, q.y).mul(smoothstep(0.02, 0.045, q.z)).mul(step(abs(q.x), 0.034));
    const m = band(q.x.div(0.017).add(0.5), 0.42).mul(forehead);
    // The lines running back from the outer corner of each eye over the cheek.
    const cheekLine = line(q.y.add(0.004).add(float(0.04).sub(q.z).mul(0.22)), 0.0035).mul(smoothstep(0.028, 0.045, abs(q.x))).mul(smoothstep(0.05, 0, q.z));
    const lowerLine = line(q.y.add(0.024).add(float(0.03).sub(q.z).mul(0.3)), 0.003).mul(smoothstep(0.035, 0.05, abs(q.x))).mul(smoothstep(0.04, 0, q.z));
    // Stripes over the crown and down the back of the head.
    const crown = band(q.x.div(0.019).add(0.5), 0.36).mul(step(abs(q.x), 0.04)).mul(smoothstep(0.03, 0.05, q.y.add(q.z.mul(0.3)))).mul(smoothstep(0.03, -0.01, q.z));
    stripe.assign(max(max(m, max(cheekLine, lowerLine).mul(0.9)), crown));
  })
    .ElseIf(tail, () => {
      const rings = band(along.mul(7).add(warp.mul(0.2)), select(ticked, float(0.25), float(0.45)));
      stripe.assign(max(rings.mul(select(ticked, float(0.5), float(1))), smoothstep(0.8, 0.86, along)));
    })
    .ElseIf(leg.greaterThan(0), () => {
      const bars = band(p.y.div(0.03).add(warp.mul(0.3)), select(ticked, float(0.3), float(0.45)));
      // A dark sole line up the back of the hind foot.
      const sole = smoothstep(0.06, 0, p.y).mul(smoothstep(HIP_Z - 0.008, HIP_Z - 0.016, p.z)).mul(step(p.z, HIP_Z));
      stripe.assign(max(bars.mul(leg).mul(select(ticked, float(0.45), float(0.9))), sole));
    })
    .Else(() => {
      // The spine: a dark line down the back.
      const top = smoothstep(0.26, 0.29, p.y.sub(abs(p.x).mul(0.4)));
      const classic = u.pattern.greaterThan(0.5).and(u.pattern.lessThan(1.5));
      const spine = top.mul(band(p.x.div(0.05).add(0.5), select(classic, float(0.85), float(0.6))));
      const side = smoothstep(0.13, 0.2, p.y);
      If(u.pattern.lessThan(0.5), () => {
        // Mackerel: thin stripes down the sides, like a fish's bones, broken here and there.
        const stripes = band(p.z.div(0.034).add(warp).add(abs(p.x).mul(2)), 0.3).mul(side).mul(smoothstep(0.25, 0.45, noise3(p.mul(30).add(marks.yzx))));
        stripe.assign(max(spine, stripes));
      })
        .ElseIf(classic, () => {
          // Classic: a bullseye on each flank, a butterfly over the shoulders.
          const flank = vec2(p.y.sub(0.205), p.z.sub((HIP_Z + SHOULDER_Z) * 0.5 - 0.02));
          const bull = band(length(flank.mul(vec2(1.25, 1))).div(0.05).add(warp.mul(0.35)), 0.5).mul(smoothstep(0.03, 0.06, abs(p.x)));
          const wing = vec2(p.y.sub(0.255), p.z.sub(SHOULDER_Z));
          const butterfly = band(length(wing.mul(vec2(1.6, 1))).div(0.04).add(warp.mul(0.3)), 0.5).mul(top);
          stripe.assign(max(max(spine, bull.mul(side)), butterfly));
        })
        .ElseIf(u.pattern.lessThan(2.5), () => {
          // Spotted: the mackerel's stripes broken into round spots in rows, each row offset by half a spot.
          const x = p.z.div(0.036).add(warp.mul(0.6)).add(abs(p.x).mul(2));
          const cell = vec2(x, p.y.div(0.032).add(warp.mul(0.3)).add(floor(x).mul(0.5)));
          const spots = smoothstep(0.34, 0.24, length(fract(cell).sub(0.5)));
          stripe.assign(max(spine.mul(0.8), spots.mul(smoothstep(0.12, 0.17, p.y))));
        })
        .Else(() => {
          // Ticked: no stripes on the body, only the spine's shading.
          stripe.assign(spine.mul(0.5));
        });
    });
  return stripe;
}

/** Where a tortoiseshell's coat is orange, 0 to 1. */
function orangeAmount({ p }: Where): Node<"float"> {
  const amount = select(u.orange.greaterThan(0.75), float(1), float(0)).toVar();
  If(u.orange.greaterThan(0.25).and(u.orange.lessThan(0.75)), () => {
    const field = fbm(p.mul(float(9).div(u.patchSize)).add(u.marks.mul(1.7)));
    // A tortie's patches are brindled, a calico's clean.
    const brindle = noise3(p.mul(140).add(u.marks)).sub(0.5).mul(0.22).div(u.patchSize);
    const threshold = mix(0.62, 0.38, u.orangeShare);
    amount.assign(smoothstep(threshold.sub(0.015), threshold.add(0.015), field.add(brindle)));
  });
  return amount;
}

/** How strongly a point is a colourpoint's point: the mask, ears, legs and tail. */
function pointAmount({ p, q, head, tail, leg, along }: Where): Node<"float"> {
  const mask = smoothstep(0.06, 0.025, length(q.sub(vec3(0, -0.018, 0.06)).mul(vec3(0.9, 1.1, 1))));
  const ears = smoothstep(EAR[1] - 0.003, EAR[1] + 0.02, p.y);
  const body = max(leg.mul(1.2), smoothstep(0.24, 0.3, p.y).mul(0.18));
  return select(head, max(mask, ears), select(tail, smoothstep(0, 0.35, along), body));
}

/**
 * How readily a point turns white as white spotting grows: the chest and
 * belly first, then the chin, paws and legs, the sides, the face's blaze,
 * the back, and last of all the top of the head, the ears and the tail.
 */
function whitePotential({ p, q, head, tail, leg, along }: Where): Node<"float"> {
  const muzzle = float(0.95).sub(length(q.sub(vec3(0, -0.03, 0.05)).mul(vec3(1, 1.4, 1))).mul(14));
  const blaze = float(0.55).sub(abs(q.x).mul(30)).sub(max(q.y, 0).mul(6));
  const cap = smoothstep(0.04, -0.04, q.y).mul(0.3).sub(0.1);
  const ear = select(p.y.greaterThan(EAR[1]), float(-0.4), float(0));
  const face = max(max(muzzle, blaze.mul(step(0.02, q.z))), cap).add(ear);
  const height = clamp(p.y.sub(0.13).div(0.17), 0, 1);
  const rest = float(1).sub(height);
  const body = float(1).sub(height.mul(0.95)).add(smoothstep(SHOULDER_Z - 0.02, SHOULDER_Z + 0.04, p.z).mul(rest).mul(0.12));
  const limbs = float(0.9).sub(p.y.mul(1.4));
  return select(head, face, select(tail, float(-0.15).sub(along.mul(0.2)), mix(body, limbs, leg)));
}

function whiteAmount(at: Where): Node<"float"> {
  const { p } = at;
  const amount = select(u.whiteness.greaterThan(0.999), float(1), float(0)).toVar();
  If(u.whiteness.greaterThan(0).and(u.whiteness.lessThan(0.999)), () => {
    const threshold = float(1).sub(u.whiteness.mul(1.08));
    const edge = fbm(p.mul(6.5).add(u.marks.zyx)).sub(0.5).mul(0.6).add(noise3(p.mul(30).add(u.marks)).sub(0.5).mul(0.12));
    amount.assign(smoothstep(threshold.sub(0.01), threshold.add(0.01), whitePotential(at).add(edge)));
  });
  return amount;
}

function fur(coat: Coat): Node<"vec3"> {
  const at = where(coat);
  const { p, q, head } = at;
  const agouti = u.agouti.greaterThan(0.5);
  const ticked = u.pattern.greaterThan(2.5);
  // The pattern shows where the agouti lets it, and on orange whatever the agouti.
  const stripe = float(0).toVar();
  If(agouti.or(u.orange.greaterThan(0.25)), () => {
    stripe.assign(tabby(at));
  });
  const ticking = noise3(p.mul(260)).sub(0.5).mul(select(ticked, float(0.5), float(0.25)));
  const belly = smoothstep(0.2, 0.13, p.y).mul(select(head, float(0), float(1)));
  // A tabby's muzzle, chin and eye rims are pale.
  const pale = select(head, smoothstep(0.034, 0.018, length(q.sub(vec3(0, -0.03, 0.058)).mul(vec3(1, 1.3, 1)))), float(0));
  const light = max(belly, pale);
  const ground = mix(u.euGround, u.euGround.mul(1.22), light);
  const eu = select(agouti, mix(ground, u.eu, clamp(stripe.add(ticking.mul(float(1).sub(stripe))), 0, 1)), u.eu);
  const ph = mix(mix(u.phGround, u.phGround.mul(1.12), light), u.ph, clamp(stripe.mul(select(agouti, float(1), float(0.85))).add(ticking.mul(0.4)), 0, 1));
  const colour = mix(eu, ph, orangeAmount(at)).toVar();
  If(u.pointed.greaterThan(0.5), () => {
    colour.assign(mix(mix(u.pointBody, colour, 0.1), colour, pointAmount(at)));
  });
  return mix(colour, u.white, whiteAmount(at));
}

function face(coat: Coat, colour: Node<"vec3">, glint: Node<"float">): void {
  const q = coat.p.sub(vec3(...SKULL));
  // The inside of the ear.
  const inner = earCup(coat, EAR, EAR_SHAPE);
  colour.assign(mix(colour, mix(u.innerEar, colour, u.longHair.mul(0.25).add(0.2)), inner));
  // The nose leather: a small rounded triangle, point down.
  const ny = q.y.add(0.011);
  const nose = step(0, q.z.sub(0.066))
    .mul(smoothstep(0.0012, 0, abs(q.x).sub(ny.add(0.004).mul(0.75).add(0.0035))))
    .mul(step(-0.004, ny))
    .mul(step(ny, 0.0055));
  colour.assign(mix(colour, u.nose, nose));
  // The line from the nose down to the mouth.
  const philtrum = step(0, q.z.sub(0.06)).mul(smoothstep(0.0011, 0.0004, abs(q.x))).mul(step(q.y, -0.015)).mul(step(-0.026, q.y));
  colour.assign(mix(colour, coat.pupil.mul(1.8), philtrum.mul(0.6)));
  // The eyes: big and round, with a slit pupil.
  for (const [side, iris] of [
    [1, u.eyeLeft],
    [-1, u.eyeRight],
  ] as const) {
    const centre = [SKULL[0] + 0.0272 * side, SKULL[1] + 0.0035, SKULL[2] + 0.0525] as const;
    paintEye(colour, glint, paintedEye(coat, { centre, forward: [0.38 * side, 0.06, 0.92], radius: 0.0145, pupil: [0.32, 0.82], open: 0.92, side }, iris));
  }
}

const CAT_COAT: CoatPattern = { name: "hearthwood-cat-coat", fur, face, sheen: u.longHair.mul(0.15).add(0.28) };

/** A cat's coat material: every cat shares one compiled pipeline, each with its own values. */
export function catCoatMaterial(look: CoatLook, atmosphere: AtmosphereUniforms) {
  const c = look.colours;
  return coatMaterial<CatCoat>(
    CAT_COAT,
    {
      blink: 0,
      pupil: themeColor(c.pupil),
      glint: themeColor(c.glint),
      eu: themeColor(c.eumelanin),
      euGround: themeColor(c.eumelaninGround),
      ph: themeColor(c.phaeomelanin),
      phGround: themeColor(c.phaeomelaninGround),
      whiteColour: themeColor(c.white),
      pointBody: themeColor(c.pointBody),
      eyeLeft: themeColor(c.eyeLeft),
      eyeRight: themeColor(c.eyeRight),
      nose: themeColor(c.nose),
      innerEar: themeColor(c.innerEar),
      orange: look.orange,
      orangeShare: look.orangeShare,
      patchSize: look.patchSize,
      agouti: look.agouti,
      pattern: look.pattern,
      white: look.white,
      pointed: look.pointed,
      longHair: look.longHair,
      marks: new Vector3(...look.marks),
    },
    atmosphere,
  );
}
