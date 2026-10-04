import { explorerAt } from "../../engine/explorers";
import {
  chooseOne,
  damage,
  gain,
  placeToken,
  relocate,
  roll,
  stayInRoom,
  table,
} from "../../engine/effects";
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

const traitName = (trait: Trait) =>
  `${trait[0].toUpperCase()}${trait.slice(1)}`;

/** Leaving this room takes a trait roll; failing it costs 1 in another trait,
 *  or the explorer may stay instead and try again on a later turn (rooms.md's
 *  official ruling). It applies however the explorer leaves. */
function rollToLeave(trait: Trait, target: number, loss: Trait): Behaviour {
  return {
    beforeLeave: (state, seat, source, go) => {
      if (immuneToRoom(state, seat, source.id)) return [go];
      return [
        roll(
          seat,
          { kind: "trait", trait },
          source.rule,
          table([
            { min: target, max: null, steps: [go] },
            {
              min: 0,
              max: target - 1,
              steps: [
                chooseOne(
                  seat,
                  [
                    {
                      label: `Lose 1 ${traitName(loss)} and keep going`,
                      steps: [gain(seat, loss, -1, source.rule), go],
                    },
                    {
                      label: `Stay in the ${CATALOG.rooms[source.id].name}`,
                      steps: [stayInRoom(seat, source.rule)],
                    },
                  ],
                  source.rule,
                ),
              ],
            },
          ]),
        ),
      ];
    },
  };
}

/** Room tiles with text, from content/rooms.md. */
export const ROOMS: BehaviourGroup = {
  rooms: {
    larder: oncePerGame("might"),
    gymnasium: oncePerGame("speed"),
    chapel: oncePerGame("sanity"),
    library: oncePerGame("knowledge"),

    "junk-room": rollToLeave("might", 3, "speed"),
    attic: rollToLeave("speed", 3, "might"),
    graveyard: rollToLeave("sanity", 4, "knowledge"),
    "pentagram-chamber": rollToLeave("knowledge", 4, "sanity"),

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
