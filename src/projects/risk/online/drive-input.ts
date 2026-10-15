import type { RiskEngine, Seat } from "../contract";
import type { BotInput } from "../bots/bot";
import type { OnlineGame } from "./game";

/** What a bot is given: its seat's view, options and redacted events, and nothing else of the
 *  game. The driver holds the state; this is the only path from it to a bot. */
export function botInput(engine: RiskEngine, game: OnlineGame, seat: Seat, seed: string): BotInput {
  const options = engine.options(game.engine, seat);
  if (!options) throw new Error(`Seat ${seat.toString()} has no decision to make`);
  return {
    seat,
    view: engine.view(game.engine, seat),
    options,
    events: engine.redact(
      game.lastEvents.map((logged) => logged.event),
      seat,
    ),
    seed,
  };
}
