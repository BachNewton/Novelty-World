// The motor roads of every built tile as continuous lines: chains joined across the tile edges they share, and where
// each line's ends land on another. For the tools that drive them (`road-check.ts`, `make-routes.ts`), which run in Node
// with every tile loaded. A line here is plain scene points, so the game can follow one with no road data loaded.

import { RoadLine, chainLine } from "../sim/road-net";
import type { World } from "../sim/world";

export interface ThroughLine {
  name: string;
  /** "tile:chain" of each chain, in order. */
  chains: string[];
  kind: string;
  ref?: string;
  line: RoadLine;
}

/** Ends closer than this are the same crossing of a tile's edge. */
const SEAM_END_M = 0.02;

interface Piece {
  id: string;
  kind: string;
  ref?: string;
  line: RoadLine;
  used: boolean;
}

const endOf = (piece: Piece, last: boolean): [number, number] => {
  const { points } = piece.line;
  const at = last ? points.length - 3 : 0;
  return [points[at], points[at + 2]];
};

const key = ([x, z]: [number, number]) => `${Math.round(x / SEAM_END_M)},${Math.round(z / SEAM_END_M)}`;

function reversed(line: RoadLine): RoadLine {
  const points = new Float32Array(line.points.length);
  const count = points.length / 3;
  for (let at = 0; at < count; at++) points.set(line.points.subarray((count - 1 - at) * 3, (count - at) * 3), at * 3);
  return new RoadLine(points);
}

function joined(lines: RoadLine[]): RoadLine {
  const all: number[] = [];
  for (const { points } of lines) {
    // The first point of each after the first is the last of the one before: the seam.
    const from = all.length === 0 ? 0 : 3;
    for (let at = from; at < points.length; at++) all.push(points[at]);
  }
  return new RoadLine(Float32Array.from(all));
}

export function throughLines(world: World): ThroughLine[] {
  const pieces: Piece[] = [];
  for (const { name, detail } of world.all()) {
    if (!detail) continue;
    detail.manifest.roadSurface.chains.forEach((chain, index) => {
      if (detail.roads.chainFirst[index] < 0) return;
      pieces.push({ id: `${name}:${index}`, kind: chain.kind, ref: chain.ref, line: chainLine(detail.roads, index), used: false });
    });
  }
  const ends = new Map<string, { piece: Piece; last: boolean }[]>();
  for (const piece of pieces) {
    for (const last of [false, true]) {
      const here = key(endOf(piece, last));
      ends.set(here, [...(ends.get(here) ?? []), { piece, last }]);
    }
  }
  const partner = (piece: Piece, last: boolean) => (ends.get(key(endOf(piece, last))) ?? []).find((end) => end.piece !== piece && !end.piece.used);
  const lines: ThroughLine[] = [];
  for (const seed of pieces) {
    if (seed.used) continue;
    seed.used = true;
    const run: { piece: Piece; forwards: boolean }[] = [{ piece: seed, forwards: true }];
    let lastEnd = partner(seed, true);
    while (lastEnd) {
      const next = lastEnd;
      next.piece.used = true;
      run.push({ piece: next.piece, forwards: !next.last });
      lastEnd = partner(next.piece, next.last ? false : true);
    }
    let firstEnd = partner(seed, false);
    while (firstEnd) {
      const next = firstEnd;
      next.piece.used = true;
      run.unshift({ piece: next.piece, forwards: next.last });
      firstEnd = partner(next.piece, next.last ? false : true);
    }
    const line = joined(run.map(({ piece, forwards }) => (forwards ? piece.line : reversed(piece.line))));
    if (line.length > 0) lines.push({ name: run[0].piece.id, chains: run.map(({ piece }) => piece.id), kind: seed.kind, ref: seed.ref, line });
  }
  return lines;
}
