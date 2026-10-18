import { V4_PARAMS, type Params } from "../rule-v4/params";

// v5 plays v4's settings exactly (`ideas/rule-bot-v5.md`): its preferences, its opponent model
// and its work knob. What it adds is plans, which take no setting, so any retune of v4's
// preferences is v5's too.

export type { Params };

export const V5_PARAMS: Params = V4_PARAMS;
