import { COMBAT_STEPS } from "./combat";
import { EFFECT_STEPS } from "./effects";
import { EXPLORATION_STEPS } from "./exploration";
import { HAUNT_STEPS } from "./haunt";
import { MONSTER_STEPS } from "./monsters";
import { MOVEMENT_STEPS } from "./movement";
import { SCENARIO_STEPS } from "./scenario";
import { TILE_STEPS } from "./tiles";

/** Every step kind the engine itself registers, by name. Sources add their
 *  own beside these, each under its source's id (`ownSteps`). */
export const ENGINE_STEPS = {
  ...EFFECT_STEPS,
  ...COMBAT_STEPS,
  ...EXPLORATION_STEPS,
  ...TILE_STEPS,
  ...MOVEMENT_STEPS,
  ...MONSTER_STEPS,
  ...SCENARIO_STEPS,
  ...HAUNT_STEPS,
};
