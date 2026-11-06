import { Vector2 } from "three";
import { positionWorld, uniform, varying } from "three/tsl";
import type { Node } from "three/webgpu";

/** Where a pixel is on a pattern that repeats every `periodM` metres across the ground, in repeats. */
export type Tiled = (periodM: number) => Node<"vec2">;

/** How far apart the anchors a pattern is measured from stand. */
const ANCHOR_M = 1000;

const repeats = (metres: number, periodM: number) => (((metres / periodM) % 1) + 1) % 1;

/**
 * Patterns laid on the ground from where each pixel is, measured from an anchor near the camera rather than the
 * world's origin. Out at 25 km a 32-bit float's steps are 2 mm, and a position blended across a triangle at those
 * numbers comes out a little different at each pixel on some GPUs, so a pattern repeating every metre or so turns to
 * grain. Measured from the anchor in the vertex stage, the numbers a pixel blends are small; each pattern adds back the
 * anchor's own share of a repeat, worked out on the CPU, so moving the anchor moves no pattern.
 */
export function tiledGround(): { tiled: Tiled; follow: (x: number, z: number) => void } {
  const anchor = uniform(new Vector2());
  const local = varying(positionWorld.xz.sub(anchor));
  const patterns: { periodM: number; offset: Vector2 }[] = [];
  const tiled: Tiled = (periodM) => {
    const offset = uniform(new Vector2(repeats(anchor.value.x, periodM), repeats(anchor.value.y, periodM)));
    patterns.push({ periodM, offset: offset.value });
    return local.div(periodM).add(offset);
  };
  const follow = (x: number, z: number) => {
    const [ax, az] = [Math.round(x / ANCHOR_M) * ANCHOR_M, Math.round(z / ANCHOR_M) * ANCHOR_M];
    if (ax === anchor.value.x && az === anchor.value.y) return;
    anchor.value.set(ax, az);
    for (const { periodM, offset } of patterns) offset.set(repeats(ax, periodM), repeats(az, periodM));
  };
  return { tiled, follow };
}
