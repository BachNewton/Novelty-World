import { adjacent, distances, placed } from "../../engine/board";
import {
  chooseOne,
  damage,
  defineStep,
  discardCard,
  drawCard,
  gain,
  keepCard,
  placeToken,
  relocate,
  removeToken,
  roll,
  table,
  type TableRow,
} from "../../engine/effects";
import { explorerAt, TRAITS } from "../../engine/explorers";
import {
  eventData,
  local,
  type Behaviour,
  type BehaviourGroup,
  type Reaction,
} from "../../engine/sources";
import type { StepHandler } from "../../engine/step-loop";
import type { GameState, RuleRef, Step, Trait } from "../../types";
import { CATALOG } from "..";

const card = (id: string): RuleRef => ({ source: "card", card: id });

const traitName = (trait: Trait) =>
  `${trait[0].toUpperCase()}${trait.slice(1)}`;

const explorerName = (state: GameState, seat: number) =>
  CATALOG.characters[explorerAt(state, seat).character].name;

function traitRoll(
  seat: number,
  trait: Trait,
  cardId: string,
  rows: TableRow[],
): Step {
  return roll(seat, { kind: "trait", trait }, card(cardId), table(rows));
}

/** Every seat in table order, starting with this one and passing left. */
function fromSeat(state: GameState, seat: number): number[] {
  const count = state.explorers.length;
  return state.explorers.map((_e, i) => (seat + i) % count);
}

/** A kept card can be told to go by several triggers in one write; only the first discards it. */
function discardIfHeld(cardId: string): StepHandler {
  return defineStep<{ seat: number }>((state, p, ctx) => {
    if (explorerAt(state, p.seat).cards.includes(cardId))
      ctx.push(discardCard(p.seat, cardId));
  });
}

/** A turn-ended reaction for the card's holder, in one of these rooms or meeting a condition. */
function holderTurnEnded(
  when: (state: GameState, seat: number, room: string) => boolean,
  cardId: string,
): Reaction[] {
  return [
    {
      event: "turn-ended",
      when: (state, event, source) => {
        const { seat, room } = eventData<{ seat: number; room: string }>(event);
        return seat === source.holder && when(state, seat, room);
      },
      steps: (_state, event) => [
        local(cardId, "discard", {
          seat: eventData<{ seat: number }>(event).seat,
        }),
      ],
    },
  ];
}

/** A token's once-a-turn roll, offered to an explorer in its room. */
function tokenRoll(
  label: string,
  rollId: string,
  makeRoll: (seat: number, room: string) => Step,
): Behaviour {
  return {
    actions: {
      open: {
        label,
        available: (state) => !(state.turn?.rolls.includes(rollId) ?? true),
        steps: (_state, seat, source) => {
          if (source.room === null) throw new Error(`${rollId} has no room`);
          return [makeRoll(seat, source.room)];
        },
      },
    },
  };
}

const GRAVE_DIRT_ROOMS = [
  "balcony",
  "gardens",
  "graveyard",
  "gymnasium",
  "larder",
  "patio",
  "tower",
];

/** Event cards A of the base game, from content/cards/events.md. */
export const EVENTS_A: BehaviourGroup = {
  cards: {
    "bloody-vision": {
      onDraw: (_state, seat) => [
        traitRoll(seat, "sanity", "bloody-vision", [
          {
            min: 4,
            max: null,
            steps: [gain(seat, "sanity", 1, card("bloody-vision"))],
          },
          {
            min: 2,
            max: 3,
            steps: [gain(seat, "sanity", -1, card("bloody-vision"))],
          },
          {
            min: 0,
            max: 1,
            steps: [local("bloody-vision", "attack", { seat })],
          },
        ]),
      ],
      steps: {
        attack: defineStep<{ seat: number }>((state, p) => {
          const room = explorerAt(state, p.seat).room;
          const reach = [room, ...adjacent(state.board, room)];
          const target = state.explorers.some(
            (e) => e.seat !== p.seat && reach.includes(e.room),
          );
          // Before the haunt there are no monsters, so an empty reach means no attack.
          if (state.status === "exploring" && !target) return;
          throw new Error(
            "Bloody Vision's attack needs combat, which the engine doesn't have yet",
          );
        }),
      },
    },

    "burning-man": {
      onDraw: (_state, seat) => {
        const rule = card("burning-man");
        return [
          traitRoll(seat, "sanity", "burning-man", [
            { min: 4, max: null, steps: [gain(seat, "sanity", 1, rule)] },
            {
              min: 2,
              max: 3,
              steps: [relocate(seat, "entrance-hall", rule)],
            },
            {
              min: 0,
              max: 1,
              steps: [
                damage(seat, "physical", { dice: 1 }, rule),
                damage(seat, "mental", { dice: 1 }, rule),
              ],
            },
          ]),
        ];
      },
    },

    "closet-door": {
      onDraw: (state, seat) => [
        placeToken("closet", explorerAt(state, seat).room, card("closet-door")),
      ],
    },

    "creepy-crawlies": {
      onDraw: (_state, seat) => {
        const rule = card("creepy-crawlies");
        return [
          traitRoll(seat, "sanity", "creepy-crawlies", [
            { min: 5, max: null, steps: [gain(seat, "sanity", 1, rule)] },
            { min: 1, max: 4, steps: [gain(seat, "sanity", -1, rule)] },
            { min: 0, max: 0, steps: [gain(seat, "sanity", -2, rule)] },
          ]),
        ];
      },
    },

    debris: {
      onDraw: (_state, seat) => [
        traitRoll(seat, "speed", "debris", [
          {
            min: 3,
            max: null,
            steps: [gain(seat, "speed", 1, card("debris"))],
          },
          { min: 0, max: 2, steps: [local("debris", "buried")] },
        ]),
      ],
      steps: {
        buried: () => {
          throw new Error(
            "Debris can't bury yet: the engine can't offer a held card's action to other explorers, or count failed attempts",
          );
        },
      },
    },

    "disquieting-sounds": {
      onDraw: (state, seat) => {
        const rule = card("disquieting-sounds");
        const omens = state.omensDrawn;
        const rows: TableRow[] = [
          { min: omens, max: null, steps: [gain(seat, "sanity", 1, rule)] },
        ];
        if (omens > 0)
          rows.push({
            min: 0,
            max: omens - 1,
            steps: [damage(seat, "mental", { dice: 1 }, rule)],
          });
        return [roll(seat, { kind: "dice", count: 6 }, rule, table(rows))];
      },
    },

    "drip-drip-drip": {
      onDraw: (state, seat) => [
        placeToken(
          "drip",
          explorerAt(state, seat).room,
          card("drip-drip-drip"),
        ),
      ],
    },

    footsteps: {
      onDraw: (state, seat) => {
        const rule = card("footsteps");
        const inChapel = explorerAt(state, seat).room === "chapel";
        const nearest = (trait: Trait, amount: number) =>
          local("footsteps", "nearest", { seat, trait, amount });
        return [
          roll(
            seat,
            { kind: "dice", count: inChapel ? 2 : 1 },
            rule,
            table([
              {
                min: 4,
                max: 4,
                steps: [gain(seat, "might", 1, rule), nearest("might", 1)],
              },
              {
                min: 3,
                max: 3,
                steps: [gain(seat, "might", 1, rule), nearest("sanity", -1)],
              },
              { min: 2, max: 2, steps: [gain(seat, "sanity", -1, rule)] },
              { min: 1, max: 1, steps: [gain(seat, "speed", -1, rule)] },
              {
                min: 0,
                max: 0,
                steps: fromSeat(state, seat).map((each) =>
                  chooseOne(
                    each,
                    TRAITS.map((trait) => ({
                      label: `Lose 1 ${traitName(trait)}`,
                      steps: [gain(each, trait, -1, rule)],
                    })),
                    rule,
                  ),
                ),
              },
            ]),
          ),
        ];
      },
      steps: {
        // Nearest is the fewest rooms along a route; the drawer breaks a tie.
        nearest: defineStep<{ seat: number; trait: Trait; amount: number }>(
          (state, p, ctx) => {
            const rule = card("footsteps");
            const away = distances(
              state.board,
              ctx.catalog,
              explorerAt(state, p.seat).room,
            );
            const others = state.explorers.filter(
              (e) => e.seat !== p.seat && e.room in away,
            );
            if (others.length === 0)
              throw new Error("Footsteps found no explorer reachable by route");
            const closest = Math.min(...others.map((e) => away[e.room]));
            ctx.push(
              chooseOne(
                p.seat,
                others
                  .filter((e) => away[e.room] === closest)
                  .map((e) => ({
                    label: `${explorerName(state, e.seat)} is the nearest explorer`,
                    steps: [gain(e.seat, p.trait, p.amount, rule)],
                  })),
                rule,
              ),
            );
          },
        ),
      },
    },

    funeral: {
      onDraw: (state, seat) => {
        const rule = card("funeral");
        const here = explorerAt(state, seat).room;
        const rooms = ["graveyard", "crypt"].filter((room) =>
          placed(state.board, room),
        );
        const putIn =
          rooms.length === 0
            ? []
            : [
                chooseOne(
                  seat,
                  rooms.map((room) => ({
                    label: `Go to the ${CATALOG.rooms[room].name}`,
                    steps: room === here ? [] : [relocate(seat, room, rule)],
                  })),
                  rule,
                ),
              ];
        return [
          traitRoll(seat, "sanity", "funeral", [
            { min: 4, max: null, steps: [gain(seat, "sanity", 1, rule)] },
            { min: 2, max: 3, steps: [gain(seat, "sanity", -1, rule)] },
            {
              min: 0,
              max: 1,
              steps: [
                gain(seat, "sanity", -1, rule),
                gain(seat, "might", -1, rule),
                ...putIn,
              ],
            },
          ]),
        ];
      },
    },

    "grave-dirt": {
      onDraw: (_state, seat) => [
        traitRoll(seat, "might", "grave-dirt", [
          {
            min: 4,
            max: null,
            steps: [gain(seat, "might", 1, card("grave-dirt"))],
          },
          { min: 0, max: 3, steps: [keepCard(seat, "grave-dirt")] },
        ]),
      ],
      reactions: [
        {
          event: "turn-started",
          when: (_state, event, source) =>
            eventData<{ seat: number }>(event).seat === source.holder,
          steps: (_state, event) => [
            damage(
              eventData<{ seat: number }>(event).seat,
              "physical",
              { points: 1 },
              card("grave-dirt"),
            ),
          ],
        },
        {
          event: "trait-changed",
          when: (_state, event, source) => {
            const { seat, spaces } = eventData<{
              seat: number;
              spaces: number;
            }>(event);
            return (
              seat === source.holder &&
              spaces > 0 &&
              event.rule.source === "card" &&
              CATALOG.cards[event.rule.card].type === "item"
            );
          },
          steps: (_state, event) => [
            local("grave-dirt", "discard", {
              seat: eventData<{ seat: number }>(event).seat,
            }),
          ],
        },
        ...holderTurnEnded(
          (_state, _seat, room) => GRAVE_DIRT_ROOMS.includes(room),
          "grave-dirt",
        ),
      ],
      steps: { discard: discardIfHeld("grave-dirt") },
    },

    "hanged-men": {
      onDraw: (_state, seat) => [
        local("hanged-men", "next", {
          seat,
          traits: [...TRAITS],
          passed: true,
        }),
      ],
      steps: {
        next: defineStep<{ seat: number; traits: Trait[]; passed: boolean }>(
          (_state, p, ctx) => {
            const rule = card("hanged-men");
            if (p.traits.length > 0) {
              ctx.push(
                roll(
                  p.seat,
                  { kind: "trait", trait: p.traits[0] },
                  rule,
                  local("hanged-men", "rolled", p),
                ),
              );
            } else if (p.passed) {
              ctx.push(
                chooseOne(
                  p.seat,
                  TRAITS.map((trait) => ({
                    label: `Gain 1 ${traitName(trait)}`,
                    steps: [gain(p.seat, trait, 1, rule)],
                  })),
                  rule,
                ),
              );
            }
          },
        ),
        rolled: defineStep<{
          seat: number;
          traits: Trait[];
          passed: boolean;
          result: number;
        }>((_state, p, ctx) => {
          const [trait, ...rest] = p.traits;
          if (p.result <= 1)
            ctx.push(gain(p.seat, trait, -1, card("hanged-men")));
          ctx.push(
            local("hanged-men", "next", {
              seat: p.seat,
              traits: rest,
              passed: p.passed && p.result >= 2,
            }),
          );
        }),
      },
    },

    "hideous-shriek": {
      onDraw: (state, seat) => {
        const rule = card("hideous-shriek");
        return fromSeat(state, seat).map((each) =>
          traitRoll(each, "sanity", "hideous-shriek", [
            { min: 4, max: null, steps: [] },
            {
              min: 1,
              max: 3,
              steps: [damage(each, "mental", { dice: 1 }, rule)],
            },
            {
              min: 0,
              max: 0,
              steps: [damage(each, "mental", { dice: 2 }, rule)],
            },
          ]),
        );
      },
    },

    "image-in-the-mirror-take": {
      onDraw: (_state, seat) => [
        drawCard(seat, "item", card("image-in-the-mirror-take")),
      ],
    },

    "jonahs-turn": {
      onDraw: (state, seat) => {
        const rule = card("jonahs-turn");
        const holder = state.explorers.find((e) =>
          e.cards.includes("puzzle-box"),
        );
        if (!holder) return [damage(seat, "mental", { dice: 1 }, rule)];
        return [
          discardCard(holder.seat, "puzzle-box"),
          drawCard(holder.seat, "item", rule),
          gain(seat, "sanity", 1, rule),
        ];
      },
    },

    "lights-out": {
      onDraw: (state, seat) =>
        explorerAt(state, seat).cards.includes("candle")
          ? []
          : [keepCard(seat, "lights-out")],
      modifiers: [
        {
          question: "movement",
          when: (_state, subject, source) => subject.seat === source.holder,
          change: { atMost: 1 },
        },
      ],
      reactions: [
        ...holderTurnEnded(
          (state, seat, room) =>
            room === "furnace-room" ||
            state.explorers.some((e) => e.seat !== seat && e.room === room),
          "lights-out",
        ),
        // Every way an explorer can get a card; a held Candle can only have just arrived.
        ...["card-drawn", "picked-up", "traded"].map((event): Reaction => ({
          event,
          when: (state, _event, source) =>
            source.holder !== null &&
            explorerAt(state, source.holder).cards.includes("candle"),
          steps: (_state, _event, source) => [
            local("lights-out", "discard", { seat: source.holder }),
          ],
        })),
      ],
      steps: { discard: discardIfHeld("lights-out") },
    },

    "locked-safe": {
      onDraw: (state, seat) => [
        placeToken("safe", explorerAt(state, seat).room, card("locked-safe")),
      ],
    },

    "mists-from-the-walls": {
      onDraw: (state, seat) => {
        const rule = card("mists-from-the-walls");
        return fromSeat(state, seat)
          .filter(
            (each) =>
              placed(state.board, explorerAt(state, each).room)?.floor ===
              "basement",
          )
          .map((each) => {
            const room = explorerAt(state, each).room;
            const extra = CATALOG.rooms[room].symbols.includes("event") ? 1 : 0;
            return traitRoll(each, "sanity", "mists-from-the-walls", [
              { min: 4, max: null, steps: [] },
              {
                min: 1,
                max: 3,
                steps: [damage(each, "mental", { dice: 1 + extra }, rule)],
              },
              {
                min: 0,
                max: 0,
                steps: [damage(each, "mental", { dice: 1 + 2 * extra }, rule)],
              },
            ]);
          });
      },
    },
  },

  tokens: {
    // You must be in the Closet's room to roll (project ruling, cards/events.md).
    closet: tokenRoll(
      "Open the Closet (roll 2 dice)",
      "closet",
      (seat, room) => {
        const rule = card("closet-door");
        return roll(
          seat,
          { kind: "dice", count: 2 },
          rule,
          table([
            { min: 4, max: null, steps: [drawCard(seat, "item", rule)] },
            { min: 2, max: 3, steps: [drawCard(seat, "event", rule)] },
            {
              min: 0,
              max: 1,
              steps: [
                drawCard(seat, "event", rule),
                removeToken("closet", room, rule),
              ],
            },
          ]),
          "closet",
        );
      },
    ),

    drip: {
      modifiers: [
        {
          question: "dicePool",
          when: (state, { seat, roll: r }, source) =>
            r.spec.kind === "trait" &&
            explorerAt(state, seat).room === source.room,
          change: { add: -1 },
        },
        {
          question: "dicePool",
          when: (state, { seat, roll: r }, source) =>
            r.spec.kind === "trait" &&
            explorerAt(state, seat).room === source.room,
          change: { atLeast: 1 },
        },
      ],
    },

    // You must be in the Safe's room to roll (project ruling, cards/events.md).
    safe: tokenRoll("Open the Safe (Knowledge roll)", "safe", (seat, room) => {
      const rule = card("locked-safe");
      return roll(
        seat,
        { kind: "trait", trait: "knowledge" },
        rule,
        table([
          {
            min: 5,
            max: null,
            steps: [
              drawCard(seat, "item", rule),
              drawCard(seat, "item", rule),
              removeToken("safe", room, rule),
            ],
          },
          {
            min: 2,
            max: 4,
            steps: [damage(seat, "physical", { dice: 1 }, rule)],
          },
          {
            min: 0,
            max: 1,
            steps: [damage(seat, "physical", { dice: 2 }, rule)],
          },
        ]),
        "safe",
      );
    }),
  },
};
