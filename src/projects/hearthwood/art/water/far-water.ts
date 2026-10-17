import type { ShaderMaterial } from "three";
import type { AtmosphereUniforms } from "../atmosphere";
import type { Palette } from "../palette";
import { shadeCustom } from "../shading";
import type { SkyUniforms } from "../sky";
import { CURVATURE } from "../terrain";
import { WATER_COLUMN_GLSL } from "./absorption";
import { WATER_SKY_GLSL, waterUniforms } from "./water";

/*
 * Far water: lakes in the coarse tiles out past where the water is drawn in
 * full, so water reads all the way to the horizon. It is drawn simply, and
 * the same whichever of the near water's features are on: its colour by how
 * far light goes through it, the sky mirrored by Fresnel, flat and still,
 * ending in the air (and under the water, in its fog). It takes the shared
 * hook points only for its declarations and its finished colour, with the
 * near water's locals those may read standing for flat water. The world
 * builds far water only while its feature is on, so its art is only that
 * (`art/features/water.ts`).
 */

const VERTEX = /* glsl */ `
attribute float depth;
attribute vec3 absorb;
varying float vDepth;
varying vec3 vAbsorb;
#include <hw_vertex_head>
void main() {
  vDepth = depth;
  vAbsorb = absorb;
  vec3 transformed = (modelMatrix * vec4(position, 1.0)).xyz;
  ${CURVATURE}
  vHwWorld = transformed;
  gl_Position = projectionMatrix * viewMatrix * vec4(transformed, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uBed;
varying float vDepth;
varying vec3 vAbsorb;
vec3 hwSkyAlong(vec3 dir);
#include <hw_fragment_head>
${WATER_SKY_GLSL}
${WATER_COLUMN_GLSL}
void main() {
  // The near water's locals that its finished colour's chunks may read, for flat water.
  vec3 hwView = normalize(cameraPosition - vHwWorld);
  bool hwBelow = cameraPosition.y < vHwWorld.y;
  vec3 hwNormal = vec3(0.0, 1.0, 0.0);
  vec3 hwAbsorb = vAbsorb;
  vec3 hwLight = uHwSkyLight + uHwSunLight;
  float facing = max(hwView.y, 0.0);
  vec3 body = hwThroughWater(uBed * hwLight, hwAbsorb, max(vDepth, 0.0) * 2.5, hwLight);
  vec3 sky = hwSkyAlong(vec3(-hwView.x, facing, -hwView.z));
  vec3 colour = mix(body, sky, 0.02 + 0.98 * pow(1.0 - facing, 5.0));
  vec3 hwColour = hwAtmosphere(colour, vHwWorld);
  #include <hw_colour>
  gl_FragColor = vec4(hwColour, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function farWaterMaterial(palette: Palette, atmosphere: AtmosphereUniforms, sky: SkyUniforms): ShaderMaterial {
  return shadeCustom("water", atmosphere, { uniforms: waterUniforms(palette, sky), vertexShader: VERTEX, fragmentShader: FRAGMENT });
}
