import { BLOCK_PARTY } from "./block-party";
import { CHAIN_REACTION } from "./chain-reaction";
import { HIGH_RISE } from "./high-rise";
import { LEG_UP } from "./leg-up";
import { LONG_AND_SHORT } from "./long-and-short";
import type { Theme } from "./song";
import { TEA_FOR_TWO } from "./tea-for-two";
import { ZIG_ZAG_ALLEY } from "./zig-zag-alley";

// The courses' themes, one per co-op course, in the picker's order: the
// themes the game plays (see `course-music.ts`) and the `?music` page lists.
export const THEMES: readonly Theme[] = [LONG_AND_SHORT, BLOCK_PARTY, TEA_FOR_TWO, LEG_UP, HIGH_RISE, ZIG_ZAG_ALLEY, CHAIN_REACTION];
