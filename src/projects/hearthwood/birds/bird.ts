import { createRng } from "@/shared/lib/seeded-random";
import { weighted } from "../animals/genes";

/*
 * The songbirds, and the one winged body they share: each species is its
 * colours on it (where its cap, cheeks, breast, back and wings are which
 * colour) and a little of its size; the body, its parts and how it moves are
 * the same for every bird. The robin with its orange breast, the great tit
 * with its black cap, white cheeks and yellow front, the chaffinch with his
 * blue-grey head and pink breast. Which is where, and when, is the
 * season's: in winter the great tits stay and most of the rest have gone.
 */

export const SONGBIRDS = ["robin", "great-tit", "chaffinch"] as const;
export type Songbird = (typeof SONGBIRDS)[number];

/** Where each colour lies on the shared body, as the names of colour tokens. */
export interface Plumage {
  back: string;
  breast: string;
  belly: string;
  cap: string;
  cheek: string;
  wing: string;
  /** A pale bar across the wing, or the wing's own colour. */
  bar: string;
  tail: string;
  beak: string;
  /** A dark stripe down the breast (a great tit's tie), or null. */
  tie: string | null;
}

const TOKEN = (name: string) => `--color-hearthwood-bird-${name}`;

export const PLUMAGE: Record<Songbird, Plumage> = {
  robin: { back: TOKEN("robin-back"), breast: TOKEN("robin-breast"), belly: TOKEN("pale"), cap: TOKEN("robin-back"), cheek: TOKEN("robin-breast"), wing: TOKEN("robin-back"), bar: TOKEN("robin-back"), tail: TOKEN("robin-back"), beak: TOKEN("beak"), tie: null },
  "great-tit": { back: TOKEN("tit-back"), breast: TOKEN("tit-yellow"), belly: TOKEN("tit-yellow"), cap: TOKEN("black"), cheek: TOKEN("pale"), wing: TOKEN("tit-wing"), bar: TOKEN("pale"), tail: TOKEN("tit-wing"), beak: TOKEN("black"), tie: TOKEN("black") },
  chaffinch: { back: TOKEN("finch-back"), breast: TOKEN("finch-breast"), belly: TOKEN("finch-breast"), cap: TOKEN("finch-cap"), cheek: TOKEN("finch-breast"), wing: TOKEN("black"), bar: TOKEN("pale"), tail: TOKEN("black"), beak: TOKEN("finch-beak"), tie: null },
};

/** How big each species is against a robin. */
export const BIRD_SIZE: Record<Songbird, number> = { robin: 1, "great-tit": 1.02, chaffinch: 1.05 };

/** How common each species is in summer and in winter. */
const SHARES: Record<"summer" | "winter", readonly (readonly [Songbird, number])[]> = {
  summer: [
    ["robin", 0.35],
    ["great-tit", 0.33],
    ["chaffinch", 0.32],
  ],
  winter: [
    ["robin", 0.15],
    ["great-tit", 0.75],
    ["chaffinch", 0.1],
  ],
};

/** A songbird's species from its seed and how far into winter the year is (0 summer to 1 deep winter). */
export function songbirdOf(seed: string, winter: number): Songbird {
  const rng = createRng(`${seed}:species`);
  return weighted(rng, winter > 0.5 ? SHARES.winter : SHARES.summer);
}
