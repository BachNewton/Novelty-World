import type { Matrix4, Object3D } from "three";
import type { Plant } from "../engine/life";

/*
 * How one plant's numbers become a copy of its design: where it stands and
 * how it is turned, leaned and scaled, and the small shift of colour that
 * keeps a wood of one design from looking stamped.
 */

/** Sets `dummy` to the plant's placing and returns its matrix. */
export function plantMatrix(p: Plant, dummy: Object3D): Matrix4 {
  const sink = p.kind === "rock" ? p.size * 0.12 : p.kind === "flowers" || p.kind === "mushroom" || p.kind === "fern" ? 0 : 0.12;
  dummy.position.set(p.x, p.y - sink, p.z);
  dummy.rotation.set(Math.cos(p.leanToward) * p.lean, p.turn, Math.sin(p.leanToward) * p.lean);
  if (p.kind === "rock") dummy.scale.set(p.size, p.size * (0.6 + 0.5 * (p.stretch - 0.85)) * 1.4, p.size * p.stretch);
  else dummy.scale.set(p.size / Math.sqrt(p.stretch), p.size * p.stretch, p.size / Math.sqrt(p.stretch));
  dummy.updateMatrix();
  return dummy.matrix;
}

/** The plant's colour shift, as an rgb multiplier written at `at`. */
export function plantColour(p: Plant, out: Float32Array, at: number): void {
  const t = p.tint * (p.kind === "rock" ? 0.4 : 1);
  const bright = 0.92 + 0.08 * Math.sin(p.x * 0.37 + p.z * 0.23);
  out[at] = (1 + 0.12 * t) * bright;
  out[at + 1] = (1 + 0.03 * t) * bright;
  out[at + 2] = (1 - 0.12 * t) * bright;
}
