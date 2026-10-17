import { serveGames } from "@/shared/lib/bot-lab/serve";
import { observeGame } from "./opponent-model";

// The worker side of the opponent-model tool's pool: the same pure game and models as the
// main thread, served through the shared `serveGames`.
serveGames(observeGame);
