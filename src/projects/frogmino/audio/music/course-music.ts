import type { CourseSpec } from "../../courses";
import { BLOCK_PARTY } from "./block-party";
import { CHAIN_REACTION } from "./chain-reaction";
import { HIGH_RISE } from "./high-rise";
import { LEG_UP } from "./leg-up";
import { LONG_AND_SHORT } from "./long-and-short";
import type { Theme } from "./song";
import { TEA_FOR_TWO } from "./tea-for-two";
import { ZIG_ZAG_ALLEY } from "./zig-zag-alley";

// Which theme plays on which course. Every registered co-op course has one
// of its own, and a test fails, naming the course, for one without.

// Each co-op course's theme, by the course's id.
export const COOP_MUSIC: ReadonlyMap<string, Theme> = new Map<string, Theme>([
  ["long-and-short", LONG_AND_SHORT],
  ["block-party", BLOCK_PARTY],
  ["tea-for-two", TEA_FOR_TWO],
  ["leg-up", LEG_UP],
  ["high-rise", HIGH_RISE],
  ["zig-zag-alley", ZIG_ZAG_ALLEY],
  ["chain-reaction", CHAIN_REACTION],
]);

// The theme a course plays. Fails loudly on a co-op course with none.
export function courseMusic(spec: CourseSpec): Theme {
  const theme = COOP_MUSIC.get(spec.id);
  if (theme !== undefined) return theme;
  throw new Error(`Frogmino: the co-op course "${spec.id}" has no music; give it a theme in audio/music/course-music.ts`);
}

// The course a theme plays on, by id, for the `?music` page.
export function themeCourse(theme: Theme): string {
  for (const [id, coop] of COOP_MUSIC) if (coop.id === theme.id) return id;
  throw new Error(`Frogmino: the theme "${theme.id}" plays on no course; give it one in audio/music/course-music.ts`);
}
