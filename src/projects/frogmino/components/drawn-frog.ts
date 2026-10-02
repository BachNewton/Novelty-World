import type { LeapStart } from "../frog/leaps";
import { glide, moveHopLift, moveProgress } from "../frog/moves";
import { pieceSize } from "../logic";
import { hopHeight, onOverpass, type Bonk, type RuleFrog, type Run } from "../run";
import type { Rotation, TetrominoKind } from "../types";
import { DECK_TOP } from "../world/structures";

export interface BonkMotion {
  from: number;
  to: number;
  startedAt: number;
}

// A jump off one level onto another, drawn over its own time: the drop from
// the overpass and the leap onto the finish gantry.
export interface Leap extends LeapStart {
  startedAt: number;
  landed: boolean;
}

// A move's glide from where the frog was drawn to its new place, along one
// axis.
export interface Glide {
  from: number;
  to: number;
  startedAt: number;
}

// What the drawn frog last saw of the rule frog, to tell what has moved.
export type SeenFrog = Pick<RuleFrog, "kind" | "rotation" | "col" | "depth">;

export interface DrawnFrog {
  // The piece and rotation drawn.
  kind: TetrominoKind;
  rotation: Rotation;
  x: number;
  y: number;
  depth: number;
  // The ground under the frog: the overpass's deck, the road or the gantry's.
  level: number;
  // How far the drawn frog still has to swing to reach the rule rotation,
  // which the frog is already drawn in.
  swing: number;
  lift: number;
  // The glides of the latest slide and jump, until they arrive.
  glideX: Glide | null;
  glideDepth: Glide | null;
  // When the latest two moves' hops started, in run time, oldest first: a
  // held jump and a held slide can overlap.
  moveHops: readonly number[];
  seen: SeenFrog;
  // The latest hop and bonk seen, and the knock-back the bonk is drawing.
  hopAt: number | null;
  bonk: Bonk | null;
  bonkMotion: BonkMotion | null;
  drop: Leap | null;
  leap: Leap | null;
}

// Where the drawn frog is heading: the middle of its rule placement's box,
// across and up from the top of the ground clearance, and its depth.
export function frogTarget(frog: RuleFrog): { x: number; y: number; depth: number } {
  const { kind, col, rotation, depth } = frog;
  const { width, height } = pieceSize(kind, rotation);
  return { x: col + (width - 1) / 2, y: height / 2, depth };
}

function seenOf({ kind, rotation, col, depth }: RuleFrog): SeenFrog {
  return { kind, rotation, col, depth };
}

// The drawn frog at the start of a run: exactly as the rules have it.
export function snapped(run: Run): DrawnFrog {
  return {
    ...frogTarget(run.frog),
    kind: run.frog.kind,
    rotation: run.frog.rotation,
    level: onOverpass(run) ? DECK_TOP : 0,
    swing: 0,
    lift: hopHeight(run.frog),
    glideX: null,
    glideDepth: null,
    moveHops: [],
    seen: seenOf(run.frog),
    hopAt: run.frog.latestHop?.startedAt ?? null,
    bonk: run.lastBonk,
    bonkMotion: null,
    drop: null,
    leap: null,
  };
}

// A gate's new piece is drawn at once in its rule pose, across and up, since
// its box differs from the old piece's. Everything else carries on: the
// depth still eases, and a hop, bonk, drop or leap goes on being drawn.
export function withPiece(drawn: DrawnFrog, frog: RuleFrog): DrawnFrog {
  const { x, y } = frogTarget(frog);
  return { ...drawn, kind: frog.kind, rotation: frog.rotation, x, y, swing: 0, glideX: null };
}

// The everyday moves the rules have made since the drawn frog last looked: a
// slide, to a new column in the same piece and rotation (a turn's kick is no
// slide), and a jump, to a new depth. A bonk's knock-back, the drop and the
// finish leap change the depth too, and are drawn as their own motions; the
// scene tells those apart.
export function movesSince(seen: SeenFrog, frog: RuleFrog): { slid: boolean; jumped: boolean } {
  const samePose = seen.kind === frog.kind && seen.rotation === frog.rotation;
  return { slid: samePose && seen.col !== frog.col, jumped: seen.depth !== frog.depth };
}

// The drawn frog seeing the rule frog now, at `time`: each move starts a
// glide from where the frog is drawn to where the rules put it, and a hop. A
// move that isn't drawn as one (a bonk, the drop or the finish leap) is only
// seen.
export function seeMoves(drawn: DrawnFrog, frog: RuleFrog, time: number, drawMoves: boolean): DrawnFrog {
  const { slid, jumped } = movesSince(drawn.seen, frog);
  const seen = seenOf(frog);
  if (!drawMoves || (!slid && !jumped)) return { ...drawn, seen, glideDepth: jumped ? null : drawn.glideDepth };
  const target = frogTarget(frog);
  return {
    ...drawn,
    seen,
    glideX: slid ? { from: drawn.x, to: target.x, startedAt: time } : drawn.glideX,
    glideDepth: jumped ? { from: drawn.depth, to: target.depth, startedAt: time } : drawn.glideDepth,
    moveHops: [...drawn.moveHops, time].slice(-2),
  };
}

// Where a glide has the frog at `time`.
export function glideAt({ from, to, startedAt }: Glide, time: number, duration: number): number {
  return from + (to - from) * glide(moveProgress(time - startedAt, duration));
}

export function arrived({ startedAt }: Glide, time: number, duration: number): boolean {
  return moveProgress(time - startedAt, duration) === 1;
}

// How high the move hops in progress lift the frog at `time`: the higher of
// the two, so a slide's hop and a jump's, held together, never cut each
// other short.
export function moveLift(hops: readonly number[], time: number, duration: number): number {
  return Math.max(0, ...hops.map((startedAt) => moveHopLift(moveProgress(time - startedAt, duration))));
}
