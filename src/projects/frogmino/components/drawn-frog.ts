import type { LeapStart } from "../frog/leaps";
import { glide, moveDuration, moveHopLift, moveProgress } from "../frog/moves";
import { frogCells, pieceSize } from "../logic";
import {
  FROG_THICKNESS,
  frogShape,
  hopHeight,
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
import type { HopHeight, Rotation, Solid, TetrominoKind } from "../types";
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

// A move's glide from where the frog was drawn to its new place, along one
// axis.
export interface Glide {
  from: number;
  to: number;
  startedAt: number;
}

// The game draws player 0's frog: solo's, until co-op play draws the team.
export const DRAWN_PLAYER = 0;

// The rule frog the drawn frog follows, at the team's depth.
export function drawnRuleFrog(run: Run): PlacedFrog {
  return placedFrog(run, DRAWN_PLAYER);
}

// What the drawn frog last saw of the rule frog, to tell what has moved.
export type SeenFrog = Pick<PlacedFrog, "kind" | "rotation" | "col" | "depth">;

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
  // The latest time the drawn frog rode on up among a row's vehicles after
  // the rules had landed it; its fall starts from then, not from the rules'
  // landing.
  rodeUntil: number | null;
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

function seenOf({ kind, rotation, col, depth }: PlacedFrog): SeenFrog {
  return { kind, rotation, col, depth };
}

// The drawn frog at the start of a run: exactly as the rules have it.
export function snapped(run: Run): DrawnFrog {
  return {
    ...frogTarget(drawnRuleFrog(run)),
    kind: drawnRuleFrog(run).kind,
    rotation: drawnRuleFrog(run).rotation,
    level: onOverpass(run) ? DECK_TOP : 0,
    swing: 0,
    lift: hopHeight(drawnRuleFrog(run)),
    rodeUntil: null,
    glideX: null,
    glideDepth: null,
    moveHops: [],
    seen: seenOf(drawnRuleFrog(run)),
    hopAt: drawnRuleFrog(run).latestHop?.startedAt ?? null,
    bonk: run.lastBonk,
    bonkMotion: null,
    drop: null,
    leap: null,
  };
}

// A gate's new piece is drawn at once in its rule pose, across and up, since
// its box differs from the old piece's. Everything else carries on: the
// depth still eases, and a hop, bonk, drop or leap goes on being drawn.
export function withPiece(drawn: DrawnFrog, frog: PlacedFrog): DrawnFrog {
  const { x, y } = frogTarget(frog);
  return { ...drawn, kind: frog.kind, rotation: frog.rotation, x, y, swing: 0, glideX: null };
}

// The everyday moves the rules have made since the drawn frog last looked: a
// slide, to a new column in the same piece and rotation (a turn's kick is no
// slide), and a jump, to a new depth. A bonk's knock-back, the drop and the
// finish leap change the depth too, and are drawn as their own motions; the
// scene tells those apart.
export function movesSince(seen: SeenFrog, frog: PlacedFrog): { slid: boolean; jumped: boolean } {
  const samePose = seen.kind === frog.kind && seen.rotation === frog.rotation;
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

// The hop arc overshoots a sine and is capped at one cell, so the drawn frog
// rises quickly to a full cell, as the rules count it, and falls the same way
// once it comes down.
const HOP_ARC_OVERSHOOT = 1.3;

// The rising half of the hop arc, `seconds` into it.
function hopArc(seconds: number, airtime: number): number {
  const progress = Math.min(0.5, Math.max(0, seconds / airtime));
  return Math.min(1, HOP_ARC_OVERSHOOT * Math.sin(Math.PI * progress));
}

// How long the arc takes to reach a full cell.
function hopRiseTime(airtime: number): number {
  return (airtime * Math.asin(1 / HOP_ARC_OVERSHOOT)) / Math.PI;
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

// Whether the frog in its rule pose, `hop` cells up and drawn at `depth`,
// would be inside a vehicle overlapping it there, across a gate's post, or
// above the face.
function drawnInVehicle(run: Run, depth: number, hop: HopHeight): boolean {
  const cells = frogCells({ ...frogShape(drawnRuleFrog(run)), hop });
  const onFace = cells.every((cell) => cell.row < run.tuning.wallRows);
  return run.walls.some((wall) => {
    const solids = overlappingDrawn(wall, depth);
    return solids.length > 0 && !(onFace && keepsClear(cells, cells, solids));
  });
}

// How high the drawn frog is among vehicles at `depth`: as high as the rules
// have it, except that a drawn frog riding a row, a full cell up, rides on
// while it stays clear. The rules land a riding frog the tick the row has
// gone by its rule depth, or a jump forward carries it clear, but a move's
// glide trails the rules, so the drawn frog can still be among the row's
// vehicles then; dropping it there would put it inside them.
function heightAmong(run: Run, drawn: DrawnFrog, depth: number): HopHeight {
  if (hopHeight(drawnRuleFrog(run)) === 1) return 1;
  return drawn.lift === 1 && !drawnInVehicle(run, depth, 1) ? 1 : 0;
}

// A frog that has just jumped clear of a vehicle and then slid into its
// lane would be drawn inside it while its glide trails behind, so it is
// drawn at its rule depth at once.
export function keptOutOfVehicles(run: Run, drawn: DrawnFrog): DrawnFrog {
  if (!inPlay(run) || !drawnInVehicle(run, drawn.depth, heightAmong(run, drawn, drawn.depth))) return drawn;
  return { ...drawn, depth: frogTarget(drawnRuleFrog(run)).depth, glideDepth: null };
}

// The drawn frog's hop at `now`. Among vehicles it is exactly as high as it
// is there. Otherwise it rises along the arc while the rules have it up, and
// falls back along it once it has come down: when the rules landed it, or
// later, when it last rode on among the row. Each only ever moves the drawn
// frog one way, so it carries on smoothly from wherever it was left.
export function withHop(run: Run, drawn: DrawnFrog, now: number): DrawnFrog {
  const hop = drawnRuleFrog(run).latestHop;
  if (hop === null) return { ...drawn, lift: 0 };
  if (amongVehicles(run, drawn.depth)) {
    const height = heightAmong(run, drawn, drawn.depth);
    const ridingOn = height === 1 && hop.landedAt !== null;
    return { ...drawn, lift: height, rodeUntil: ridingOn ? now : drawn.rodeUntil };
  }
  const airtime = run.tuning.hopAirtime;
  if (hop.landedAt === null) return { ...drawn, lift: Math.max(drawn.lift, hopArc(now - toSeconds(hop.startedAt), airtime)) };
  const landed = toSeconds(hop.landedAt);
  const down = Math.max(landed, drawn.rodeUntil ?? landed);
  return { ...drawn, lift: Math.min(drawn.lift, hopArc(hopRiseTime(airtime) - (now - down), airtime)) };
}

// A bonk knocks the drawn frog back along a low arc over this long; the frog
// itself flattens against the row and is left dazed.
export const BONK_DURATION = 0.3;
const BONK_ARC_HEIGHT = 0.8;

// The drawn frog seeing the rules' latest bonk. A new one knocks it back from
// where it is drawn to where the rules knocked it. That is not the row's face
// whenever the bonk interrupts a move: a jump forward into the face, or a row
// arriving mid-glide, finds the drawn frog still short of it.
export function seeBonk(drawn: DrawnFrog, run: Run): DrawnFrog {
  const bonk = run.lastBonk;
  if (bonk === drawn.bonk) return drawn;
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
  const target = frogTarget(drawnRuleFrog(run)).depth;
  const stride = moveDuration(run.tuning);
  const jump = drawn.glideDepth;
  const gliding = jump !== null && jump.to === target;
  const depth = gliding
    ? glideAt(jump, now, stride)
    : target + (drawn.depth - target) * Math.exp((-3 / run.tuning.easeDuration) * delta);
  const glideDepth = gliding && !arrived(jump, now, stride) ? jump : null;
  return keptOutOfVehicles(run, { ...drawn, depth, glideDepth });
}
