import { NO_FIXES } from "../rule-v6/params";
import { V6_1_PARAMS, type Params } from "../rule-v6.1/params";

// v4.1's settings are v5.1's (`rule-v5.1/params.ts`): v6.1's pick with every one of v6's fixes
// off. What makes it v4 is its planner, which has no sweeps. At 3 and 4 players it is v4.

export const V4_1_PARAMS: Params = { ...V6_1_PARAMS, fixes: NO_FIXES };
