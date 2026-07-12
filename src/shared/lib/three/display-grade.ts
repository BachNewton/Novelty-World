import * as THREE from "three";
import { registerGlobalUniforms } from "./global-material-uniforms";

/**
 * A display-space colour grade — saturation + contrast — that costs **no pass and no framebuffer**.
 *
 * ## Why this is not a post-processing pass
 *
 * It used to be one: a `ShaderPass` at the end of an `EffectComposer`. That is the textbook place for a
 * grade, and it is what every three.js example does. It was also, measured, the single most expensive
 * thing in the frame after the water — not because a saturation multiply is expensive, but because
 * *wanting one at all* forced an `EffectComposer` into existence, and a composer means the scene is
 * rendered into a HalfFloat + 4x-MSAA offscreen target that must be resolved and blitted every frame.
 * On a bandwidth-starved iGPU that is ~7 ms at 1080p and ~13 ms at a 1.5x render scale — paid on an
 * EMPTY frame, because it scales with pixels and not with content. Three multiplies were dragging a
 * whole HDR pipeline behind them.
 *
 * So the grade moves into the tone-mapping step, which every material already runs. three has a
 * sanctioned hook for exactly this: `CustomToneMapping`, whose body is a stub in the stock
 * `tonemapping_pars_fragment` chunk, is intended to be replaced. We replace it with "run the operator
 * you actually asked for, then grade the result". Now:
 *
 *   - with bloom OFF (the default) there is **no composer at all** — the scene renders straight to the
 *     default framebuffer, which also hands back the context's cheap driver-resolved MSAA;
 *   - with bloom ON the composer still runs, and `OutputPass` — which supports `CUSTOM_TONE_MAPPING`
 *     natively — picks up the very same patched function. ONE implementation covers both paths.
 *
 * ## Why it grades in encoded space, and why that costs two transfers
 *
 * The old pass ran *after* `OutputPass`, i.e. on sRGB-**encoded** values: contrast pivoted about
 * display mid-grey, saturation mixed against display luma. Tone mapping runs one step earlier, on
 * linear display-referred values, and a contrast pivot about 0.5 means something different there. To
 * keep the look **identical** — these values were graded by eye, and re-deriving them would be
 * guessing at what someone already decided — we encode, grade exactly as before, and decode. three's
 * `colorspace_fragment` then re-encodes on the way out, so the round trip cancels and the pixels match
 * the old pipeline. The price is two sRGB transfers per fragment, which is arithmetic, not bandwidth.
 *
 * Defaults are INERT (saturation 1, contrast 1 — identity), because this patches the `THREE` singleton
 * for the whole page: any other scene must render exactly as it did before.
 */

/** Shared by every material via `registerGlobalUniforms` — mutate `.value` to grade the whole scene. */
export const GRADE_UNIFORMS: Record<string, THREE.IUniform> = {
  uGradeSaturation: { value: 1 },
  uGradeContrast: { value: 1 },
  uGradeToneOp: { value: 0 },
};

/**
 * Which operator `CustomToneMapping` should run before grading.
 *
 * `renderer.toneMapping` is occupied by `CustomToneMapping` itself once this is installed, so the real
 * choice has to live somewhere else. A uniform, not a `#define`: switching the operator then costs a
 * uniform write instead of recompiling every shader in the scene.
 */
const TONE_OPS = new Map<THREE.ToneMapping, number>([
  [THREE.AgXToneMapping, 0],
  [THREE.ACESFilmicToneMapping, 1],
  [THREE.NeutralToneMapping, 2],
  [THREE.ReinhardToneMapping, 3],
  [THREE.CineonToneMapping, 4],
  [THREE.LinearToneMapping, 5],
]);

const GRADE_PARS = /* glsl */ `
uniform float uGradeSaturation;
uniform float uGradeContrast;
uniform int uGradeToneOp;

// The sRGB transfer pair, written out here rather than reused from three's \`colorspace_pars_fragment\`:
// that chunk is included AFTER this one, and GLSL needs the declaration before the call.
vec3 noveltySrgbEncode( vec3 c ) {
  return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( vec3( 0.0031308 ), c ) );
}
vec3 noveltySrgbDecode( vec3 c ) {
  return mix( c / 12.92, pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ), step( vec3( 0.04045 ), c ) );
}
`;

/** three's stub, verbatim. Replacing it (rather than appending) keeps the chunk compiling exactly once. */
const CUSTOM_STUB = "vec3 CustomToneMapping( vec3 color ) { return color; }";

const CUSTOM_GRADED = /* glsl */ `
vec3 CustomToneMapping( vec3 color ) {

  // The operator the caller actually chose. Each of three's operators applies toneMappingExposure
  // itself, so exposure is already handled inside these.
  vec3 mapped;
  if ( uGradeToneOp == 1 ) mapped = ACESFilmicToneMapping( color );
  else if ( uGradeToneOp == 2 ) mapped = NeutralToneMapping( color );
  else if ( uGradeToneOp == 3 ) mapped = ReinhardToneMapping( color );
  else if ( uGradeToneOp == 4 ) mapped = CineonToneMapping( color );
  else if ( uGradeToneOp == 5 ) mapped = LinearToneMapping( color );
  else mapped = AgXToneMapping( color );

  // Grade where the old full-screen pass graded: sRGB-encoded display space. Clamp before the encode —
  // pow() of a negative is NaN, and an operator can hand back a hair below zero.
  vec3 s = noveltySrgbEncode( clamp( mapped, 0.0, 1.0 ) );
  float l = dot( s, vec3( 0.2126, 0.7152, 0.0722 ) ); // display-space luma (post-tonemap)
  s = mix( vec3( l ), s, uGradeSaturation );          // saturation about luma
  s = ( s - 0.5 ) * uGradeContrast + 0.5;             // contrast about mid-grey

  // Back to linear: colorspace_fragment re-encodes after us, so the round trip cancels.
  return noveltySrgbDecode( clamp( s, 0.0, 1.0 ) );

}
`;

/** A re-evaluated module must SEE its own prior work: module scope resets on hot reload, `THREE` does not. */
const SENTINEL = "// novelty-display-grade-installed";

let installed = false;
let users = 0;
let pristinePars: string | undefined;
let releaseUniforms: (() => void) | undefined;

/**
 * Patch three's tone-mapping chunk so `CustomToneMapping` runs the chosen operator and then grades.
 * Idempotent and ref-counted; the last caller out restores three byte-for-byte.
 */
export const installDisplayGrade = (): void => {
  users++;
  if (installed || THREE.ShaderChunk.tonemapping_pars_fragment.includes(SENTINEL)) {
    installed = true;
    return;
  }
  installed = true;

  if (!THREE.ShaderChunk.tonemapping_pars_fragment.includes(CUSTOM_STUB)) {
    throw new Error("Display grade: three's CustomToneMapping stub no longer matches");
  }
  pristinePars = THREE.ShaderChunk.tonemapping_pars_fragment;
  THREE.ShaderChunk.tonemapping_pars_fragment = `${SENTINEL}\n${GRADE_PARS}${pristinePars.replace(
    CUSTOM_STUB,
    CUSTOM_GRADED,
  )}`;

  releaseUniforms = registerGlobalUniforms(GRADE_UNIFORMS);
};

/** Put three back as we found it, and make the uniforms inert first in case a frame lands in between. */
export const uninstallDisplayGrade = (): void => {
  users = Math.max(0, users - 1);
  if (users > 0 || !installed) return;

  GRADE_UNIFORMS.uGradeSaturation.value = 1;
  GRADE_UNIFORMS.uGradeContrast.value = 1;

  if (pristinePars !== undefined) THREE.ShaderChunk.tonemapping_pars_fragment = pristinePars;
  pristinePars = undefined;
  releaseUniforms?.();
  releaseUniforms = undefined;
  installed = false;
};

/** The renderer's tone mapping must stay `CustomToneMapping`; the real operator rides a uniform. */
export const setGradeToneMapping = (mode: THREE.ToneMapping): void => {
  GRADE_UNIFORMS.uGradeToneOp.value = TONE_OPS.get(mode) ?? 0;
};

export const setGradeValues = (saturation: number, contrast: number): void => {
  GRADE_UNIFORMS.uGradeSaturation.value = saturation;
  GRADE_UNIFORMS.uGradeContrast.value = contrast;
};
