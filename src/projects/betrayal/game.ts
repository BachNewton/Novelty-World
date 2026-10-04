import { CATALOG } from "./data";
import type { Engine, Rules } from "./engine/step-loop";

/** Every step and decision kind the game registers. Exploration adds the first ones. */
const RULES: Rules = { steps: {}, decisions: {} };

export const ENGINE: Engine = { catalog: CATALOG, rules: RULES };
