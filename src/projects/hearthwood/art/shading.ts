import { DoubleSide, MeshDepthMaterial, ShaderMaterial, type IUniform, type Material, type MeshLambertMaterial, type ShaderMaterialParameters, type WebGLProgramParametersWithUniforms } from "three";
import { featureDefine, liveFeatures, type FeatureSwitches, type FeatureToggles } from "../features";
import { ATMOSPHERE_GLSL, ATMOSPHERE_UNIFORMS_GLSL, NOISE_GLSL, type AtmosphereUniforms } from "./atmosphere";
import { HOOKS, SKY_HOOKS, type FeatureArt, type Hook, type MaterialKind } from "./feature-art";
import { FEATURE_ART } from "./features";
import { patchCaster } from "./shadows/caster-depth";

/*
 * The shared materials, and the features' GLSL compiled into them. Every
 * material in the world is one of a few kinds (see `feature-art.ts`); each
 * is built with every feature's chunks for its kind already in place, each
 * inside `#ifdef` of its feature's define, and carries the defines of the
 * features that are on. Switching a feature changes those defines and
 * recompiles the materials it reaches (three keys its program cache by the
 * defines), so a feature that is off is not in any compiled shader: nothing
 * branches on a switch at run time.
 *
 * Lambert materials (the land, plants, places, Elliott) are three's own with
 * the hooks patched in; the water and the sky are written whole, and mark
 * their hook points with `#include <hw_…>` lines (`hw_vertex_head`,
 * `hw_vertex`, `hw_fragment_head`, `hw_surface`, `hw_normal`, `hw_light`,
 * `hw_colour`) that are filled in here. Either way every material ends in
 * the world's air.
 */

/** A chunk's GLSL under its feature's define, each in its own block so two features' locals never meet. */
function guarded(art: readonly FeatureArt[], kind: MaterialKind, hook: Hook): string {
  const scoped = hook !== "vertexHead" && hook !== "fragmentHead";
  return art
    .flatMap((a) =>
      (a.chunks ?? [])
        .filter((chunk) => chunk.kinds.includes(kind) && chunk[hook] !== undefined)
        .map((chunk) => `#ifdef ${featureDefine(a.feature)}\n${scoped ? `{\n${chunk[hook]}\n}` : chunk[hook]}\n#endif`),
    )
    .join("\n");
}

/** `defined(A) || defined(B)` for the features with GLSL at a hook of a kind, or null when none has any. */
function anyAt(art: readonly FeatureArt[], kind: MaterialKind, hook: Hook): string | null {
  const defines = art.filter((a) => (a.chunks ?? []).some((c) => c.kinds.includes(kind) && c[hook] !== undefined)).map((a) => `defined(${featureDefine(a.feature)})`);
  return defines.length === 0 ? null : defines.join(" || ");
}

/** Code that only exists while some feature at the hook is on. */
function whileAny(art: readonly FeatureArt[], kind: MaterialKind, hook: Hook, code: (chunks: string) => string): string {
  const any = anyAt(art, kind, hook);
  return any === null ? "" : `#if ${any}\n${code(guarded(art, kind, hook))}\n#endif`;
}

/** The features that reach a kind of material. */
function featuresFor(art: readonly FeatureArt[], kind: MaterialKind): FeatureArt[] {
  return art.filter((a) => (a.chunks ?? []).some((c) => c.kinds.includes(kind)));
}

/** The uniforms every feature reaching a kind reads, one object shared by all its materials. */
export function featureUniforms(art: readonly FeatureArt[], kind: MaterialKind): Record<string, IUniform> {
  return Object.assign({}, ...featuresFor(art, kind).map((a) => a.uniforms ?? {})) as Record<string, IUniform>;
}

/** The defines a kind of material carries under some switches: one for each feature that reaches it and is on. */
export function kindDefines(art: readonly FeatureArt[], kind: MaterialKind, toggles: FeatureToggles): Record<string, string> {
  return Object.fromEntries(featuresFor(art, kind).filter((a) => toggles[a.feature]).map((a) => [featureDefine(a.feature), ""]));
}

/** Throws on art that can't be compiled in: a hook the sky doesn't have, two features with the same uniform or pass, a feature listed twice. */
export function checkFeatureArt(art: readonly FeatureArt[]): void {
  const seen = { features: new Set<string>(), uniforms: new Set<string>(), passes: new Set<string>() };
  for (const a of art) {
    if (seen.features.has(a.feature)) throw new Error(`Feature "${a.feature}" has its art listed twice`);
    seen.features.add(a.feature);
    for (const name of Object.keys(a.uniforms ?? {})) {
      if (seen.uniforms.has(name)) throw new Error(`Uniform ${name} of feature "${a.feature}" is another feature's too`);
      seen.uniforms.add(name);
    }
    for (const pass of a.passes ?? []) {
      if (seen.passes.has(pass.id)) throw new Error(`Pass "${pass.id}" of feature "${a.feature}" is another pass's id too`);
      seen.passes.add(pass.id);
    }
    for (const chunk of a.chunks ?? []) {
      if (!chunk.kinds.includes("sky")) continue;
      const wrong = HOOKS.filter((hook) => chunk[hook] !== undefined && !SKY_HOOKS.includes(hook));
      if (wrong.length > 0) throw new Error(`Feature "${a.feature}" gives the sky GLSL at ${wrong.join(", ")}, which it doesn't have`);
    }
  }
}

/** Pastes `code` in after (or before) `anchor`, which must be there. */
function inject(source: string, anchor: string, code: string, before = false): string {
  if (!source.includes(anchor)) throw new Error(`A Hearthwood material's shader has no ${anchor} to patch`);
  return source.replace(anchor, before ? `${code}\n${anchor}` : `${anchor}\n${code}`);
}

const VERTEX_DECLARATIONS = `varying vec3 vHwWorld;\n${ATMOSPHERE_UNIFORMS_GLSL}\n${NOISE_GLSL}`;
const FRAGMENT_DECLARATIONS = `varying vec3 vHwWorld;\n${ATMOSPHERE_GLSL}\n${NOISE_GLSL}`;

/** The water's and the sky's hook points, filled in. */
export function fillHooks(source: string, art: readonly FeatureArt[], kind: MaterialKind): string {
  const filled = source
    .replace("#include <hw_vertex_head>", `${VERTEX_DECLARATIONS}\n${guarded(art, kind, "vertexHead")}`)
    .replace("#include <hw_fragment_head>", `${FRAGMENT_DECLARATIONS}\n${guarded(art, kind, "fragmentHead")}`)
    .replace(/#include <hw_(vertex|surface|normal|light|colour)>/g, (_, hook: Hook) => guarded(art, kind, hook));
  if (filled.includes("#include <hw_")) throw new Error(`A ${kind} shader marks a hook point that doesn't exist`);
  return filled;
}

/** A Lambert material's own GLSL on top of the shared ground: the land's per-pixel ground is one. */
export interface OwnGlsl {
  /** Names its program apart from every other material of its kind. */
  key: string;
  uniforms?: Record<string, IUniform>;
  vertexHead?: string;
  vertex?: string;
  fragmentHead?: string;
  surface?: string;
}

/** Where the world is, for the air, after the vertex is placed. */
const WORLD_POSITION = /* glsl */ `
  vec4 hwWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    hwWorld = instanceMatrix * hwWorld;
  #endif
  vHwWorld = (modelMatrix * hwWorld).xyz;
`;

/** A little noise over the ground, so a field reads as grass and not as paint. */
const GRAIN = /* glsl */ `
  float hwGrain = hwValueNoise(vHwWorld.xz * 0.9) * 0.6 + hwValueNoise(vHwWorld.xz * 3.1) * 0.4;
  diffuseColor.rgb *= 0.82 + 0.36 * hwGrain;
`;

/** Patches any of three's vertex shaders with the vertex hooks of a kind and a material's own vertex GLSL, so whatever moves a vertex there moves it here too. */
export function patchVertex(vertexShader: string, art: readonly FeatureArt[], kind: MaterialKind, own: OwnGlsl | null): string {
  const vertex = inject(vertexShader, "#include <common>", `${VERTEX_DECLARATIONS}\n${own?.vertexHead ?? ""}\n${guarded(art, kind, "vertexHead")}`);
  return inject(vertex, "#include <begin_vertex>", `${own?.vertex ?? ""}\n${guarded(art, kind, "vertex")}`);
}

/** Patches three's Lambert shader with the hooks of a kind, and the material's own GLSL. */
export function patchLambert(shader: { vertexShader: string; fragmentShader: string }, art: readonly FeatureArt[], kind: MaterialKind, own: OwnGlsl | null): void {
  const vertex = inject(patchVertex(shader.vertexShader, art, kind, own), "#include <fog_vertex>", WORLD_POSITION);

  const grained = kind === "land" || kind === "ground";
  let fragment = shader.fragmentShader;
  fragment = inject(fragment, "#include <common>", `${FRAGMENT_DECLARATIONS}\n${own?.fragmentHead ?? ""}\n${guarded(art, kind, "fragmentHead")}`);
  fragment = inject(fragment, "#include <color_fragment>", `${own?.surface ?? ""}\n${grained ? GRAIN : ""}\n${guarded(art, kind, "surface")}`);
  fragment = inject(
    fragment,
    "#include <normal_fragment_maps>",
    `vec3 hwNormal = inverseTransformDirection(normal, viewMatrix);\n${whileAny(art, kind, "normal", (chunks) => `${chunks}\nhwNormal = normalize(hwNormal);\nnormal = normalize((viewMatrix * vec4(hwNormal, 0.0)).xyz);`)}`,
  );
  fragment = inject(
    fragment,
    "#include <lights_fragment_end>",
    whileAny(
      art,
      kind,
      "light",
      (chunks) =>
        `{\nvec3 hwDirect = reflectedLight.directDiffuse;\nvec3 hwIndirect = reflectedLight.indirectDiffuse;\n${chunks}\nreflectedLight.directDiffuse = hwDirect;\nreflectedLight.indirectDiffuse = hwIndirect;\n}`,
    ),
  );
  fragment = inject(
    fragment,
    "#include <tonemapping_fragment>",
    `gl_FragColor.rgb = hwAtmosphere(gl_FragColor.rgb, vHwWorld);\n${whileAny(art, kind, "colour", (chunks) => `{\nvec3 hwColour = gl_FragColor.rgb;\n${chunks}\ngl_FragColor.rgb = hwColour;\n}`)}`,
    true,
  );
  shader.vertexShader = vertex;
  shader.fragmentShader = fragment;
}

/** Keeps every shared material's defines in step with the switches. */
export class ShadingVariants {
  private readonly materials = new Map<Material, MaterialKind>();

  constructor(
    private readonly switches: FeatureSwitches,
    readonly art: readonly FeatureArt[],
  ) {
    checkFeatureArt(art);
    switches.subscribe(() => {
      for (const [material, kind] of this.materials) this.apply(material, kind);
    });
  }

  track(material: Material, kind: MaterialKind): void {
    this.materials.set(material, kind);
    this.apply(material, kind);
    material.addEventListener("dispose", () => this.materials.delete(material));
  }

  /** Sets a material's feature defines, and recompiles it only if they changed. */
  private apply(material: Material, kind: MaterialKind): void {
    const want = kindDefines(this.art, kind, this.switches.toggles());
    const reach = featuresFor(this.art, kind).map((a) => featureDefine(a.feature));
    const defines: Record<string, unknown> = { ...(material.defines ?? {}) };
    let changed = false;
    for (const define of reach) {
      const on = define in want;
      if (on === define in defines) continue;
      if (on) defines[define] = "";
      else delete defines[define];
      changed = true;
    }
    if (!changed) return;
    material.defines = defines;
    material.needsUpdate = true;
  }
}

let shared: ShadingVariants | null = null;

/** This page's variants: every feature's art, under the page's switches. */
export function shadingVariants(): ShadingVariants {
  shared ??= new ShadingVariants(liveFeatures(), FEATURE_ART);
  return shared;
}

export type LambertKind = Extract<MaterialKind, "land" | "ground" | "foliage" | "solid">;

/** What each shared Lambert material was made from, so its shadow depth can move its vertices the same way. */
const LAMBERTS = new WeakMap<Material, { kind: LambertKind; atmosphere: AtmosphereUniforms; uniforms: Record<string, IUniform>; own: OwnGlsl | null }>();

/** A Lambert material made one of the shared kinds: it ends in the world's air and takes every feature's GLSL for its kind. */
export function shadeLambert<M extends MeshLambertMaterial>(material: M, kind: LambertKind, atmosphere: AtmosphereUniforms, own: OwnGlsl | null = null): M {
  const variants = shadingVariants();
  const uniforms = { ...atmosphere, ...featureUniforms(variants.art, kind), ...own?.uniforms };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    patchLambert(shader, variants.art, kind, own);
  };
  material.customProgramCacheKey = () => `hearthwood:${kind}:${own?.key ?? ""}`;
  variants.track(material, kind);
  LAMBERTS.set(material, { kind, atmosphere, uniforms, own });
  return material;
}

const depths = new WeakMap<AtmosphereUniforms, Partial<Record<LambertKind, MeshDepthMaterial>>>();
const ownDepths = new WeakMap<Material, MeshDepthMaterial>();

/** Three's depth material with a kind's vertex hooks (and a material's own vertex GLSL) compiled in under `HW_DEPTH`, made ready for the shadow maps. */
function depthMaterial(kind: LambertKind, uniforms: Record<string, IUniform>, own: OwnGlsl | null): MeshDepthMaterial {
  const variants = shadingVariants();
  // Both faces cast, so open shapes (a trunk, the land's skirts, a leaf) cast from either side.
  const material = new MeshDepthMaterial({ side: DoubleSide });
  material.defines = { HW_DEPTH: "" };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = patchVertex(shader.vertexShader, variants.art, kind, own);
    patchCaster(shader);
  };
  material.customProgramCacheKey = () => `hearthwood:depth:${kind}:${own?.key ?? ""}`;
  variants.track(material, kind);
  return material;
}

/**
 * The depth a kind's things cast their shadows with: three's own, with the
 * kind's vertex hooks compiled in under `HW_DEPTH` (no colour and no normal
 * there), so whatever a feature moves or shrinks casts its shadow where it is
 * drawn. One per kind and air, shared by every mesh that casts with it.
 */
export function shadowDepth(kind: LambertKind, atmosphere: AtmosphereUniforms): MeshDepthMaterial {
  let byKind = depths.get(atmosphere);
  if (!byKind) {
    byKind = {};
    depths.set(atmosphere, byKind);
  }
  const known = byKind[kind];
  if (known) return known;
  const material = depthMaterial(kind, { ...atmosphere, ...featureUniforms(shadingVariants().art, kind) }, null);
  byKind[kind] = material;
  return material;
}

/** The shadow depth of one shared Lambert material, with its own vertex GLSL too (the land's geomorph and the earth's curve), made once; null for any other material. */
export function shadowDepthOf(material: Material): MeshDepthMaterial | null {
  const known = ownDepths.get(material);
  if (known) return known;
  const made = LAMBERTS.get(material);
  if (!made) return null;
  const depth = made.own ? depthMaterial(made.kind, made.uniforms, made.own) : shadowDepth(made.kind, made.atmosphere);
  if (made.own) material.addEventListener("dispose", () => depth.dispose());
  ownDepths.set(material, depth);
  return depth;
}

export type CustomKind = Extract<MaterialKind, "water" | "sky">;

/** A shader of its own made one of the shared kinds: its `#include <hw_…>` hook points filled in, and its defines kept in step. */
export function shadeCustom(kind: CustomKind, atmosphere: AtmosphereUniforms, parameters: ShaderMaterialParameters & { vertexShader: string; fragmentShader: string }): ShaderMaterial {
  const variants = shadingVariants();
  const material = new ShaderMaterial({
    ...parameters,
    uniforms: { ...atmosphere, ...featureUniforms(variants.art, kind), ...parameters.uniforms },
    vertexShader: fillHooks(parameters.vertexShader, variants.art, kind),
    fragmentShader: fillHooks(parameters.fragmentShader, variants.art, kind),
  });
  variants.track(material, kind);
  return material;
}
