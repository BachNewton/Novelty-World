import { CATALOG } from "./data";
import { BEHAVIOURS } from "./data/behaviours";
import { HAUNTS } from "./data/haunts";
import { COMBAT_DECISIONS, COMBAT_STEPS } from "./engine/combat";
import { EXPLORATION_DECISIONS, EXPLORATION_STEPS } from "./engine/exploration";
import { EFFECT_DECISIONS, EFFECT_STEPS } from "./engine/effects";
import { HAUNT_STEPS } from "./engine/haunt";
import { MONSTER_STEPS } from "./engine/monsters";
import { MOVEMENT_STEPS } from "./engine/movement";
import { SCENARIO_STEPS } from "./engine/scenario";
import { localStep, type Behaviours } from "./engine/sources";
import { TILE_DECISIONS, TILE_STEPS } from "./engine/tiles";
import type { Engine, Rules, StepHandler } from "./engine/step-loop";
import { viewFor as engineView, type GameView } from "./engine/view";
import type { GameState } from "./types";
import { withHaunts } from "./kit/haunt";

/** Every source's own steps, registered under the source's id. */
function localSteps(behaviours: Behaviours): Record<string, StepHandler> {
  const result: Record<string, StepHandler> = {};
  for (const group of [
    behaviours.rulebook,
    behaviours.cards,
    behaviours.rooms,
    behaviours.tokens,
    behaviours.statuses,
  ]) {
    for (const [id, behaviour] of Object.entries(group)) {
      for (const [name, handler] of Object.entries(behaviour?.steps ?? {})) {
        result[localStep(id, name)] = handler;
      }
    }
  }
  return result;
}

export function buildRules(behaviours: Behaviours): Rules {
  const steps = {
    ...EFFECT_STEPS,
    ...COMBAT_STEPS,
    ...EXPLORATION_STEPS,
    ...TILE_STEPS,
    ...MOVEMENT_STEPS,
    ...MONSTER_STEPS,
    ...SCENARIO_STEPS,
    ...HAUNT_STEPS,
  };
  for (const [name, handler] of Object.entries(localSteps(behaviours))) {
    if (name in steps) throw new Error(`Step ${name} is registered twice`);
    steps[name] = handler;
  }
  return {
    steps,
    decisions: {
      ...EFFECT_DECISIONS,
      ...COMBAT_DECISIONS,
      ...EXPLORATION_DECISIONS,
      ...TILE_DECISIONS,
    },
  };
}

export const ENGINE: Engine = withHaunts(
  {
    catalog: CATALOG,
    rules: buildRules(BEHAVIOURS),
    behaviours: BEHAVIOURS,
    haunts: {},
  },
  HAUNTS,
);

/** What a seat, or a spectator (null), may see of a game: all that the UI,
 *  bots and AI players are given. */
export function viewFor(state: GameState, seat: number | null): GameView {
  return engineView(ENGINE, state, seat);
}
