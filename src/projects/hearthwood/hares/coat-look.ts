import type { HareCoat } from "./hare";

/* What the hare's coat shader is given: its colour tokens and numbers. */

const TOKEN = (name: string) => `--color-hearthwood-hare-${name}`;

export interface HareCoatLook {
  colours: { brown: string; grey: string; white: string; tips: string; eye: string; glint: string; nose: string; innerEar: string };
  warmth: number;
  marks: readonly [number, number, number];
}

export function hareCoatLook(coat: HareCoat): HareCoatLook {
  return {
    colours: { brown: TOKEN("brown"), grey: TOKEN("grey"), white: TOKEN("white"), tips: TOKEN("tips"), eye: TOKEN("eye"), glint: TOKEN("glint"), nose: TOKEN("nose"), innerEar: TOKEN("inner-ear") },
    warmth: coat.warmth,
    marks: coat.marks,
  };
}
