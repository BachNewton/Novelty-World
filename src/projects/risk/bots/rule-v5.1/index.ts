import type { Bot } from "../bot";
import { ruleBot } from "../rule-v6.1";
import { V5_1_PARAMS } from "./params";

export { ruleBot };

export const ruleV5_1Bot: Bot = ruleBot(V5_1_PARAMS);
