// Every net-v1 weight set, by name: rewritten by `python -m riskgpu.selfplay.export`; never edited by hand.

import type { NetWeights } from "../network";
import { WEIGHTS as wimit_1 } from "./imit-1";
import { WEIGHTS as wm1a_25 } from "./m1a-25";
import { WEIGHTS as wm1a_50 } from "./m1a-50";
import { WEIGHTS as wm2a_50 } from "./m2a-50";
import { WEIGHTS as ws2_1_50 } from "./s2-1-50";
import { WEIGHTS as ws2_2_150 } from "./s2-2-150";
import { WEIGHTS as wsw128b_125 } from "./sw128b-125";
import { WEIGHTS as wsw128b_450 } from "./sw128b-450";

export const WEIGHT_SETS: Readonly<Record<string, NetWeights>> = {
  "imit-1": wimit_1,
  "m1a-25": wm1a_25,
  "m1a-50": wm1a_50,
  "m2a-50": wm2a_50,
  "s2-1-50": ws2_1_50,
  "s2-2-150": ws2_2_150,
  "sw128b-125": wsw128b_125,
  "sw128b-450": wsw128b_450,
};
