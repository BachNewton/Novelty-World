import { V6_PARAMS, type Params as V6Params } from "../rule-v6/params";
import type { BorderMode } from "./border";

// v6.1 plays v6's settings whole, with one more: how the border loss gathers the opponents'
// blows (`ideas/rule-bot-v6.1.md`). With `border` at "sum" it plays exactly v6's moves.

export interface Params extends V6Params {
  border: BorderMode;
}

/** v6.1: v6 with the border loss of the single worst opponent. Provisional: the screen in
 *  `ideas/rule-bot-v6.1.md` picks the mode (and with it, if need be, `borderWeight`). */
export const V6_1_PARAMS: Params = { ...V6_PARAMS, border: "max" };
