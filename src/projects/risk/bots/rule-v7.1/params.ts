import { V6_1_PARAMS, type Params as V6_1Params } from "../rule-v6.1/params";
import type { Search } from "../rule-v7/params";

// v7.1 is v7's search (`ideas/rule-bot-v7.md`) on v6.1 (`ideas/rule-bot-v6.1.md`): v6.1's
// settings whole, its search's knobs v7's, a fixed amount of work, never a clock.

export interface Params extends V6_1Params {
  search: Search;
}

export const V7_1_PARAMS: Params = {
  ...V6_1_PARAMS,
  search: { replies: 8, candidates: 4, mixed: 1 },
};
