// Every net-v1 weight set, by name: rewritten by `python -m riskgpu.selfplay.export`; never edited by hand.

import type { NetWeights } from "../network";
import { WEIGHTS as wm1a_25 } from "./m1a-25";
import { WEIGHTS as wm1a_50 } from "./m1a-50";
import { WEIGHTS as wm2a_50 } from "./m2a-50";
import { WEIGHTS as wsw128b_125 } from "./sw128b-125";
import { WEIGHTS as wsw128b_450 } from "./sw128b-450";

export const WEIGHT_SETS: Readonly<Record<string, NetWeights>> = {
  "m1a-25": wm1a_25,
  "m1a-50": wm1a_50,
  "m2a-50": wm2a_50,
  "sw128b-125": wsw128b_125,
  "sw128b-450": wsw128b_450,
};
