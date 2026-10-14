import { TUNING } from "../tuning";
import { BLOCK_PARTY } from "./block-party";
import { checkCoopCourse } from "./check";
import { COURSE_TIERS, type DesignedCourse } from "./design";
import { CHAIN_REACTION } from "./chain-reaction";
import { LONG_AND_SHORT } from "./long-and-short";
import { TEA_FOR_TWO } from "./tea-for-two";
import { ZIG_ZAG_ALLEY } from "./zig-zag-alley";

// Every designed co-op course, the picker's list. A course is its own file in
// this folder and one line here (see "Adding a co-op course" in the project's
// CLAUDE.md). Each is checked as the list is built, so a broken course fails
// loudly before anyone plays it.
const COURSES: readonly DesignedCourse[] = [
  BLOCK_PARTY,
  TEA_FOR_TWO,
  LONG_AND_SHORT,
  ZIG_ZAG_ALLEY,
  CHAIN_REACTION,
];

export function buildCoopRegistry(courses: readonly DesignedCourse[]): readonly DesignedCourse[] {
  if (courses.length === 0) throw new Error("Frogmino: there are no co-op courses");
  const ids = new Set<string>();
  for (const course of courses) {
    if (ids.has(course.id)) throw new Error(`Frogmino: two co-op courses are called "${course.id}"`);
    ids.add(course.id);
    checkCoopCourse(course, TUNING);
  }
  // In the picker's order: by tier, easiest first, and in the order listed
  // within a tier.
  return COURSE_TIERS.flatMap((tier) => courses.filter((course) => course.tier === tier));
}

export const COOP_COURSES: readonly DesignedCourse[] = buildCoopRegistry(COURSES);

// A co-op course by id; fails loudly on one that doesn't exist, naming those
// that do.
export function coopCourseById(id: string): DesignedCourse {
  const course = COOP_COURSES.find((c) => c.id === id);
  if (course === undefined) {
    throw new Error(`Frogmino: no co-op course "${id}"; the courses are ${COOP_COURSES.map((c) => c.id).join(", ")}`);
  }
  return course;
}

// The course the picker starts on: the first easy one.
export const DEFAULT_COOP_COURSE: string = (COOP_COURSES.find((c) => c.tier === "easy") ?? COOP_COURSES[0]).id;

// The course `step` places along the picker's list from `id`, going round.
export function stepCoopCourse(id: string, step: number): string {
  const at = COOP_COURSES.indexOf(coopCourseById(id));
  const { length } = COOP_COURSES;
  return COOP_COURSES[(((at + step) % length) + length) % length].id;
}
