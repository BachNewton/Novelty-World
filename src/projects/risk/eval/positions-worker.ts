import { serveGames } from "@/shared/lib/bot-lab/serve";
import { recordGame } from "./positions";

// The worker side of the position recorder's pool: the recorder's games, served through the
// shared `serveGames` as the measuring runs' are.
serveGames(recordGame);
