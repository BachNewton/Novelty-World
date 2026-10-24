import { attribute, cameraPosition, cross, dFdx, dFdy, dot, fwidth, length, max, normalize, positionWorld, select, smoothstep, vec2 } from "three/tsl";
import type { Node, UniformNode } from "three/webgpu";
import type { Color } from "three";
import type { FeatureId } from "../../features";
import type { AtmosphereUniforms } from "../atmosphere";
import type { SkyUniforms } from "../sky/sky";

/*
 * What every piece of water knows about the point of it being drawn, as
 * nodes any water feature may read: the engine's water carried in the
 * mesh's attributes (how deep the bed lies, which way and how hard a river
 * runs, how steeply it falls, its region's absorption), never the depth
 * buffer. They are the same nodes in every water material, so every water
 * material is one graph.
 */

/** Metres down to the bed. */
export const waterDepth: Node<"float"> = attribute<"float">("depth", "float").max(0);
/** Absorption per metre, red, green and blue (`absorption.ts`). */
export const waterAbsorb: Node<"vec3"> = attribute<"vec3">("absorb", "vec3");
const flow = attribute<"vec2">("flow", "vec2");
/** How much river there is, 0 (still) to 1. */
export const waterMoving: Node<"float"> = length(flow).clamp(0, 1);
/** Which way it runs, x and z. */
export const waterFlowDir: Node<"vec2"> = select(waterMoving.greaterThan(0.01), normalize(flow), vec2(1, 0));
/** How steeply it falls, 0 (level) to 1 (over a fall). */
export const waterFalling: Node<"float"> = smoothstep(0.4, 2, attribute<"float">("fall", "float"));
/** Where on the surface, x and z. */
export const waterP: Node<"vec2"> = positionWorld.xz;
/** Towards the eye. */
export const waterView: Node<"vec3"> = cameraPosition.sub(positionWorld).normalize();
/** How much of the surface one pixel spans, in metres: a pattern finer than this fades out. */
export const waterFootprint: Node<"float"> = max(length(fwidth(waterP)), 1e-4);

/** Whether the eye sees this face from below the water: the face turned to the eye faces down. A fall's sheet seen from below its top is still seen from above. */
const face = normalize(cross(dFdx(positionWorld), dFdy(positionWorld)));
export const waterBelow: Node<"bool"> = face.y.mul(dot(face, waterView)).lessThan(0);

/** The colours and lights a water feature may read beside the surface's own. */
export interface WaterColours {
  air: AtmosphereUniforms;
  shallow: UniformNode<"vec3", Color>;
  deep: UniformNode<"vec3", Color>;
  foam: UniformNode<"vec3", Color>;
  /** The bed under the water as the land draws it (its shore, stonier). */
  bed: UniformNode<"vec3", Color>;
  /** The sky's own uniforms, read only (the sky's area owns them). */
  sky: SkyUniforms;
}

/**
 * The surface as the water's features build it up, in order:
 *
 * - `normal`: the surface's normal, world space.
 * - `body`: how much of the light falling on the water comes back up out of
 *   it (the bed through it and the water's own colour), as an albedo.
 * - `reflect`: what the surface mirrors, as light (not lit again).
 * - `fresnel`: how much it mirrors, against the body.
 * - `foam`: how white it is, 0 to 1.
 * - `glint`: how strongly the lights glint off it (0: no glint at all, as
 *   plain water has none).
 * - `ice`: how much of it is frozen, 0 to 1.
 */
export interface WaterSurface {
  normal: Node<"vec3">;
  body: Node<"vec3">;
  reflect: Node<"vec3">;
  fresnel: Node<"float">;
  foam: Node<"float">;
  glint: Node<"float">;
  ice: Node<"float">;
}

/** A water feature's part in the water's own material: bending the normal (world space), then the surface, each in the order the group lists them. */
export interface WaterStep {
  feature: FeatureId;
  normal?: (normal: Node<"vec3">, colours: WaterColours) => Node<"vec3">;
  surface?: (surface: WaterSurface, colours: WaterColours) => WaterSurface;
}
