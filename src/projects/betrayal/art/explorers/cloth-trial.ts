import { animated } from "../animate";
import { RUN_SPEED, WALK_SPEED, walkLength, walkPose, type Walk } from "../house-walk";
import { group } from "../shapes";
import type { ExplorerBuilder } from "../stage";
import { ADULT_WALK, walkingOf, type Gait } from "./figure";

/*
 * The trial of simulated cloth on Zoe's skirt, for the owner to compare: the
 * page's URL picks it (`?cloth=panels|net`, on the bench and in the house),
 * and without it the skirt is the heavy cloth worked out from the clock.
 * The bench's course walks a figure round a little loop with sharp turns,
 * stops, then runs it, so the cloth shows how it swings, lags and settles.
 */

export const CLOTH_TRIALS = ["off", "panels", "net"] as const;
export type ClothTrial = (typeof CLOTH_TRIALS)[number];

function isClothTrial(value: string): value is ClothTrial {
  return (CLOTH_TRIALS as readonly string[]).includes(value);
}

/** The cloth this page asks for; a value it doesn't know throws, so a typo never passes for a choice. Figures are
 *  also built in tests and workers, which have no page. */
export function clothTrial(): ClothTrial {
  const search = typeof window === "undefined" ? "" : window.location.search;
  const trial = new URLSearchParams(search).get("cloth") ?? "off";
  if (!isClothTrial(trial)) throw new Error(`cloth=${trial}: it is one of ${CLOTH_TRIALS.join(", ")}`);
  return trial;
}

/** The course's loop, in metres from where the figure stands: round a narrow
 *  triangle, each corner a sharp turn, ending as it began, facing the same way. */
const LOOP: readonly (readonly [number, number])[] = [
  [-0.45, -0.3],
  [-0.45, 0.65],
  [0.45, -0.25],
  [-0.45, -0.65],
  [-0.45, -0.3],
];
/** The course: walk the loop, stand, run it twice, stand. Seconds each part takes to start after the last. */
const COURSE = { walkAt: 0.5, standAfterWalk: 2.2, runs: 2, standAfterRun: 2.5 };

function loopWalk(start: number, times: number, pace: Walk["pace"]): Walk {
  const points = [LOOP[0], ...Array.from({ length: times }, () => LOOP.slice(1)).flat()];
  return { path: points.map(([x, z]) => ({ floor: "ground", x, y: 0, z })), start, pace };
}

/** How long a walk along a path takes, at its pace. */
function lasts(walk: Walk): number {
  return walkLength(walk.path) / (walk.pace === "run" ? RUN_SPEED : WALK_SPEED);
}

const WALKING = loopWalk(COURSE.walkAt, 1, "walk");
const RUNNING = loopWalk(COURSE.walkAt + lasts(WALKING) + COURSE.standAfterWalk, COURSE.runs, "run");

/** When, in each round of the course, the figure walks and runs, and how long a round takes. */
export const COURSE_TIMES = {
  walk: { start: WALKING.start, end: WALKING.start + lasts(WALKING) },
  run: { start: RUNNING.start, end: RUNNING.start + lasts(RUNNING) },
  period: RUNNING.start + lasts(RUNNING) + COURSE.standAfterRun,
};

/** A figure walking and running the course, over and over, from where the bench stands it. Its own root stays put:
 *  a holder between them moves and turns it, as the house's holder does. */
export function onCourse(build: ExplorerBuilder): ExplorerBuilder {
  return (seed) => {
    let step = ADULT_WALK.step;
    const at = (seconds: number) => {
      const t = ((seconds % COURSE_TIMES.period) + COURSE_TIMES.period) % COURSE_TIMES.period;
      return walkPose(t < RUNNING.start ? WALKING : RUNNING, t, step);
    };
    const gait: Gait = (seconds) => at(seconds).stride;
    const figure = build(seed, gait);
    // The stride follows the figure's own step, known once it is built.
    step = walkingOf(figure).step;
    const holder = animated(group(figure), (seconds) => {
      const pose = at(seconds);
      holder.position.set(pose.point.x, 0, pose.point.z);
      holder.rotation.y = pose.heading;
    });
    return group(holder);
  };
}
