import { lift, settleTeam, slide, standsOn, supported, turn } from "../team";
import type { Frog, Rotation, TetrominoKind } from "../types";

// The team's poses as the planner sees them, between rows, with no vehicle
// overlapping the team: only the road's edges and the partners are in the
// way. The planner finds the fewest slots of time taking the team from one
// pose to a pose that passes the next row, with the team's own moves
// (`team.ts`) that the run plays too, so the steps it finds are ones the
// real engine plays the same way; the solver replays every one through the
// engine and fails loudly if it disagrees.
//
// Time runs in slots, each one action (or none) by one player. A hop keeps a
// frog in its own airtime for a whole number of slots; once that is over it
// falls to the highest support below it, a partner or the road, as soon as
// nothing is under it. A row reaches the team in the middle of a slot, after
// the slot's action and before the slot's end, so a frog whose airtime ends
// with that slot is still up when it is judged.

export interface PlanFrog {
  kind: TetrominoKind;
  col: number;
  rotation: Rotation;
  // Whole cells above the road.
  height: number;
  // How many slots of its own airtime the frog has left: 0 once it is over,
  // or it never hopped.
  air: number;
}

export type TeamPose = readonly PlanFrog[];

export type PoseAction = "left" | "right" | "rotateCw" | "rotateCcw" | "hop";

// One slot's move: a player's action, or a wait, which lets time pass.
export type PlanMove = { kind: "act"; player: number; action: PoseAction } | { kind: "wait" };

export interface PlanStep {
  move: PlanMove;
  // The team after the move, as a row arriving in that slot would judge it.
  pose: TeamPose;
}

export interface TeamPlan {
  steps: PlanStep[];
  // How many poses the search looked at.
  searched: number;
}

export interface PlanProblem {
  start: TeamPose;
  lanes: number;
  // How many slots a hop keeps a frog up.
  airSlots: number;
  // Whether a team pose passes the row.
  goal: (pose: TeamPose) => boolean;
  // The most poses the search may look at before giving up.
  maxPoses: number;
}

const ACTIONS: readonly PoseAction[] = ["left", "right", "rotateCw", "rotateCcw", "hop"];

export function planShape(frog: PlanFrog): Frog {
  return { kind: frog.kind, col: frog.col, rotation: frog.rotation, height: frog.height };
}

// Between rows nothing but the road's edges and the partners is in the way.
const OPEN_ROAD = (): boolean => true;

// Every frog out of its airtime with nothing under it falls.
function settle(pose: TeamPose): TeamPose {
  return settleTeam(pose, (player) => pose[player].air === 0);
}

// The stacking moves: a carry, a hop that lifts a partner or a slide that
// takes a rider along; a hop off, a frog hopping from a partner standing on
// its support; and a double jump, a frog hopping from a partner still in its
// own airtime.
export type StackMove = "carry" | "hop off" | "double jump";

const NO_MOVES: readonly StackMove[] = [];

// The stacking moves a player's action made, from the team before it to the
// team after it.
export function stackMovesOf(before: TeamPose, player: number, action: PoseAction, after: TeamPose): StackMove[] {
  if (after === before) return [];
  const moves: StackMove[] = [];
  if (after.some((frog, i) => i !== player && (frog.col !== before[i].col || frog.height > before[i].height))) moves.push("carry");
  if (action === "hop") {
    const hopper = planShape(before[player]);
    const under = before.filter((frog, i) => i !== player && standsOn(hopper, planShape(frog)));
    if (under.some((frog) => frog.air > 0)) moves.push("double jump");
    else if (under.length > 0) moves.push("hop off");
  }
  return moves;
}

// A player's action, as the run applies it: a slide carries its riders where
// they have room, a turn kicks and carries nothing, a hop needs the frog
// supported and out of its airtime and lifts what stands on it, and after
// any action a frog out of its airtime with nothing under it falls. An
// action making one of the `refused` stacking moves is refused, for asking
// what the team can reach without them.
export function applyPoseAction(
  pose: TeamPose,
  lanes: number,
  player: number,
  action: PoseAction,
  airSlots: number,
  refused: readonly StackMove[] = NO_MOVES,
): TeamPose {
  const road = { first: 0, last: lanes - 1 };
  let moved: PlanFrog[] | null = null;
  switch (action) {
    case "left":
    case "right":
      moved = slide(pose, player, action === "left" ? -1 : 1, road, OPEN_ROAD);
      break;
    case "rotateCw":
    case "rotateCcw":
      moved = turn(pose, player, action === "rotateCw" ? 1 : -1, road, OPEN_ROAD);
      break;
    case "hop":
      if (pose[player].air === 0 && supported(pose, player)) moved = lift(pose, player, road, OPEN_ROAD);
      if (moved !== null) moved[player] = { ...moved[player], air: airSlots };
      break;
  }
  if (moved === null) return pose;
  const after = settle(moved);
  return refused.length > 0 && stackMovesOf(pose, player, action, after).some((move) => refused.includes(move)) ? pose : after;
}

// The slot ends: each frog in its airtime uses a slot of it, and once it is
// over falls if nothing is under it.
export function endSlot(pose: TeamPose): TeamPose {
  return settle(pose.map((frog) => (frog.air === 0 ? frog : { ...frog, air: frog.air - 1 })));
}

// The most lanes, heights and slots of airtime a pose's number has room for.
const CODE_LANES = 32;
const CODE_HEIGHTS = 16;
const CODE_AIR = 8;

// A pose as one number, for the searches' sets of poses seen: each frog's
// lane, rotation, height and airtime left, the airtime capped at `airCap`.
export function poseCode(pose: TeamPose, airCap: number): number {
  let code = 0;
  for (const f of pose) {
    if (f.col < 0 || f.col >= CODE_LANES || f.height < 0 || f.height >= CODE_HEIGHTS || f.air >= CODE_AIR) {
      throw new Error(`A frog at lane ${String(f.col)}, ${String(f.height)} up with ${String(f.air)} slots of airtime is past a pose's number`);
    }
    code = (((code * CODE_LANES + f.col) * 4 + f.rotation) * CODE_HEIGHTS + f.height) * CODE_AIR + Math.min(f.air, airCap);
  }
  return code;
}

function movesFor(players: number): PlanMove[] {
  const moves: PlanMove[] = [];
  for (let player = 0; player < players; player++) {
    for (const action of ACTIONS) moves.push({ kind: "act", player, action });
  }
  moves.push({ kind: "wait" });
  return moves;
}

interface Visit {
  // The pose at the slot's end, from which the next slot starts.
  after: TeamPose;
  steps: PlanStep[];
}

// The fewest slots from the start to a pose the goal accepts, breadth first.
// Null if no pose the team can reach passes; it throws if the search would
// look at more than `maxPoses` poses, so it never runs away.
export function planTeam({ start, lanes, airSlots, goal, maxPoses }: PlanProblem): TeamPlan | null {
  if (goal(start)) return { steps: [], searched: 1 };
  const moves = movesFor(start.length);
  const seen = new Set([poseCode(start, airSlots)]);
  let frontier: Visit[] = [{ after: start, steps: [] }];
  while (frontier.length > 0) {
    const next: Visit[] = [];
    for (const visit of frontier) {
      for (const move of moves) {
        const pose = move.kind === "wait" ? visit.after : applyPoseAction(visit.after, lanes, move.player, move.action, airSlots);
        // A refused action is a wait, and the plan says so.
        if (move.kind === "act" && pose === visit.after) continue;
        const steps = [...visit.steps, { move, pose }];
        if (goal(pose)) return { steps, searched: seen.size };
        const after = endSlot(pose);
        const key = poseCode(after, airSlots);
        if (seen.has(key)) continue;
        seen.add(key);
        if (seen.size > maxPoses) throw new Error(`No route found within ${String(maxPoses)} team poses`);
        next.push({ after, steps });
      }
    }
    frontier = next;
  }
  return null;
}

// The frogs a step carried: those, besides the one acting, that slid along
// with it or rose with its hop.
export function carriedIn(before: TeamPose, step: PlanStep): number[] {
  const { move, pose } = step;
  if (move.kind === "wait") return [];
  return pose.flatMap((frog, i) => (i !== move.player && (frog.col !== before[i].col || frog.height > before[i].height) ? [i] : []));
}

// The stacking moves a step made.
export function stepStackMoves(before: TeamPose, step: PlanStep): StackMove[] {
  return step.move.kind === "wait" ? [] : stackMovesOf(before, step.move.player, step.move.action, step.pose);
}
