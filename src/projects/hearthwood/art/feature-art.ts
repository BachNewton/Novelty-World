import type { Camera, Scene } from "three";
import type { Node, WebGPURenderer } from "three/webgpu";
import type { FeatureId } from "../features";
import type { AtmosphereUniforms } from "./atmosphere";
import type { DayState } from "./light/daylight";
import type { SkyUniforms } from "./sky/sky";
import type { WeatherNow } from "./weather/now";

/*
 * What a feature brings to the drawing, as plain declarations: node
 * functions for the shared materials' stages, a per-frame update (uniforms,
 * compute dispatches), and steps of the frame's post pipeline. Each group
 * gathers its features' art in `art/features/<group>.ts`; `materials.ts`
 * builds the stages into every shared material of the kinds they name, and
 * `frame.ts` builds the post steps into the one pipeline, only for the
 * features that are on. Switching a feature rebuilds the materials and the
 * pipeline it reaches; a feature that is off is in no shader at all.
 */

/** The kinds of shared material a stage can go into. */
export const MATERIAL_KINDS = [
  /** The land's tiles: the per-pixel ground, mesh at the world's origin. */
  "land",
  /** A plain grained floor (the gallery's). */
  "ground",
  /** Instanced plants that move in the wind: trees, bushes, flowers, ferns. */
  "foliage",
  /** Everything else solid and vertex-coloured: rocks, places, camp, Elliott, the animals and people. */
  "solid",
  /** Lakes, rivers, falls and pools, lit by their own nodes, mesh at the world's origin. */
  "water",
  /** The sky's dome: only its colour. */
  "sky",
] as const;

export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** What every stage is given: the material's kind and the world's air. */
export interface StageContext {
  kind: MaterialKind;
  air: AtmosphereUniforms;
}

/** The light a surface gives back, both already times its own colour: from the key light (shadowed) and from the sky and the ground all round. */
export interface ReflectedLight {
  direct: Node<"vec3">;
  indirect: Node<"vec3">;
}

/**
 * A feature's node functions for the materials of some kinds. Each stage
 * takes the value so far and returns the next, in the order the features are
 * listed, so stages compose:
 *
 * - `position`: the vertex in its mesh's own space before the mesh (or its
 *   instance) is placed; for the land and water, whose meshes stand at the
 *   world's origin, that is world space. Shadows are drawn through it too, so
 *   what moves casts its shadow where it is drawn.
 * - `surface`: the surface's own colour before it is lit (linear).
 * - `normal`: the surface's normal in view space, as three's `normalView`.
 * - `light`: the light the surface gives back, direct and indirect.
 * - `colour`: the finished colour, linear, after the air, before the grade.
 *
 * The sky takes only `colour`. Water's own material reads its stages the
 * same way, with its own meaning for `light` (see `water/water.ts`).
 */
export interface Stages {
  kinds: readonly MaterialKind[];
  position?: (position: Node<"vec3">, context: StageContext) => Node<"vec3">;
  surface?: (colour: Node<"vec3">, context: StageContext) => Node<"vec3">;
  normal?: (normal: Node<"vec3">, context: StageContext) => Node<"vec3">;
  light?: (light: ReflectedLight, context: StageContext) => ReflectedLight;
  colour?: (colour: Node<"vec3">, context: StageContext) => Node<"vec3">;
}

/** What a feature's per-frame update is given. */
export interface FeatureFrame {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: Camera;
  /** The hour, its light, and the seconds of motion. */
  day: DayState;
  atmosphere: AtmosphereUniforms;
  sky: SkyUniforms;
  /** The weather where the camera is (see `weather/now.ts`). */
  weather: WeatherNow;
  /** Seconds since the last frame. */
  delta: number;
  /** Where Elliott stands, for anything that answers them (plants parting round their feet); null where nobody walks (the gallery). */
  player: { x: number; y: number; z: number } | null;
}

/** What a post step reads: the frame so far, and the scene's own buffers. */
export interface PostInput {
  /** The frame so far, linear, scene-referred (before the tone curve unless the step runs after it). */
  colour: Node<"vec4">;
  /** The scene's depth as the depth buffer holds it (reversed: 1 near, 0 far and the sky). */
  depth: Node<"float">;
  /** The distance along the view to what was drawn at this pixel, in metres. */
  viewZ: Node<"float">;
  /** The scene's view-space normal, packed 0 to 1, where a step asked for normals. */
  normal: Node<"vec3"> | null;
  air: AtmosphereUniforms;
  sky: SkyUniforms;
}

/**
 * A step of the frame's post pipeline: a node function from the frame so far
 * to the frame on. Steps run from the lowest `order` up; the tone curve is
 * at 0, so a step below 0 works on scene-referred light and one above on the
 * frame as it shows (still linear; it is encoded last). The whole chain is
 * one node graph, so three fuses what it can and only steps that blur (bloom)
 * cost passes of their own.
 */
export interface PostStep {
  /** Unique across all steps. */
  id: string;
  order: number;
  /** Whether it reads the scene's normals, so the scene pass writes them. */
  normals?: boolean;
  build: (input: PostInput) => Node<"vec4">;
}

export interface FeatureArt {
  feature: FeatureId;
  stages?: readonly Stages[];
  /** Runs once a frame while the feature is on, before anything is drawn: update uniforms, dispatch compute. */
  frame?: (frame: FeatureFrame) => void;
  post?: readonly PostStep[];
  /** While on, the plain haze steps aside and this feature's `colour` stage is the air (the weather's fog). */
  replacesAir?: boolean;
}
