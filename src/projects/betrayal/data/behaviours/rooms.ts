import { FLOOR_NAMES, placed } from "../../engine/board";
import { explorerAt, placeOf } from "../../engine/explorers";
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
import {
  drawRoomTile,
  enterNewRoom,
  placeRoom,
  spotOf,
} from "../../engine/tiles";
import type {
  FloorId,
  GameEvent,
  GameState,
  RuleRef,
  Trait,
} from "../../types";
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
        available: (state, _seat, source) =>
          state.turn !== null &&
          !state.turn.movementEnded &&
          !state.turn.rolls.includes(id(source.id)),
        steps: (state, seat, source) => {
          const side = explorerAt(state, seat).side;
          const other = CATALOG.rooms[source.id].doors.find((d) => d !== side);
          if (side === undefined || other === undefined)
            throw new Error(`No other side of the ${source.id} to cross to`);
          return [
            roll(
              seat,
              { kind: "trait", trait },
              source.rule,
              table([
                {
                  min: target,
                  max: null,
                  steps: [crossBarrier(seat, other, source.rule)],
                },
                {
                  min: 0,
                  max: target - 1,
                  steps: [endMovement(seat, source.rule)],
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

type Seat = { seat: number };
type Entered = { seat: number; room: string; discovered?: boolean };

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
          steps: (_state, seat, source) => [
            roll(
              seat,
              { kind: "trait", trait: "knowledge" },
              source.rule,
              table([
                {
                  min: 6,
                  max: null,
                  steps: [
                    drawCard(seat, "item", source.rule),
                    drawCard(seat, "item", source.rule),
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
          steps: (_state, seat, source) => [
            relocate(seat, "ballroom", source.rule),
            damage(seat, "physical", { dice: 1 }, source.rule),
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
            const { seat } = eventData<Entered>(event);
            return [
              roll(
                seat,
                { kind: "trait", trait: "speed" },
                source.rule,
                table([
                  { min: 5, max: null, steps: [] },
                  {
                    min: 0,
                    max: 4,
                    steps: [local(COLLAPSED, "fall", { seat })],
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
          steps: (_state, seat) => [local(COLLAPSED, "fall", { seat })],
        },
      },
      steps: {
        // Falling spends no movement, but deals the damage (p. 7). Only the
        // first to fall puts a basement tile in the house, next to any
        // basement room, and marks where they land; later falls land there.
        fall: defineStep<Seat>((state, p, ctx) => {
          const rule = COLLAPSED_RULE;
          const hurt = damage(p.seat, "physical", { dice: 1 }, rule);
          const below = state.tokens.find((t) => t.token === BELOW);
          if (below) {
            ctx.push(
              relocate(p.seat, below.room, rule, below.side ?? null),
              hurt,
            );
            return;
          }
          ctx.push(
            drawRoomTile(
              p.seat,
              { kind: "doorways", floors: ["basement"], except: null },
              rule,
              {
                then: enterNewRoom(p.seat, null, rule, {
                  draws: true,
                  after: [local(COLLAPSED, "mark", p), hurt],
                }),
                otherwise: [local(COLLAPSED, "land", p)],
              },
            ),
          );
        }),
        // In a barrier room the token stays on the side they landed on (p. 7).
        mark: defineStep<Seat>((state, p, ctx) => {
          const { room, side } = placeOf(state, p.seat);
          ctx.push(placeToken(BELOW, room, COLLAPSED_RULE, { side }));
        }),
        // Every basement tile is placed: the faller chooses a basement room.
        land: defineStep<Seat>((state, p, ctx) => {
          const rule = COLLAPSED_RULE;
          ctx.push(
            chooseOne(
              p.seat,
              state.board.tiles
                .filter((t) => t.floor === "basement")
                .map((t) => ({
                  label: `Fall to the ${ctx.catalog.rooms[t.tile].name}`,
                  steps: [
                    relocate(p.seat, t.tile, rule),
                    local(COLLAPSED, "mark", p),
                    damage(p.seat, "physical", { dice: 1 }, rule),
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
        when: (state: GameState, event: GameEvent, source: Source) => {
          const { seat, room } = eventData<Entered>(event);
          return (
            room === source.id &&
            state.turn?.seat === seat &&
            !state.turn.rolls.includes(ELEVATOR)
          );
        },
        steps: (_state: GameState, event: GameEvent) => [
          local(ELEVATOR, "ride", { seat: eventData<Entered>(event).seat }),
        ],
      })),
      steps: {
        ride: defineStep<Seat>((_state, p, ctx) => {
          const rule = ELEVATOR_RULE;
          const go = (floor: FloorId, shake = false) =>
            local(ELEVATOR, "move", { seat: p.seat, floor, shake });
          ctx.push(
            roll(
              p.seat,
              { kind: "dice", count: 2 },
              rule,
              table([
                {
                  min: 4,
                  max: 4,
                  steps: [
                    chooseOne(
                      p.seat,
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
        move: defineStep<{ seat: number; floor: FloorId; shake: boolean }>(
          (state, p, ctx) => {
            const here = spotOf(state.board, ELEVATOR);
            ctx.push(
              placeRoom(
                p.seat,
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
            ...state.explorers
              .filter((e) => e.room === ELEVATOR)
              .map((e) =>
                damage(e.seat, "physical", { dice: 1 }, ELEVATOR_RULE),
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
