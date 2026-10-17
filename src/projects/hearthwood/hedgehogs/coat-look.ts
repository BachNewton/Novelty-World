import type { HedgehogCoat } from "./hedgehog";

/*
 * What the hedgehog's coat shader is given: the colour tokens it shows and
 * the numbers its patterns take. Pure, so the scene only resolves the tokens.
 */

const TOKEN = (name: string) => `--color-hearthwood-hedgehog-${name}`;

export interface HedgehogCoatLook {
  colours: { band: string; tip: string; fur: string; furPale: string; mask: string; nose: string; eye: string; glint: string };
  darkness: number;
  tips: number;
  face: number;
  marks: readonly [number, number, number];
}

export function hedgehogCoatLook(coat: HedgehogCoat): HedgehogCoatLook {
  return {
    colours: { band: TOKEN("band"), tip: TOKEN("tip"), fur: TOKEN("fur"), furPale: TOKEN("fur-pale"), mask: TOKEN("mask"), nose: TOKEN("nose"), eye: TOKEN("eye"), glint: TOKEN("glint") },
    darkness: coat.darkness,
    tips: coat.tips,
    face: coat.face,
    marks: coat.marks,
  };
}
