import type { FoxCoat, FoxPhase } from "./fox";

/*
 * What the fox's coat shader is given for a coat: the colour tokens it
 * shows, and the numbers its pattern functions take. Pure, so the scene only
 * resolves the tokens.
 */

const TOKEN = (name: string) => `--color-hearthwood-fox-${name}`;

export const PHASE_INDEX: Record<FoxPhase, number> = { red: 0, cross: 1, silver: 2 };

export interface FoxCoatLook {
  colours: {
    red: string;
    ginger: string;
    white: string;
    dark: string;
    frost: string;
    eye: string;
    pupil: string;
    glint: string;
    nose: string;
    innerEar: string;
    tongue: string;
    mouth: string;
  };
  phase: number;
  depth: number;
  bib: number;
  socks: number;
  marks: readonly [number, number, number];
}

export function foxCoatLook(coat: FoxCoat): FoxCoatLook {
  return {
    colours: {
      red: TOKEN("red"),
      ginger: TOKEN("ginger"),
      white: TOKEN("white"),
      dark: TOKEN(coat.phase === "silver" ? "silver" : "dark"),
      frost: TOKEN("frost"),
      eye: TOKEN("eye"),
      pupil: TOKEN("pupil"),
      glint: TOKEN("glint"),
      nose: TOKEN("nose"),
      innerEar: TOKEN("inner-ear"),
      tongue: TOKEN("tongue"),
      mouth: TOKEN("mouth"),
    },
    phase: PHASE_INDEX[coat.phase],
    depth: coat.depth,
    bib: coat.bib,
    socks: coat.socks,
    marks: coat.marks,
  };
}
