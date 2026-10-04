import { FROG_POLKKA_A_CAPPELLA, FROG_POLKKA_ELECTRO } from "./frog-polkka";
import { GRIDLOCK } from "./gridlock";
import { GANTRY_FANFARE, GATE_SHIMMER } from "./jingles";
import { LILY_PAD_LOBBY } from "./lily-pad-lobby";
import { RUSH_HOUR } from "./rush-hour";
import { SAMMAKKOPOLKKA } from "./sammakkopolkka";
import type { Theme } from "./song";
import { TWO_FROGS } from "./two-frogs";

// Every theme the `?music` page offers, in the order a run meets them.
export const THEMES: readonly Theme[] = [LILY_PAD_LOBBY, RUSH_HOUR, FROG_POLKKA_A_CAPPELLA, FROG_POLKKA_ELECTRO, SAMMAKKOPOLKKA, GRIDLOCK, TWO_FROGS, GATE_SHIMMER, GANTRY_FANFARE];
