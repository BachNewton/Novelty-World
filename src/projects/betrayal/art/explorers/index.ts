import { CHARACTERS } from "../../data/characters";
import { pawn } from "../kit/pawn";
import { banshee, monsterLineUp, spider } from "../monsters";
import type { ExplorerBuilder } from "../stage";
import { CARD_PALETTE, figureFor } from "./by-character";
import { explorerLineUp } from "./line-up";
import { longfellow } from "./longfellow";
import { ox } from "./ox";
import { rhinehardt } from "./rhinehardt";
import { zoe } from "./zoe";

export interface BenchExplorer {
  id: string;
  name: string;
  /** Who stands on the prime spot. */
  build: ExplorerBuilder;
  /** Who stands on the spots after it, slot 1 onward, placed as the house places them. */
  crowd?: readonly ExplorerBuilder[];
}

/** A full table, one seat per character card, each in its card's colour: the
 *  built figures where the card has one, the scale pawn in the seat's colour otherwise. */
const TABLE: readonly ExplorerBuilder[] = ["professor-longfellow", "ox-bellows", "zoe-ingstrom", "brandon-jaspers", "vivian-lopez", "heather-granville"].map(
  (id) => {
    const character = CHARACTERS.find((candidate) => candidate.id === id);
    if (!character) throw new Error(`No character "${id}"`);
    return figureFor(id, CARD_PALETTE[character.card]);
  },
);

/** Every figure the art bench can stand in a room, the first by default. The
 *  scale pawn stays, as the plain 1.6 m reference rooms are judged against. */
export const BENCH_EXPLORERS: readonly BenchExplorer[] = [
  { id: "longfellow", name: "Professor Longfellow", build: longfellow },
  { id: "pawn", name: "Scale pawn", build: () => pawn() },
  { id: "ox", name: "Ox Bellows", build: ox },
  { id: "zoe", name: "Zoe Ingstrom", build: zoe },
  { id: "rhinehardt", name: "Father Rhinehardt", build: rhinehardt },
  { id: "explorer-line-up", name: "Every explorer, with the pawn", build: (seed) => explorerLineUp(seed) },
  { id: "explorer-walk", name: "Every explorer walking on the spot", build: (seed) => explorerLineUp(seed, "walk") },
  { id: "explorer-run", name: "Every explorer running on the spot", build: (seed) => explorerLineUp(seed, "run") },
  { id: "explorer-walk-side", name: "Every explorer walking on the spot, side on", build: (seed) => explorerLineUp(seed, "walk", undefined, { sideOn: true }) },
  { id: "explorer-run-side", name: "Every explorer running on the spot, side on", build: (seed) => explorerLineUp(seed, "run", undefined, { sideOn: true }) },
  // Stand-in props in the right hand, until items have art: one for all, or one each (spear, revolver, candle).
  { id: "explorer-revolver", name: "Every explorer holding a revolver", build: (seed) => explorerLineUp(seed, undefined, "revolver") },
  { id: "explorer-candle", name: "Every explorer holding a candle", build: (seed) => explorerLineUp(seed, undefined, "candle") },
  { id: "explorer-spear", name: "Every explorer holding a spear", build: (seed) => explorerLineUp(seed, undefined, "spear") },
  { id: "explorer-armed-walk", name: "Every explorer walking, holding a prop each", build: (seed) => explorerLineUp(seed, "walk", "each") },
  { id: "explorer-armed-run", name: "Every explorer running, holding a prop each", build: (seed) => explorerLineUp(seed, "run", "each") },
  // Monsters stand where an explorer would, so the bench can judge them in a room.
  { id: "banshee", name: "The Banshee", build: (seed, gait) => banshee(seed, gait) },
  { id: "banshee-stunned", name: "The Banshee, stunned", build: (seed, gait) => banshee(seed, gait, { stunned: true }) },
  { id: "spider", name: "The Spider", build: (seed, gait) => spider(seed, gait) },
  { id: "spider-stunned", name: "The Spider, stunned", build: (seed, gait) => spider(seed, gait, { stunned: true }) },
  // A packed room, filled as the house fills its standing spots, to see how a crowd looks in practice.
  { id: "crowd-6", name: "A full table: six explorers, one a spot", build: TABLE[0], crowd: TABLE.slice(1) },
  { id: "crowd-7", name: "Six explorers and the Banshee, one past the spots", build: TABLE[0], crowd: [...TABLE.slice(1), (seed, gait) => banshee(seed, gait)] },
  { id: "crowd-spider", name: "The Spider on the prime spot, three explorers after it", build: (seed, gait) => spider(seed, gait), crowd: TABLE.slice(0, 3) },
  { id: "monster-line-up", name: "Every figure, monsters and explorers, with the pawn", build: (seed) => monsterLineUp(seed) },
];
