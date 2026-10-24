import { Color, Vector3 } from "three";
import { abs, attribute, clamp, diffuseColor, dot, float, floor, Fn, fract, If, length, materialReference, max, mix, normalView, positionGeometry, positionViewDirection, pow, property, smoothstep, sqrt, step, vec2, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import type { EarShape } from "../../animals/sculpt";
import type { Vec3 } from "../../animals/rig";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import { diorama, type DioramaMaterial, type OwnNodes } from "../../art/materials";
import { typed } from "../../art/tsl";

/*
 * An animal's coat: one of the shared solid materials with a surface of its
 * own. Every marking is a pattern function of where a point lies on the
 * animal in its bind pose (the mesh's own positions, before skinning bends
 * them), so the coat moves with the body however it bends. A species gives
 * its patterns (`CoatPattern`): the fur, and the face painted over it on the
 * head (eyes, nose, the inside of the ears). This gives them the noise they
 * are built from, a painted eye that blinks, an ear's cup, and lays the rest
 * over every species alike: the sculpture's own hollows darken the coat, and
 * a soft sheen at the silhouette reads as fur. The sheen and the eyes' glint
 * are lit by the sky's and the key light's light, so a companion dims with
 * the land at dusk.
 *
 * Every animal of a species shares one node graph, so one compiled pipeline:
 * its own values (colours, how white, its blink) live on its material's
 * `coat` record, which the graph reads by reference, as three's own
 * materials read their colour.
 */

/** What every coat carries, whatever its species. */
export interface CoatValues {
  /** How far closed the eyes are, 0 to 1. */
  blink: number;
  pupil: Color;
  glint: Color;
}

/** A coat's material: a shared solid material with its animal's own values. */
export type CoatMaterial<V extends CoatValues = CoatValues> = DioramaMaterial & { coat: V };

type KeysOf<V, T> = { [K in keyof V]: V[K] extends T ? K : never }[keyof V] & string;

/** A species' handles on its animals' own values, each read from the material drawn. */
export function coatInputs<V extends CoatValues>() {
  return {
    float: (name: KeysOf<V, number>) => typed<"float">(materialReference(`coat.${name}`, "float")),
    colour: (name: KeysOf<V, Color>) => typed<"vec3">(materialReference(`coat.${name}`, "color")),
    vec: (name: KeysOf<V, Vector3>) => typed<"vec3">(materialReference(`coat.${name}`, "vec3")),
  };
}

const common = coatInputs<CoatValues>();

/** Where a point lies on the animal, and what part of it, for the patterns. */
export interface Coat {
  /** The point in the bind pose, in the sculpture's metres. */
  p: Node<"vec3">;
  /** The sculpture's part: 0 the body, 1 the head, more for a species' own (a tongue, antlers). */
  part: Node<"float">;
  head: Node<"bool">;
  pupil: Node<"vec3">;
  glintColour: Node<"vec3">;
}

/** A species' coat: its fur, and its face painted over the fur on the head. */
export interface CoatPattern {
  /** A name for the compiled program. */
  name: string;
  fur: (coat: Coat) => Node<"vec3">;
  /** Paints over `colour` on the head's pixels only, raising `glint` where light catches (an eye, a wet nose). */
  face: (coat: Coat, colour: Node<"vec3">, glint: Node<"float">) => void;
  /** How strongly the fur shines at the silhouette (a long coat more). */
  sheen: Node<"float"> | number;
}

/** A cheap hash of a 3D point, 0 to 1. */
export const hash3 = Fn(([q]: [Node<"vec3">]) => {
  const p = fract(q.mul(0.3183099).add(0.1)).mul(17);
  return fract(p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)));
}).setLayout({ name: "coatHash3", type: "float", inputs: [{ name: "q", type: "vec3" }] });

/** Value noise in 3D, 0 to 1. */
export const noise3 = Fn(([x]: [Node<"vec3">]) => {
  const i = floor(x);
  const f0 = fract(x);
  const f = f0.mul(f0).mul(f0.mul(-2).add(3));
  const h = (dx: number, dy: number, dz: number) => hash3(i.add(vec3(dx, dy, dz)));
  const low = mix(mix(h(0, 0, 0), h(1, 0, 0), f.x), mix(h(0, 1, 0), h(1, 1, 0), f.x), f.y);
  const high = mix(mix(h(0, 0, 1), h(1, 0, 1), f.x), mix(h(0, 1, 1), h(1, 1, 1), f.x), f.y);
  return mix(low, high, f.z);
}).setLayout({ name: "coatNoise3", type: "float", inputs: [{ name: "x", type: "vec3" }] });

/** Three octaves of value noise, 0 to 1. */
export const fbm = Fn(([p]: [Node<"vec3">]) =>
  noise3(p)
    .mul(0.55)
    .add(noise3(p.mul(2.03).add(7.1)).mul(0.3))
    .add(noise3(p.mul(4.1).add(3.3)).mul(0.15)),
).setLayout({ name: "coatFbm", type: "float", inputs: [{ name: "p", type: "vec3" }] });

/** A painted eye's colour, how much of the point it covers, and its glint. */
export interface Eye {
  colour: Node<"vec3">;
  cover: Node<"float">;
  spark: Node<"float">;
}

/** How an eye is painted: where it sits and looks, its size, its pupil's radii (a share of the eye's), how wide open its lids are, which side it is on. */
export interface EyeShape {
  centre: Vec3;
  forward: Vec3;
  radius: number;
  pupil: readonly [number, number];
  open: number;
  side: number;
}

/**
 * An eye painted on the face: the iris, the pupil, a glint and a dark rim,
 * its lids an almond that closes as the animal blinks. Its frame is worked
 * out here once, so the shader only projects onto it.
 */
export function paintedEye(coat: Coat, shape: EyeShape, iris: Node<"vec3">): Eye {
  const forward = new Vector3(...shape.forward).normalize();
  const right = new Vector3(0, 1, 0).cross(forward).normalize();
  const up = new Vector3().crossVectors(forward, right);
  const q = coat.p.sub(vec3(...shape.centre));
  const front = step(-shape.radius * 0.55, dot(q, vec3(forward)));
  const uv = vec2(dot(q, vec3(right)), dot(q, vec3(up))).div(shape.radius);
  const opening = float(1).sub(common.float("blink"));
  const lid = sqrt(max(float(1).sub(uv.x.mul(uv.x)), 0)).mul(mix(0.04, shape.open, opening)).sub(abs(uv.y));
  const across = abs(uv.x);
  const inside = step(0, lid).mul(step(across, 1));
  const rim = smoothstep(-0.14, -0.02, lid).mul(step(across, 1.12)).mul(float(1).sub(inside));
  const pupil = smoothstep(0.08, 0, length(uv.div(vec2(...shape.pupil))).sub(0.6));
  const spark = smoothstep(0.24, 0.16, length(uv.sub(vec2(0.32 * shape.side, 0.34)))).mul(inside).mul(opening);
  let colour: Node<"vec3"> = mix(iris.mul(0.78), iris.mul(1.08), smoothstep(-0.6, 0.6, uv.y.negate()));
  colour = mix(colour, coat.pupil, pupil);
  colour = mix(colour, coat.glintColour, spark);
  colour = mix(colour, coat.pupil.mul(1.4), rim);
  return { colour, cover: max(inside, rim).mul(front), spark: spark.mul(front) };
}

/** Paints an eye over the colour so far, and raises the glint by its spark. */
export function paintEye(colour: Node<"vec3">, glint: Node<"float">, eye: Eye): void {
  colour.assign(mix(colour, eye.colour, eye.cover));
  glint.assign(max(glint, eye.spark));
}

/** How much a point lies inside an erect ear's cup, 0 to 1, found in the left ear's own frame (both ears, by symmetry). */
export function earCup(coat: Coat, at: Vec3, shape: EarShape): Node<"float"> {
  const { width, height, depth, splay, turn, cupInset: inset, cupLift: lift, tip } = shape;
  const [cy, sy, cz, sz] = [Math.cos(turn), Math.sin(turn), Math.cos(splay), Math.sin(splay)];
  const p = coat.p;
  const e0 = vec3(abs(p.x), p.y, p.z).sub(vec3(...at));
  const e1x = e0.x.mul(cy).sub(e0.z.mul(sy));
  const ez = e0.x.mul(sy).add(e0.z.mul(cy));
  const ex = e1x.mul(cz).add(e0.y.mul(sz));
  const ey = e1x.mul(-sz).add(e0.y.mul(cz));
  const t = clamp(ey.sub(lift).div(height), 0, 1);
  const r = max(float(width * 0.5).mul(float(1).sub(t)).add(t.mul(tip)).sub(inset), 0.002);
  const cup = length(vec2(ex.div(r), ez.sub(width * depth * 0.42).div(r.mul(depth))));
  return smoothstep(1.25, 0.95, cup).mul(smoothstep(lift, lift + 0.01, ey)).mul(step(0, ez));
}

/** The glint the face raised, read by the coat's own light after the surface is painted. */
const coatGlint = property("float", "coatGlint");

function coatNodes(pattern: CoatPattern, air: AtmosphereUniforms): OwnNodes {
  const part = typed<"float">(attribute("aPart", "float"));
  const occlusion = typed<"float">(attribute("aOcclusion", "float"));
  const coat: Coat = { p: positionGeometry, part, head: part.greaterThan(0.5), pupil: common.colour("pupil"), glintColour: common.colour("glint") };
  const surface = Fn(() => {
    const colour = pattern.fur(coat).toVar("coatColour");
    const glint = float(0).toVar("coatGlintSoFar");
    If(coat.head, () => pattern.face(coat, colour, glint));
    coatGlint.assign(glint);
    return colour.mul(mix(0.62, 1, occlusion));
  })();
  // A soft sheen at the silhouette reads as fur; a dark coat still catches a little.
  const facing = clamp(dot(normalView, positionViewDirection), 0, 1);
  const around = air.uHwSkyLight.add(air.uHwKeyLight).mul(1 / Math.PI);
  const sheen = max(diffuseColor.rgb, vec3(0.16)).mul(pow(float(1).sub(facing), 2.5)).mul(pattern.sheen);
  const emissive = around.mul(sheen.add(coat.glintColour.mul(coatGlint).mul(0.35)));
  return { surface, emissive };
}

const graphs = new WeakMap<AtmosphereUniforms, Map<CoatPattern, OwnNodes>>();

/** A species' one node graph in an air, built the first time it is asked for. */
function graphOf(pattern: CoatPattern, air: AtmosphereUniforms): OwnNodes {
  let byPattern = graphs.get(air);
  if (!byPattern) {
    byPattern = new Map();
    graphs.set(air, byPattern);
  }
  let own = byPattern.get(pattern);
  if (!own) {
    own = coatNodes(pattern, air);
    byPattern.set(pattern, own);
  }
  return own;
}

/** An animal's coat material, in the world's air: its species' graph, with its own values. */
export function coatMaterial<V extends CoatValues>(pattern: CoatPattern, values: V, air: AtmosphereUniforms): CoatMaterial<V> {
  const material = diorama("solid", air, {}, graphOf(pattern, air)) as CoatMaterial<V>;
  material.name = pattern.name;
  material.coat = values;
  return material;
}
