import { pawn } from "../kit/pawn";
import { banshee, monsterLineUp, spider } from "../monsters";
import type { ExplorerBuilder } from "../stage";
import { explorerLineUp } from "./line-up";
import { longfellow } from "./longfellow";
import { ox } from "./ox";
import { zoe } from "./zoe";

export interface BenchExplorer {
  id: string;
  name: string;
  build: ExplorerBuilder;
}

/** Every figure the art bench can stand in a room, the first by default. The
 *  scale pawn stays, as the plain 1.6 m reference rooms are judged against. */
export const BENCH_EXPLORERS: readonly BenchExplorer[] = [
  { id: "longfellow", name: "Professor Longfellow", build: longfellow },
  { id: "pawn", name: "Scale pawn", build: () => pawn() },
  { id: "ox", name: "Ox Bellows", build: ox },
  { id: "zoe", name: "Zoe Ingstrom", build: zoe },
  { id: "explorer-line-up", name: "Every explorer, with the pawn", build: (seed) => explorerLineUp(seed) },
  { id: "explorer-walk", name: "Every explorer walking on the spot", build: (seed) => explorerLineUp(seed, "walk") },
  { id: "explorer-run", name: "Every explorer running on the spot", build: (seed) => explorerLineUp(seed, "run") },
  // Monsters stand where an explorer would, so the bench can judge them in a room.
  { id: "banshee", name: "The Banshee", build: (seed, gait) => banshee(seed, gait) },
  { id: "banshee-stunned", name: "The Banshee, stunned", build: (seed, gait) => banshee(seed, gait, { stunned: true }) },
  { id: "spider", name: "The Spider", build: (seed, gait) => spider(seed, gait) },
  { id: "spider-stunned", name: "The Spider, stunned", build: (seed, gait) => spider(seed, gait, { stunned: true }) },
  { id: "monster-line-up", name: "Every figure, monsters and explorers, with the pawn", build: (seed) => monsterLineUp(seed) },
];
