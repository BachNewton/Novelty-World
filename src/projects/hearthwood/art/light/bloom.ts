import { AdditiveBlending, HalfFloatType, LinearFilter, ShaderMaterial, Vector2, WebGLRenderTarget, type Texture, type WebGLRenderer } from "three";
import type { FeatureArt } from "../feature-art";
import { FULL_SCREEN_VERTEX, FullScreen } from "../passes";
import { SRGB_GLSL } from "./srgb";

/*
 * Bloom (`bloom`), a pass over the finished frame: the brightest parts of
 * the picture (the campfire and its glow, the sun, the moon and its halo)
 * spill a soft glow into what is round them, the way light blooms in the
 * eye and through a lens. Their light above a threshold is shrunk by halves
 * into a chain of ever smaller, ever blurrier copies (a wide filter at each
 * step, so nothing flickers as it moves), which are then grown back up and
 * added together, so the glow has a tight core and a wide soft skirt. The
 * frame is as the screen shows it, so the threshold is on what shows as
 * bright, and warm light, the fire's, blooms a little more readily.
 */

/** How many halvings the glow spreads over. */
const LEVELS = 6;
/** How bright, as shown, a pixel must be to bloom, and the soft knee under it. */
const THRESHOLD = 0.86;
const KNEE = 0.12;
const STRENGTH = 0.4;

const PREFILTER = /* glsl */ `
uniform sampler2D tColour;
uniform vec2 uTexel;
varying vec2 vUv;
${SRGB_GLSL}
vec3 bright(vec2 at) {
  vec3 c = texture2D(tColour, at).rgb;
  float shown = max(c.r, max(c.g, c.b));
  // Warm light blooms a little more readily than cool.
  shown += 0.12 * clamp(c.r - c.b, 0.0, 1.0);
  float soft = clamp(shown - ${THRESHOLD} + ${KNEE}, 0.0, 2.0 * ${KNEE});
  soft = soft * soft / (4.0 * ${KNEE} + 1e-4);
  float kept = max(soft, shown - ${THRESHOLD}) / max(shown, 1e-4);
  return hwToLinear(c) * kept;
}
void main() {
  vec2 d = uTexel;
  vec3 sum = bright(vUv) * 0.5;
  sum += (bright(vUv + vec2(-d.x, -d.y)) + bright(vUv + vec2(d.x, -d.y)) + bright(vUv + vec2(-d.x, d.y)) + bright(vUv + vec2(d.x, d.y))) * 0.125;
  gl_FragColor = vec4(sum, 1.0);
}
`;

/** Halving with a wide, overlapping filter (thirteen taps), so a small bright thing never pops in and out as it moves. */
const DOWN = /* glsl */ `
uniform sampler2D tColour;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 d = uTexel;
  vec3 a = texture2D(tColour, vUv + d * vec2(-2.0, -2.0)).rgb;
  vec3 b = texture2D(tColour, vUv + d * vec2(0.0, -2.0)).rgb;
  vec3 c = texture2D(tColour, vUv + d * vec2(2.0, -2.0)).rgb;
  vec3 e = texture2D(tColour, vUv + d * vec2(-2.0, 0.0)).rgb;
  vec3 f = texture2D(tColour, vUv).rgb;
  vec3 g = texture2D(tColour, vUv + d * vec2(2.0, 0.0)).rgb;
  vec3 h = texture2D(tColour, vUv + d * vec2(-2.0, 2.0)).rgb;
  vec3 i = texture2D(tColour, vUv + d * vec2(0.0, 2.0)).rgb;
  vec3 j = texture2D(tColour, vUv + d * vec2(2.0, 2.0)).rgb;
  vec3 k = texture2D(tColour, vUv + d * vec2(-1.0, -1.0)).rgb;
  vec3 l = texture2D(tColour, vUv + d * vec2(1.0, -1.0)).rgb;
  vec3 m = texture2D(tColour, vUv + d * vec2(-1.0, 1.0)).rgb;
  vec3 n = texture2D(tColour, vUv + d * vec2(1.0, 1.0)).rgb;
  vec3 sum = f * 0.125 + (a + c + h + j) * 0.03125 + (b + e + g + i) * 0.0625 + (k + l + m + n) * 0.125;
  gl_FragColor = vec4(sum, 1.0);
}
`;

/** Growing back with a tent, added onto the level above. */
const UP = /* glsl */ `
uniform sampler2D tColour;
uniform vec2 uTexel;
uniform float uWeight;
varying vec2 vUv;
void main() {
  vec2 d = uTexel;
  vec3 sum = texture2D(tColour, vUv).rgb * 4.0;
  sum += (texture2D(tColour, vUv + vec2(d.x, 0.0)).rgb + texture2D(tColour, vUv - vec2(d.x, 0.0)).rgb + texture2D(tColour, vUv + vec2(0.0, d.y)).rgb + texture2D(tColour, vUv - vec2(0.0, d.y)).rgb) * 2.0;
  sum += texture2D(tColour, vUv + d).rgb + texture2D(tColour, vUv - d).rgb + texture2D(tColour, vUv + vec2(d.x, -d.y)).rgb + texture2D(tColour, vUv + vec2(-d.x, d.y)).rgb;
  gl_FragColor = vec4(sum / 16.0 * uWeight, 1.0);
}
`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tColour;
uniform sampler2D tBloom;
uniform float uStrength;
varying vec2 vUv;
${SRGB_GLSL}
void main() {
  vec4 shown = texture2D(tColour, vUv);
  vec3 glow = texture2D(tBloom, vUv).rgb * uStrength;
  vec3 c = hwToLinear(shown.rgb) + glow;
  // A soft shoulder, so the glow over something already bright never clips harshly.
  c = c / (1.0 + max(vec3(0.0), c - 0.85) * 0.6);
  gl_FragColor = vec4(hwToSrgb(c), shown.a);
}
`;

function material(fragmentShader: string, extra: Record<string, { value: unknown }> = {}): ShaderMaterial {
  return new ShaderMaterial({ uniforms: { tColour: { value: null }, uTexel: { value: new Vector2() }, ...extra }, vertexShader: FULL_SCREEN_VERTEX, fragmentShader });
}

function level(width: number, height: number): WebGLRenderTarget {
  return new WebGLRenderTarget(width, height, { type: HalfFloatType, depthBuffer: false, magFilter: LinearFilter, minFilter: LinearFilter });
}

function sizeOf(width: number, height: number, i: number): [number, number] {
  return [Math.max(1, Math.round(width / 2 ** (i + 1))), Math.max(1, Math.round(height / 2 ** (i + 1)))];
}

function draw(gl: WebGLRenderer, quad: FullScreen, source: Texture, sourceSize: [number, number], target: WebGLRenderTarget): void {
  quad.material.uniforms.tColour.value = source;
  (quad.material.uniforms.uTexel.value as Vector2).set(1 / sourceSize[0], 1 / sourceSize[1]);
  quad.render(gl, target);
}

export const BLOOM_ART: FeatureArt = {
  feature: "bloom",
  passes: [
    {
      id: "bloom",
      stage: "post",
      order: 100,
      create: () => {
        const prefilter = new FullScreen(material(PREFILTER));
        const down = new FullScreen(material(DOWN));
        const upMaterial = material(UP, { uWeight: { value: 1 } });
        upMaterial.blending = AdditiveBlending;
        const up = new FullScreen(upMaterial);
        const composite = new FullScreen(material(COMPOSITE, { tBloom: { value: null }, uStrength: { value: STRENGTH } }));
        let levels: WebGLRenderTarget[] = [];
        let size: [number, number] = [1, 1];
        const setSize = (width: number, height: number) => {
          size = [width, height];
          for (const target of levels) target.dispose();
          levels = Array.from({ length: LEVELS }, (_, i) => level(...sizeOf(width, height, i)));
        };
        return {
          setSize,
          render: ({ gl, colour, output }) => {
            if (!colour) throw new Error("Bloom is a post pass, and needs the frame's colour");
            draw(gl, prefilter, colour, size, levels[0]);
            for (let i = 1; i < LEVELS; i++) draw(gl, down, levels[i - 1].texture, sizeOf(size[0], size[1], i - 1), levels[i]);
            const autoClear = gl.autoClear;
            gl.autoClear = false;
            for (let i = LEVELS - 1; i > 0; i--) {
              upMaterial.uniforms.uWeight.value = 0.85;
              draw(gl, up, levels[i].texture, sizeOf(size[0], size[1], i), levels[i - 1]);
            }
            gl.autoClear = autoClear;
            composite.material.uniforms.tColour.value = colour;
            composite.material.uniforms.tBloom.value = levels[0].texture;
            composite.render(gl, output);
          },
          dispose: () => {
            for (const target of levels) target.dispose();
            prefilter.dispose();
            down.dispose();
            up.dispose();
            composite.dispose();
          },
        };
      },
    },
  ],
};
