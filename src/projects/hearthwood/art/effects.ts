import { AdditiveBlending, BufferAttribute, type InstancedBufferAttribute, InstancedBufferGeometry, NormalBlending, type Blending } from "three";
import { abs, attribute, cameraPosition, cos, dot, float, fract, hash, instanceIndex, length, max, mix, modelWorldMatrix, normalView, positionGeometry, positionViewDirection, pow, sin, smoothstep, sqrt, uv, userData, varying, vec3, vec4 } from "three/tsl";
import { MeshBasicNodeMaterial, Sprite, SpriteNodeMaterial, type Node } from "three/webgpu";
import { hazeAmount, type AtmosphereUniforms } from "./atmosphere";
import type { SkyUniforms } from "./sky/sky";
import { typed } from "./tsl";

/*
 * The things that make their own light, or float in the air as light does:
 * the fire's flames, embers and glow, steam, sparkles, the charms' glows and
 * motes, fireflies, the clues' glints. None is lit by the storybook light;
 * each is a cloud of soft camera-facing quads, every one placed in the
 * vertex stage from its own seed and the clock, so nothing about them is
 * moved on the CPU. The far haze veils them as it veils everything (a fire
 * a valley off is a faint spark), but they never dim with the day's light.
 *
 * Every kind is one material, shared by every copy of it in a scene (one
 * per world's air): what differs between copies (how strongly a cloud
 * shows, its colour, how wide it spreads) is the object's own `userData`,
 * which three reads per draw, so a hundred fires would still be one graph.
 */

function quadBuffers() {
  return {
    position: new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3),
    uv: new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2),
    index: new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1),
  };
}

function quad(buffers: ReturnType<typeof quadBuffers>, count: number): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  g.setAttribute("position", buffers.position);
  g.setAttribute("uv", buffers.uv);
  g.setIndex(buffers.index);
  g.instanceCount = count;
  return g;
}

/**
 * The plain clouds' quads, one for each count drawn, over one set of
 * buffers. They are never disposed: disposing one would free the buffers
 * under the rest, and only a handful of counts are ever drawn.
 */
let buffers: ReturnType<typeof quadBuffers> | null = null;
const quads = new Map<number, InstancedBufferGeometry>();
function quadOf(count: number): InstancedBufferGeometry {
  let made = quads.get(count);
  if (!made) {
    made = quad((buffers ??= quadBuffers()), count);
    quads.set(count, made);
  }
  return made;
}

/**
 * A cloud of camera-facing quads drawn with one of the materials here, in
 * one draw (three's instanced sprites). How many it draws is its geometry's
 * instance count, never the sprite's own `count`: three keys the node build
 * of anything drawn with a `count` above one by the object's own uuid
 * (`RenderObject.getMaterialCacheKey`), so every cloud would build its
 * material's graph afresh, where a geometry's count leaves every cloud of a
 * kind sharing one build.
 */
export type Cloud = Sprite & { geometry: InstancedBufferGeometry };

/**
 * A cloud of `count` particles. Without `geometry` it draws the shared quad
 * of that count, never to be disposed, and `showParticles` changes how many;
 * `geometry`, where given, is a `quadWith` of its owner's, carrying
 * per-particle attributes beside the quad (the fireflies' spots), whose
 * instance count the owner sets from then on.
 */
export function cloud(count: number, material: SpriteNodeMaterial, geometry?: InstancedBufferGeometry): Cloud {
  if (geometry) geometry.instanceCount = count;
  const sprite: Cloud = Object.assign(new Sprite(material), { geometry: geometry ?? quadOf(count) });
  // Each particle moves far from the quad's own little bounds.
  sprite.frustumCulled = false;
  return sprite;
}

/** Draws `count` of a plain cloud's particles: the shared quad of that count, laid out as every other, so nothing is built again. */
export function showParticles(c: Cloud, count: number): void {
  c.geometry = quadOf(count);
}

/** A quad of its own with per-particle attributes beside it, one value per particle; whoever made it disposes it. */
export function quadWith(attributes: Record<string, InstancedBufferAttribute>): InstancedBufferGeometry {
  const g = quad(quadBuffers(), 0);
  for (const [name, values] of Object.entries(attributes)) g.setAttribute(name, values);
  return g;
}

/** A number of the object's own, from its `userData`. */
export const own = (name: string): Node<"float"> => typed<"float">(userData(name, "float"));
/** A colour of the object's own, from its `userData` (a `Color`). */
export const ownColour = (name: string): Node<"vec3"> => typed<"vec3">(userData(name, "color"));

/** A particle's seed, 0 to 1, one stream per `k`. */
const seed = (k: number): Node<"float"> => hash(instanceIndex.add(k * 7919));

/** The soft round spot every particle is drawn as: 1 at its middle to 0 at its rim, with `power` its falloff. */
function spot(power: number): Node<"float"> {
  const d = length(uv().sub(0.5)).mul(2);
  return pow(max(float(1).sub(d), 0), power);
}

/** A material of camera-facing quads at `centre` (in the object's space), `size` metres across. */
function billboards(centre: Node<"vec3">, size: Node<"float">, additive: boolean): { material: SpriteNodeMaterial; world: Node<"vec3"> } {
  const blending: Blending = additive ? AdditiveBlending : NormalBlending;
  const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending });
  material.positionNode = centre;
  material.scaleNode = size;
  return { material, world: varying(modelWorldMatrix.mul(vec4(centre, 1)).xyz) };
}

/**
 * A colour and alpha as the air leaves it, from the particle's place in the
 * world. A glow is drawn added, its colour already weighted by how much of
 * it shows (so its light falls off softly as the square of its spot);
 * steam lies over what is behind it.
 */
function veiled(air: AtmosphereUniforms, colour: Node<"vec3">, alpha: Node<"float">, world: Node<"vec3">, glows = true): Node<"vec4"> {
  const a = alpha.mul(float(1).sub(hazeAmount(air, world)));
  return vec4(glows ? colour.mul(a) : colour, a);
}

function perKey<K extends object, T>(build: (key: K) => T): (key: K) => T {
  const made = new WeakMap<K, T>();
  return (key) => {
    let value = made.get(key);
    if (value === undefined) {
      value = build(key);
      made.set(key, value);
    }
    return value;
  };
}

/**
 * A soft round glow (the fire's, a charm's, the cauldron's), as wide as the
 * object's scale. Its `userData`: `glow` (a Color), `strength`, `pulse` (how
 * much it breathes) and `phase`.
 */
export const glowMaterial = perKey((air: AtmosphereUniforms) => {
  const breathe = float(1).add(own("pulse").mul(sin(air.uHwTime.mul(2.3).add(own("phase").mul(20)))));
  const { material, world } = billboards(vec3(0), breathe, true);
  material.colorNode = veiled(air, ownColour("glow"), spot(2.4).mul(own("strength")), world);
  return material;
});

/**
 * Embers rising from a fire and fading, each on its own loop. Its
 * `userData`: `tint` (a Color) and `strength`.
 */
export const emberMaterial = perKey((air: AtmosphereUniforms) => {
  const s = seed(1);
  const t = air.uHwTime;
  const life = fract(t.mul(s.mul(0.25).add(0.35)).add(s.mul(7)));
  const from = vec3(seed(2).sub(0.5).mul(0.5), 0.3, seed(3).sub(0.5).mul(0.5));
  const drift = vec3(sin(t.mul(2).add(s.mul(30))).mul(0.25).mul(life), life.mul(s.add(1.6)), cos(t.mul(1.7).add(s.mul(20))).mul(0.25).mul(life));
  const { material, world } = billboards(from.add(drift), float(1).sub(life).mul(0.1), true);
  const fade = varying(float(1).sub(life));
  material.colorNode = veiled(air, ownColour("tint"), smoothstep(0, 0.8, spot(1.6)).mul(fade).mul(own("strength")), world);
  return material;
});

/**
 * Steam (or a brew's glowing vapour) rising and spreading from round its
 * emitter. Its `userData`: `tint` (a Color), `warm` (the fire's light on it,
 * a Color), `strength` and `spread`.
 */
export const steamMaterial = perKey((air: AtmosphereUniforms) => {
  const s = seed(1);
  const t = air.uHwTime;
  const life = fract(t.mul(s.mul(0.18).add(0.28)).add(s.mul(5)));
  const spread = own("spread");
  const at = vec3(
    sin(s.mul(40)).mul(spread).add(sin(t.mul(1.3).add(s.mul(20))).mul(0.12).mul(life)),
    life.mul(s.mul(0.5).add(0.9)),
    cos(s.mul(40)).mul(spread).add(cos(t.mul(1.1).add(s.mul(17))).mul(0.12).mul(life)),
  );
  const { material, world } = billboards(at, life.mul(0.55).add(0.17), false);
  const lifeOut = varying(life);
  const alpha = spot(1.3).mul(smoothstep(0, 0.15, lifeOut)).mul(float(1).sub(lifeOut)).mul(0.5).mul(own("strength"));
  // Steam makes no light of its own: it takes the sky's and the key light's, and the warmth of the fire it rises from.
  const lit = ownColour("tint").mul(air.uHwSkyLight.add(air.uHwSunLight)).add(ownColour("warm"));
  material.colorNode = veiled(air, lit, alpha, world, false);
  return material;
});

/** A little four-pointed star of light in a quad: a bright middle and a thin cross. */
function star(): Node<"float"> {
  const c = uv().sub(0.5);
  return max(float(1).sub(abs(c.x.mul(c.y)).mul(9)).sub(length(c).mul(1.6)), 0);
}

/**
 * Sparkles twinkling in a ball round their middle (sizzle over the pan, the
 * burst a dish or brew rises in). Its `userData`: `tint` (a Color),
 * `strength` and `spread` (the ball's radius).
 */
export const sparkleMaterial = perKey((air: AtmosphereUniforms) => {
  const s = seed(1);
  const t = air.uHwTime;
  const angle = seed(2).mul(Math.PI * 2);
  const r = sqrt(seed(3));
  const ball = vec3(cos(angle).mul(r), seed(4).mul(1.5).sub(0.5), sin(angle).mul(r)).mul(own("spread"));
  const at = ball.add(vec3(0, fract(t.mul(0.4).add(s)).mul(0.12), 0));
  const twinkle = pow(max(sin(t.mul(s.mul(4).add(5)).add(s.mul(60))), 0), 6);
  const { material, world } = billboards(at, twinkle.add(0.3).mul(0.06), true);
  material.colorNode = veiled(air, ownColour("tint"), star().mul(varying(twinkle)).mul(own("strength")), world);
  return material;
});

/**
 * A pick's sparkles: a ring of them lifting off the spot, spreading and
 * fading as the pop plays. Its `userData`: `tint` (a Color) and `age`, 0 to 1
 * through the pop.
 */
export const popMaterial = perKey((air: AtmosphereUniforms) => {
  const age = own("age");
  const angle = float(instanceIndex).mul(Math.PI * 2 / 7);
  const ease = float(1).sub(pow(float(1).sub(age), 3));
  const spread = age.mul(1.6).add(1);
  const ring = vec3(cos(angle).mul(0.12), float(instanceIndex).mod(3).mul(0.06).add(0.08), sin(angle).mul(0.12)).mul(spread);
  const { material, world } = billboards(ring.add(vec3(0, ease.mul(0.45), 0)), float(0.05), true);
  material.colorNode = veiled(air, ownColour("tint"), star().add(spot(2).mul(0.5)).min(1).mul(float(1).sub(smoothstep(0.35, 1, age))), world, false);
  return material;
});

/** How many sparkles a pick's pop throws up. */
export const POP_SPARKLES = 7;

/**
 * The few soft glints circling over a clue still to examine. Its
 * `userData`: `tint` (a Color), `radius`, `size`, `opacity`, `lift` (their
 * height), `glints` (how many there are, the cloud's own count) and `phase`.
 */
export const glintMaterial = perKey((air: AtmosphereUniforms) => {
  const t = air.uHwTime;
  const g = float(instanceIndex);
  const phase = own("phase");
  const angle = t.mul(0.9).add(g.div(own("glints")).mul(Math.PI * 2)).add(phase);
  const radius = own("radius");
  const at = vec3(cos(angle).mul(radius), own("lift").add(sin(t.mul(1.7).add(g.mul(2.1)).add(phase)).mul(0.13)), sin(angle).mul(radius));
  const { material, world } = billboards(at, own("size").mul(0.6).add(sin(t.mul(3.1)).mul(0.05)), true);
  const opacity = own("opacity");
  const glint = spot(2).add(star().mul(0.6)).min(1);
  material.colorNode = veiled(air, ownColour("tint"), glint.mul(opacity.add(float(1).sub(opacity).mul(sin(t.mul(2.3)))).clamp(0, 1)), world, false);
  return material;
});

/**
 * Pale motes drifting about a point (the hush round Elliott's feet). Its
 * `userData`: `tint` (a Color) and `strength`.
 */
export const moteMaterial = perKey((air: AtmosphereUniforms) => {
  const s = seed(1);
  const t = air.uHwTime;
  const a = seed(2).mul(Math.PI * 2);
  const r = seed(3).mul(1.2).add(0.4);
  const home = vec3(cos(a).mul(r), seed(4).mul(1.1).add(0.1), sin(a).mul(r));
  const tt = t.mul(s.mul(0.15).add(0.2)).add(s.mul(40));
  const at = home.add(vec3(sin(tt).mul(0.5), sin(tt.mul(1.3).add(s.mul(7))).mul(0.25).add(fract(t.mul(0.06).add(s)).mul(0.8)), cos(tt.mul(0.9)).mul(0.5)));
  const { material, world } = billboards(at, float(0.09), true);
  const twinkle = varying(sin(t.mul(s.add(1.5)).add(s.mul(30))).mul(0.45).add(0.55));
  material.colorNode = veiled(air, ownColour("tint").mul(1.4), spot(1.5).mul(twinkle).mul(own("strength")), world);
  return material;
});

/** How many motes drift round Elliott's feet under the hush. */
export const MOTES = 64;

/**
 * Fireflies drifting and blinking about their spots (the per-particle `spot`
 * attribute, in the object's space), out only as the night comes. Its
 * `userData`: `tint` (a Color).
 */
export const fireflyMaterial = perKey((sky: SkyUniforms) => perKey((air: AtmosphereUniforms) => {
  // Each its own phase and pace: the golden ratio's steps spread them evenly over 0 to 1.
  const s = fract(float(instanceIndex).mul(0.6180339887));
  const t = air.uHwTime;
  const tt = t.mul(s.mul(0.2).add(0.25)).add(s.mul(50));
  const at = attribute<"vec3">("spot", "vec3").add(vec3(sin(tt).mul(1.6), sin(tt.mul(1.7).add(s.mul(9))).mul(0.5), cos(tt.mul(0.8)).mul(1.6)));
  // Never narrower than about a pixel and a half, however far off.
  const far = length(modelWorldMatrix.mul(vec4(at, 1)).xyz.sub(cameraPosition));
  const { material, world } = billboards(at, max(far.mul(0.005), 0.13), true);
  const blink = varying(smoothstep(0.3, 1, sin(t.mul(s.add(1.2)).add(s.mul(31)))));
  material.colorNode = veiled(air, ownColour("tint").mul(1.8), spot(1.6).mul(blink).mul(sky.uNight), world);
  return material;
}));

/**
 * Soft flame shells (open cones round the fire), licking upwards: each
 * shell wobbles in its own time, burns from the core's colour at its foot
 * through the flame's to the tip's, and fades towards its top and its
 * edges. Its `userData`: `core`, `flame`, `tip` (Colors), `seed` and
 * `strength`.
 */
export const flameMaterial = perKey((air: AtmosphereUniforms) => {
  const p = positionGeometry;
  const h = p.y.div(0.9).add(0.5).clamp(0, 1);
  const t = air.uHwTime.mul(7).add(own("seed").mul(10));
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
  material.positionNode = vec3(p.x.add(sin(t.add(p.y.mul(5))).mul(0.06).mul(h)), p.y.mul(sin(t.mul(1.3)).mul(0.12).add(1)), p.z.add(cos(t.mul(0.8).add(p.y.mul(4))).mul(0.05).mul(h)));
  const height = varying(h);
  const colour = mix(mix(ownColour("core"), ownColour("flame"), smoothstep(0.05, 0.5, height)), ownColour("tip"), smoothstep(0.5, 1, height));
  const edge = abs(dot(normalView, positionViewDirection));
  const alpha = float(1).sub(smoothstep(0.55, 1, height)).mul(smoothstep(0, 0.6, edge)).mul(own("strength"));
  const world = varying(modelWorldMatrix.mul(vec4(0, 0, 0, 1)).xyz);
  material.colorNode = veiled(air, colour, alpha, world);
  return material;
});
