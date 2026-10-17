import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, type Material, type ShaderMaterial } from "three";
import type { LandTile } from "../../engine/tiles";
import type { AtmosphereUniforms } from "../atmosphere";
import { LATE_LAYER } from "../passes";
import type { Palette } from "../palette";
import { shadeCustom } from "../shading";
import type { SkyUniforms } from "../sky";
import { CURVATURE } from "../terrain";
import { regionAbsorption, tileAbsorption } from "./absorption";

/*
 * Water, opaque (no blending, so no overdraw), lit by its own shader. On its
 * own, with every water feature off, it is plain: clear shallows to deep
 * blue by how far the bed lies below, a faint sky over it, and where a river
 * runs, streaks of foam the way it flows, running fast and white over falls.
 * Everything else is a feature of the water group (`features/water.ts`),
 * each its own file in this folder, gathered by `art/features/water.ts`.
 *
 * The features work on the water's own locals, at the shared hook points, in
 * the order the group lists them:
 *
 * - `normal`: `hwNormal`, up to start with; `hwRippleP`, where on the
 *   surface the ripples are read (parallax moves it); `hwIce`, how much of
 *   the surface is frozen.
 * - `surface`: `hwBed`, the light leaving the bed towards the eye, linear,
 *   standing for the shallows' colour until something knows the real bed.
 *   `uBed` is the colour of the bed itself, for a feature to light.
 * - `light`: `hwBody`, the light coming up out of the water (the bed through
 *   it and the water's own colour); `hwReflect`, what the surface mirrors;
 *   `hwFresnel`, how much it mirrors; `hwSpecular`, glints added on top;
 *   `hwFoam`, how white it is.
 * - `colour`: `hwColour` after the air, as everywhere.
 *
 * Always there to read: `hwP` (the point on the surface, x and z), `hwView`
 * (towards the eye), `hwDepth` (metres down to the bed), `hwFlowDir` and
 * `hwMoving` (a river's way and how much river there is), `hwFalling` (how
 * steeply it falls), `hwAbsorb` (its absorption per metre), `hwBelow`
 * (whether it is seen from its underside, from under the water), `hwLight`
 * (the light falling on it), and `hwSkyAlong(dir)`, the sky's colour along
 * a direction.
 */

const VERTEX = /* glsl */ `
attribute float depth;
attribute vec2 flow;
attribute float fall;
attribute vec3 absorb;
varying float vDepth;
varying vec2 vFlow;
varying float vFall;
varying vec3 vAbsorb;
#include <hw_vertex_head>
void main() {
  vDepth = depth;
  vFlow = flow;
  vFall = fall;
  vAbsorb = absorb;
  vec3 transformed = (modelMatrix * vec4(position, 1.0)).xyz;
  ${CURVATURE}
  #include <hw_vertex>
  vHwWorld = transformed;
  gl_Position = projectionMatrix * viewMatrix * vec4(transformed, 1.0);
}
`;

/** The sky's colour along a direction, from the same uniforms the sky's dome is drawn from: what water mirrors and what shows through it from below. */
export const WATER_SKY_GLSL = /* glsl */ `
uniform vec3 uSky;
uniform vec3 uMoonDir;
uniform float uNight;
uniform vec3 uMoon;
vec3 hwSkyAlong(vec3 dir) {
  float up = max(dir.y, 0.0);
  vec3 colour = mix(uHwHaze, uSky, pow(smoothstep(0.0, 0.75, up), 0.7));
  float toSun = max(dot(dir, uHwSunDir), 0.0);
  float sunUp = smoothstep(-0.12, 0.1, uHwSunDir.y);
  colour += uHwSunColor * (0.35 * pow(toSun, 8.0) + 0.25 * pow(toSun, 64.0)) * sunUp;
  float toMoon = max(dot(dir, uMoonDir), 0.0);
  colour += uMoon * 0.12 * pow(toMoon, 30.0) * uNight;
  return colour;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uBed;
varying float vDepth;
varying vec2 vFlow;
varying float vFall;
varying vec3 vAbsorb;
vec3 hwSkyAlong(vec3 dir);
#include <hw_fragment_head>
${WATER_SKY_GLSL}

void main() {
  float t = uHwTime;
  vec2 hwP = vHwWorld.xz;
  vec3 hwView = normalize(cameraPosition - vHwWorld);
  // Seen from its underside: the face turned to the eye faces down. A fall's sheet seen from below its top is still seen from above.
  vec3 hwFace = normalize(cross(dFdx(vHwWorld), dFdy(vHwWorld)));
  bool hwBelow = hwFace.y * dot(hwFace, hwView) < 0.0;
  float hwDepth = max(vDepth, 0.0);
  vec3 hwAbsorb = vAbsorb;
  float hwMoving = clamp(length(vFlow), 0.0, 1.0);
  vec2 hwFlowDir = hwMoving > 0.01 ? normalize(vFlow) : vec2(1.0, 0.0);
  float hwFalling = smoothstep(0.4, 2.0, vFall);
  vec3 hwLight = uHwSkyLight + uHwSunLight;

  float hwIce = 0.0;
  vec2 hwRippleP = hwP;
  vec3 hwNormal = vec3(0.0, 1.0, 0.0);
  #include <hw_normal>
  hwNormal = normalize(hwNormal);

  vec3 hwBed = uShallow * hwLight;
  #include <hw_surface>

  vec3 hwBody = mix(hwBed, uDeep * hwLight, smoothstep(0.05, 2.6, hwDepth) * (1.0 - 0.5 * hwMoving));
  vec3 hwReflect = mix(uHwHaze, uSky, 0.7) * mix(vec3(1.0), hwLight, 0.5);
  float hwFresnel = 0.08 + 0.45 * pow(1.0 - max(dot(hwView, hwNormal), 0.0), 3.0);
  vec3 hwSpecular = vec3(0.0);

  // A river's streaks run the way it flows, and it runs fast and white where it falls.
  float along = dot(hwP, hwFlowDir);
  float across = dot(hwP, vec2(-hwFlowDir.y, hwFlowDir.x));
  float speed = 1.2 + 4.0 * hwFalling;
  float streak = hwValueNoise(vec2(along * 0.5 - t * speed, across * 3.0)) * hwValueNoise(vec2(along * 1.4 - t * speed * 1.3, across * 6.0 + 4.0));
  float hwFoam = max(hwMoving * smoothstep(0.4, 0.65, streak) * 0.35, hwFalling * (0.65 + 0.35 * streak));
  #include <hw_light>

  vec3 colour = mix(hwBody, hwReflect, hwFresnel) + hwSpecular;
  colour = mix(colour, uFoam * hwLight, clamp(hwFoam, 0.0, 1.0) * 0.85);
  vec3 hwColour = hwAtmosphere(colour, vHwWorld);
  #include <hw_colour>
  gl_FragColor = vec4(hwColour, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** The water lying on a tile, or null when it is dry: a grid at the water table, over every square any of whose corners is under water. */
export function waterGeometry(tile: LandTile): BufferGeometry | null {
  if (!tile.wet) return null;
  const { side, spacing, x0, z0 } = tile;
  const count = side * side;
  const positions = new Float32Array(count * 3);
  const depths = new Float32Array(count);
  for (let v = 0; v < count; v++) depths[v] = tile.water[v] - tile.heights[v];
  for (let v = 0; v < count; v++) {
    const c = v % side;
    const r = Math.floor(v / side);
    // On dry ground at the water's edge the surface stays level with the water beside it, under the bank, rather than climbing to another terrace's water table.
    let level = tile.water[v];
    if (depths[v] < 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const n = (r + dr) * side + c + dc;
          if (r + dr >= 0 && c + dc >= 0 && r + dr < side && c + dc < side && depths[n] >= 0) level = Math.min(level, tile.water[n]);
        }
      }
    }
    positions.set([x0 + c * spacing, level, z0 + r * spacing], v * 3);
  }
  const indices: number[] = [];
  for (let r = 0; r < side - 1; r++) {
    for (let c = 0; c < side - 1; c++) {
      const a = r * side + c;
      if ([a, a + side, a + 1, a + side + 1].every((i) => depths[i] < -0.3)) continue;
      indices.push(a, a + side, a + 1, a + 1, a + side, a + side + 1);
    }
  }
  if (indices.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("depth", new BufferAttribute(depths, 1));
  geometry.setAttribute("flow", new BufferAttribute(tile.flow, 2));
  geometry.setAttribute("fall", new BufferAttribute(tile.fall, 1));
  geometry.setAttribute("absorb", tileAbsorption(tile.regions, count));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** A round pool of still water at height 0, deepest in its middle, its shore at `radius`: a tarn or a pond shown on its own. */
export function poolGeometry(radius: number): BufferGeometry {
  const rings = 8;
  const segments = 40;
  const positions: number[] = [0, 0, 0];
  const depths: number[] = [1.8];
  for (let r = 1; r <= rings; r++) {
    const out = (r / rings) * radius * 1.06;
    for (let s = 0; s < segments; s++) {
      const angle = (s / segments) * Math.PI * 2;
      positions.push(Math.cos(angle) * out, 0, Math.sin(angle) * out);
      depths.push(1.8 * (1 - (out / radius) ** 2));
    }
  }
  const indices: number[] = [];
  for (let s = 0; s < segments; s++) indices.push(0, 1 + ((s + 1) % segments), 1 + s);
  for (let r = 1; r < rings; r++) {
    const inner = 1 + (r - 1) * segments;
    const outer = 1 + r * segments;
    for (let s = 0; s < segments; s++) {
      const n = (s + 1) % segments;
      indices.push(inner + s, inner + n, outer + s, inner + n, outer + n, outer + s);
    }
  }
  const count = positions.length / 3;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("depth", new BufferAttribute(new Float32Array(depths), 1));
  geometry.setAttribute("flow", new BufferAttribute(new Float32Array(count * 2), 2));
  geometry.setAttribute("fall", new BufferAttribute(new Float32Array(count), 1));
  geometry.setAttribute("absorb", regionAbsorption("highlands", count));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** The uniforms every water shader shares: the palette's water, and the sky it mirrors. */
export function waterUniforms(palette: Palette, sky: SkyUniforms) {
  return {
    uSky: sky.uSky,
    uMoonDir: sky.uMoonDir,
    uNight: sky.uNight,
    uMoon: sky.uMoon,
    uShallow: { value: new Color().copy(palette.things["water-shallow"]) },
    uDeep: { value: new Color().copy(palette.things["water-deep"]) },
    uFoam: { value: new Color().copy(palette.things["water-foam"]) },
    // The bed as the land draws it under shallow water: its shore, stonier.
    uBed: { value: new Color().copy(palette.things["ground-shore"]).lerp(palette.things.rock, 0.4) },
  };
}

export function waterMaterial(palette: Palette, atmosphere: AtmosphereUniforms, sky: SkyUniforms): ShaderMaterial {
  return shadeCustom("water", atmosphere, {
    uniforms: waterUniforms(palette, sky),
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    // A fall's sheet is seen from below as well as from above, and so is a lake by an eye under it.
    side: DoubleSide,
  });
}

/** A mesh of water: drawn on the late layer, after the passes that read the scene behind it (refraction, reflections). */
export function waterMesh(geometry: BufferGeometry, material: Material): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.layers.set(LATE_LAYER);
  return mesh;
}
