import { CustomToneMapping, NeutralToneMapping, ShaderChunk, type ToneMapping } from "three";

/*
 * The tone curve (`toneMapping`): how the scene's light, which runs far
 * brighter than a screen, is fitted to it. Hearthwood's own storybook curve
 * keeps every hue true, as Khronos' neutral curve does (a colour is scaled
 * as a whole, never bent channel by channel, so firelight stays orange
 * rather than turning yellow and the sky stays blue rather than cyan), but
 * begins rolling the highlights off earlier and more softly, and bleaches
 * them towards white far less: a sunset, the fire and a lit cloud keep
 * their colour as they brighten, pastel rather than blown out. Its shadows
 * are left as they are rather than deepened, which keeps them soft. Off,
 * the scene is mapped by the plain neutral curve.
 */

const STORYBOOK = /* glsl */ `
vec3 CustomToneMapping( vec3 color ) {
  color = max(color * toneMappingExposure, vec3(0.0));
  float peak = max(color.r, max(color.g, color.b));
  const float START = 0.62;
  if (peak > START) {
    const float SPAN = 1.0 - START;
    float rolled = START + SPAN * (1.0 - exp(-(peak - START) / SPAN));
    color *= rolled / peak;
    float squeezed = 1.0 - rolled / peak;
    color = mix(color, vec3(rolled), 0.35 * squeezed * squeezed);
  }
  return color;
}
`;

const PLAIN = "vec3 CustomToneMapping( vec3 color ) { return color; }";

// Three's custom tone mapping is a placeholder in its shared chunk, filled in once for every shader.
if (ShaderChunk.tonemapping_pars_fragment.includes(PLAIN)) {
  ShaderChunk.tonemapping_pars_fragment = ShaderChunk.tonemapping_pars_fragment.replace(PLAIN, STORYBOOK);
} else if (!ShaderChunk.tonemapping_pars_fragment.includes("const float START = 0.62;")) {
  throw new Error("Three's tone mapping chunk no longer has the custom curve's placeholder");
}

/** The tone mapping the renderer uses, with the storybook curve on or off: switching it recompiles every material that is tone mapped. */
export function toneMappingFor(storybook: boolean): ToneMapping {
  return storybook ? CustomToneMapping : NeutralToneMapping;
}
