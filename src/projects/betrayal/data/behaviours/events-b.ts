import { neighbourCell, placed, roomAt, turn } from "../../engine/board";
import {
  chooseOne,
  damage,
  defineStep,
  discardCard,
  drawCard,
  gain,
  placeToken,
  removeToken,
  roll,
  table,
  type TableRow,
} from "../../engine/effects";
import { explorerAt, TRAITS } from "../../engine/explorers";
import { local, type BehaviourGroup } from "../../engine/sources";
import type { Catalog, GameState, RuleRef, Step, Trait } from "../../types";
import { CATALOG } from "..";

const card = (id: string): RuleRef => ({ source: "card", card: id });

const traitName = (trait: Trait) =>
  `${trait[0].toUpperCase()}${trait.slice(1)}`;

function traitRoll(
  seat: number,
  trait: Trait,
  rule: RuleRef,
  rows: TableRow[],
  id: string | null = null,
): Step {
  return roll(seat, { kind: "trait", trait }, rule, table(rows), id);
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

function heldItems(state: GameState, seat: number): string[] {
  return explorerAt(state, seat).cards.filter(
    (c) => CATALOG.cards[c].type === "item",
  );
}

type SeatParams = { seat: number };
type ItemParams = { seat: number; card: string };
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
                  local("shrieking-wind", "to-entrance-hall", {
                    seat: p.seat,
                    card: item,
                  }),
                ],
              })),
              card("shrieking-wind"),
            ),
          );
        }),
        "to-entrance-hall": defineStep<ItemParams>((state, p, ctx) => {
          const explorer = explorerAt(state, p.seat);
          explorer.cards = explorer.cards.filter((c) => c !== p.card);
          state.piles["entrance-hall"] = [
            ...(state.piles["entrance-hall"] ?? []),
            p.card,
          ];
          ctx.emit("item-moved", card("shrieking-wind"), {
            seat: p.seat,
            card: p.card,
            room: "entrance-hall",
          });
          const onLose = ctx.engine.behaviours.cards[p.card]?.onLose;
          if (onLose) ctx.push(...onLose(state, p.seat));
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

    // The Smoke token's dice penalty is its own behaviour, under tokens. Its blocking of
    // line of sight waits for the engine to ask a line-of-sight question.
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
          change: { add: -2 },
        },
        {
          question: "dicePool",
          when: (state, { seat, roll }, source) =>
            roll.spec.kind === "trait" &&
            explorerAt(state, seat).room === source.room,
          change: { atLeast: 1 },
        },
      ],
    },
  },
};
