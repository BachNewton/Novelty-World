import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import { applyInput, createRun, inAirtime, playTo, type RuleRows, type Run } from "../run";
import { tickTiming } from "../ticks";
import { TUNING } from "../tuning";
import type { TetrominoKind } from "../types";
import { startPose } from "./analyse";
import { DEFAULT_SLOT } from "./solver";
import { applyPoseAction, endSlot, poseCode, type PoseAction, type TeamPose } from "./team-plan";

// The guard against a pair stuck for good: on an open road, wherever the two
// frogs can get to, they can always get back to where they started. Stacking
// lets one frog climb over the other, so it must never let them into an
// arrangement they can't undo; under the rules before it, an O and an S could
// cross over and never cross back.
//
// For every pair of pieces it explores every arrangement the pair can reach
// from the start on a 10-lane road with no traffic, by the planner's own
// moves (slides with riders, turns with kicks, hops that lift, double jumps,
// waits, falls; airtime counted in the planner's slots), and asserts that
// every one at rest, neither frog in its airtime, leads back to the start.
// The planner is what the solver holds to the engine, so a spot check here
// plays random walks of its moves in the engine too.
//
// It is slow because it walks every arrangement of all 28 pairs, a hundred
// thousand or so each; no fast test sees a one-way arrangement, which only
// shows by searching all of them.

const LANES = 10;
const KINDS: readonly TetrominoKind[] = ["I", "O", "T", "S", "Z", "J", "L"];
const PAIRS = KINDS.flatMap((a, i) => KINDS.slice(i).map((b) => [a, b] as const));
const AIR_SLOTS = tickTiming(TUNING).hopAirtime / DEFAULT_SLOT;
const ACTIONS: readonly PoseAction[] = ["left", "right", "rotateCw", "rotateCcw", "hop"];

// Every move a slot can hold, from a pose at the slot's start to the pose at
// the next one's.
function successors(pose: TeamPose): TeamPose[] {
  const acted = [0, 1].flatMap((player) => ACTIONS.map((action) => applyPoseAction(pose, LANES, player, action, AIR_SLOTS)));
  return [pose, ...acted.filter((next) => next !== pose)].map(endSlot);
}

interface Explored {
  poses: TeamPose[];
  // Which poses each pose can reach in a slot, by index.
  next: number[][];
}

// Every pose the pair can reach from the start, at a slot's start.
function explore(start: TeamPose): Explored {
  const index = new Map([[poseCode(start, AIR_SLOTS), 0]]);
  const poses = [start];
  const next: number[][] = [];
  for (let at = 0; at < poses.length; at++) {
    next.push(
      successors(poses[at]).map((pose) => {
        const code = poseCode(pose, AIR_SLOTS);
        const known = index.get(code);
        if (known !== undefined) return known;
        index.set(code, poses.length);
        poses.push(pose);
        return poses.length - 1;
      }),
    );
  }
  return { poses, next };
}

// The poses that lead back to the start, by index.
function leadBack({ poses, next }: Explored): boolean[] {
  const before: number[][] = poses.map(() => []);
  next.forEach((targets, from) => {
    for (const to of targets) before[to].push(from);
  });
  const back = poses.map(() => false);
  back[0] = true;
  const queue = [0];
  for (let at = queue.pop(); at !== undefined; at = queue.pop()) {
    for (const from of before[at]) {
      if (back[from]) continue;
      back[from] = true;
      queue.push(from);
    }
  }
  return back;
}

function describePose(pose: TeamPose): string {
  return pose.map((frog) => `${frog.kind} r${String(frog.rotation)} c${String(frog.col)} up ${String(frog.height)}`).join(", ");
}

describe("a pair of frogs on an open road", () => {
  it.each(PAIRS)("%s and %s can always get back to where they started", (a, b) => {
    const explored = explore(startPose([a, b], LANES));
    const back = leadBack(explored);
    const resting = explored.poses.filter((pose) => pose.every((frog) => frog.air === 0));
    expect(resting.length).toBeGreaterThan(100);
    const stuck = explored.poses.filter((pose, i) => !back[i] && pose.every((frog) => frog.air === 0));
    expect(stuck.map(describePose).slice(0, 3)).toEqual([]);
  });
});

// No traffic within reach.
const NO_TRAFFIC: RuleRows = () => ({ solids: [{ cells: [{ col: 0, row: 0 }], length: 1 }], gap: 1e6 });

describe("the planner's moves", () => {
  it.each(PAIRS)("play the same in the engine for %s and %s, slot by slot", (a, b) => {
    const random = createRng(`never-stuck:${a}${b}`).next;
    const started = createRun(NO_TRAFFIC, TUNING, { kinds: [a, b], lanes: LANES });
    let run: Run = { ...started, droppedAt: 0, depth: 5 };
    let pose = startPose([a, b], LANES);
    const same = (): void => {
      expect(run.frogs.map(({ col, rotation, height }) => ({ col, rotation, height }))).toEqual(
        pose.map(({ col, rotation, height }) => ({ col, rotation, height })),
      );
      expect(run.frogs.map((frog) => inAirtime(run, frog))).toEqual(pose.map((frog) => frog.air > 0));
    };
    for (let slot = 0; slot < 300; slot++) {
      // Hops half the time, so the pair climbs on each other often.
      const player = random() < 0.5 ? 0 : 1;
      const action = random() < 0.5 ? "hop" : ACTIONS[Math.floor(random() * 4)];
      pose = applyPoseAction(pose, LANES, player, action, AIR_SLOTS);
      run = applyInput(run, { tick: run.tick, player, input: { kind: "act", action } });
      same();
      pose = endSlot(pose);
      run = playTo(run, run.tick + DEFAULT_SLOT);
      same();
    }
  });
});
