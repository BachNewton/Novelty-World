import type { CourseSpec } from "../../courses";
import { FINAL_STRETCH } from "./final-stretch";
import { HOP_ALONG_ROUTE } from "./hop-along-route";
import { HURRY_UP_AND_WAIT } from "./hurry-up-and-wait";
import { MIRROR_MIRROR } from "./mirror-mirror";
import type { Theme } from "./song";
import { TALL_AND_SQUARE } from "./tall-and-square";
import { TEE_TIME } from "./tee-time";
import { TWO_SQUARES_WALTZ } from "./two-squares-waltz";

// Which theme plays on which course. Every registered co-op course has one,
// and a test fails, naming the course, for one without.

export const SOLO_MUSIC: Theme = HOP_ALONG_ROUTE;

// Each co-op course's theme, by the course's id.
export const COOP_MUSIC: ReadonlyMap<string, Theme> = new Map<string, Theme>([]);

// The themes for the courses the co-op course brief plans, under the brief's
// names for them until the courses exist. When a course lands, move its theme
// into `COOP_MUSIC` under the course's id.
export const PLANNED_COOP_MUSIC: ReadonlyMap<string, { course: string; theme: Theme }> = new Map([
  ["E1", { course: "E1, easy: O and O, the gentle start", theme: TWO_SQUARES_WALTZ }],
  ["E2", { course: "E2, easy: T and T, the interlock", theme: TEE_TIME }],
  ["E3", { course: "E3, easy: I and O, the odd couple", theme: TALL_AND_SQUARE }],
  ["M1", { course: "M1, medium: S and Z, the mirror pair", theme: MIRROR_MIRROR }],
  ["M2", { course: "M2, medium: T and L, chains and pace", theme: HURRY_UP_AND_WAIT }],
  ["H1", { course: "H1, hard", theme: FINAL_STRETCH }],
]);

// Registered courses that play in silence: the teaching ramp, which is being
// removed as the brief's courses land. Delete it from here then.
export const SILENT_COURSES: readonly string[] = ["teaching-ramp"];

// The theme a course plays, or null for a silent one. Fails loudly on a
// co-op course with neither.
export function courseMusic(spec: CourseSpec): Theme | null {
  if (spec.kind === "solo") return SOLO_MUSIC;
  const theme = COOP_MUSIC.get(spec.id);
  if (theme !== undefined) return theme;
  if (SILENT_COURSES.includes(spec.id)) return null;
  throw new Error(`Frogmino: the co-op course "${spec.id}" has no music; give it a theme in audio/music/course-music.ts`);
}

// What a theme plays on, for the `?music` page.
export function themeCourses(theme: Theme, courseName: (id: string) => string): string[] {
  const on: string[] = [];
  if (SOLO_MUSIC.id === theme.id) on.push("Solo");
  for (const [id, coop] of COOP_MUSIC) if (coop.id === theme.id) on.push(courseName(id));
  for (const planned of PLANNED_COOP_MUSIC.values()) if (planned.theme.id === theme.id) on.push(`${planned.course} (planned)`);
  return on;
}
