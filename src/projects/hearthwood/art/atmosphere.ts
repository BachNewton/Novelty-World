import { Color, Vector3 } from "three";
import { abs, cameraPosition, dot, exp, float, floor, Fn, fract, length, max, mix, normalize, pow, select, sin, smoothstep, uniform, vec2 } from "three/tsl";
import type { Node, UniformNode } from "three/webgpu";
import { colourUniform } from "./tsl";

/*
 * The valley's air, shared by everything drawn in it: a haze that lies
 * thickest low in the valley and thins up the mountains, warmed towards the
 * sun. Every material in the valley ends in it (see `materials.ts`), so one
 * set of uniforms moves the whole scene's mood. Each uniform is a TSL
 * uniform node: the CPU sets `.value`, every material that read it sees it.
 */

export interface AtmosphereUniforms {
  uHwHaze: UniformNode<"vec3", Color>;
  uHwSunColor: UniformNode<"vec3", Color>;
  uHwSunDir: UniformNode<"vec3", Vector3>;
  /** How thick the haze is at the valley floor, per metre. */
  uHwHazeDensity: UniformNode<"float", number>;
  /** How quickly it thins with height, per metre. */
  uHwHazeFalloff: UniformNode<"float", number>;
  uHwShadowTint: UniformNode<"vec3", Color>;
  /** Seconds, for anything that moves. */
  uHwTime: UniformNode<"float", number>;
  /** The light falling on a surface that lights itself in its own shader (water): from the sky and the ground all round, and from the sun (or moon). */
  uHwSkyLight: UniformNode<"vec3", Color>;
  uHwSunLight: UniformNode<"vec3", Color>;
  /** The key light's colour times its intensity, exactly as the directional light shines it (the sun's or the moon's). */
  uHwKeyLight: UniformNode<"vec3", Color>;
}

export function makeAtmosphere(): AtmosphereUniforms {
  return {
    uHwHaze: colourUniform(),
    uHwSunColor: colourUniform(),
    uHwSunDir: uniform(new Vector3(0, 1, 0)),
    uHwHazeDensity: uniform(0.004),
    // Thinning over about 1,800 m, so the air still lies between the eye and mountains 2,500 m high.
    uHwHazeFalloff: uniform(1 / 1800),
    uHwShadowTint: colourUniform(),
    uHwTime: uniform(0),
    uHwSkyLight: colourUniform(new Color(1, 1, 1)),
    uHwSunLight: colourUniform(),
    uHwKeyLight: colourUniform(),
  };
}

/** A cheap hash of a 2D point, 0 to 1. */
export const hash2 = Fn(([p]: [Node<"vec2">]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453))).setLayout({
  name: "airHash2",
  type: "float",
  inputs: [{ name: "p", type: "vec2" }],
});

/** Value noise, 0 to 1, for anything drawn that wants a little unevenness. Laid out as a function of its own in the shader, called rather than pasted in at every use: the land calls it dozens of times. */
export const valueNoise = Fn(([p]: [Node<"vec2">]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(f.mul(-2).add(3));
  const a = hash2(i);
  const b = hash2(i.add(vec2(1, 0)));
  const c = hash2(i.add(vec2(0, 1)));
  const d = hash2(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}).setLayout({ name: "airValueNoise", type: "float", inputs: [{ name: "p", type: "vec2" }] });

/** The haze's colour along a view direction: warmer towards the sun. */
export function hazeColour(air: AtmosphereUniforms, dir: Node<"vec3">): Node<"vec3"> {
  const toSun = max(dot(dir, air.uHwSunDir), 0);
  return mix(air.uHwHaze, air.uHwSunColor, float(0.4).mul(pow(toSun, 6)).mul(smoothstep(-0.1, 0.15, air.uHwSunDir.y)));
}

/** Height haze integrated along the ray from the eye to `world`: thick on the valley floor, thin up high. A closed form, true to the horizon. */
export function hazeAmount(air: AtmosphereUniforms, world: Node<"vec3">): Node<"float"> {
  const ray = world.sub(cameraPosition);
  const dist = length(ray);
  const k = air.uHwHazeFalloff;
  const rise = ray.y.mul(k);
  const base = exp(max(cameraPosition.y, -10).mul(k).negate());
  const along = select(abs(rise).greaterThan(1e-3), float(1).sub(exp(rise.negate())).div(rise), float(1));
  return float(1).sub(exp(air.uHwHazeDensity.mul(base).mul(along).mul(dist).negate()));
}

/** A colour at `world` seen through the air from the eye. */
export function throughAir(air: AtmosphereUniforms, colour: Node<"vec3">, world: Node<"vec3">): Node<"vec3"> {
  const dir = normalize(world.sub(cameraPosition));
  return mix(colour, hazeColour(air, dir), hazeAmount(air, world));
}
