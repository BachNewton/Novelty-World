import { serveGames } from "@/shared/lib/bot-lab/serve";
import { runSpec } from "./runner";

// The worker side of Risk's pool (see `parallel.ts`): the same pure runner and bot
// registry as the main thread, served through the shared `serveGames`.
serveGames(runSpec);
