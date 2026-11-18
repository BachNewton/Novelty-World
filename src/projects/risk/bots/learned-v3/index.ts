import type { Bot } from "../bot";
import { netBot } from "../net-v1/play";
import { WEIGHTS } from "../net-v1/weights/c3-75";

// learned-v3, the third seated learned bot (`ideas/learned-bot.md`): learned-v1's network (net-v1)
// with run c3's checkpoint `c3-75`, playing its most likely move. Its seating bar: better than
// learned-v2 one-in and not worse one-out at 5 players, on train and holdout seeds, and not worse
// than rule-v7.1 at any table of 3 to 6 in either mixture. It imports its one weight set directly,
// never the registry of them all, so a server that seats it loads only these weights. Seated, so
// frozen: another checkpoint is another version.

export const learnedV3Bot: Bot = netBot(WEIGHTS, "argmax");
