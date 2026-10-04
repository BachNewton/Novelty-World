import { pawn } from "../kit/pawn";
import type { ExplorerBuilder } from "../stage";
import { longfellow } from "./longfellow";

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
];
