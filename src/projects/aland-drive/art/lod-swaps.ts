import type { BufferGeometry } from "three/webgpu";
import type { RoadsideModel } from "./roadside/models";
import SWAPS from "./lod-check/swaps.json";

/*
 * Where a model swaps to its far version is measured, not chosen: `lod-check/check.mjs --write` finds, for every model
 * it can draw, the nearest swap at which the change isn't noticed, and writes it to `lod-check/swaps.json` under its
 * versions' fingerprint. Every kit's model constructor passes its model through `measuredSwap`, so the game draws each
 * model at the swap the check found. A model the check can't draw keeps the swap its kit gives, and a model whose art
 * has changed since the table was written fails the check until it's written again.
 */

interface MeasuredSwap {
  name: string;
  swapM: number;
}

const TABLE: Record<string, MeasuredSwap | undefined> = SWAPS;

/** FNV-1a over every attribute and the index of both versions, so any change to either is a different model. */
export function fingerprint(near: BufferGeometry, far: BufferGeometry): string {
  let hash = 0x811c9dc5;
  const mix = (bytes: Uint8Array) => {
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193);
  };
  for (const geometry of [near, far]) {
    for (const name of Object.keys(geometry.attributes).sort()) {
      const { array } = geometry.getAttribute(name);
      mix(new TextEncoder().encode(name));
      mix(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
    }
    const index = geometry.index?.array;
    if (index !== undefined) mix(new Uint8Array(index.buffer, index.byteOffset, index.byteLength));
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Whether the check has measured this model's swap: a model the game scales per place must have been. */
export function isMeasured(model: RoadsideModel): boolean {
  return model.far === null || TABLE[fingerprint(model.near, model.far)] !== undefined;
}

/** The swap the check measured for a model's two versions, or the kit's own where it hasn't drawn them. */
export function measuredSwap(model: RoadsideModel): RoadsideModel {
  if (model.far === null) return model;
  const measured = TABLE[fingerprint(model.near, model.far)];
  return measured === undefined ? model : { ...model, swapM: measured.swapM };
}
