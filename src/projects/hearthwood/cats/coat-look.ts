import type { Coat, TabbyPattern } from "./genetics";

/*
 * What the coat shader is given for a coat: the colour tokens of each pigment
 * it shows, and the numbers its pattern functions take. Pure, so the scene
 * only resolves the tokens.
 */

const TOKEN = (name: string) => `--color-hearthwood-cat-${name}`;

export const PATTERN_INDEX: Record<TabbyPattern, number> = { mackerel: 0, classic: 1, spotted: 2, ticked: 3 };

export interface CoatLook {
  colours: {
    eumelanin: string;
    eumelaninGround: string;
    phaeomelanin: string;
    phaeomelaninGround: string;
    white: string;
    pointBody: string;
    eyeLeft: string;
    eyeRight: string;
    nose: string;
    innerEar: string;
    pupil: string;
    glint: string;
  };
  /** 0 none, 0.5 patches, 1 all orange. */
  orange: number;
  orangeShare: number;
  patchSize: number;
  agouti: number;
  pattern: number;
  white: number;
  pointed: number;
  longHair: number;
  marks: readonly [number, number, number];
}

export function coatLook(coat: Coat): CoatLook {
  return {
    colours: {
      eumelanin: TOKEN(coat.eumelanin),
      eumelaninGround: TOKEN(`${coat.eumelanin}-ground`),
      phaeomelanin: TOKEN(coat.phaeomelanin),
      phaeomelaninGround: TOKEN(`${coat.phaeomelanin}-ground`),
      white: TOKEN("white"),
      pointBody: TOKEN("point-body"),
      eyeLeft: TOKEN(`eye-${coat.eyes[0]}`),
      eyeRight: TOKEN(`eye-${coat.eyes[1]}`),
      nose: TOKEN(`nose-${coat.nose}`),
      innerEar: TOKEN("inner-ear"),
      pupil: TOKEN("pupil"),
      glint: TOKEN("glint"),
    },
    orange: coat.orange === "none" ? 0 : coat.orange === "patches" ? 0.5 : 1,
    orangeShare: coat.orangeShare,
    patchSize: coat.patchSize,
    agouti: coat.agouti ? 1 : 0,
    pattern: PATTERN_INDEX[coat.pattern],
    white: coat.white,
    pointed: coat.pointed ? 1 : 0,
    longHair: coat.longHair ? 1 : 0,
    marks: coat.marks,
  };
}
