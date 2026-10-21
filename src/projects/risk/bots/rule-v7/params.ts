import { V6_PARAMS, type Params as V6Params } from "../rule-v6/params";

// v7 plays v6's settings whole and adds a search over the turn's plan (`ideas/rule-bot-v7.md`).
// Its knobs are a fixed amount of work, never a clock, so the same position always gives the
// same move.

export interface Search {
  /** Replies per candidate plan: imagined rounds of the opponents' turns after it. 0 plays v6. */
  replies: number;
  /** v6's best plans kept for the replies, v6's own choice first. */
  candidates: number;
  /** Whether the opponents in a reply are drawn from a mix of bots (1) or are all v6 (0). */
  mixed: number;
}

export type SearchKnob = keyof Search;

export interface Params extends V6Params {
  search: Search;
}

export const V7_PARAMS: Params = {
  ...V6_PARAMS,
  search: { replies: 8, candidates: 4, mixed: 1 },
};
