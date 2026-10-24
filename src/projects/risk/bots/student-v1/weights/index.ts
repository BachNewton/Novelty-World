// Every student-v1 weight set, by name: rewritten by `npm run risk:student-weights`; never edited by hand.

import type { StudentWeights } from "../network";
import { WEIGHTS as pilot } from "./pilot";

export const WEIGHT_SETS: Readonly<Record<string, StudentWeights>> = {
  "pilot": pilot,
};
