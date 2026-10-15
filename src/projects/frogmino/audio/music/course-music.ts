import type { CourseSpec } from "../../courses";
import { FINAL_STRETCH } from "./final-stretch";
import { HURRY_UP_AND_WAIT } from "./hurry-up-and-wait";
import { MIRROR_MIRROR } from "./mirror-mirror";
import type { Theme } from "./song";
import { TALL_AND_SQUARE } from "./tall-and-square";
import { TEE_TIME } from "./tee-time";
import { TWO_SQUARES_WALTZ } from "./two-squares-waltz";

// Which theme plays on which course. Every registered co-op course has one,
// and a test fails, naming the course, for one without.

// Each co-op course's theme, by the course's id.
export const COOP_MUSIC: ReadonlyMap<string, Theme> = new Map<string, Theme>([
  ["block-party", TWO_SQUARES_WALTZ],
  ["tea-for-two", TEE_TIME],
  ["long-and-short", TALL_AND_SQUARE],
  ["zig-zag-alley", MIRROR_MIRROR],
  ["chain-reaction", HURRY_UP_AND_WAIT],
]);

// The themes for the courses the co-op course brief plans, under the brief's
// names for them until the courses exist. When a course lands, move its theme
// into `COOP_MUSIC` under the course's id.
export const PLANNED_COOP_MUSIC: ReadonlyMap<string, { course: string; theme: Theme }> = new Map([
  ["H1", { course: "H1, hard", theme: FINAL_STRETCH }],
]);

// The theme a course plays. Fails loudly on a co-op course with none.
export function courseMusic(spec: CourseSpec): Theme {
  const theme = COOP_MUSIC.get(spec.id);
  if (theme !== undefined) return theme;
  throw new Error(`Frogmino: the co-op course "${spec.id}" has no music; give it a theme in audio/music/course-music.ts`);
}

// What a theme plays on, for the `?music` page.
export function themeCourses(theme: Theme, courseName: (id: string) => string): string[] {
  const on: string[] = [];
  for (const [id, coop] of COOP_MUSIC) if (coop.id === theme.id) on.push(courseName(id));
  for (const planned of PLANNED_COOP_MUSIC.values()) if (planned.theme.id === theme.id) on.push(`${planned.course} (planned)`);
  return on;
}
