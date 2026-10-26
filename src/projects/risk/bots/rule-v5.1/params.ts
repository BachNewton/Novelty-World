import { NO_FIXES } from "../rule-v6/params";
import { V6_1_PARAMS, type Params } from "../rule-v6.1/params";

// v5.1 is v5 with v6.1's stall fix (`ideas/rule-bot-v6.1.md`, "After v6.1"): v6 with every one of
// its fixes off plays v5's moves exactly, so v6.1 with them off is v5 scored by v6.1's settings,
// the pick v6.1 took to its bar, unchanged. At 3 and 4 players it is v5.

export type { Params };

export const V5_1_PARAMS: Params = { ...V6_1_PARAMS, fixes: NO_FIXES };
