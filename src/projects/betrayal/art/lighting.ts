import * as THREE from "three";
import { paletteHex, type PaletteKey } from "./palette";

/*
 * How the house is lit. Almost everything in it stands still, so its light is
 * baked: each room's lamps and candles, and the moon through the windows, are
 * worked out once (with their shadows, and with the walls and the rooms next
 * door in the way) into a lightmap per room, which every static surface reads
 * as one texture. What moves stays live: candle flicker modulates the baked
 * light, the fill is one cheap uniform light, the active explorer's light is a
 * real light, and moving pieces (explorers, a swaying chandelier) are lit by
 * light probes taken in the same bake.
 */

/**
 * The lightmap's own resolution and filtering, independent of the render
 * resolution and of the textures' pixel size: one setting, so the look can be
 * judged and changed in one place. 16 texels a metre (6 cm) keeps a shadow's
 * edge as sharp as a candle's would be at this scale; linear filtering lets
 * it fall off smoothly at native resolution and is no softer than a pixel at
 * a low one. `nearest` gives blocky shadow edges instead.
 */
export const LIGHTMAP: { texelsPerMetre: number; filter: "linear" | "nearest" } = {
  texelsPerMetre: 10,
  filter: "linear",
};

/** The light the whole house shares: one fill, one moon shining from a fixed
 *  corner of the board, and one fog. The bench lights a room the same way. */
export const HOUSE_LIGHT = {
  fill: { sky: "moon" as PaletteKey, ground: "void" as PaletteKey, intensity: 2.7 },
  /** High in the sky beyond the bottom-right corner of the board. */
  moon: { colour: "moonLight" as PaletteKey, intensity: 7.2, from: new THREE.Vector3(6, 9.2, 5.6) },
  /** How much the far side of what is framed fades into the fog colour, 0–1. */
  fog: { colour: "soot" as PaletteKey, density: 0.4 },
};

/** The way the moonlight comes from: a unit vector towards the moon. */
export function moonDirection(): THREE.Vector3 {
  return HOUSE_LIGHT.moon.from.clone().normalize();
}

/** A point light baked into the house, in its room's frame. */
export interface BakedLight {
  at: THREE.Vector3;
  colour: PaletteKey;
  /** Candela. */
  intensity: number;
  /** Metres beyond which it has no effect. */
  range: number;
  /** 0 is steady; 0.15 a candle, 0.3 a fire. At most `MAX_FLICKER`. */
  flicker: number;
}

/** The deepest flicker the flicker map can hold. */
export const MAX_FLICKER = 0.5;
/** Flickering lights share this many independent flicker signals, so
 *  neighbouring flames don't waver in step. */
export const FLICKER_CHANNELS = 4;

function flickerAt(seconds: number, phase: number): number {
  return 0.5 * Math.sin(seconds * 7.3 + phase) + 0.3 * Math.sin(seconds * 13.1 + phase * 2.1) + 0.2 * Math.sin(seconds * 23.7 + phase * 3.7);
}

/** Each flicker channel's signal at a moment, between −1 and 1. */
export function flickerSignal(seconds: number, out: THREE.Vector4): THREE.Vector4 {
  return out.set(flickerAt(seconds, 0), flickerAt(seconds, 1.9), flickerAt(seconds, 3.8), flickerAt(seconds, 5.7));
}

export function fillLight(): THREE.HemisphereLight {
  const { sky, ground, intensity } = HOUSE_LIGHT.fill;
  return new THREE.HemisphereLight(paletteHex(sky), paletteHex(ground), intensity);
}

export function houseFog(): THREE.Fog {
  return new THREE.Fog(paletteHex(HOUSE_LIGHT.fog.colour), 1, 100);
}

/*
 * Budgets the renderer is held to, checked on the real compiled programs at
 * run time and on the built scene in the tests. A phone's GPU may offer as
 * few as 13 texture units to one program, and a floor drawn in thousands of
 * calls is what made the old house lose its context there.
 */
export const MAX_TEXTURE_UNITS = 12;
export const MAX_DRAW_CALLS = 300;
/** Live lights that may cast a shadow at once: each adds a sampler to every lit program. */
export const MAX_LIVE_SHADOWS = 2;

const SAMPLER_TYPES = (gl: WebGL2RenderingContext) =>
  new Set<number>([
    gl.SAMPLER_2D,
    gl.SAMPLER_CUBE,
    gl.SAMPLER_3D,
    gl.SAMPLER_2D_ARRAY,
    gl.SAMPLER_2D_SHADOW,
    gl.SAMPLER_CUBE_SHADOW,
    gl.SAMPLER_2D_ARRAY_SHADOW,
    gl.INT_SAMPLER_2D,
    gl.UNSIGNED_INT_SAMPLER_2D,
  ]);

/** The texture units one linked program samples. */
function programSamplers(gl: WebGL2RenderingContext, handle: WebGLProgram, types: Set<number>): number {
  const count = gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS) as number;
  let samplers = 0;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(handle, i);
    if (info && types.has(info.type)) samplers += info.size;
  }
  return samplers;
}

/**
 * Fails loudly when the last frame broke a budget: too many draw calls, or a
 * program using more texture units than a phone may have. Each program is
 * counted once, when it has finished linking (three may compile in parallel).
 */
export function budgetGuard(renderer: THREE.WebGLRenderer) {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const types = SAMPLER_TYPES(gl);
  const parallel = gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null;
  const counted = new Map<WebGLProgram, number>();
  let most = 0;
  return {
    check: () => {
      const calls = renderer.info.render.calls;
      if (calls > MAX_DRAW_CALLS) throw new Error(`The last frame drew ${calls} calls; the budget is ${MAX_DRAW_CALLS}`);
      for (const program of renderer.info.programs ?? []) {
        const handle = (program as unknown as { program: WebGLProgram }).program;
        if (counted.has(handle)) continue;
        if (parallel && gl.getProgramParameter(handle, parallel.COMPLETION_STATUS_KHR) !== true) continue;
        const samplers = programSamplers(gl, handle, types);
        counted.set(handle, samplers);
        most = Math.max(most, samplers);
        if (samplers > MAX_TEXTURE_UNITS) throw new Error(`A shader uses ${samplers} texture units; the most allowed is ${MAX_TEXTURE_UNITS}`);
      }
    },
    /** The most texture units any program counted so far uses. */
    samplers: () => most,
  };
}
