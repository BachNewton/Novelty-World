// Every student-v1 weight set, by name: rewritten by `npm run risk:student-weights`; never edited by hand.

import type { StudentWeights } from "../network";
import { WEIGHTS as e625664 } from "./e6-256-64";
import { WEIGHTS as pilot } from "./pilot";

export const WEIGHT_SETS: Readonly<Record<string, StudentWeights>> = {
  "e6-256-64": e625664,
  "pilot": pilot,
};
