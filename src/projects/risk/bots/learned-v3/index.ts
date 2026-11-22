import type { Bot } from "../bot";
import { netBot } from "../net-v1/play";
import { WEIGHTS } from "../net-v1/weights/d4-500";

// learned-v3, the third seated learned bot (`ideas/learned-bot.md`): learned-v1's network (net-v1)
// with run d4's checkpoint `d4-500`, playing its most likely move. It reads the clock: the
// player-turns left before `TURN_CAP`, which stays at zero in a game that runs past it, as an online
// game, with no cap, may. Its seating bar: better than learned-v2 one-in and not worse one-out at 5
// players, on train and holdout seeds, not worse than rule-v7.1 at any table of 3 to 6 in either
// mixture, at tables of several of it against one rule-v7.1 it caps no more games than learned-v2
// does, and with the harness's cap raised to 2,400 its games past the clock's end go no
// differently in kind from the best clockless net's. It imports its one weight set directly,
// never the registry of them all, so a server that seats it loads only these weights. Seated, so
// frozen: another checkpoint is another version.

export const learnedV3Bot: Bot = netBot(WEIGHTS, "argmax");
