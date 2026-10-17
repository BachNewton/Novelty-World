import type { Camera, DepthTexture, IUniform, Scene, Texture, WebGLRenderer, WebGLRenderTarget } from "three";
import type { FeatureId } from "../features";
import type { AtmosphereUniforms } from "./atmosphere";
import type { DayState } from "./daylight";
import type { SkyUniforms } from "./sky";

/*
 * What a feature brings to the drawing, as plain declarations: GLSL for the
 * shared materials' hook points, the uniforms that GLSL reads, a per-frame
 * update of them, and render passes of its own. Each group gathers its
 * features' art in `art/features/<group>.ts`; `shading.ts` compiles the GLSL
 * in under each feature's define, and `passes.ts` runs the passes, only for
 * the features that are on.
 */

/** The kinds of shared material a chunk can go into. */
export const MATERIAL_KINDS = [
  /** The land's tiles: the per-pixel ground, mesh at the world's origin. */
  "land",
  /** A plain grained floor (the gallery's). */
  "ground",
  /** Instanced plants that move in the wind: trees, bushes, flowers, ferns. */
  "foliage",
  /** Everything else solid and vertex-coloured: rocks, places, camp, Elliott. */
  "solid",
  /** Lakes, rivers, falls and pools, lit by their own shader, mesh at the world's origin. */
  "water",
  /** The sky's dome: only its declarations and its colour. */
  "sky",
] as const;

export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/**
 * The hook points, in the order the shader meets them. Each is GLSL pasted
 * in at that point, inside `#ifdef` of its feature's define:
 *
 * - `vertexHead`, `fragmentHead`: declarations (uniforms, varyings,
 *   functions) at file scope. The air's uniforms and functions
 *   (`atmosphere.ts`), `hwValueNoise` and three's `common` are already there.
 * - `vertex`: move the vertex. `transformed` is the vertex in its mesh's own
 *   space before the mesh is placed (for the land and water, whose meshes
 *   stand at the world's origin, that is world space); `position` and, when
 *   instanced, `instanceMatrix` are there too.
 * - `surface`: the surface's own colour before it is lit, `diffuseColor.rgb`,
 *   at `vHwWorld` (world space).
 * - `normal`: the surface's normal in world space, `hwNormal`, normalised
 *   again after every chunk has had it.
 * - `light`: the light the surface gives back, `hwDirect` from the sun or
 *   moon (already shadowed) and `hwIndirect` from the sky and the ground, each
 *   already times the surface's colour; `hwNormal` and `vHwWorld` are there.
 * - `colour`: the finished colour, `hwColour`, linear, after the air and
 *   before tone mapping, at `vHwWorld`.
 *
 * The sky takes only `vertexHead`, `fragmentHead` and `colour`, with
 * `vHwWorld` a point on its dome round the camera.
 *
 * The depth a Lambert kind casts its shadows with (`shadowDepth` in
 * `shading.ts`) takes `vertexHead` and `vertex` too, so what moves casts its
 * shadow where it is drawn; there `HW_DEPTH` is defined, and there is no
 * colour and no normal to read.
 */
export const HOOKS = ["vertexHead", "vertex", "fragmentHead", "surface", "normal", "light", "colour"] as const;

export type Hook = (typeof HOOKS)[number];

export const SKY_HOOKS: readonly Hook[] = ["vertexHead", "fragmentHead", "colour"];

/** A feature's GLSL for the materials of some kinds, at any of the hook points. */
export type Chunk = Partial<Record<Hook, string>> & { kinds: readonly MaterialKind[] };

/** What a feature's per-frame update and its passes are given. */
export interface FeatureFrame {
  gl: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  /** The hour, its light, and the seconds of motion. */
  day: DayState;
  atmosphere: AtmosphereUniforms;
  sky: SkyUniforms;
  /** Seconds since the last frame. */
  delta: number;
}

/**
 * When a pass runs in the frame:
 * - `before`: before the scene is drawn, into targets of its own (a cloud shadow map, a reflection).
 * - `opaque`: after everything but the late layer is drawn, with the scene's colour and depth so far to copy or read (refraction); the late layer (`LATE_LAYER` in `passes.ts`, where water belongs once anything needs this) is drawn after.
 * - `post`: over the finished scene, reading its colour (and depth) and drawing the frame on (grading, bloom, god rays).
 */
export type PassStage = "before" | "opaque" | "post";

export interface PassFrame extends FeatureFrame {
  /** The scene so far, linear and not yet tone mapped: null for `before`. */
  colour: Texture | null;
  /** The scene's depth, reversed (1 near, 0 far: read it with `depth.ts`), when a pass on asked for it; null for `before`. */
  depth: DepthTexture | null;
  /** `post`: the target this pass draws the frame on into. Null otherwise. */
  output: WebGLRenderTarget | null;
  /** The drawing buffer's size, in device pixels. */
  width: number;
  height: number;
}

/** A pass, while its feature is on: made when the feature is switched on, disposed when it is switched off. */
export interface FeaturePass {
  /** The drawing buffer's size, in device pixels: on making and whenever it changes. */
  setSize?: (width: number, height: number) => void;
  render: (frame: PassFrame) => void;
  /** Frees every target and material it made. */
  dispose: () => void;
}

export interface PassSpec {
  /** Unique across all passes: the name its GPU time is shown under. */
  id: string;
  stage: PassStage;
  /** Passes of a stage run from the lowest order up. */
  order: number;
  /** Whether it reads the scene's depth, so the scene is drawn with a depth texture. */
  depth?: boolean;
  create: (gl: WebGLRenderer) => FeaturePass;
}

export interface FeatureArt {
  feature: FeatureId;
  chunks?: readonly Chunk[];
  /** The uniforms its chunks read, shared by every material they go into, so one update moves them all. */
  uniforms?: Record<string, IUniform>;
  /** Runs once a frame while the feature is on, before anything is drawn: update the uniforms here. */
  frame?: (frame: FeatureFrame) => void;
  passes?: readonly PassSpec[];
}
