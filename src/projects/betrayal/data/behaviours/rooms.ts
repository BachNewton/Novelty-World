import { FLOOR_NAMES, placed } from "../../engine/board";
import { allFigures, figureOf, placeOf } from "../../engine/figures";
import {
  chooseOne,
  damage,
  defineStep,
  drawCard,
  endMovement,
  gain,
  placeToken,
  relocate,
  roll,
  stayInRoom,
  table,
} from "../../engine/effects";
import {
  eventData,
  local,
  type Behaviour,
  type BehaviourGroup,
  type Source,
} from "../../engine/sources";
import { crossBarrier } from "../../engine/movement";
import { onTurn } from "../../engine/questions";
import type { Engine } from "../../engine/step-loop";
import {
  drawRoomTile,
  enterNewRoom,
  placeRoom,
  spotOf,
} from "../../engine/tiles";
import type {
  FigureId,
  FloorId,
  GameEvent,
  GameState,
  RuleRef,
  Trait,
} from "../../types";
import { CATALOG } from "..";
import { immuneToRoom } from "./omens";

/** The explorer token that marks a figure in a room, in the colour of its character card. */
function explorerToken(state: GameState, figure: FigureId): string {
  return `explorer-${CATALOG.characters[figureOf(state, figure).definition].card}`;
}

/** The figure that ended its seat's turn in this room, if one did: the
 *  seat's explorer. */
function endedHere(event: GameEvent, room: string): FigureId | null {
  const ended = eventData<{ figure: FigureId | null; room: string | null }>(
    event,
  );
  return ended.room === room ? ended.figure : null;
}

/** Once per game for each explorer, ending a turn here gains 1 in a trait; their explorer token marks that they have (Widow's Walk FAQ). */
function oncePerGame(trait: Trait): Behaviour {
  return {
    reactions: [
      {
        event: "turn-ended",
        when: (state, event, source) => {
          const figure = endedHere(event, source.id);
          return (
            figure !== null &&
            !state.tokens.some(
              (t) =>
                t.room === source.id && t.token === explorerToken(state, figure),
            )
          );
        },
        steps: (state, event, source) => {
          const figure = endedHere(event, source.id);
          if (figure === null) return [];
          return [
            gain(figure, trait, 1, source.rule),
            placeToken(explorerToken(state, figure), source.id, source.rule),
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
          const figure = endedHere(event, source.id);
          return figure !== null && !immuneToRoom(state, figure, source.id);
        },
        steps: (_state, event, source) => {
          const figure = endedHere(event, source.id);
          return figure === null
            ? []
            : [damage(figure, kind, { points: 1 }, source.rule)];
        },
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
    beforeLeave: (state, figure, source, go) => {
      if (immuneToRoom(state, figure, source.id)) return [go];
      return [
        roll(
          figure,
          { kind: "trait", trait },
          source.rule,
          table([
            { min: target, max: null, steps: [go] },
            {
              min: 0,
              max: target - 1,
              steps: [
                chooseOne(
                  figure,
                  [
                    {
                      label: `Lose 1 ${traitName(loss)} and keep going`,
                      steps: [gain(figure, loss, -1, source.rule), go],
                    },
                    {
                      label: `Stay in the ${CATALOG.rooms[source.id].name}`,
                      steps: [stayInRoom(figure, source.rule)],
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

/** A barrier room, split in two with one side by each door (p. 7). Once a
 *  turn an explorer may try the room's roll to cross to the other side.
 *  Crossing is part of moving, so it can't be tried once their movement has
 *  ended, but it spends none, so it can be tried with no spaces left; failing
 *  ends their movement (rules.md's project ruling). */
function barrierRoom(trait: Trait, target: number): Behaviour {
  const id = (room: string) => `cross-${room}`;
  return {
    barrier: { trait, target },
    actions: {
      cross: {
        label: `Try to cross (${traitName(trait)} roll of ${target}+)`,
        available: (state, figure, source) =>
          state.turn !== null &&
          !state.turn.movementEnded.includes(figure) &&
          !state.turn.rolls.includes(id(source.id)),
        steps: (state, figure, source) => {
          const { side } = placeOf(state, figure);
          const other = CATALOG.rooms[source.id].doors.find((d) => d !== side);
          if (side === null || other === undefined)
            throw new Error(`No other side of the ${source.id} to cross to`);
          return [
            roll(
              figure,
              { kind: "trait", trait },
              source.rule,
              table([
                {
                  min: target,
                  max: null,
                  steps: [crossBarrier(figure, other, source.rule)],
                },
                {
                  min: 0,
                  max: target - 1,
                  steps: [endMovement(figure, source.rule)],
                },
              ]),
              { id: id(source.id) },
            ),
          ];
        },
      },
    },
  };
}

type Subject = { figure: FigureId };
type Entered = { figure: FigureId; room: string; discovered?: boolean };

/** The figure that entered this room, or ended its seat's turn in it. */
function arrivedOrEnded(event: GameEvent, room: string): FigureId | null {
  return event.type === "turn-ended"
    ? endedHere(event, room)
    : eventData<Entered>(event).room === room
      ? eventData<Entered>(event).figure
      : null;
}

const COLLAPSED = "collapsed-room";
const COLLAPSED_RULE: RuleRef = { source: "room", room: COLLAPSED };
const BELOW = "below-collapsed-room";
const ELEVATOR = "mystic-elevator";
const ELEVATOR_RULE: RuleRef = { source: "room", room: ELEVATOR };

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

    tower: barrierRoom("might", 3),
    chasm: barrierRoom("speed", 3),
    catacombs: barrierRoom("sanity", 6),

    // Its two item symbols are what is locked inside, so discovering it
    // draws only the event; opening it draws the items (rooms.md). Everyone
    // in it is outside the vault door (p. 8), and no one goes in to empty it,
    // so the engine tracks no sides here (rooms.md's project ruling).
    vault: {
      discoveryDraws: ["event"],
      actions: {
        open: {
          label: "Try to open the Vault (Knowledge roll of 6+)",
          available: (state) =>
            !state.tokens.some((t) => t.token === "vault-empty") &&
            !(state.turn?.rolls.includes("vault") ?? true),
          steps: (_state, figure, source) => [
            roll(
              figure,
              { kind: "trait", trait: "knowledge" },
              source.rule,
              table([
                {
                  min: 6,
                  max: null,
                  steps: [
                    drawCard(figure, "item", source.rule),
                    drawCard(figure, "item", source.rule),
                    placeToken("vault-empty", source.id, source.rule),
                  ],
                },
                { min: 0, max: 5, steps: [] },
              ]),
              { id: "vault" },
            ),
          ],
        },
      },
    },

    // Falling spends no movement, so it can be done with none left and
    // movement goes on afterwards (rooms.md's official ruling).
    gallery: {
      actions: {
        fall: {
          label: "Fall down to the Ballroom (1 die of physical damage)",
          available: (state) => placed(state.board, "ballroom") !== undefined,
          steps: (_state, figure, source) => [
            relocate(figure, "ballroom", source.rule, null, [
              damage(figure, "physical", { dice: 1 }, source.rule),
            ]),
          ],
        },
      },
    },

    crypt: endTurnDamage("mental"),
    "furnace-room": endTurnDamage("physical"),

    "collapsed-room": {
      reactions: [
        {
          // Only the explorer who discovers it must roll (p. 7).
          event: "entered",
          when: (_state, event, source) => {
            const d = eventData<Entered>(event);
            return d.room === source.id && d.discovered === true;
          },
          steps: (_state, event, source) => {
            const { figure } = eventData<Entered>(event);
            return [
              roll(
                figure,
                { kind: "trait", trait: "speed" },
                source.rule,
                table([
                  { min: 5, max: null, steps: [] },
                  {
                    min: 0,
                    max: 4,
                    steps: [local(COLLAPSED, "fall", { figure })],
                  },
                ]),
              ),
            ];
          },
        },
      ],
      actions: {
        // Anyone else in it may use it on purpose (p. 7).
        fall: {
          label: "Fall to the basement (1 die of physical damage)",
          available: () => true,
          steps: (_state, figure) => [local(COLLAPSED, "fall", { figure })],
        },
      },
      steps: {
        // Falling spends no movement, but deals the damage (p. 7). Only the
        // first to fall puts a basement tile in the house, next to any
        // basement room, and marks where they land; later falls land there.
        fall: defineStep<Subject>((state, p, ctx) => {
          const rule = COLLAPSED_RULE;
          const hurt = damage(p.figure, "physical", { dice: 1 }, rule);
          const below = state.tokens.find((t) => t.token === BELOW);
          if (below) {
            ctx.push(
              relocate(p.figure, below.room, rule, below.side ?? null, [hurt]),
            );
            return;
          }
          ctx.push(
            drawRoomTile(
              p.figure,
              { kind: "doorways", floors: ["basement"], except: null },
              rule,
              {
                then: enterNewRoom(p.figure, null, rule, {
                  draws: true,
                  after: [local(COLLAPSED, "mark", p), hurt],
                }),
                otherwise: [local(COLLAPSED, "land", p)],
              },
            ),
          );
        }),
        // In a barrier room the token stays on the side they landed on (p. 7).
        mark: defineStep<Subject>((state, p, ctx) => {
          const { room, side } = placeOf(state, p.figure);
          ctx.push(placeToken(BELOW, room, COLLAPSED_RULE, { side }));
        }),
        // Every basement tile is placed: the faller chooses a basement room.
        land: defineStep<Subject>((state, p, ctx) => {
          const rule = COLLAPSED_RULE;
          ctx.push(
            chooseOne(
              p.figure,
              state.board.tiles
                .filter((t) => t.floor === "basement")
                .map((t) => ({
                  label: `Fall to the ${ctx.catalog.rooms[t.tile].name}`,
                  steps: [
                    relocate(p.figure, t.tile, rule, null, [
                      local(COLLAPSED, "mark", p),
                      damage(p.figure, "physical", { dice: 1 }, rule),
                    ]),
                  ],
                })),
              rule,
            ),
          );
        }),
      },
    },

    "mystic-elevator": {
      // A hero rolls each turn they enter it, and at the end of each turn
      // spent in it without moving; it works once a turn (pp. 7-8).
      reactions: (["entered", "turn-ended"] as const).map((type) => ({
        event: type,
        when: (
          state: GameState,
          event: GameEvent,
          source: Source,
          engine: Engine,
        ) => {
          const figure = arrivedOrEnded(event, source.id);
          return (
            figure !== null &&
            state.turn !== null &&
            onTurn(engine, state, figure) &&
            !state.turn.rolls.includes(ELEVATOR)
          );
        },
        steps: (_state: GameState, event: GameEvent, source: Source) => {
          const figure = arrivedOrEnded(event, source.id);
          return figure === null ? [] : [local(ELEVATOR, "ride", { figure })];
        },
      })),
      steps: {
        ride: defineStep<Subject>((_state, p, ctx) => {
          const rule = ELEVATOR_RULE;
          const go = (floor: FloorId, shake = false) =>
            local(ELEVATOR, "move", { figure: p.figure, floor, shake });
          ctx.push(
            roll(
              p.figure,
              { kind: "dice", count: 2 },
              rule,
              table([
                {
                  min: 4,
                  max: 4,
                  steps: [
                    chooseOne(
                      p.figure,
                      ctx.catalog.rooms[ELEVATOR].floors.map((floor) => ({
                        label: `Send the elevator to the ${FLOOR_NAMES[floor]}`,
                        steps: [go(floor)],
                      })),
                      rule,
                    ),
                  ],
                },
                { min: 3, max: 3, steps: [go("upper")] },
                { min: 2, max: 2, steps: [go("ground")] },
                { min: 1, max: 1, steps: [go("basement")] },
                { min: 0, max: 0, steps: [go("basement", true)] },
              ]),
              { id: ELEVATOR },
            ),
          );
        }),
        // It goes next to an open door on the floor rolled, never sealing a
        // floor; with nowhere to go it stays. On its own floor it may stay.
        move: defineStep<{ figure: FigureId; floor: FloorId; shake: boolean }>(
          (state, p, ctx) => {
            const here = spotOf(state.board, ELEVATOR);
            ctx.push(
              placeRoom(
                p.figure,
                ELEVATOR,
                { kind: "doorways", floors: [p.floor], except: here },
                ELEVATOR_RULE,
                { stay: here.floor === p.floor },
              ),
              ...(p.shake ? [local(ELEVATOR, "shake", null)] : []),
            );
          },
        ),
        // On a 0, everyone in the elevator takes the damage (p. 8).
        shake: defineStep((state, _p, ctx) => {
          ctx.push(
            ...allFigures(state)
              .filter((e) => e.place?.room === ELEVATOR)
              .map((e) =>
                damage(e.id, "physical", { dice: 1 }, ELEVATOR_RULE),
              ),
          );
        }),
      },
    },

    "coal-chute": {
      reactions: [
        {
          // Entering and sliding are one space together, so the slide spends no movement (p. 7).
          event: "entered",
          when: (_state, event, source) =>
            eventData<{ room: string }>(event).room === source.id,
          steps: (_state, event, source) => [
            relocate(
              eventData<{ figure: FigureId }>(event).figure,
              "basement-landing",
              source.rule,
            ),
          ],
        },
      ],
    },
  },
};
