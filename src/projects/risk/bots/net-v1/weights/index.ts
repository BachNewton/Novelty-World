// Every net-v1 weight set, by name: rewritten by `python -m riskgpu.selfplay.export`; never edited by hand.

import type { NetWeights } from "../network";
import { WEIGHTS as wm1a_25 } from "./m1a-25";

export const WEIGHT_SETS: Readonly<Record<string, NetWeights>> = {
  "m1a-25": wm1a_25,
};
