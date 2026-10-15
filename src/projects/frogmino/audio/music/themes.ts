import { CROAKERS_CROSSING } from "./croakers-crossing";
import { FINAL_STRETCH } from "./final-stretch";
import { FROG_POLKKA_A_CAPPELLA, FROG_POLKKA_ELECTRO } from "./frog-polkka";
import { GRIDLOCK } from "./gridlock";
import { HOP_ALONG_ROUTE } from "./hop-along-route";
import { HURRY_UP_AND_WAIT } from "./hurry-up-and-wait";
import { GANTRY_FANFARE } from "./jingles";
import { LILY_PAD_LOBBY } from "./lily-pad-lobby";
import { MIRROR_MIRROR } from "./mirror-mirror";
import { RUSH_HOUR } from "./rush-hour";
import { SAMMAKKOPOLKKA } from "./sammakkopolkka";
import type { Theme } from "./song";
import { TALL_AND_SQUARE } from "./tall-and-square";
import { TEE_TIME } from "./tee-time";
import { TWO_FROGS } from "./two-frogs";
import { TWO_SQUARES_WALTZ } from "./two-squares-waltz";

// The courses' themes, the ones the game plays (see `course-music.ts`), from
// the easiest course to the hardest.
export const COURSE_THEMES: readonly Theme[] = [
  TWO_SQUARES_WALTZ,
  TEE_TIME,
  TALL_AND_SQUARE,
  MIRROR_MIRROR,
  HURRY_UP_AND_WAIT,
  FINAL_STRETCH,
];

// Course themes no course plays yet, ready for a course to come.
export const SPARE_THEMES: readonly Theme[] = [HOP_ALONG_ROUTE];

// The earlier ideas, kept as sketches on the `?music` page; none plays in the game.
export const SKETCHES: readonly Theme[] = [LILY_PAD_LOBBY, CROAKERS_CROSSING, RUSH_HOUR, FROG_POLKKA_A_CAPPELLA, FROG_POLKKA_ELECTRO, SAMMAKKOPOLKKA, GRIDLOCK, TWO_FROGS, GANTRY_FANFARE];

// Every theme the `?music` page offers.
export const THEMES: readonly Theme[] = [...COURSE_THEMES, ...SPARE_THEMES, ...SKETCHES];
