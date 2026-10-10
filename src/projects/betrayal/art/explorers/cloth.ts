import type * as THREE from "three";
import type { Gait, Stride } from "./figure";

/*
 * Cloth the legs push out (a robe, a skirt) is heavy: it moves out before a
 * knee arrives, peaks gently and falls back after it has gone, never shoved
 * the moment a leg touches it. A stride is a pure function of the clock, so
 * the cloth can know where the legs will be as well as where they were: it
 * makes room for every place a leg passes through a little ahead of now and
 * a little behind, and moves between those smoothly. Worked out from the
 * clock alone, on a fixed grid of moments, it is the same at any frame rate
 * and in a frozen screenshot.
 *
 * The figure says how far its cloth must move out for a stride (`pushes`,
 * any number of values: a robe's rows, a skirt's depth), worked out on legs
 * of its own posed for that stride, since the moments around now aren't the
 * pose it shows. At each moment of the grid the cloth makes room for the
 * most any moment from `behind` before it to `ahead` after it pushes; the
 * cloth now is a smooth average of those over the grid moments within
 * `soften` of now. Each moment's room reaches a grid moment past the
 * softening either side, so the average is never less than the legs push
 * now. The figure leaves its legs a little more room in `pushes` than they
 * need, and the cloth is still held to at least the push of its own legs as
 * they are now (`now`), smoothly, so no leg ever goes through, though the
 * hold barely ever has to act; when it does, it knocks the cloth.
 */

export interface ClothTiming {
  /** How long, in seconds, before a leg arrives the cloth makes room for it. */
  ahead: number;
  /** How long after a leg has gone the cloth still keeps room for it. */
  behind: number;
  /** How long, either side of now, the cloth's moves are smoothed over. */
  soften: number;
}

/** The grid of moments the push is worked out at, in seconds. */
const GRID = 0.02;

/** How much a grid moment `u` (in `soften`s from now) counts: smooth to its second derivative, and nothing past a `soften`. */
const weight = (u: number) => (Math.abs(u) >= 1 ? 0 : (1 - u * u) ** 3);

/** How close, in the cloth's own measure, its smooth path may come to the legs' push now before it is held out of their way. */
const HOLD = 0.004;

/** `value`, held to at least `floor` smoothly: untouched while it is `soft` clear of it, and never a kink where it is held. */
export function atLeast(value: number, floor: number, soft = HOLD): number {
  const short = floor - value;
  if (short <= -soft) return value;
  return value + (short >= soft ? short : (short + soft) ** 2 / (4 * soft));
}

/** The push at a grid moment, raised where it peaks between it and the
 *  moments either side to the top of the parabola through the three, so a
 *  leg's furthest reach between grid moments still has room made for it. */
function peaked(worked: ReadonlyMap<number, Float32Array>, moment: number, size: number): Float32Array {
  const [before, here, after] = [worked.get(moment - 1), worked.get(moment), worked.get(moment + 1)];
  if (!before || !here || !after) throw new Error("A peak is found from the grid moments either side");
  let raised: Float32Array | undefined;
  for (let i = 0; i < size; i++) {
    const bend = 2 * here[i] - before[i] - after[i];
    if (bend <= 0 || here[i] < before[i] || here[i] < after[i]) continue;
    raised ??= here.slice();
    raised[i] += (after[i] - before[i]) ** 2 / (8 * bend);
  }
  return raised ?? here;
}

/** Heavy cloth driven by a gait: returns what fills `out` with how far the
 *  cloth moves out at `clock` (each value as `pushes` gives them), never less
 *  than the legs push it now (`now`, worked out on the figure's own legs). */
export function heavyCloth(size: number, gait: Gait, pushes: (stride: Stride, seconds: number, out: Float32Array) => void, { ahead, behind, soften }: ClothTiming) {
  const around = Math.ceil(soften / GRID);
  // A grid moment past the softening either side, so the average covers the legs between grid moments too.
  const [before, after] = [Math.max(Math.round(behind / GRID), around + 1), Math.max(Math.round(ahead / GRID), around + 1)];
  /** The push at each grid moment worked out lately, by its number, with the stride it was worked out for. */
  let known = new Map<number, { stride: Stride; push: Float32Array }>();
  const same = (a: Stride, b: Stride) => a.phase === b.phase && a.amount === b.amount && a.running === b.running;
  const pushAt = (moment: number, stride: Stride, keep: typeof known): Float32Array => {
    const seen = known.get(moment);
    // A gait can change under a figure (a new walk), so a moment is worked out again if its stride has.
    let push = seen && same(seen.stride, stride) ? seen.push : undefined;
    if (!push) {
      push = new Float32Array(size);
      pushes(stride, moment * GRID, push);
    }
    keep.set(moment, { stride, push });
    return push;
  };
  const room = new Float32Array(size);
  return (clock: number, now: Float32Array, out: Float32Array) => {
    const at = clock / GRID;
    const first = Math.floor(at) - around + 1;
    const last = Math.ceil(at) + around - 1;
    const strides = new Map<number, Stride>();
    for (let moment = first - before - 1; moment <= last + after + 1; moment++) strides.set(moment, gait(moment * GRID));
    // Standing still all through, the cloth hangs as the legs push it now.
    if ([...strides.values()].every(({ amount }) => amount === 0)) {
      known.clear();
      out.set(now);
      return;
    }
    const keep = new Map<number, { stride: Stride; push: Float32Array }>();
    const worked = new Map<number, Float32Array>();
    for (const [moment, stride] of strides) worked.set(moment, pushAt(moment, stride, keep));
    known = keep;
    const pushed = new Map<number, Float32Array>();
    for (let moment = first - before; moment <= last + after; moment++) pushed.set(moment, peaked(worked, moment, size));
    out.fill(0);
    let total = 0;
    for (let moment = first; moment <= last; moment++) {
      const counts = weight((moment - at) / (soften / GRID));
      if (counts === 0) continue;
      room.fill(0);
      for (let from = moment - before; from <= moment + after; from++) {
        const push = pushed.get(from);
        if (!push) throw new Error("The cloth's window reaches past the moments it worked out");
        for (let i = 0; i < size; i++) room[i] = Math.max(room[i], push[i]);
      }
      for (let i = 0; i < size; i++) out[i] += room[i] * counts;
      total += counts;
    }
    for (let i = 0; i < size; i++) out[i] = atLeast(out[i] / total, now[i]);
  };
}

/** Marks the parts that are cloth the legs push, so the cloth's smoothness check finds them. */
export function hangsCloth<T extends THREE.Object3D>(figure: T, cloth: readonly THREE.Object3D[]): T {
  figure.userData.cloth = cloth;
  return figure;
}

export function clothOf(figure: THREE.Object3D): readonly THREE.Object3D[] {
  return (figure.userData as { cloth?: readonly THREE.Object3D[] }).cloth ?? [];
}
