import { fitsRow } from "../run";
import type { Solid } from "../types";
import { applyPoseAction, endSlot, planShape, type PoseAction, type TeamPose } from "./team-plan";

// How hard a row is for a team, read off the planner's pose space: how many
// team poses the team can reach between rows that pass the row. One is a
// single answer; dozens, a row with room to spare. It counts shapes, not
// timings: a frog up counts once, however much of its airtime is left. Poses
// the team can't reach don't count, so neither does an answer that needs the
// frogs to pass through each other.

const ACTIONS: readonly PoseAction[] = ["left", "right", "rotateCw", "rotateCcw", "hop"];

function shapeKey(pose: TeamPose): string {
  return pose
    .map((frog) => {
      const { col, rotation, hop } = planShape(frog);
      return `${String(col)}.${String(rotation)}.${String(hop)}`;
    })
    .join("|");
}

function stateKey(pose: TeamPose): string {
  return pose.map((f) => `${String(f.col)}.${String(f.rotation)}.${f.air === null ? "-" : String(f.air)}`).join("|");
}

// Every distinct team pose a row arriving in some slot could judge, reachable
// from `start` by the planner's moves. Between rows nothing but the road's
// edges and the partners is in the way, so it is the same for every row.
export function reachablePoses(start: TeamPose, lanes: number, airSlots: number): TeamPose[] {
  const poses = new Map<string, TeamPose>([[shapeKey(start), start]]);
  const seen = new Set([stateKey(start)]);
  const queue: TeamPose[] = [start];
  for (let pose = queue.pop(); pose !== undefined; pose = queue.pop()) {
    const from = pose;
    const nexts = [from, ...from.flatMap((_, player) => ACTIONS.map((action) => applyPoseAction(from, lanes, player, action, airSlots)))];
    for (const next of nexts) {
      const key = shapeKey(next);
      if (!poses.has(key)) poses.set(key, next);
      const after = endSlot(next);
      const state = stateKey(after);
      if (seen.has(state)) continue;
      seen.add(state);
      queue.push(after);
    }
  }
  return [...poses.values()];
}

// The reachable poses that pass a row of `solids`.
export function passingPoses(reachable: readonly TeamPose[], solids: readonly Solid[], wallRows: number): TeamPose[] {
  return reachable.filter((pose) => pose.every((frog) => fitsRow(planShape(frog), solids, wallRows)));
}
