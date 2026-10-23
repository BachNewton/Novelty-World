import type * as THREE from "three";
import { pawn } from "../kit/pawn";
import { group } from "../shapes";
import type { ExplorerBuilder } from "../stage";
import { CARD_PALETTE, figureFor } from "../explorers/by-character";
import { onTheSpot, startingSpeed } from "../explorers/line-up";
import type { Pace } from "../explorers/figure";
import { cat } from "./cat";
import { dog } from "./dog";
import { girl } from "./girl";
import { madman } from "./madman";

export { cat } from "./cat";
export { dog } from "./dog";
export { girl } from "./girl";
export { madman } from "./madman";

/** A companion: an omen card an explorer keeps, whose figure follows them round the house. It is no seat, so it has
 *  no colour of its own and no Speed: it keeps its holder's pace. The people stand on two legs, as the explorers'
 *  figures do, with hands to hold things; the animals go on four, on the shared gait in `quadruped.ts`, and hold
 *  nothing. */
export interface Companion {
  /** The omen card's id. */
  id: string;
  name: string;
  build: ExplorerBuilder;
  hands: boolean;
}

export const COMPANIONS: readonly Companion[] = [
  { id: "girl", name: "The Girl", build: girl, hands: true },
  { id: "madman", name: "The Madman", build: madman, hands: true },
  { id: "dog", name: "The Dog", build: dog, hands: false },
  { id: "cat", name: "The Cat", build: cat, hands: false },
];

/** The row, by character or companion id: each person between the explorers they must never be taken for, and the
 *  animals at the end, beside the pawn for their size. */
const ROW: readonly string[] = ["zoe-ingstrom", "girl", "missy-dubourde", "professor-longfellow", "madman", "father-rhinehardt", "ox-bellows", "dog", "cat"];
/** How far apart the row stands its figures, as the explorers' line-up does. */
const SPACING = 0.85;

/**
 * Every companion and the scale pawn, across the bench's first view and
 * facing it: the Girl between Zoe and Missy, the Madman among the older men,
 * and the Dog and the Cat by the pawn. With a `pace`, every figure
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
