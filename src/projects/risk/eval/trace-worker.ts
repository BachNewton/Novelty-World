import { serveGames } from "@/shared/lib/bot-lab/serve";
import { surveyGame } from "./trace";

// The worker side of `risk:trace --survey`: each game played on the runner and traced, so the
// survey can read its shape as well as its result.
serveGames(surveyGame);
