import { BufferAttribute, BufferGeometry, Color, DoubleSide, type ShaderMaterial } from "three";
import type { LandTile } from "../engine/tiles";
import type { AtmosphereUniforms } from "./atmosphere";
import { CURVATURE } from "./terrain";
import type { Palette } from "./palette";
import { shadeCustom } from "./shading";
import type { SkyUniforms } from "./sky";

/*
 * Water, opaque (no blending, so no overdraw) and lit by its own small
 * shader: clear shallows to deep blue by how far the bed lies below, a slow
 * foam round the shore, the sky at a glancing angle and glints of sun. Where
 * a river runs, streaks of foam run the way it flows; where it drops over a
 * fall it runs fast and white.
 */

const VERTEX = /* glsl */ `
attribute float depth;
attribute vec2 flow;
attribute float fall;
varying float vDepth;
varying vec2 vFlow;
varying float vFall;
#include <hw_vertex_head>
void main() {
  vDepth = depth;
  vFlow = flow;
  vFall = fall;
  vec3 transformed = (modelMatrix * vec4(position, 1.0)).xyz;
  ${CURVATURE}
  #include <hw_vertex>
  vHwWorld = transformed;
  gl_Position = projectionMatrix * viewMatrix * vec4(transformed, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uSky;
varying float vDepth;
varying vec2 vFlow;
varying float vFall;
#include <hw_fragment_head>

void main() {
  float t = uHwTime;
  vec2 p = vHwWorld.xz;
  float moving = clamp(length(vFlow), 0.0, 1.0);
  vec2 way = moving > 0.01 ? normalize(vFlow) : vec2(1.0, 0.0);
  float along = dot(p, way);
  float across = dot(p, vec2(-way.y, way.x));
  float falling = smoothstep(0.4, 2.0, vFall);
  float speed = 1.2 + 4.0 * falling;

  vec2 still = vec2(hwValueNoise(p * 0.35 + vec2(t * 0.25, 0.0)) - 0.5, hwValueNoise(p * 0.35 + vec2(0.0, t * 0.21) + 7.0) - 0.5) * 0.22;
  still += vec2(hwValueNoise(p * 1.3 - t * 0.4) - 0.5, hwValueNoise(p * 1.3 + 3.0 + t * 0.35) - 0.5) * 0.08;
  vec2 running = vec2(hwValueNoise(vec2(along * 0.8 - t * 2.0, across * 0.7)) - 0.5, hwValueNoise(vec2(along * 0.7 - t * 1.6, across * 0.7 + 9.0)) - 0.5) * 0.35;
  vec2 ripple = mix(still, running, moving);

  vec3 view = normalize(cameraPosition - vHwWorld);
  vec3 hwNormal = normalize(vec3(ripple.x, 1.0, ripple.y));
  #include <hw_normal>
  hwNormal = normalize(hwNormal);
  float fresnel = pow(1.0 - max(dot(view, hwNormal), 0.0), 3.0);
  vec4 diffuseColor = vec4(mix(uShallow, uDeep, smoothstep(0.05, 2.6, vDepth) * (1.0 - 0.5 * moving)), 1.0);
  #include <hw_surface>
  vec3 hwDirect = diffuseColor.rgb * uHwSunLight;
  vec3 hwIndirect = diffuseColor.rgb * uHwSkyLight;
  #include <hw_light>
  vec3 light = uHwSkyLight + uHwSunLight;
  vec3 sky = mix(uHwHaze, uSky, 0.7) * mix(vec3(1.0), light, 0.5);
  vec3 colour = mix(hwDirect + hwIndirect, sky, 0.08 + 0.45 * fresnel);
  float glint = pow(max(dot(reflect(-view, hwNormal), uHwSunDir), 0.0), 180.0) * smoothstep(-0.05, 0.1, uHwSunDir.y);
  colour += uHwSunColor * glint * 2.2;

  float shore = 1.0 - smoothstep(0.0, 0.28 + 0.12 * sin(t * 0.8 + p.x * 0.3 + p.y * 0.2), vDepth);
  float lace = smoothstep(0.45, 0.75, hwValueNoise(p * 2.2 + t * 0.15));
  float streak = hwValueNoise(vec2(along * 0.5 - t * speed, across * 3.0)) * hwValueNoise(vec2(along * 1.4 - t * speed * 1.3, across * 6.0 + 4.0));
  float white = max(shore * (0.5 + 0.5 * lace) * 0.85, moving * smoothstep(0.4, 0.65, streak) * 0.35);
  white = max(white, falling * (0.65 + 0.35 * streak));
  colour = mix(colour, uFoam * light, clamp(white, 0.0, 1.0) * 0.85);
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
  for (let v = 0; v < count; v++) {
    positions.set([x0 + (v % side) * spacing, tile.water[v], z0 + Math.floor(v / side) * spacing], v * 3);
    depths[v] = tile.water[v] - tile.heights[v];
  }
  const indices: number[] = [];
  for (let r = 0; r < side - 1; r++) {
    for (let c = 0; c < side - 1; c++) {
      const a = r * side + c;
      const quad = [a, a + side, a + 1, a + side + 1];
      if (quad.every((i) => depths[i] < -0.3)) continue;
      indices.push(a, a + side, a + 1, a + 1, a + side, a + side + 1);
    }
  }
  if (indices.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("depth", new BufferAttribute(depths, 1));
  geometry.setAttribute("flow", new BufferAttribute(tile.flow, 2));
  geometry.setAttribute("fall", new BufferAttribute(tile.fall, 1));
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
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function waterMaterial(palette: Palette, atmosphere: AtmosphereUniforms, sky: SkyUniforms): ShaderMaterial {
  return shadeCustom("water", atmosphere, {
    uniforms: {
      uSky: sky.uSky,
      uShallow: { value: new Color().copy(palette.things["water-shallow"]) },
      uDeep: { value: new Color().copy(palette.things["water-deep"]) },
      uFoam: { value: new Color().copy(palette.things["water-foam"]) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    // A fall's sheet is seen from below as well as from above.
    side: DoubleSide,
  });
}
