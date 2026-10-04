import { explorerAt } from "../../engine/explorers";
import { gain, placeToken } from "../../engine/effects";
import { eventData, type Behaviour } from "../../engine/sources";
import type { GameState } from "../../types";
import { CATALOG } from "..";

/** The explorer token that marks a seat in a room, in the colour of its character card. */
function explorerToken(state: GameState, seat: number): string {
  return `explorer-${CATALOG.characters[explorerAt(state, seat).character].card}`;
}

/** Room tiles with text, from content/rooms.md. */
export const ROOM_BEHAVIOURS: Record<string, Behaviour> = {
  larder: {
    reactions: [
      {
        // Once per game for each explorer; their explorer token marks that they have (Widow's Walk FAQ).
        event: "turn-ended",
        when: (state, event) => {
          const { seat, room } = eventData<{ seat: number; room: string }>(
            event,
          );
          return (
            room === "larder" &&
            !state.tokens.some(
              (t) =>
                t.room === "larder" && t.token === explorerToken(state, seat),
            )
          );
        },
        steps: (state, event, source) => {
          const { seat } = eventData<{ seat: number }>(event);
          return [
            gain(seat, "might", 1, source.rule),
            placeToken(explorerToken(state, seat), "larder", source.rule),
          ];
        },
      },
    ],
  },
};
