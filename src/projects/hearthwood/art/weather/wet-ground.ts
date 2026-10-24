import { Vector4 } from "three";
import { attribute, cameraPosition, cameraViewMatrix, dot, float, floor, fract, length, max, mix, normalize, normalWorldGeometry, positionWorld, pow, reflect, sin, smoothstep, step, uniform, vec2, vec3, vec4 } from "three/tsl";
import type { Node } from "three/webgpu";
import { hash2, valueNoise, type AtmosphereUniforms } from "../atmosphere";
import { weatherColours } from "../atmosphere/colours";
import type { FeatureArt, MaterialKind, ReflectedLight } from "../feature-art";
import { colourUniform } from "../tsl";

/*
 * Wet ground and puddles (`wetGround`). In and after rain the open, level
 * ground darkens as it soaks, and water gathers in its hollows: puddles
 * placed by noise, on level ground only and never under the trees, filling
 * as the weather's standing water rises and shrinking back to their deepest
 * middles as it dries. A puddle is dark and still, mirrors the sky at a
 * glance with a glint of the key light, and while the rain falls its
 * surface is broken by rings spreading from where each drop lands.
 *
 * Every stage works the puddle out again from the world position and the
 * mesh's own normal (two lookups of value noise), which is cheaper to keep
 * in step than to carry between them.
 */

const wet = {
  /** How wet the ground is, how much standing water there is, how hard it rains, and the seconds of motion. */
  state: uniform(new Vector4()),
  sky: colourUniform(),
  glint: colourUniform(),
  puddle: colourUniform(),
};

/** How level the mesh is here, 0 to 1. */
function levelness(): Node<"float"> {
  return smoothstep(0.9, 0.985, normalWorldGeometry.y);
}

/** How open the ground is: the land knows its woods, the gallery's floor is all open. */
function openness(kind: MaterialKind): Node<"float"> {
  if (kind !== "land") return float(1);
  return float(1).sub(smoothstep(0.25, 0.55, attribute<"vec4">("fields", "vec4").x));
}

/** How much of a puddle a point is, 0 to 1. */
function puddleAt(kind: MaterialKind): Node<"float"> {
  const p = positionWorld.xz;
  const hollow = valueNoise(p.mul(0.31)).mul(0.6).add(valueNoise(p.mul(1.1).add(5)).mul(0.4));
  const fill = float(0.88).sub(wet.state.y.mul(0.17));
  return smoothstep(fill, fill.add(0.025), hollow).mul(levelness()).mul(openness(kind)).mul(step(0.01, wet.state.y));
}

/** Rings spreading from drops landing on still water: each cell of a grid takes a drop now and then. The surface's slope. */
function ripples(p: Node<"vec2">, t: Node<"float">): Node<"vec2"> {
  let slope: Node<"vec2"> = vec2(0);
  for (let layer = 0; layer < 3; layer++) {
    const q = p.mul(2.2).add(vec2(0.37 * layer, 0.71 * layer));
    const cell = floor(q);
    const inCell = fract(q).sub(0.5);
    const seed = hash2(cell.add(13 * layer));
    const at = vec2(hash2(cell.add(3.1)), hash2(cell.add(7.9))).sub(0.5).mul(0.5);
    const age = fract(t.mul(seed.mul(0.5).add(0.9)).add(seed));
    const off = inCell.sub(at);
    const d = length(off);
    const radius = age.mul(0.45);
    const fade = float(1).sub(age);
    const ring = sin(d.sub(radius).mul(48)).mul(smoothstep(0.09, 0, d.sub(radius).abs())).mul(fade).mul(fade);
    slope = slope.add(off.div(max(d, 1e-3)).mul(ring));
  }
  return slope.mul(0.28);
}

function soaked(colour: Node<"vec3">, kind: MaterialKind): Node<"vec3"> {
  const soak = wet.state.x.mul(mix(0.35, 1, levelness())).mul(mix(0.55, 1, openness(kind)));
  // Soaked earth and grass are darker and a little richer.
  const dark = pow(colour, vec3(soak.mul(0.35).add(1))).mul(float(1).sub(soak.mul(0.35)));
  return mix(dark, wet.puddle.mul(mix(vec3(1), dark.mul(2), 0.35)), puddleAt(kind));
}

function stillWater(normal: Node<"vec3">, kind: MaterialKind): Node<"vec3"> {
  const ring = ripples(positionWorld.xz, wet.state.w).mul(wet.state.z);
  const up = cameraViewMatrix.mul(vec4(normalize(vec3(ring.x, 1, ring.y)), 0)).xyz;
  return mix(normal, up, puddleAt(kind));
}

function mirrored({ direct, indirect }: ReflectedLight, kind: MaterialKind, air: AtmosphereUniforms): ReflectedLight {
  const puddle = puddleAt(kind);
  const view = normalize(cameraPosition.sub(positionWorld));
  const facing = max(dot(view, vec3(0, 1, 0)), 0);
  const mirror = pow(float(1).sub(facing), 5).mul(0.94).add(0.06);
  const glint = pow(max(dot(reflect(view.negate(), vec3(0, 1, 0)), air.uHwSunDir), 0), 220);
  // Still water barely takes light into itself: what shows is what it mirrors.
  return {
    direct: direct.mul(float(1).sub(puddle.mul(0.6))),
    indirect: mix(indirect, wet.sky, mirror.mul(puddle)).add(wet.glint.mul(glint).mul(puddle).mul(3)),
  };
}

export const WET_GROUND_ART: FeatureArt = {
  feature: "wetGround",
  stages: [
    {
      kinds: ["land", "ground"],
      surface: (colour, { kind }) => soaked(colour, kind),
      normal: (normal, { kind }) => stillWater(normal, kind),
      light: (light, { kind, air }) => mirrored(light, kind, air),
    },
  ],
  frame: ({ day, atmosphere, sky, weather }) => {
    const w = weather.weather;
    wet.state.value.set(w.wetness, w.puddles, w.precipitation * (1 - w.snow), day.motion);
    wet.sky.value.copy(sky.uSky.value).lerp(atmosphere.uHwHaze.value, 0.35).multiplyScalar(0.55 + 0.45 * day.light.ambient);
    wet.glint.value.copy(atmosphere.uHwKeyLight.value);
    wet.puddle.value.copy(weatherColours().puddle);
  },
};
