import { ring, stretched, union, type Solid, type Vec3 } from "../forms";

/*
 * What the small charms share (the Ring, the Medallion, the Amulet of the
 * Ages, the Angel Feather): they are held up in their own beat at about three
 * times life-size, so they read in a hand from the house's distance, where
 * the weapons' one and a half to two times would leave them specks. Each is
 * still its own model; this is only their scale and the chain a pendant
 * hangs from.
 */

/** How much bigger than life a small charm is built. */
export const CHARM_SIZE = 3;
/** Metres at a charm's held size. */
export const life = (metres: number) => metres * CHARM_SIZE;

/**
 * A chain of oval links from `top` straight down to `bottom`, each `length`
 * long (inside) and of wire `wire` thick, every other link turned a quarter
 * round so they hang through each other.
 */
export function chain(top: Vec3, bottom: Vec3, { length, wire }: { length: number; wire: number }): Solid {
  const span = top[1] - bottom[1];
  const pitch = length * 0.82;
  const count = Math.max(1, Math.round(span / pitch));
  const width = length * 0.42;
  return union(
    ...Array.from({ length: count }, (_, k) => {
      const t = (k + 0.5) / count;
      const centre: Vec3 = [top[0] + (bottom[0] - top[0]) * t, top[1] - span * t, top[2] + (bottom[2] - top[2]) * t];
      const link = ring(centre, width, wire, k % 2 === 0 ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
      return stretched(link, centre, [1, (length / 2 + wire) / (width + wire), 1]);
    }),
  );
}
