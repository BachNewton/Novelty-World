import type { LeapStart } from "../frog/leaps";
import { glide, moveDuration, moveHopLift, moveProgress } from "../frog/moves";
import { frogCells, pieceSize } from "../logic";
import {
  FROG_THICKNESS,
  frogShape,
  inPlay,
  onOverpass,
  placedFrog,
  type Bonk,
  type PlacedFrog,
  type Run,
  type Wall,
} from "../run";
import { toSeconds } from "../ticks";
import { keepsClear } from "../traffic";
import type { Rotation, Solid } from "../types";
import { DECK_TOP } from "../world/structures";

// The drawn frog keeps time on the drawing's clock, in seconds: the rules'
// time, and on into the tick under way (see `ticks.ts`), so its glides and
// arcs run smoothly between the rules' ticks. The rules' own times are ticks.

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

// The drawn frog's way up or down to a new height, in cells.
export interface Vertical {
  from: number;
  to: number;
  startedAt: number;
}

// A move's glide from where the frog was drawn to its new place, along one
// axis.
export interface Glide {
  from: number;
  to: number;
  startedAt: number;
}

// The game draws every frog of the team, each its own drawn frog following
// its player's rule frog.

// The rule frog a drawn frog follows, at the team's depth.
export function drawnRuleFrog(run: Run, drawn: Pick<DrawnFrog, "player">): PlacedFrog {
  return placedFrog(run, drawn.player);
}

// What the drawn frog last saw of the rule frog, to tell what has moved.
export type SeenFrog = Pick<PlacedFrog, "rotation" | "col" | "depth">;

export interface DrawnFrog {
  // Whose frog it is.
  player: number;
  // The rotation drawn.
  rotation: Rotation;
  x: number;
  y: number;
  depth: number;
  // The ground under the frog: the overpass's deck, the road or the gantry's.
  level: number;
  // How far the drawn frog still has to swing to reach the rule rotation,
  // which the frog is already drawn in.
  swing: number;
  // How many cells above the ground under it the frog is drawn, from its
  // hops, its partner and riding: the rules' height, on the way there.
  lift: number;
  // The rise or fall under way to the rules' height.
  vertical: Vertical | null;
  // The glides of the latest slide and jump, until they arrive.
  glideX: Glide | null;
  glideDepth: Glide | null;
  // When the latest two moves' hops started, oldest first: a held jump and a
  // held slide can overlap.
  moveHops: readonly number[];
  seen: SeenFrog;
  // The latest hop and bonk seen (the hop by the tick it started at), and
  // the knock-back the bonk is drawing.
  hopAt: number | null;
  bonk: Bonk | null;
  bonkMotion: BonkMotion | null;
  drop: Leap | null;
  leap: Leap | null;
}

// Where the drawn frog is heading: the middle of its rule placement's box,
// across and up from the top of the ground clearance, and its depth.
export function frogTarget(frog: PlacedFrog): { x: number; y: number; depth: number } {
  const { kind, col, rotation, depth } = frog;
  const { width, height } = pieceSize(kind, rotation);
  return { x: col + (width - 1) / 2, y: height / 2, depth };
}

function seenOf({ rotation, col, depth }: PlacedFrog): SeenFrog {
  return { rotation, col, depth };
}

// A player's drawn frog at the start of a run: exactly as the rules have it.
export function snapped(run: Run, player: number): DrawnFrog {
  const frog = placedFrog(run, player);
  return {
    ...frogTarget(frog),
    player,
    rotation: frog.rotation,
    level: onOverpass(run) ? DECK_TOP : 0,
    swing: 0,
    lift: frog.height,
    vertical: null,
    glideX: null,
    glideDepth: null,
    moveHops: [],
    seen: seenOf(frog),
    hopAt: frog.latestHop?.startedAt ?? null,
    bonk: run.lastBonk,
    bonkMotion: null,
    drop: null,
    leap: null,
  };
}

// The everyday moves the rules have made since the drawn frog last looked: a
// slide, to a new column in the same rotation (a turn's kick is no
// slide), and a jump, to a new depth. A bonk's knock-back, the drop and the
// finish leap change the depth too, and are drawn as their own motions; the
// scene tells those apart.
export function movesSince(seen: SeenFrog, frog: PlacedFrog): { slid: boolean; jumped: boolean } {
  const samePose = seen.rotation === frog.rotation;
  return { slid: samePose && seen.col !== frog.col, jumped: seen.depth !== frog.depth };
}

// The drawn frog seeing the rule frog at `time`: each move starts a
// glide from where the frog is drawn to where the rules put it, and a hop. A
// move that isn't drawn as one (a bonk, the drop or the finish leap) is only
// seen.
export function seeMoves(drawn: DrawnFrog, frog: PlacedFrog, time: number, drawMoves: boolean): DrawnFrog {
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

// The hop arc overshoots a sine and is capped at its top, so the drawn frog
// rises quickly to a full cell, as the rules count it, and falls the same way
// once it comes down.
const HOP_ARC_OVERSHOOT = 1.3;

// The rising half of the hop arc, from 0 to 1, `seconds` into it.
function hopArc(seconds: number, airtime: number): number {
  const progress = Math.min(0.5, Math.max(0, seconds / airtime));
  return Math.min(1, HOP_ARC_OVERSHOOT * Math.sin(Math.PI * progress));
}

// How long the arc takes to reach its top.
function hopRiseTime(airtime: number): number {
  return (airtime * Math.asin(1 / HOP_ARC_OVERSHOOT)) / Math.PI;
}

// How far along a rise or a fall the drawn frog is, from 0 to 1. It rises
// along the hop arc, and falls along it backwards, slowly at first and
// fastest as it lands. A longer way takes longer, as the square root of its
// cells, as a fall under gravity does.
function verticalProgress({ from, to, startedAt }: Vertical, now: number, airtime: number): number {
  const seconds = (now - startedAt) / Math.sqrt(Math.abs(to - from));
  if (to > from) return hopArc(seconds, airtime);
  const rise = hopRiseTime(airtime);
  return seconds >= rise ? 1 : 1 - hopArc(rise - seconds, airtime);
}

// A wall's solids overlapping the frog drawn with its front at `depth`.
function overlappingDrawn(wall: Wall, depth: number): readonly Solid[] {
  if (wall.depth >= depth) return [];
  return wall.solids.filter((solid) => wall.depth + solid.length > depth - FROG_THICKNESS);
}

// Whether any vehicle overlaps the frog drawn at `depth`, in play.
export function amongVehicles(run: Run, depth: number): boolean {
  return inPlay(run) && run.walls.some((wall) => overlappingDrawn(wall, depth).length > 0);
}

// Whether the frog in its rule pose, `height` cells up and drawn at `depth`,
// would be inside a vehicle overlapping it there.
function drawnInVehicle(run: Run, drawn: DrawnFrog, depth: number, height: number): boolean {
  const cells = frogCells({ ...frogShape(drawnRuleFrog(run, drawn)), height });
  return run.walls.some((wall) => !keepsClear(cells, overlappingDrawn(wall, depth)));
}

// How high the drawn frog is among vehicles at `depth`: as high as the rules
// have it, except that a drawn frog riding a row higher up rides on there
// while it stays clear. The rules bring a riding frog down the tick the row
// has gone by its rule depth, or a jump forward carries it clear, but a
// move's glide trails the rules, so the drawn frog can still be among the
// row's vehicles then; dropping it there would put it inside them.
function heightAmong(run: Run, drawn: DrawnFrog, depth: number): number {
  const height = drawnRuleFrog(run, drawn).height;
  const held = drawn.lift > height && Number.isInteger(drawn.lift) && !drawnInVehicle(run, drawn, depth, drawn.lift);
  return held ? drawn.lift : height;
}

// A frog that has just jumped clear of a vehicle and then slid into its
// lane would be drawn inside it while its glide trails behind, so it is
// drawn at its rule depth at once.
export function keptOutOfVehicles(run: Run, drawn: DrawnFrog): DrawnFrog {
  if (!inPlay(run) || !drawnInVehicle(run, drawn, drawn.depth, heightAmong(run, drawn, drawn.depth))) return drawn;
  return { ...drawn, depth: frogTarget(drawnRuleFrog(run, drawn)).depth, glideDepth: null };
}

// The drawn frog's height at `now`. Among vehicles it is exactly as high as
// it is there. Otherwise it follows the rules' height: whenever that changes
// (a hop, being carried up or down, a fall onto a partner or the road), it
// rises or falls there along the hop arc from wherever it is drawn, so a hop
// off a partner still in the air springs on from mid-rise. It comes down
// once it has left the vehicles, when it rode on among them after the rules
// had it lower.
export function withHop(run: Run, drawn: DrawnFrog, now: number): DrawnFrog {
  if (amongVehicles(run, drawn.depth)) return { ...drawn, lift: heightAmong(run, drawn, drawn.depth), vertical: null };
  const target = drawnRuleFrog(run, drawn).height;
  let vertical = drawn.vertical;
  if (vertical === null || vertical.to !== target) {
    if (drawn.lift === target) return { ...drawn, vertical: null };
    vertical = { from: drawn.lift, to: target, startedAt: now };
  }
  const progress = verticalProgress(vertical, now, run.tuning.hopAirtime);
  if (progress === 1) return { ...drawn, lift: target, vertical: null };
  return { ...drawn, lift: vertical.from + (target - vertical.from) * progress, vertical };
}

// A bonk knocks the drawn frog back along a low arc over this long; the frog
// itself flattens against the row and is left dazed.
export const BONK_DURATION = 0.3;
const BONK_ARC_HEIGHT = 0.8;

// Whether two of the rules' bonks are the same one. Online, a correction
// re-runs the rules, which make every bonk afresh, so a bonk is told by when
// and where it was, not by which object holds it.
export function sameBonk(a: Bonk | null, b: Bonk | null): boolean {
  return a === b || (a !== null && b !== null && a.tick === b.tick && a.depth === b.depth);
}

// The drawn frog seeing the rules' latest bonk. A new one knocks it back from
// where it is drawn to where the rules knocked it. That is not the row's face
// whenever the bonk interrupts a move: a jump forward into the face, or a row
// arriving mid-glide, finds the drawn frog still short of it.
export function seeBonk(drawn: DrawnFrog, run: Run): DrawnFrog {
  const bonk = run.lastBonk;
  if (sameBonk(bonk, drawn.bonk)) return drawn;
  if (bonk === null) return { ...drawn, bonk };
  return { ...drawn, bonk, bonkMotion: { from: drawn.depth, to: run.depth, startedAt: toSeconds(bonk.tick) } };
}

export interface BonkPose {
  depth: number;
  lift: number;
}

// Where a bonk's knock-back has the drawn frog at `now`; null once it is
// over, or once the frog has jumped away from where the bonk put it.
export function bonkPose(motion: BonkMotion | null, run: Run, now: number): BonkPose | null {
  if (motion === null || run.depth !== motion.to) return null;
  const progress = (now - motion.startedAt) / BONK_DURATION;
  if (progress >= 1) return null;
  const eased = 1 - (1 - progress) ** 2;
  return {
    depth: motion.from + (motion.to - motion.from) * eased,
    lift: BONK_ARC_HEIGHT * Math.sin(Math.PI * progress),
  };
}

// The drawn frog's depth on the road at `now`, `delta` seconds on from the
// last frame: along a bonk's knock-back, a jump's glide, or else easing to
// the rule depth, and kept out of the vehicles. The drop and the finish leap
// draw it their own way.
export function followDepth(drawn: DrawnFrog, run: Run, now: number, pose: BonkPose | null, delta: number): DrawnFrog {
  if (pose !== null) return { ...drawn, depth: pose.depth };
  const target = frogTarget(drawnRuleFrog(run, drawn)).depth;
  const stride = moveDuration(run.tuning);
  const jump = drawn.glideDepth;
  const gliding = jump !== null && jump.to === target;
  const depth = gliding
    ? glideAt(jump, now, stride)
    : target + (drawn.depth - target) * Math.exp((-3 / run.tuning.easeDuration) * delta);
  const glideDepth = gliding && !arrived(jump, now, stride) ? jump : null;
  return keptOutOfVehicles(run, { ...drawn, depth, glideDepth });
}
