import { explorerAt } from "../../engine/explorers";
import { damage, gain, placeToken, relocate } from "../../engine/effects";
import {
  eventData,
  type Behaviour,
  type BehaviourGroup,
} from "../../engine/sources";
import type { GameState, Trait } from "../../types";
import { CATALOG } from "..";
import { immuneToRoom } from "./omens";

/** The explorer token that marks a seat in a room, in the colour of its character card. */
function explorerToken(state: GameState, seat: number): string {
  return `explorer-${CATALOG.characters[explorerAt(state, seat).character].card}`;
}

type TurnEnded = { seat: number; room: string };

/** Once per game for each explorer, ending a turn here gains 1 in a trait; their explorer token marks that they have (Widow's Walk FAQ). */
function oncePerGame(trait: Trait): Behaviour {
  return {
    reactions: [
      {
        event: "turn-ended",
        when: (state, event, source) => {
          const { seat, room } = eventData<TurnEnded>(event);
          return (
            room === source.id &&
            !state.tokens.some(
              (t) =>
                t.room === source.id && t.token === explorerToken(state, seat),
            )
          );
        },
        steps: (state, event, source) => {
          const { seat } = eventData<TurnEnded>(event);
          return [
            gain(seat, trait, 1, source.rule),
            placeToken(explorerToken(state, seat), source.id, source.rule),
          ];
        },
      },
    ],
  };
}

/** Ending a turn here deals 1 point of damage. */
function endTurnDamage(kind: "physical" | "mental"): Behaviour {
  return {
    reactions: [
      {
        event: "turn-ended",
        when: (state, event, source) => {
          const { seat, room } = eventData<TurnEnded>(event);
          return room === source.id && !immuneToRoom(state, seat, source.id);
        },
        steps: (_state, event, source) => [
          damage(
            eventData<TurnEnded>(event).seat,
            kind,
            { points: 1 },
            source.rule,
          ),
        ],
      },
    ],
  };
}

/** Room tiles with text, from content/rooms.md. */
export const ROOMS: BehaviourGroup = {
  rooms: {
    larder: oncePerGame("might"),
    gymnasium: oncePerGame("speed"),
    chapel: oncePerGame("sanity"),
    library: oncePerGame("knowledge"),

    crypt: endTurnDamage("mental"),
    "furnace-room": endTurnDamage("physical"),

    "coal-chute": {
      reactions: [
        {
          // Entering and sliding are one space together, so the slide spends no movement (p. 7).
          event: "entered",
          when: (_state, event, source) =>
            eventData<{ room: string }>(event).room === source.id,
          steps: (_state, event, source) => [
            relocate(
              eventData<{ seat: number }>(event).seat,
              "basement-landing",
              source.rule,
            ),
          ],
        },
      ],
    },
  },
};
