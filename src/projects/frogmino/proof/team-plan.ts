import { frogCells, insideLanes, turnWithKicks, type Placement } from "../logic";
import type { Frog, Rotation, TetrominoKind } from "../types";

// The team's poses as the planner sees them, between rows, with no vehicle
// overlapping the team: only the road's edges and the partners are in the
// way. The planner finds the fewest slots of time taking the team from one
// pose to a pose that passes the next row, with the real piece rules
// (`logic.ts`) and the run's rules for hops and partners (`run.ts`), so the
// steps it finds are ones the real engine plays the same way; the solver
// replays every one through the engine and fails loudly if it disagrees.
//
// Time runs in slots, each one action (or none) by one player. A hop keeps a
// frog up for a whole number of slots, its airtime, and then it lands, unless
// its partner is under it: then it stands on its partner until the partner
// moves out from under it. A row reaches the team in the middle of a slot,
// after the slot's action and before the slot's end, so a frog whose airtime
// ends with that slot is still up when it is judged.

export interface PlanFrog {
  kind: TetrominoKind;
  col: number;
  rotation: Rotation;
  // Null on the road; while up, how many slots of airtime it has left, 0
  // once its airtime is over and it is standing on its partner.
  air: number | null;
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
  return { kind: frog.kind, col: frog.col, rotation: frog.rotation, hop: frog.air === null ? 0 : 1 };
}

function clearOfPartners(pose: TeamPose, player: number, shape: Frog): boolean {
  const cells = frogCells(shape);
  return pose.every(
    (other, i) => i === player || frogCells(planShape(other)).every((a) => cells.every((b) => a.col !== b.col || a.row !== b.row)),
  );
}

function withFrog(pose: TeamPose, player: number, frog: Partial<PlanFrog>): TeamPose {
  return pose.map((f, i) => (i === player ? { ...f, ...frog } : f));
}

// Every frog whose airtime is over lands, unless a partner is under it.
function settle(pose: TeamPose): TeamPose {
  let next = pose;
  next.forEach((frog, player) => {
    if (frog.air === 0 && clearOfPartners(next, player, { ...planShape(frog), hop: 0 })) next = withFrog(next, player, { air: null });
  });
  return next;
}

// A player's action, as the run applies it: a slide or turn (with its kicks)
// stays on the road and clear of the partners, a hop is ignored while up, and
// after any action a frog whose airtime is over lands if it can.
export function applyPoseAction(pose: TeamPose, lanes: number, player: number, action: PoseAction, airSlots: number): TeamPose {
  const frog = pose[player];
  const road = { first: 0, last: lanes - 1 };
  const shape = planShape(frog);
  const allowed = (p: Placement): boolean => insideLanes(frog.kind, p, road) && clearOfPartners(pose, player, { ...shape, ...p });
  let next = pose;
  switch (action) {
    case "left":
    case "right": {
      const placement = { col: frog.col + (action === "left" ? -1 : 1), rotation: frog.rotation };
      if (allowed(placement)) next = withFrog(pose, player, placement);
      break;
    }
    case "rotateCw":
    case "rotateCcw": {
      const placement = turnWithKicks(frog.kind, frog, action === "rotateCw" ? 1 : -1, allowed);
      if (placement !== null) next = withFrog(pose, player, placement);
      break;
    }
    case "hop":
      if (frog.air === null && clearOfPartners(pose, player, { ...shape, hop: 1 })) next = withFrog(pose, player, { air: airSlots });
      break;
  }
  return settle(next);
}

// The slot ends: each frog up uses a slot of its airtime, and lands once it
// is over, unless it stands on a partner.
export function endSlot(pose: TeamPose): TeamPose {
  return settle(pose.map((frog) => (frog.air === null || frog.air === 0 ? frog : { ...frog, air: frog.air - 1 })));
}

function poseKey(pose: TeamPose, airSlots: number): string {
  return pose.map((f) => `${String(f.col)}.${String(f.rotation)}.${f.air === null ? "-" : String(Math.min(f.air, airSlots))}`).join("|");
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
  const seen = new Set([poseKey(start, airSlots)]);
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
        const key = poseKey(after, airSlots);
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
