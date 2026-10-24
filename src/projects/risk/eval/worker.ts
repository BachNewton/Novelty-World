import { serveGames } from "@/shared/lib/bot-lab/serve";
import { runSpecAsync } from "./runner";

// The worker side of Risk's pool (see `parallel.ts`): the same pure runner and bot
// registry as the main thread, served through the shared `serveGames`. A native seat is
// answered by the worker's own native process (`native/bot.ts`).
serveGames(runSpecAsync);
