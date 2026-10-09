import type * as THREE from "three";
import { longfellow } from "../explorers/longfellow";
import { pawn } from "../kit/pawn";
import { group } from "../shapes";
import { banshee } from "./banshee";
import { spider } from "./spider";

export { banshee } from "./banshee";
export { spider } from "./spider";

/** The monsters beside an explorer and the scale pawn, for judging their size
 *  and style together: the Spider in the middle, the Banshee on its right
 *  (−x), Longfellow and the pawn on its left. */
export function monsterLineUp(seed = "line-up"): THREE.Group {
  const place = (figure: THREE.Object3D, x: number, z = 0) => {
    figure.position.set(x, 0, z);
    return figure;
  };
  return group(
    place(spider(`${seed}:spider`), 0, -0.2),
    place(banshee(`${seed}:banshee`), -1.75, 0.3),
    place(longfellow(`${seed}:longfellow`), 1.6, 0.4),
    place(pawn(), 2.45, 0.1),
  );
}
