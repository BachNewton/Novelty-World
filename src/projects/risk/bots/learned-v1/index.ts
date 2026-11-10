import type { Bot } from "../bot";
import { netBot } from "../net-v1/play";
import { WEIGHTS } from "../net-v1/weights/s2-2-150";

// learned-v1, the first seated learned bot (`ideas/learned-bot.md`): net-v1's network with stage 2's
// best checkpoint, `s2-2-150` (PPO from the imitation of native-v2, seed 2, iteration 150), playing
// its most likely move. It passed M4: better than rule-v7.1 at every table, one-in and one-out, on
// train and holdout seeds. It imports its one weight set directly, never the registry of them all,
// so a server that seats it loads only these weights. Seated, so frozen: another checkpoint is
// another version.

export const learnedV1Bot: Bot = netBot(WEIGHTS, "argmax");
