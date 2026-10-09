import type * as THREE from "three";
import { longfellow } from "../explorers/longfellow";
import { ox } from "../explorers/ox";
import { zoe } from "../explorers/zoe";
import { pawn } from "../kit/pawn";
import { group } from "../shapes";
import { banshee } from "./banshee";
import { spider } from "./spider";

export { banshee } from "./banshee";
export { spider } from "./spider";

/** The monsters beside the explorers and the scale pawn, for judging every
 *  figure's size and style together: the Spider in the middle, the Banshee
 *  and Ox on its right (−x), Longfellow, Zoe and the pawn on its left. */
export function monsterLineUp(seed = "line-up"): THREE.Group {
  const place = (figure: THREE.Object3D, x: number, z = 0) => {
    figure.position.set(x, 0, z);
    return figure;
  };
  return group(
    place(spider(`${seed}:spider`), 0, -0.2),
    place(banshee(`${seed}:banshee`), -1.75, 0.3),
    place(ox(`${seed}:ox`), -2.6, 0.3),
    place(longfellow(`${seed}:longfellow`), 1.6, 0.4),
    place(zoe(`${seed}:zoe`), 2.4, 0.4),
    place(pawn(), 3.2, 0.1),
  );
}
