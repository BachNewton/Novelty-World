import type * as THREE from "three";
import { pawn } from "../kit/pawn";
import { group } from "../shapes";
import type { ExplorerBuilder } from "../stage";
import { CARD_PALETTE, figureFor } from "../explorers/by-character";
import { onTheSpot, startingSpeed } from "../explorers/line-up";
import type { Pace } from "../explorers/figure";
import { girl } from "./girl";
import { madman } from "./madman";

export { girl } from "./girl";
export { madman } from "./madman";

/** A companion: an omen card an explorer keeps, whose figure follows them round the house. It is no seat, so it has
 *  no colour of its own and no Speed: it keeps its holder's pace. */
export interface Companion {
  /** The omen card's id. */
  id: string;
  name: string;
  build: ExplorerBuilder;
}

export const COMPANIONS: readonly Companion[] = [
  { id: "girl", name: "The Girl", build: girl },
  { id: "madman", name: "The Madman", build: madman },
];

/** The row, by character or companion id: each companion between the explorers it must never be taken for. */
const ROW: readonly string[] = ["zoe-ingstrom", "girl", "missy-dubourde", "professor-longfellow", "madman", "father-rhinehardt", "ox-bellows"];
/** How far apart the row stands its figures, as the explorers' line-up does. */
const SPACING = 0.85;

/**
 * Each companion beside the explorers it must never be taken for, and the
 * scale pawn, across the bench's first view and facing it: the Girl between
 * Zoe and Missy, the Madman among the older men. With a `pace`, every figure
 * walks or runs on the spot, the explorers at their starting Speed and the
 * companions at the house's own pace.
 */
export function companionLineUp(seed = "companions", pace?: Pace): THREE.Group {
  const row: THREE.Object3D[] = ROW.map((id) => {
    const companion = COMPANIONS.find((one) => one.id === id);
    return companion ? onTheSpot(companion.build, `${seed}:${id}`, pace) : onTheSpot(figureFor(id, CARD_PALETTE.white), `${seed}:${id}`, pace, startingSpeed(id));
  });
  row.push(pawn());
  return group(
    ...row.map((figure, i) => {
      const holder = group(figure);
      const along = (i - (row.length - 1) / 2) * SPACING;
      holder.position.set(along * Math.SQRT1_2, 0, -along * Math.SQRT1_2);
      holder.rotation.y = Math.PI / 4;
      return holder;
    }),
  );
}
