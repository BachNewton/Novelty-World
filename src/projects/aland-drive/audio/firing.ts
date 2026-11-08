/*
 * When an engine's cylinders fire, and which exhaust each pulse leaves by: the
 * arrangement that makes a cross-plane V8 burble and a flat-plane one shriek. A
 * voice names one of these; `synthesis.ts` renders the pulses at those angles.
 */

export interface Firing {
  /** Crank degrees into the four-stroke cycle's 720 at which each cylinder fires, in firing order. */
  angles: readonly number[];
  /** The exhaust each firing leaves by, 0 or 1: a vee's two banks, a boxer's two sides. One exhaust is all 0. */
  banks: readonly (0 | 1)[];
}

const evenly = (cylinders: number) => Array.from({ length: cylinders }, (_, i) => (720 * i) / cylinders);

/** A straight engine, one exhaust, every firing the same gap apart: a triple, a four, a five, a six. */
export const inline = (cylinders: number): Firing => ({ angles: evenly(cylinders), banks: evenly(cylinders).map(() => 0) });

/** A vee or flat engine firing evenly, from one bank and then the other: a 60° V6, a flat-plane V8, a V10, a V12. */
export const vee = (cylinders: number): Firing => ({ angles: evenly(cylinders), banks: evenly(cylinders).map((_, i) => (i % 2 === 0 ? 0 : 1)) });

/**
 * A cross-plane V8, firing 1-8-4-3-6-5-7-2 with the odd cylinders on the left: evenly in all, but each bank on its own
 * fires twice close together and then waits, so each pipe lopes. That is the burble.
 */
export const crossPlaneV8: Firing = { angles: evenly(8), banks: [0, 1, 1, 0, 1, 0, 0, 1] };

/** A flat-plane V8: each bank fires as a four does, evenly, so the pipes are two screaming fours. */
export const flatPlaneV8: Firing = vee(8);

/** An odd-fire V6, 90° banks on shared crankpins: firings 90° and 150° apart, a lumpy, uneven beat. */
export const oddFireV6: Firing = { angles: [0, 90, 240, 330, 480, 570], banks: [0, 1, 0, 1, 0, 1] };

/**
 * A boxer four, 1-3-2-4: one side fires twice and then the other. On equal-length pipes the pulses meet evenly; on
 * unequal ones (a voice's long bank delay) the second side's arrive late, and the even note turns to a loping rumble.
 */
export const boxerFour: Firing = { angles: evenly(4), banks: [0, 0, 1, 1] };

/** An air-cooled flat four, 1-4-3-2, each side's pair into its own short pipe. */
export const airCooledFlatFour: Firing = { angles: evenly(4), banks: [0, 1, 1, 0] };
