import { CHARACTERS } from "../../data/characters";
import { pawn } from "../kit/pawn";
import { banshee, monsterLineUp, spider } from "../monsters";
import type { ExplorerBuilder } from "../stage";
import { CARD_PALETTE, figureFor } from "./by-character";
import { explorerLineUp } from "./line-up";
import { flash } from "./flash";
import { longfellow } from "./longfellow";
import { ox } from "./ox";
import { peter } from "./peter";
import { rhinehardt } from "./rhinehardt";
import { brandon } from "./brandon";
import { heather } from "./heather";
import { TWIRLING, zoe } from "./zoe";
import { vivian } from "./vivian";
import { zostra } from "./zostra";
import { onCourse } from "./cloth-trial";

export interface BenchExplorer {
  id: string;
  name: string;
  /** Who stands on the prime place. */
  build: ExplorerBuilder;
  /** Who stands in the room with it, placed as the house places figures. */
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
  { id: "flash", name: "Darrin \"Flash\" Williams", build: flash },
  { id: "brandon", name: "Brandon Jaspers", build: brandon },
  { id: "peter", name: "Peter Akimoto", build: peter },
  { id: "heather-granville", name: "Heather Granville", build: heather },
  { id: "zoe", name: "Zoe Ingstrom", build: zoe },
  // Round a little loop with sharp turns, walking, stopping, then running: how her skirt swings (`&cloth=` picks it).
  { id: "zoe-course", name: "Zoe walking and running a course", build: onCourse(zoe) },
  // Twirling on cue every few seconds, so her skirt's twirl can be judged without waiting for it.
  { id: "zoe-twirl", name: "Zoe twirling, every few seconds", build: (seed, gait) => zoe(seed, gait, { twirls: TWIRLING }) },
  { id: "rhinehardt", name: "Father Rhinehardt", build: rhinehardt },
  { id: "vivian", name: "Vivian Lopez", build: vivian },
  { id: "rhinehardt-course", name: "Father Rhinehardt walking and running a course", build: onCourse(rhinehardt) },
  { id: "zostra", name: "Madame Zostra", build: zostra },
  { id: "zostra-course", name: "Madame Zostra walking and running a course", build: onCourse(zostra) },
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
  { id: "banshee-course", name: "The Banshee gliding a course", build: onCourse((seed, gait) => banshee(seed, gait)) },
  { id: "spider", name: "The Spider", build: (seed, gait) => spider(seed, gait) },
  { id: "spider-stunned", name: "The Spider, stunned", build: (seed, gait) => spider(seed, gait, { stunned: true }) },
  // A packed room, placed as the house places figures, to see how a crowd looks in practice.
  { id: "crowd-6", name: "A full table: six explorers", build: TABLE[0], crowd: TABLE.slice(1) },
  { id: "crowd-7", name: "Six explorers and the Banshee", build: TABLE[0], crowd: [...TABLE.slice(1), (seed, gait) => banshee(seed, gait)] },
  { id: "crowd-spider", name: "The Spider on the prime place, three explorers after it", build: (seed, gait) => spider(seed, gait), crowd: TABLE.slice(0, 3) },
  { id: "monster-line-up", name: "Every figure, monsters and explorers, with the pawn", build: (seed) => monsterLineUp(seed) },
  // Every character as a seat shows them, `seated:<character id>`: their figure, or the pawn in their card's colour.
  ...CHARACTERS.map((character) => ({ id: `seated:${character.id}`, name: `${character.name}, as seated`, build: figureFor(character.id, CARD_PALETTE[character.card]) })),
];
