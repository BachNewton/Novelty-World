import {
  beyondWall,
  COMPASS,
  EDGES,
  FLOORS,
  neighbourCell,
  placed,
  roomAt,
  sideName,
  sightLines,
  turn,
} from "../../engine/board";
import {
  chooseOne,
  damage,
  defineStep,
  discardCard,
  drawCard,
  endMovement,
  gain,
  keepCard,
  loseCard,
  placeToken,
  placeWallToken,
  relocate,
  removeToken,
  roll,
  table,
  type TableRow,
} from "../../engine/effects";
import { explorerAt, placeOf, TRAITS } from "../../engine/explorers";
import { barrierSides } from "../../engine/questions";
import {
  local,
  type Behaviour,
  type BehaviourGroup,
} from "../../engine/sources";
import type { Engine } from "../../engine/step-loop";
import {
  drawRoomTile,
  enterNewRoom,
  placeOptions,
  placeRoom,
  spotOf,
  type Where,
} from "../../engine/tiles";
import type {
  Catalog,
  Edge,
  FloorId,
  GameState,
  Place,
  RuleRef,
  Step,
  Trait,
} from "../../types";
import { CATALOG } from "..";
import { markFailed, trap } from "./trapped";

const card = (id: string): RuleRef => ({ source: "card", card: id });

const traitName = (trait: Trait) =>
  `${trait[0].toUpperCase()}${trait.slice(1)}`;

function traitRoll(
  seat: number,
  trait: Trait,
  rule: RuleRef,
  rows: TableRow[],
  id?: string,
): Step {
  return roll(seat, { kind: "trait", trait }, rule, table(rows), { id });
}

/** Every explorer, starting with the one who drew the card and going left. */
function fromDrawer(state: GameState, seat: number): number[] {
  const seats = state.explorers.map((e) => e.seat).sort((a, b) => a - b);
  const start = seats.indexOf(seat);
  return [...seats.slice(start), ...seats.slice(0, start)];
}

function floorOf(state: GameState, room: string) {
  const tile = placed(state.board, room);
  if (!tile) throw new Error(`${room} is not on the board`);
  return tile.floor;
}

/** A window facing an empty cell. A window against a placed room is a false
 *  feature and doesn't count as a window (rules p. 8, glossary p. 21). */
function hasOutsideWindow(
  catalog: Catalog,
  state: GameState,
  room: string,
): boolean {
  const tile = placed(state.board, room);
  if (!tile) return false;
  return catalog.rooms[room].windows.some((edge) => {
    const cell = neighbourCell(tile, turn(edge, tile.rotation));
    return !roomAt(state.board, tile.floor, cell.x, cell.y);
  });
}

const OPEN_TO_THE_WIND = ["gardens", "graveyard", "patio", "tower", "balcony"];
// Unlike Shrieking Wind, not the Patio (the card's resolution).
const BECKONING_ROOMS = ["gardens", "graveyard", "tower", "balcony"];

function heldItems(state: GameState, seat: number): string[] {
  return explorerAt(state, seat).cards.filter(
    (c) => CATALOG.cards[c].type === "item",
  );
}

type SeatParams = { seat: number };

/** Every place in these rooms: each side of a barrier room, as a token there
 *  lies on one side (p. 7). */
function placesIn(engine: Engine, rooms: string[]): Place[] {
  return rooms.flatMap((room): Place[] => {
    const sides = barrierSides(engine, room);
    return sides.length === 0
      ? [{ room, side: null }]
      : sides.map((side) => ({ room, side }));
  });
}

function placeLabel(state: GameState, place: Place): string {
  const room = `the ${CATALOG.rooms[place.room].name}`;
  return place.side === null
    ? room
    : `${room}, on its ${sideName(state.board, place.room, place.side)} side`;
}

type Linked = { seat: number; there: Place };

/** A card that links two rooms with a pair of tokens (Secret Passage, Secret
 *  Stairs): one goes in the drawer's room, on their side, and the other where
 *  they choose among `rooms`. Then they may go through at once, even with no
 *  movement left, followed by `after` once they are there. */
function linkRooms(
  id: string,
  token: string,
  after: (seat: number) => Step[],
) {
  const rule = card(id);
  return {
    otherEnd: (
      engine: Engine,
      state: GameState,
      seat: number,
      rooms: string[],
    ): Step =>
      chooseOne(
        seat,
        placesIn(engine, rooms).map((there) => ({
          label: `Put the other ${CATALOG.tokens[token].name} token in ${placeLabel(state, there)}`,
          steps: [local(id, "link", { seat, there })],
        })),
        rule,
      ),
    steps: {
      link: defineStep<Linked>((state, p, ctx) => {
        const here = placeOf(state, p.seat);
        const same = here.room === p.there.room && here.side === p.there.side;
        ctx.push(
          placeToken(token, here.room, rule, {
            side: here.side,
            link: p.there,
          }),
          placeToken(token, p.there.room, rule, {
            side: p.there.side,
            link: here,
          }),
          ...(same
            ? []
            : [
                chooseOne(
                  p.seat,
                  [
                    {
                      label: `Go through to ${placeLabel(state, p.there)}`,
                      steps: [
                        relocate(p.seat, p.there.room, rule, p.there.side),
                        local(id, "arrived", p),
                      ],
                    },
                    { label: "Stay here", steps: [] },
                  ],
                  rule,
                ),
              ]),
        );
      }),
      // A rule for leaving may have kept them where they were.
      arrived: defineStep<Linked>((state, p, ctx) => {
        if (explorerAt(state, p.seat).room === p.there.room)
          ctx.push(...after(p.seat));
      }),
    },
  };
}

const SECRET_PASSAGE = linkRooms("secret-passage", "secret-passage", () => []);
// Only the drawer, only going through at once, draws (the card's resolution).
const SECRET_STAIRS = linkRooms("secret-stairs", "secret-stairs", (seat) => [
  drawCard(seat, "event", card("secret-stairs")),
]);

/** A linked token joins its room, on its side, to where the other one lies:
 *  going through counts as one space. Any explorer may use it. */
const LINKED_TOKEN: Behaviour = {
  modifiers: [
    {
      question: "connections",
      when: (_state, { mover, from }, source) =>
        mover.kind === "explorer" &&
        source.token !== null &&
        source.token.room === from.room &&
        (source.token.side ?? null) === from.side,
      change: {
        add: (_state, { from }, source) => {
          const link = source.token?.link;
          return link && !(link.room === from.room && link.side === from.side)
            ? [link]
            : [];
        },
      },
    },
  ],
};

const roomsOn = (state: GameState, floors: FloorId[] | null) =>
  state.board.tiles
    .filter((t) => floors === null || floors.includes(t.floor))
    .map((t) => t.tile);

/** Where a Wall Switch can go, as printed edges of the room's tile: each wall
 *  with no exit, and each corner (cards/events.md, Revolving Wall). */
function switchWalls(catalog: Catalog, room: string): Edge[][] {
  const tile = catalog.rooms[room];
  const walls = EDGES.filter(
    (edge) => !tile.doors.includes(edge) && !tile.passages.includes(edge),
  ).map((edge) => [edge]);
  const corners = EDGES.map((edge, i) => [edge, EDGES[(i + 1) % 4]]);
  return [...walls, ...corners];
}

const NORTH_SOUTH: Edge[] = ["top", "bottom"];

/** A wall's name as the board shows it: "north wall", "north-east corner". */
function wallName(state: GameState, room: string, wall: Edge[]): string {
  const tile = placed(state.board, room);
  if (!tile) throw new Error(`${room} is not on the board`);
  const sides = wall
    .map((edge) => turn(edge, tile.rotation))
    .sort((a) => (NORTH_SOUTH.includes(a) ? -1 : 1))
    .map((edge) => COMPASS[edge]);
  return `${sides.join("-")} ${wall.length === 2 ? "corner" : "wall"}`;
}

/** The cell beyond a wall, and the room there if any. */
function beyond(state: GameState, room: string, wall: Edge[]) {
  const spot = beyondWall(state.board, room, wall);
  return { spot, room: roomAt(state.board, spot.floor, spot.x, spot.y) };
}

/** Whether a tile from the stack or the discard pile can go there. */
function roomCanGo(catalog: Catalog, state: GameState, where: Where): boolean {
  return [...state.board.stack, ...state.board.discards].some(
    (tile) => placeOptions(catalog, state.board, tile, where).length > 0,
  );
}

type SwitchParams = { seat: number; room: string; wall: Edge[] };
type PossessionParams = { seat: number; trait: Trait };

/** Event cards B of the base game, from content/cards/events.md. */
export const EVENTS_B: BehaviourGroup = {
  cards: {
    "night-view": {
      onDraw: (_state, seat) => {
        const rule = card("night-view");
        return [
          traitRoll(seat, "knowledge", rule, [
            { min: 5, max: null, steps: [gain(seat, "knowledge", 1, rule)] },
            { min: 0, max: 4, steps: [] },
          ]),
        ];
      },
    },

    "phone-call": {
      onDraw: (_state, seat) => {
        const rule = card("phone-call");
        return [
          roll(
            seat,
            { kind: "dice", count: 2 },
            rule,
            table([
              { min: 4, max: 4, steps: [gain(seat, "sanity", 1, rule)] },
              { min: 3, max: 3, steps: [gain(seat, "knowledge", 1, rule)] },
              {
                min: 1,
                max: 2,
                steps: [damage(seat, "mental", { dice: 1 }, rule)],
              },
              {
                min: 0,
                max: 0,
                steps: [damage(seat, "physical", { dice: 2 }, rule)],
              },
            ]),
          ),
        ];
      },
    },

    possession: {
      onDraw: (_state, seat) => {
        const rule = card("possession");
        return [
          chooseOne(
            seat,
            TRAITS.map((trait) => ({
              label: `Make a ${traitName(trait)} roll`,
              steps: [
                traitRoll(seat, trait, rule, [
                  {
                    min: 4,
                    max: null,
                    steps: [
                      chooseOne(
                        seat,
                        TRAITS.map((gained) => ({
                          label: `Gain 1 ${traitName(gained)}`,
                          steps: [gain(seat, gained, 1, rule)],
                        })),
                        rule,
                      ),
                    ],
                  },
                  {
                    min: 0,
                    max: 3,
                    steps: [
                      local("possession", "drop-to-lowest", { seat, trait }),
                    ],
                  },
                ]),
              ],
            })),
            rule,
          ),
        ];
      },
      steps: {
        // Read when the result lands, not when the card was drawn: the clip is wherever it is then.
        "drop-to-lowest": defineStep<PossessionParams>((state, p, ctx) => {
          const rule = card("possession");
          const clips = explorerAt(state, p.seat).clips;
          if (clips[p.trait] > 0) {
            ctx.push(gain(p.seat, p.trait, -clips[p.trait], rule));
            return;
          }
          // You choose the different trait (the card's resolution).
          const others = TRAITS.filter((t) => t !== p.trait && clips[t] > 0);
          if (others.length === 0) return;
          ctx.push(
            chooseOne(
              p.seat,
              others.map((t) => ({
                label: `Lower ${traitName(t)} to its lowest value`,
                steps: [gain(p.seat, t, -clips[t], rule)],
              })),
              rule,
            ),
          );
        }),
      },
    },

    "revolving-wall": {
      onDraw: (state, seat) => {
        const rule = card("revolving-wall");
        const room = explorerAt(state, seat).room;
        // A wall with nothing beyond it is usable only if a room can go there.
        // With none usable this floor has no rooms left: the card is discarded.
        const usable = switchWalls(CATALOG, room).filter((wall) => {
          const there = beyond(state, room, wall);
          return (
            there.room !== undefined ||
            roomCanGo(CATALOG, state, { kind: "cell", spot: there.spot })
          );
        });
        if (usable.length === 0) return [];
        return [
          chooseOne(
            seat,
            usable.map((wall) => ({
              label: `Put the Wall Switch on the ${wallName(state, room, wall)} of the ${CATALOG.rooms[room].name}`,
              steps: [local("revolving-wall", "switch", { seat, room, wall })],
            })),
            rule,
          ),
        ];
      },
      steps: {
        switch: defineStep<SwitchParams>((state, p, ctx) => {
          const rule = card("revolving-wall");
          const there = beyond(state, p.room, p.wall);
          ctx.push(
            placeWallToken("wall-switch", p.room, p.wall, rule),
            there.room
              ? relocate(p.seat, there.room.tile, rule)
              : drawRoomTile(p.seat, { kind: "cell", spot: there.spot }, rule, {
                  then: enterNewRoom(p.seat, null, rule, { draws: true }),
                  otherwise: null,
                }),
          );
        }),
      },
    },

    rotten: {
      onDraw: (_state, seat) => {
        const rule = card("rotten");
        return [
          traitRoll(seat, "sanity", rule, [
            { min: 5, max: null, steps: [gain(seat, "sanity", 1, rule)] },
            { min: 2, max: 4, steps: [gain(seat, "might", -1, rule)] },
            {
              min: 1,
              max: 1,
              steps: [
                gain(seat, "might", -1, rule),
                gain(seat, "speed", -1, rule),
              ],
            },
            {
              min: 0,
              max: 0,
              steps: TRAITS.map((trait) => gain(seat, trait, -1, rule)),
            },
          ]),
        ];
      },
    },

    "shrieking-wind": {
      onDraw: (state, seat) => {
        const rule = card("shrieking-wind");
        return fromDrawer(state, seat)
          .filter((s) => {
            const room = explorerAt(state, s).room;
            return (
              OPEN_TO_THE_WIND.includes(room) ||
              hasOutsideWindow(CATALOG, state, room)
            );
          })
          .map((s) =>
            traitRoll(s, "might", rule, [
              { min: 5, max: null, steps: [] },
              {
                min: 3,
                max: 4,
                steps: [damage(s, "physical", { dice: 1 }, rule)],
              },
              {
                min: 1,
                max: 2,
                steps: [damage(s, "mental", { dice: 1 }, rule)],
              },
              {
                min: 0,
                max: 0,
                steps: [
                  damage(s, "physical", { dice: 1 }, rule),
                  local("shrieking-wind", "blow-item-away", { seat: s }),
                ],
              },
            ]),
          );
      },
      steps: {
        "blow-item-away": defineStep<SeatParams>((state, p, ctx) => {
          const items = heldItems(state, p.seat);
          if (items.length === 0) return;
          ctx.push(
            chooseOne(
              p.seat,
              items.map((item) => ({
                label: `Put the ${ctx.catalog.cards[item].name} in the Entrance Hall`,
                steps: [
                  loseCard(
                    p.seat,
                    item,
                    { to: "room", room: "entrance-hall" },
                    card("shrieking-wind"),
                  ),
                ],
              })),
              card("shrieking-wind"),
            ),
          );
        }),
      },
    },

    silence: {
      onDraw: (state, seat) => {
        const rule = card("silence");
        return fromDrawer(state, seat)
          .filter(
            (s) => floorOf(state, explorerAt(state, s).room) === "basement",
          )
          .map((s) =>
            traitRoll(s, "sanity", rule, [
              { min: 4, max: null, steps: [] },
              {
                min: 1,
                max: 3,
                steps: [damage(s, "mental", { dice: 1 }, rule)],
              },
              {
                min: 0,
                max: 0,
                steps: [damage(s, "mental", { dice: 2 }, rule)],
              },
            ]),
          );
      },
    },

    skeletons: {
      onDraw: (state, seat) => {
        const rule = card("skeletons");
        return [
          placeToken("skeletons", explorerAt(state, seat).room, rule),
          damage(seat, "mental", { dice: 1 }, rule),
        ];
      },
    },

    "secret-passage": {
      onDraw: (_state, seat) => {
        const on = (floors: FloorId[] | null) => [
          local("secret-passage", "other-end", { seat, floors }),
        ];
        return [
          roll(
            seat,
            { kind: "dice", count: 3 },
            card("secret-passage"),
            table([
              { min: 6, max: null, steps: on(null) },
              { min: 4, max: 5, steps: on(["upper"]) },
              { min: 2, max: 3, steps: on(["ground"]) },
              { min: 0, max: 1, steps: on(["basement"]) },
            ]),
          ),
        ];
      },
      steps: {
        ...SECRET_PASSAGE.steps,
        "other-end": defineStep<{ seat: number; floors: FloorId[] | null }>(
          (state, p, ctx) => {
            ctx.push(
              SECRET_PASSAGE.otherEnd(
                ctx.engine,
                state,
                p.seat,
                roomsOn(state, p.floors),
              ),
            );
          },
        ),
      },
    },

    "secret-stairs": {
      onDraw: (_state, seat) => [local("secret-stairs", "other-end", { seat })],
      steps: {
        ...SECRET_STAIRS.steps,
        "other-end": defineStep<SeatParams>((state, p, ctx) => {
          const floor = floorOf(state, explorerAt(state, p.seat).room);
          ctx.push(
            SECRET_STAIRS.otherEnd(
              ctx.engine,
              state,
              p.seat,
              roomsOn(
                state,
                FLOORS.filter((f) => f !== floor),
              ),
            ),
          );
        }),
      },
    },

    // The Smoke token's rules are its own behaviour, under tokens.
    smoke: {
      onDraw: (state, seat) => [
        placeToken("smoke", explorerAt(state, seat).room, card("smoke")),
      ],
    },

    "something-hidden": {
      onDraw: (_state, seat) => {
        const rule = card("something-hidden");
        return [
          chooseOne(
            seat,
            [
              {
                label: "Make a Knowledge roll",
                steps: [
                  traitRoll(seat, "knowledge", rule, [
                    {
                      min: 4,
                      max: null,
                      steps: [drawCard(seat, "item", rule)],
                    },
                    { min: 0, max: 3, steps: [gain(seat, "sanity", -1, rule)] },
                  ]),
                ],
              },
              { label: "Don't roll", steps: [] },
            ],
            rule,
          ),
        ];
      },
    },

    "something-slimy": {
      onDraw: (_state, seat) => {
        const rule = card("something-slimy");
        return [
          traitRoll(seat, "speed", rule, [
            { min: 4, max: null, steps: [gain(seat, "speed", 1, rule)] },
            { min: 1, max: 3, steps: [gain(seat, "might", -1, rule)] },
            {
              min: 0,
              max: 0,
              steps: [
                gain(seat, "might", -1, rule),
                gain(seat, "speed", -1, rule),
              ],
            },
          ]),
        ];
      },
    },

    spider: {
      onDraw: (_state, seat) => {
        const rule = card("spider");
        return [
          chooseOne(
            seat,
            (["speed", "sanity"] as const).map((trait) => ({
              label: `Make a ${traitName(trait)} roll`,
              steps: [
                traitRoll(seat, trait, rule, [
                  { min: 4, max: null, steps: [gain(seat, trait, 1, rule)] },
                  {
                    min: 1,
                    max: 3,
                    steps: [damage(seat, "physical", { dice: 1 }, rule)],
                  },
                  {
                    min: 0,
                    max: 0,
                    steps: [damage(seat, "physical", { dice: 2 }, rule)],
                  },
                ]),
              ],
            })),
            rule,
          ),
        ];
      },
    },

    "the-beckoning": {
      onDraw: (state, seat) => {
        const rule = card("the-beckoning");
        return fromDrawer(state, seat)
          .filter((s) => {
            const room = explorerAt(state, s).room;
            return (
              BECKONING_ROOMS.includes(room) ||
              hasOutsideWindow(CATALOG, state, room)
            );
          })
          .map((s) =>
            traitRoll(s, "sanity", rule, [
              { min: 3, max: null, steps: [] },
              {
                min: 0,
                max: 2,
                steps: [local("the-beckoning", "jump", { seat: s })],
              },
            ]),
          );
      },
      steps: {
        jump: defineStep<SeatParams>((state, p, ctx) => {
          const rule = card("the-beckoning");
          const hurt = damage(p.seat, "physical", { dice: 1 }, rule);
          if (placed(state.board, "patio")) {
            ctx.push(relocate(p.seat, "patio", rule, null, [hurt]));
            return;
          }
          const where: Where = {
            kind: "doorways",
            floors: ["ground"],
            except: null,
          };
          // With nowhere to put the Patio there is nowhere to jump (the card's resolution).
          if (
            placeOptions(ctx.catalog, state.board, "patio", where).length === 0
          )
            return;
          const { stack, discards } = state.board;
          if (![...stack, ...discards].includes("patio"))
            throw new Error(
              "The Patio is neither in the house nor left to draw",
            );
          state.board.stack = ctx.random.shuffle(
            stack.filter((t) => t !== "patio"),
          );
          state.board.discards = discards.filter((t) => t !== "patio");
          ctx.push(
            placeRoom(p.seat, "patio", where, rule, {
              then: [
                enterNewRoom(p.seat, "patio", rule, {
                  draws: true,
                  after: [hurt],
                }),
              ],
            }),
          );
        }),
      },
    },

    "the-lost-one": {
      onDraw: (_state, seat) => {
        const rule = card("the-lost-one");
        const led = (floor: "upper" | "basement") =>
          drawRoomTile(
            seat,
            { kind: "doorways", floors: [floor], except: null },
            rule,
            {
              // The card prints its own end: one pass through the stack, no reshuffle.
              reshuffle: false,
              then: enterNewRoom(seat, null, rule, { draws: true }),
              otherwise: [relocate(seat, "entrance-hall", rule)],
            },
          );
        return [
          traitRoll(seat, "knowledge", rule, [
            { min: 5, max: null, steps: [gain(seat, "knowledge", 1, rule)] },
            {
              min: 0,
              max: 4,
              steps: [
                roll(
                  seat,
                  { kind: "dice", count: 3 },
                  rule,
                  table([
                    {
                      min: 6,
                      max: 6,
                      steps: [relocate(seat, "entrance-hall", rule)],
                    },
                    {
                      min: 4,
                      max: 5,
                      steps: [relocate(seat, "upper-landing", rule)],
                    },
                    { min: 2, max: 3, steps: [led("upper")] },
                    { min: 0, max: 1, steps: [led("basement")] },
                  ]),
                ),
              ],
            },
          ]),
        ];
      },
    },

    "the-voice": {
      onDraw: (_state, seat) => {
        const rule = card("the-voice");
        return [
          traitRoll(seat, "knowledge", rule, [
            { min: 4, max: null, steps: [drawCard(seat, "item", rule)] },
            { min: 0, max: 3, steps: [] },
          ]),
        ];
      },
    },

    "the-walls": {
      onDraw: (_state, seat) => {
        const rule = card("the-walls");
        return [
          drawRoomTile(
            seat,
            { kind: "doorways", floors: [...FLOORS], except: null },
            rule,
            {
              then: enterNewRoom(seat, null, rule, { draws: true }),
              otherwise: [],
            },
          ),
        ];
      },
    },

    webs: {
      // The Might roll on drawing is your first attempt to break free (the
      // card's resolution), so it can't be tried again this turn.
      onDraw: (_state, seat) => {
        const rule = card("webs");
        return [
          roll(
            seat,
            { kind: "trait", trait: "might" },
            rule,
            table([
              { min: 4, max: null, steps: [gain(seat, "might", 1, rule)] },
              {
                min: 0,
                max: 3,
                steps: [keepCard(seat, "webs"), markFailed("webs", 1)],
              },
            ]),
            { id: "webs" },
          ),
        ];
      },
      // A rescuer must be in your room (the card's resolution).
      ...trap(
        "webs",
        "Make a Might roll to free the explorer stuck in the Webs",
        (seat, rule) => [endMovement(seat, rule)],
      ),
    },

    "what-the": {
      onDraw: (_state, seat) => [local("what-the", "lift", { seat })],
      steps: {
        lift: defineStep<SeatParams>((state, p, ctx) => {
          const rule = card("what-the");
          const room = explorerAt(state, p.seat).room;
          // The starting tiles never move (the card's resolution).
          if (ctx.catalog.rooms[room].start !== null) {
            ctx.emit("room-stayed", rule, { tile: room });
            return;
          }
          const here = spotOf(state.board, room);
          const sameFloor: Where = {
            kind: "doorways",
            floors: [here.floor],
            except: here,
          };
          const otherFloors: Where = {
            kind: "doorways",
            floors: ctx.catalog.rooms[room].floors.filter(
              (f) => f !== here.floor,
            ),
            except: null,
          };
          ctx.push(
            placeRoom(
              p.seat,
              room,
              placeOptions(ctx.catalog, state.board, room, sameFloor).length > 0
                ? sameFloor
                : otherFloors,
              rule,
            ),
          );
        }),
      },
    },

    whoops: {
      onDraw: (_state, seat) => [local("whoops", "lose-random-item", { seat })],
      steps: {
        "lose-random-item": defineStep<SeatParams>((state, p, ctx) => {
          const items = heldItems(state, p.seat);
          if (items.length === 0) return;
          ctx.push(discardCard(p.seat, ctx.random.shuffle(items)[0]));
        }),
      },
    },
  },

  tokens: {
    "secret-passage": LINKED_TOKEN,
    "secret-stairs": LINKED_TOKEN,

    "wall-switch": {
      actions: {
        use: {
          label: "Use the Wall Switch (Knowledge roll)",
          available: (state, _seat, source) =>
            source.beside !== null &&
            !(state.turn?.rolls.includes("wall-switch") ?? true),
          steps: (state, seat, source) => {
            const here = explorerAt(state, seat).room;
            const other = here === source.room ? source.beside : source.room;
            if (other === null)
              throw new Error("The Wall Switch has no room beyond it");
            return [
              traitRoll(
                seat,
                "knowledge",
                source.rule,
                [
                  {
                    min: 3,
                    max: null,
                    steps: [relocate(seat, other, source.rule)],
                  },
                  { min: 0, max: 2, steps: [] },
                ],
                "wall-switch",
              ),
            ];
          },
        },
      },
    },

    skeletons: {
      actions: {
        search: {
          label: "Search the Skeletons (Sanity roll)",
          available: (state) => !state.turn?.rolls.includes("skeletons"),
          steps: (_state, seat, source) => {
            if (source.room === null)
              throw new Error("The Skeletons token isn't in a room");
            return [
              traitRoll(
                seat,
                "sanity",
                source.rule,
                [
                  {
                    min: 5,
                    max: null,
                    steps: [
                      drawCard(seat, "item", source.rule),
                      removeToken("skeletons", source.room, source.rule),
                    ],
                  },
                  {
                    min: 0,
                    max: 4,
                    steps: [damage(seat, "mental", { dice: 1 }, source.rule)],
                  },
                ],
                "skeletons",
              ),
            ];
          },
        },
      },
    },

    smoke: {
      modifiers: [
        {
          question: "dicePool",
          when: (state, { seat, roll }, source) =>
            roll.spec.kind === "trait" &&
            explorerAt(state, seat).room === source.room,
          change: { fewer: 2, minimum: 1 },
        },
        {
          // Sight is mutual, so the Smoke blocks it into, out of and through
          // its room (the card's project ruling).
          question: "lineOfSight",
          change: {
            remove: (state, { room }, source) => {
              const lines = sightLines(state.board, CATALOG, room);
              if (room === source.room) return lines.flat();
              return lines.flatMap((line) => {
                const at = line.findIndex((r) => r === source.room);
                return at < 0 ? [] : line.slice(at);
              });
            },
          },
        },
      ],
    },
  },
};
