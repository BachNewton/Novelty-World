import { CATALOG } from "./data";
import { BEHAVIOURS } from "./data/behaviours";
import { HAUNTS } from "./data/haunts";
import { COMBAT_DECISIONS } from "./engine/combat";
import { EXPLORATION_DECISIONS } from "./engine/exploration";
import { EFFECT_DECISIONS } from "./engine/effects";
import { HAUNT_DECISIONS } from "./engine/haunt";
import { localStep, type Behaviours } from "./engine/sources";
import { ENGINE_STEPS } from "./engine/steps";
import { TILE_DECISIONS } from "./engine/tiles";
import type { Engine, Rules, StepKind } from "./engine/step-loop";
import { viewFor as engineView, type GameView } from "./engine/view";
import type { GameState } from "./types";
import { withHaunts } from "./kit/haunt";

/** Every source's own steps, registered under the source's id. */
function localSteps(behaviours: Behaviours): Record<string, StepKind> {
  const result: Record<string, StepKind> = {};
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
  const steps: Record<string, StepKind> = { ...ENGINE_STEPS };
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
      ...HAUNT_DECISIONS,
    },
  };
}

/** The engine with the whole catalogue and no haunt built, for tests that
 *  build haunts of their own. */
export const BASE_ENGINE: Engine = {
  catalog: CATALOG,
  rules: buildRules(BEHAVIOURS),
  behaviours: BEHAVIOURS,
  haunts: {},
};

export const ENGINE: Engine = withHaunts(BASE_ENGINE, HAUNTS);

/** What a seat, or a spectator (null), may see of a game: all that the UI,
 *  bots and AI players are given. */
export function viewFor(state: GameState, seat: number | null): GameView {
  return engineView(ENGINE, state, seat);
}
