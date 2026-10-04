import { FLOOR_NAMES, placed } from "../../engine/board";
import { allFigures, figureDefinition, placeOf } from "../../engine/figures";
import {
  attempt,
  chooseOne,
  damage,
  harmful,
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
  askPermission,
  askStructured,
  onTurn,
  type Modifier,
} from "../../engine/questions";
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
  Step,
  Trait,
} from "../../types";
import { CATALOG } from "..";
import { immuneToRoom } from "./omens";

/** The token that marks a figure in a room: an explorer's, in the colour of
 *  its character card. */
function explorerToken(state: GameState, figure: FigureId): string {
  const token = figureDefinition(CATALOG, state, figure).token;
  if (token === null) throw new Error(`${figure} has no token to mark it`);
  return token;
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
            : [
                harmful(figure, source.rule, {
                  what: `the ${kind} damage`,
                  apply: {
                    label: `Take 1 ${kind} damage`,
                    steps: [damage(figure, kind, { points: 1 }, source.rule)],
                  },
                  ignore: { label: "Ignore the damage", steps: [] },
                }),
              ];
        },
      },
    ],
  };
}

const traitName = (trait: Trait) =>
  `${trait[0].toUpperCase()}${trait.slice(1)}`;

/** Leaving this room takes a trait roll; failing it costs 1 in another trait,
 *  or the explorer may stay instead and try again on a later turn (rooms.md's
 *  official ruling). It applies however the explorer leaves. The roll is
 *  harmful text, which the traitor may ignore and a monster does. */
function rollToLeave(trait: Trait, target: number, loss: Trait): Behaviour {
  return {
    beforeLeave: (state, figure, source, go) => {
      if (immuneToRoom(state, figure, source.id)) return [go];
      const leave = roll(
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
        );
      return [
        harmful(figure, source.rule, {
          what: "the roll to leave",
          apply: {
            label: `Make the ${traitName(trait)} roll to leave`,
            steps: [leave],
          },
          ignore: { label: "Leave without rolling", steps: [go] },
        }),
      ];
    },
  };
}

/** A barrier room, split in two with one side by each door (p. 7). Once a
 *  turn an explorer may try the room's roll to cross to the other side.
 *  Crossing is part of moving, so it can't be tried once their movement has
 *  ended, but it spends none, so it can be tried with no spaces left; failing
 *  ends their movement (rules.md's project ruling). The roll is harmful
 *  text, so the traitor may cross without it (ruling harmful-text). A
 *  monster ignores the barrier altogether (p. 7), so has nothing to cross. */
function barrierRoom(trait: Trait, target: number): Behaviour {
  const id = (room: string) => `cross-${room}`;
  return {
    barrier: { trait, target },
    actions: {
      cross: {
        label: `Try to cross (${traitName(trait)} roll of ${target}+)`,
        available: (state, figure, source, engine) =>
          state.turn !== null &&
          !state.turn.movementEnded.includes(figure) &&
          !state.turn.rolls.includes(id(source.id)) &&
          !askStructured(engine, state, "ignoresBarriers", { figure }),
        steps: (state, figure, source) => {
          const { side } = placeOf(state, figure);
          const other = CATALOG.rooms[source.id].doors.find((d) => d !== side);
          if (side === null || other === undefined)
            throw new Error(`No other side of the ${source.id} to cross to`);
          const cross = crossBarrier(figure, other, source.rule);
          return [
            harmful(figure, source.rule, {
              what: "the roll to cross",
              apply: {
                label: `Make the ${traitName(trait)} roll to cross`,
                steps: [
                  roll(
                    figure,
                    { kind: "trait", trait },
                    source.rule,
                    table([
                      { min: target, max: null, steps: [cross] },
                      {
                        min: 0,
                        max: target - 1,
                        steps: [endMovement(figure, source.rule)],
                      },
                    ]),
                    { id: id(source.id) },
                  ),
                ],
              },
              ignore: {
                label: "Cross without rolling",
                steps: [attempt(id(source.id)), cross],
              },
            }),
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
const LANDING = "basement-landing";

/** Whether a figure isn't bound by the Mystic Elevator's text: the traitor
 *  and monsters choose where it goes (p. 8). */
function freeRider(engine: Engine, state: GameState, figure: FigureId): boolean {
  return (
    askStructured(engine, state, "bindingText", {
      figure,
      rule: ELEVATOR_RULE,
    }) !== "binding"
  );
}

/** A fall's damage, or the shaking elevator's: harmful text. */
function fallDamage(figure: FigureId, rule: RuleRef): Step {
  return harmful(figure, rule, {
    what: "the damage",
    apply: {
      label: "Take 1 die of physical damage",
      steps: [damage(figure, "physical", { dice: 1 }, rule)],
    },
    ignore: { label: "Ignore the damage", steps: [] },
  });
}

/** A way only monsters can take, from one room to another, as a move of 1
 *  space: up the Coal Chute, the Collapsed Room or to the Gallery (p. 19,
 *  ruling monster-climbs). `from` may be worked out from the state (where
 *  the first faller from the Collapsed Room landed). */
function climb(
  from: string | ((state: GameState) => string | null),
  to: string,
): Modifier {
  const start = (state: GameState) =>
    typeof from === "string" ? from : from(state);
  return {
    question: "connections",
    when: (state, { mover, from: place }, _source, engine) =>
      mover.kind === "figure" &&
      place.room === start(state) &&
      placed(state.board, to) !== undefined &&
      askStructured(engine, state, "monsterRules", { figure: mover.figure }),
    change: { add: () => [{ room: to, side: null }] },
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
        // Its contents are cards, so only a figure that can hold them opens it.
        open: {
          label: "Try to open the Vault (Knowledge roll of 6+)",
          available: (state, figure, _source, engine) =>
            !state.tokens.some((t) => t.token === "vault-empty") &&
            !(state.turn?.rolls.includes("vault") ?? true) &&
            askPermission(engine, state, "canCarry", { figure }).allowed,
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
    // movement goes on afterwards (rooms.md's official ruling). Its damage
    // is harmful text. A monster can climb back up (p. 19).
    gallery: {
      modifiers: [climb("ballroom", "gallery")],
      actions: {
        fall: {
          label: "Fall down to the Ballroom (1 die of physical damage)",
          available: (state) => placed(state.board, "ballroom") !== undefined,
          steps: (_state, figure, source) => [
            relocate(figure, "ballroom", source.rule, null, [
              fallDamage(figure, source.rule),
            ]),
          ],
        },
      },
    },

    crypt: endTurnDamage("mental"),
    "furnace-room": endTurnDamage("physical"),

    "collapsed-room": {
      // A monster can climb up from where the first faller landed (p. 19).
      modifiers: [
        climb(
          (state) => state.tokens.find((t) => t.token === BELOW)?.room ?? null,
          COLLAPSED,
        ),
      ],
      reactions: [
        {
          // Only the explorer who discovers it must roll (p. 7), and the
          // roll is harmful text.
          event: "entered",
          when: (_state, event, source) => {
            const d = eventData<Entered>(event);
            return d.room === source.id && d.discovered === true;
          },
          steps: (_state, event, source) => {
            const { figure } = eventData<Entered>(event);
            return [
              harmful(figure, source.rule, {
                what: "the roll to avoid falling",
                apply: {
                  label: "Make the Speed roll to avoid falling",
                  steps: [
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
                  ],
                },
                ignore: { label: "Don't roll, and stay", steps: [] },
              }),
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
        // A figure that can't discover rooms (a monster) falls into a
        // basement room already there (p. 7).
        fall: defineStep<Subject>((state, p, ctx) => {
          const rule = COLLAPSED_RULE;
          const hurt = fallDamage(p.figure, rule);
          const below = state.tokens.find((t) => t.token === BELOW);
          if (below) {
            ctx.push(
              relocate(p.figure, below.room, rule, below.side ?? null, [hurt]),
            );
            return;
          }
          if (
            !askPermission(ctx.engine, state, "canDiscover", {
              figure: p.figure,
            }).allowed
          ) {
            ctx.push(local(COLLAPSED, "land", p));
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
                      fallDamage(p.figure, rule),
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
      // spent in it without moving; it works once a turn (pp. 7-8). The
      // traitor and monsters, whom its text doesn't bind, send it where they
      // choose without rolling when they enter it, once over the traitor's
      // turn and the monster turn after it (p. 8, ruling harmful-text).
      reactions: (["entered", "turn-ended"] as const).map((type) => ({
        event: type,
        when: (
          state: GameState,
          event: GameEvent,
          source: Source,
          engine: Engine,
        ) => {
          const figure = arrivedOrEnded(event, source.id);
          if (
            figure === null ||
            state.turn === null ||
            !onTurn(engine, state, figure)
          )
            return false;
          return freeRider(engine, state, figure)
            ? type === "entered" && !state.turn.setUses.includes(ELEVATOR)
            : !state.turn.rolls.includes(ELEVATOR);
        },
        steps: (
          state: GameState,
          event: GameEvent,
          source: Source,
          engine: Engine,
        ) => {
          const figure = arrivedOrEnded(event, source.id);
          if (figure === null) return [];
          return [
            local(
              ELEVATOR,
              freeRider(engine, state, figure) ? "send" : "ride",
              { figure },
            ),
          ];
        },
      })),
      steps: {
        send: defineStep<Subject>((state, p, ctx) => {
          if (state.turn === null) throw new Error("No turn to send it on");
          state.turn.setUses.push(ELEVATOR);
          ctx.push(
            chooseOne(
              p.figure,
              ctx.catalog.rooms[ELEVATOR].floors.map((floor) => ({
                label: `Send the elevator to the ${FLOOR_NAMES[floor]}`,
                steps: [
                  local(ELEVATOR, "move", {
                    figure: p.figure,
                    floor,
                    shake: false,
                  }),
                ],
              })),
              ELEVATOR_RULE,
            ),
          );
        }),
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
              .map((e) => fallDamage(e.id, ELEVATOR_RULE)),
          );
        }),
      },
    },

    "coal-chute": {
      // A monster can climb up the chute from the Basement Landing, and go
      // back down it, a space each way (p. 19, ruling monster-climbs).
      modifiers: [
        climb(LANDING, "coal-chute"),
        climb("coal-chute", LANDING),
      ],
      reactions: [
        {
          // Entering and sliding are one space together, so the slide
          // spends no movement (p. 7). Climbing up into it isn't sliding.
          event: "entered",
          when: (_state, event, source) => {
            const d = eventData<{ room: string; from?: string }>(event);
            return d.room === source.id && d.from !== LANDING;
          },
          steps: (_state, event, source) => [
            relocate(
              eventData<{ figure: FigureId }>(event).figure,
              LANDING,
              source.rule,
            ),
          ],
        },
      ],
    },
  },
};
