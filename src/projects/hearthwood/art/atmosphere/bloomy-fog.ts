import { HalfFloatType, LinearFilter, ShaderMaterial, Vector2, WebGLRenderTarget, type Texture } from "three";
import type { FeatureArt } from "../feature-art";
import { FULL_SCREEN_VERTEX, FullScreen } from "../passes";

/*
 * Bloomy fog: bright lights glow through damp air. Over the finished frame,
 * what is bright (the fire and its embers at night, the sun low in a misty
 * sky) is picked out, spread wide by blurring it down a chain of ever
 * smaller frames and back up, and laid back over the frame, as a soft halo
 * whose strength is how much mist, rain and haze the weather holds: on a
 * crisp clear day there is hardly a glow, in a misty dawn the sun and the
 * fire bloom. It works on the frame as it shows, as every pass does.
 */

/** How many times the bright parts are halved, and so how wide the glow spreads. */
const LEVELS = 5;

const BRIGHT = /* glsl */ `
uniform sampler2D tColour;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tColour, vUv).rgb;
  float peak = max(c.r, max(c.g, c.b));
  // A soft knee, so nothing pops in as it crosses the threshold.
  float over = smoothstep(uThreshold, 1.0, peak);
  gl_FragColor = vec4(c * over * over, 1.0);
}
`;

// A soft 9-tap blur, half a texel apart, used both down and up the chain.
const BLUR = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uTexel;
uniform sampler2D tAdd;
uniform float uAdd;
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 sum = texture2D(tSource, vUv).rgb * 4.0;
  sum += texture2D(tSource, vUv + vec2(-o.x, -o.y)).rgb;
  sum += texture2D(tSource, vUv + vec2(o.x, -o.y)).rgb;
  sum += texture2D(tSource, vUv + vec2(-o.x, o.y)).rgb;
  sum += texture2D(tSource, vUv + vec2(o.x, o.y)).rgb;
  sum += texture2D(tSource, vUv + vec2(-2.0 * o.x, 0.0)).rgb * 2.0;
  sum += texture2D(tSource, vUv + vec2(2.0 * o.x, 0.0)).rgb * 2.0;
  sum += texture2D(tSource, vUv + vec2(0.0, -2.0 * o.y)).rgb * 2.0;
  sum += texture2D(tSource, vUv + vec2(0.0, 2.0 * o.y)).rgb * 2.0;
  vec3 blurred = sum / 16.0;
  gl_FragColor = vec4(blurred + texture2D(tAdd, vUv).rgb * uAdd, 1.0);
}
`;

const COMPOSE = /* glsl */ `
uniform sampler2D tColour;
uniform sampler2D tGlow;
uniform float uStrength;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tColour, vUv);
  vec3 glow = texture2D(tGlow, vUv).rgb * uStrength;
  // Screened over the frame, so the glow lifts the dark round a light and never burns out what is already bright.
  gl_FragColor = vec4(1.0 - (1.0 - c.rgb) * (1.0 - min(glow, vec3(1.0))), c.a);
}
`;

function halfTarget(): WebGLRenderTarget {
  return new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false, magFilter: LinearFilter, minFilter: LinearFilter });
}

export const BLOOMY_FOG_ART: FeatureArt = {
  feature: "bloomyFog",
  passes: [
    {
      id: "bloomy-fog",
      stage: "post",
      // Before the frame's own grade and vignette, so they lie over the glow too.
      order: 100,
      create: () => {
        const bright = new FullScreen(new ShaderMaterial({ uniforms: { tColour: { value: null }, uThreshold: { value: 0.82 } }, vertexShader: FULL_SCREEN_VERTEX, fragmentShader: BRIGHT }));
        const blur = new FullScreen(
          new ShaderMaterial({
            uniforms: { tSource: { value: null }, uTexel: { value: new Vector2() }, tAdd: { value: null }, uAdd: { value: 0 } },
            vertexShader: FULL_SCREEN_VERTEX,
            fragmentShader: BLUR,
          }),
        );
        const compose = new FullScreen(
          new ShaderMaterial({ uniforms: { tColour: { value: null }, tGlow: { value: null }, uStrength: { value: 0 } }, vertexShader: FULL_SCREEN_VERTEX, fragmentShader: COMPOSE }),
        );
        const down = Array.from({ length: LEVELS }, halfTarget);
        const up = Array.from({ length: LEVELS - 1 }, halfTarget);
        const sizes = Array.from({ length: LEVELS }, () => new Vector2(1, 1));
        const texel = new Vector2();
        const pass = (source: Texture, target: WebGLRenderTarget, texel: Vector2, add: Texture | null, gl: Parameters<FullScreen["render"]>[0]) => {
          const u = blur.material.uniforms;
          u.tSource.value = source;
          (u.uTexel.value as Vector2).copy(texel);
          u.tAdd.value = add ?? source;
          u.uAdd.value = add ? 1 : 0;
          blur.render(gl, target);
        };
        return {
          setSize: (width, height) => {
            let w = width;
            let h = height;
            for (let i = 0; i < LEVELS; i++) {
              w = Math.max(1, Math.ceil(w / 2));
              h = Math.max(1, Math.ceil(h / 2));
              sizes[i].set(w, h);
              down[i].setSize(w, h);
              if (i < LEVELS - 1) up[i].setSize(w, h);
            }
          },
          render: ({ gl, colour, output, weather }) => {
            if (!colour) throw new Error("Bloomy fog is a post pass, and needs the frame");
            const w = weather.weather;
            const damp = Math.min(1, w.mist * 0.8 + w.precipitation * 0.6 + Math.max(0, w.haze - 0.3) * 0.18);
            bright.material.uniforms.tColour.value = colour;
            bright.render(gl, down[0]);
            for (let i = 1; i < LEVELS; i++) pass(down[i - 1].texture, down[i], texel.set(1 / sizes[i - 1].x, 1 / sizes[i - 1].y), null, gl);
            // Back up the chain, each level blurred and added to the one above it.
            let glow = down[LEVELS - 1].texture;
            for (let i = LEVELS - 2; i >= 0; i--) {
              pass(glow, up[i], texel.set(0.5 / sizes[i + 1].x, 0.5 / sizes[i + 1].y), down[i].texture, gl);
              glow = up[i].texture;
            }
            const u = compose.material.uniforms;
            u.tColour.value = colour;
            u.tGlow.value = glow;
            u.uStrength.value = 0.12 + 0.75 * damp;
            compose.render(gl, output);
          },
          dispose: () => {
            bright.dispose();
            blur.dispose();
            compose.dispose();
            for (const target of [...down, ...up]) target.dispose();
          },
        };
      },
    },
  ],
};
