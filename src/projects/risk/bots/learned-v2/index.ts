import type { Bot } from "../bot";
import { netBot } from "../net-v1/play";
import { WEIGHTS } from "../net-v1/weights/b1-100";

// learned-v2, the second seated learned bot (`ideas/learned-bot.md`): learned-v1's network (net-v1)
// with run b1's checkpoint `b1-100`, playing its most likely move. It cleared its seating bar:
// better than learned-v1 at 5 players in both mixtures, on train and holdout seeds, and better than
// rule-v7.1 at every table of 3 to 6 in both mixtures. It imports its one weight set directly, never
// the registry of them all, so a server that seats it loads only these weights. Seated, so frozen:
// another checkpoint is another version.

export const learnedV2Bot: Bot = netBot(WEIGHTS, "argmax");
