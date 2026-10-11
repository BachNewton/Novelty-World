import * as THREE from "three";
import { animated } from "./animate";
import { walkLasts, walkPose, type Walk } from "./house-walk";
import { group } from "./shapes";
import type { ExplorerBuilder } from "./stage";
import { onCourse } from "./explorers/cloth-trial";
import { ADULT_WALK, STANDING, walkingOf, type Gait, type Pace, type Stride } from "./explorers/figure";
import { onTheSpot } from "./explorers/line-up";

/*
 * How the figure viewer (`?bench=figures`) moves a figure: standing in its
 * idle, walking or running on the spot, or along little scripted courses
 * that show a straight, its start and stop, and sharp turns. Each is a pure
 * function of the stage's clock, looping, so a frozen clock always shows the
 * same frame.
 */

export const FIGURE_STATES = ["idle", "walk", "walk-line", "run", "run-line", "turns", "start-stop", "course"] as const;
export type FigureState = (typeof FIGURE_STATES)[number];

export const STATE_LABELS: Record<FigureState, string> = {
  idle: "Idle",
  walk: "Walk on the spot",
  "walk-line": "Walk a straight",
  run: "Run on the spot",
  "run-line": "Run a straight",
  turns: "Sharp turns",
  "start-stop": "Start and stop",
  course: "Loop course",
};

/** Radians a figure turns on the spot each second, between the straights of a course. */
const TURN_RATE = Math.PI / 0.9;
/** The way across the first view of the bench (from the bottom-right corner), so a straight shows its gait side on. */
const ACROSS: readonly [number, number] = [Math.SQRT1_2, -Math.SQRT1_2];

type Point = readonly [number, number];

/** One move of a course: along a path at a pace, or standing for a while (turning first, if the next move needs it). */
type Move = { go: readonly Point[]; pace: Pace } | { stand: number };

interface Pose {
  x: number;
  z: number;
  heading: number;
  stride: Stride;
}

const along = (metres: number): Point => [ACROSS[0] * metres, ACROSS[1] * metres];

/** The courses, by state: each ends where it began, and the course turns the figure back to face the way it started. */
const COURSES: Partial<Record<FigureState, readonly Move[]>> = {
  "walk-line": [{ go: [along(-1.2), along(1.2)], pace: "walk" }, { stand: 0.4 }, { go: [along(1.2), along(-1.2)], pace: "walk" }, { stand: 0.4 }],
  "run-line": [{ go: [along(-1.6), along(1.6)], pace: "run" }, { stand: 0.6 }, { go: [along(1.6), along(-1.6)], pace: "run" }, { stand: 0.6 }],
  // A bow tie walked round three times: every corner a sharp turn, taken in the stride as the house takes them.
  turns: [
    {
      go: Array.from({ length: 3 }, (): Point[] => [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]).flat().concat([[-0.7, -0.7]]),
      pace: "walk",
    },
    { stand: 1 },
  ],
  "start-stop": [
    { go: [along(-1.8), along(-0.6)], pace: "walk" },
    { stand: 1.2 },
    { go: [along(-0.6), along(1.8)], pace: "run" },
    { stand: 1.2 },
    { go: [along(1.8), along(-1.8)], pace: "walk" },
    { stand: 1 },
  ],
};

/** The turn about the vertical facing from `a` to `b`, as the house faces a walker. */
function facing(a: Point, b: Point): number {
  return Math.atan2(b[0] - a[0], b[1] - a[1]);
}

/** The shortest turn from one heading to another, in radians. */
function turnBetween(from: number, to: number): number {
  return THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
}

type Segment = { start: number; end: number; pose: (seconds: number, step: number) => Pose };

/** A course as segments on its own clock, walked at a Speed value: each move, with a turn on the spot before any that
 *  faces a new way. */
function segmentsOf(moves: readonly Move[], speed: number | undefined): { segments: Segment[]; period: number } {
  const goes = moves.filter((move): move is Extract<Move, { go: readonly Point[] }> => "go" in move);
  if (goes.length === 0) throw new Error("A course has somewhere to go");
  const first = goes[0].go;
  const startHeading = facing(first[0], first[1]);
  const segments: Segment[] = [];
  let time = 0;
  let at: Point = first[0];
  let heading = startHeading;
  const standing = (x: number, z: number, from: number, to: number, start: number, lasts: number): Segment => ({
    start,
    end: start + lasts,
    pose: (seconds) => {
      const t = lasts === 0 ? 1 : THREE.MathUtils.smootherstep((seconds - start) / lasts, 0, 1);
      return { x, z, heading: from + turnBetween(from, to) * t, stride: STANDING(seconds) };
    },
  });
  const turnTo = (to: number) => {
    const lasts = Math.abs(turnBetween(heading, to)) / TURN_RATE;
    if (lasts > 1e-3) segments.push(standing(at[0], at[1], heading, to, time, lasts));
    time += lasts;
    heading = to;
  };
  for (const move of moves) {
    if ("stand" in move) {
      segments.push(standing(at[0], at[1], heading, heading, time, move.stand));
      time += move.stand;
      continue;
    }
    const path = move.go;
    turnTo(facing(path[0], path[1]));
    const walk: Walk = { path: path.map(([x, z]) => ({ floor: "ground", x, y: 0, z })), start: time, pace: move.pace, speed };
    const lasts = walkLasts(walk);
    segments.push({
      start: time,
      end: time + lasts,
      pose: (seconds, step) => {
        const pose = walkPose(walk, seconds, step);
        return { x: pose.point.x, z: pose.point.z, heading: pose.heading, stride: pose.stride };
      },
    });
    time += lasts;
    at = path[path.length - 1];
    heading = facing(path[path.length - 2], at);
  }
  turnTo(startHeading);
  return { segments, period: time };
}

const courses = new Map<string, ReturnType<typeof segmentsOf>>();

function courseOf(state: FigureState, speed: number | undefined): ReturnType<typeof segmentsOf> {
  const key = `${state}:${String(speed)}`;
  const known = courses.get(key);
  if (known) return known;
  const moves = COURSES[state];
  if (!moves) throw new Error(`"${state}" is no course`);
  const course = segmentsOf(moves, speed);
  courses.set(key, course);
  return course;
}

/** Where a course has a figure at a moment on the stage's clock, looping, given its walking step and Speed value. */
export function coursePose(state: FigureState, seconds: number, step = ADULT_WALK.step, speed?: number): Pose {
  const { segments, period } = courseOf(state, speed);
  const t = THREE.MathUtils.euclideanModulo(seconds, period);
  const segment = segments.find(({ end }) => t < end) ?? segments[segments.length - 1];
  return segment.pose(t, step);
}

/** A figure moving as the state says, from the middle of the stage, at a Speed value (left out, the house's own pace;
 *  the cloth trial's course keeps it): `root` to add to the scene, and the figure itself inside it. The figure's own
 *  root stays put: a holder moves and turns it, as the house's does. */
export function inMotion(build: ExplorerBuilder, seed: string, state: FigureState, speed?: number): { root: THREE.Object3D; figure: THREE.Object3D } {
  if (state === "idle") return alone(build(seed, STANDING));
  if (state === "walk" || state === "run") return alone(onTheSpot(build, seed, state, speed));
  let step = ADULT_WALK.step;
  const made: { figure: THREE.Object3D | null } = { figure: null };
  const course = state === "course";
  const gait: Gait = (seconds) => coursePose(state, seconds, step, speed).stride;
  const builds: ExplorerBuilder = (figureSeed, figureGait) => {
    made.figure = build(figureSeed, figureGait);
    return made.figure;
  };
  if (course) {
    const root = onCourse(builds)(seed);
    if (!made.figure) throw new Error("The course built no figure");
    return { root, figure: made.figure };
  }
  const built = builds(seed, gait);
  // The stride follows the figure's own step, known once it is built.
  step = walkingOf(built).step;
  const holder = animated(group(built), (seconds) => {
    const pose = coursePose(state, seconds, step, speed);
    holder.position.set(pose.x, 0, pose.z);
    holder.rotation.y = pose.heading;
  });
  return { root: group(holder), figure: built };
}

/** A figure that stands where it is built, in a group of its own, so whatever stands round it (its ring) goes with it. */
function alone(figure: THREE.Object3D): { root: THREE.Object3D; figure: THREE.Object3D } {
  return { root: group(figure), figure };
}
