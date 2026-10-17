import type { EarType } from "./dog";
import type { Coat, Pattern } from "./genetics";

/*
 * What the dog's coat shader is given for a coat: the colour tokens of each
 * pigment it shows, and the numbers its pattern functions take. Pure, so the
 * scene only resolves the tokens.
 */

const TOKEN = (name: string) => `--color-hearthwood-dog-${name}`;

export const PATTERN_INDEX: Record<Pattern, number> = { solid: 0, clear: 1, sable: 2, agouti: 3, tan: 4, saddle: 5 };
export const EAR_INDEX: Record<EarType, number> = { prick: 0, fold: 1, drop: 2 };
const LENGTH_INDEX = { short: 0, medium: 1, long: 2 } as const;

export interface DogCoatLook {
  colours: {
    eumelanin: string;
    merle: string;
    phaeomelanin: string;
    white: string;
    eyeLeft: string;
    eyeRight: string;
    nose: string;
    innerEar: string;
    tongue: string;
    mouth: string;
    pupil: string;
    glint: string;
  };
  pattern: number;
  brindle: number;
  mask: number;
  merle: number;
  white: number;
  shading: number;
  /** 0 short, 1 medium, 2 long. */
  length: number;
  ears: number;
  marks: readonly [number, number, number];
}

export function dogCoatLook(coat: Coat, ears: EarType): DogCoatLook {
  return {
    colours: {
      eumelanin: TOKEN(coat.eumelanin),
      merle: TOKEN(`${coat.eumelanin}-merle`),
      phaeomelanin: TOKEN(coat.phaeomelanin),
      white: TOKEN("white"),
      eyeLeft: TOKEN(`eye-${coat.eyes[0]}`),
      eyeRight: TOKEN(`eye-${coat.eyes[1]}`),
      nose: TOKEN(`nose-${coat.nose}`),
      innerEar: TOKEN("inner-ear"),
      tongue: TOKEN("tongue"),
      mouth: TOKEN("mouth"),
      pupil: TOKEN("pupil"),
      glint: TOKEN("glint"),
    },
    pattern: PATTERN_INDEX[coat.pattern],
    brindle: coat.brindle ? 1 : 0,
    mask: coat.mask ? 1 : 0,
    merle: coat.merle ? 1 : 0,
    white: coat.white,
    shading: coat.shading,
    length: LENGTH_INDEX[coat.length],
    ears: EAR_INDEX[ears],
    marks: coat.marks,
  };
}
