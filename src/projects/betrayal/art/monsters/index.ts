import type * as THREE from "three";
import { flash } from "../explorers/flash";
import { jenny } from "../explorers/jenny";
import { longfellow } from "../explorers/longfellow";
import { ox } from "../explorers/ox";
import { peter } from "../explorers/peter";
import { rhinehardt } from "../explorers/rhinehardt";
import { brandon } from "../explorers/brandon";
import { heather } from "../explorers/heather";
import { zoe } from "../explorers/zoe";
import { pawn } from "../kit/pawn";
import { group } from "../shapes";
import { banshee } from "./banshee";
import { spider } from "./spider";

export { banshee } from "./banshee";
export { spider } from "./spider";

/** The monsters beside the explorers and the scale pawn, for judging every
 *  figure's size and style together: the Spider in the middle, the Banshee
 *  Ox, Rhinehardt, Flash and Jenny on its right (−x), Longfellow, Zoe, Brandon, Peter, Heather and the pawn on its left. */
export function monsterLineUp(seed = "line-up"): THREE.Group {
  const place = (figure: THREE.Object3D, x: number, z = 0) => {
    figure.position.set(x, 0, z);
    return figure;
  };
  return group(
    place(spider(`${seed}:spider`), 0, -0.2),
    place(banshee(`${seed}:banshee`), -1.75, 0.3),
    place(ox(`${seed}:ox`), -2.6, 0.3),
    place(rhinehardt(`${seed}:rhinehardt`), -3.45, 0.3),
    place(flash(`${seed}:flash`), -4.3, 0.3),
    place(jenny(`${seed}:jenny`), -5.15, 0.3),
    place(longfellow(`${seed}:longfellow`), 1.6, 0.4),
    place(zoe(`${seed}:zoe`), 2.4, 0.4),
    place(brandon(`${seed}:brandon`), 3.2, 0.4),
    place(peter(`${seed}:peter`), 4.0, 0.4),
    place(heather(`${seed}:heather`), 4.8, 0.4),
    place(pawn(), 5.6, 0.1),
  );
}
