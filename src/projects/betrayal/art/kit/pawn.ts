import type * as THREE from "three";
import type { PaletteKey } from "../palette";
import { figureBase } from "../explorers/figure";
import { flat, group, lathe } from "../shapes";

export interface PawnOptions {
  colour?: PaletteKey;
  /** Ring around the base, so pawns of similar colours stay apart. */
  rim?: PaletteKey;
}

/** An explorer as a board-game miniature: a turned pawn on a round base,
 *  life-size (1.6 m) so rooms can be judged at the scale of a person. */
export function pawn({ colour = "bloodLight", rim = "boneDark" }: PawnOptions = {}): THREE.Group {
  const body = lathe(
    [
      [0, 0.08],
      [0.3, 0.08],
      [0.3, 0.16],
      [0.24, 0.2],
      [0.16, 0.26],
      [0.12, 0.6],
      [0.1, 1.0],
      [0.1, 1.08],
      [0.2, 1.12],
      [0.2, 1.17],
      [0.09, 1.2],
      [0.13, 1.26],
      [0.17, 1.36],
      [0.17, 1.44],
      [0.13, 1.53],
      [0.06, 1.58],
      [0, 1.6],
    ],
    flat(colour),
    10,
  );
  return group(figureBase(rim), body);
}
