import { attackWith, cardAttack } from "../../engine/combat";
import {
  cardFlag,
  chooseOne,
  defineStep,
  gain,
  gainCard,
  handle,
  isHandled,
  loseCard,
  markCard,
  placeToken,
  removeToken,
  roll,
  table,
  takeFromPile,
  type CardDestination,
} from "../../engine/effects";
import { explorerAt, placeOf } from "../../engine/explorers";
import { routeDistances } from "../../engine/movement";
import type { Mover } from "../../engine/questions";
import {
  eventData,
  local,
  type Behaviour,
  type BehaviourGroup,
} from "../../engine/sources";
import type { Engine } from "../../engine/step-loop";
import type { GameState, RuleRef, Step, Trait } from "../../types";
import { CATALOG } from "..";

const card = (id: string): RuleRef => ({ source: "card", card: id });

/** An omen that changes traits while you have it: the changes when you get it, reversed when you lose it.
 *  Only a gain is tied to the card, so that losing the card takes back the spaces it pushed past the maximum (p. 11). */
function heldTraits(id: string, changes: [Trait, number][]): Behaviour {
  const apply = (seat: number, sign: 1 | -1) =>
    changes.map(([trait, amount]) =>
      gain(seat, trait, sign * amount, card(id), amount > 0 ? id : null),
    );
  return {
    onGain: (_state, seat) => apply(seat, 1),
    onLose: (_state, seat) => apply(seat, -1),
  };
}

/** Putting the Mask on: gain 2 Knowledge and lose 2 Sanity. Taking it off reverses that. Only the
 *  gain is tied to the card, as with the omens that change traits while held. */
function maskTraits(seat: number, sign: 1 | -1): Step[] {
  return [
    gain(seat, "knowledge", 2 * sign, card("mask"), "mask"),
    gain(seat, "sanity", -2 * sign, card("mask")),
  ];
}

const maskOn = (seat: number): Step[] => [
  ...maskTraits(seat, 1),
  markCard("mask", "worn", true, "holder", card("mask")),
];

const maskOff = (seat: number): Step[] => [
  ...maskTraits(seat, -1),
  markCard("mask", "worn", false, "holder", card("mask")),
];

const MEDALLION_ROOMS = ["pentagram-chamber", "crypt", "graveyard"];

/** Whether an explorer is immune to a room's effects because they hold the Medallion. */
export function immuneToRoom(
  state: GameState,
  seat: number,
  room: string,
): boolean {
  return (
    MEDALLION_ROOMS.includes(room) &&
    explorerAt(state, seat).cards.includes("medallion")
  );
}

type Search = { seat: number; type: "item" | "event" };

const DOG = card("dog");
/** The small monster token standing for the Dog. Before the haunt no monster
 *  has a colour yet, so any colour differs from theirs. */
const DOG_TOKEN = "monster-magenta";
/** Rooms the Dog can't go into: the one-way Coal Chute and the Mystic
 *  Elevator (the card's official ruling), and the rooms that take a roll to
 *  leave, as it could never come back out (the card's project ruling). */
const NO_DOG = [
  "coal-chute",
  "mystic-elevator",
  "junk-room",
  "attic",
  "graveyard",
  "pentagram-chamber",
];
const DOG_RANGE = 6;

const dogMover = (seat: number): Mover => ({
  kind: "companion",
  card: "dog",
  seat,
});

/** The rooms the Dog can run to, by doors and stairs: never across a barrier,
 *  which takes a roll, and never out of a room it couldn't leave. */
function dogRuns(engine: Engine, state: GameState, seat: number): string[] {
  const here = placeOf(state, seat);
  if (NO_DOG.includes(here.room)) return [];
  const rooms = routeDistances(engine, state, dogMover(seat), here, false)
    .filter(
      (r) =>
        r.distance > 0 &&
        r.distance <= DOG_RANGE &&
        r.place.room !== here.room,
    )
    .map((r) => r.place.room);
  return [...new Set(rooms)].sort();
}

const dogTraits = (seat: number, sign: 1 | -1) => [
  gain(seat, "might", sign, DOG, sign > 0 ? "dog" : null),
  gain(seat, "sanity", sign, DOG, sign > 0 ? "dog" : null),
];

type DogRun = { seat: number; room: string };
type DogCarry = DogRun & { card: string };

/** The Dog: its token follows its holder, and once a turn it runs to a room
 *  and back, fetching or leaving one item. The run ends back with its holder,
 *  so it never holds an item between turns (the card's project ruling). */
const DOG_BEHAVIOUR: Behaviour = {
  onGain: (state, seat) => [
    ...dogTraits(seat, 1),
    placeToken(DOG_TOKEN, explorerAt(state, seat).room, DOG, { holder: seat }),
  ],
  onLose: (state, seat) => [
    ...dogTraits(seat, -1),
    removeToken(DOG_TOKEN, explorerAt(state, seat).room, DOG),
  ],
  modifiers: [
    {
      question: "connections",
      when: (_state, { mover }, source) =>
        mover.kind === "companion" &&
        mover.card === "dog" &&
        mover.seat === source.holder,
      change: { remove: () => NO_DOG },
    },
  ],
  actions: {
    run: {
      label: `Send the Dog to a room up to ${DOG_RANGE} spaces away and back`,
      available: (state, seat, _source, engine) =>
        dogRuns(engine, state, seat).length > 0,
      steps: (_state, seat) => [local("dog", "run", { seat })],
    },
  },
  steps: {
    run: defineStep<{ seat: number }>((state, p, ctx) => {
      ctx.push(
        chooseOne(
          p.seat,
          dogRuns(ctx.engine, state, p.seat).map((room) => ({
            label: `Send the Dog to the ${CATALOG.rooms[room].name}`,
            steps: [local("dog", "there", { seat: p.seat, room })],
          })),
          DOG,
        ),
      );
    }),
    there: defineStep<DogRun>((state, p, ctx) => {
      ctx.emit("dog-ran", DOG, p);
      const fetch = (state.piles[p.room] ?? [])
        .filter((c) => !isHandled(state, c))
        .map((c) => ({
          label: `The Dog brings back the ${CATALOG.cards[c].name}`,
          steps: [local("dog", "fetch", { ...p, card: c })],
        }));
      const leave = explorerAt(state, p.seat)
        .cards.filter(
          (c) => CATALOG.cards[c].transfer.drop && !isHandled(state, c),
        )
        .map((c) => ({
          label: `The Dog leaves your ${CATALOG.cards[c].name} there`,
          steps: [local("dog", "leave", { ...p, card: c })],
        }));
      ctx.push(
        chooseOne(
          p.seat,
          [
            ...fetch,
            ...leave,
            { label: "The Dog comes back with nothing", steps: [] },
          ],
          DOG,
        ),
      );
    }),
    // The holder gets what the Dog fetches when it comes back to them.
    fetch: defineStep<DogCarry>((state, p, ctx) => {
      takeFromPile(state, p.room, p.card);
      handle(state, p.card);
      ctx.push(gainCard(p.seat, p.card, "picked-up", DOG));
    }),
    leave: defineStep<DogCarry>((state, p, ctx) => {
      handle(state, p.card);
      ctx.push(loseCard(p.seat, p.card, { to: "room", room: p.room }, DOG));
    }),
  },
  describe: {
    "dog-ran": (event, words) => {
      const d = eventData<DogRun>(event);
      return `${words.explorer(d.seat)}'s Dog runs to the ${words.room(d.room)}`;
    },
    "token-placed": (event, words) =>
      `The Dog's token goes in the ${words.room(eventData<{ room: string }>(event).room)}, and goes wherever its holder goes`,
    "token-removed": () => "The Dog's token is taken away",
    "card-gained": (event, words) => {
      const d = eventData<{ seat: number; card: string }>(event);
      return `The Dog brings ${words.explorer(d.seat)} the ${words.card(d.card)}`;
    },
    "card-lost": (event, words) => {
      const d = eventData<{ card: string; destination: CardDestination }>(
        event,
      );
      if (d.destination.to !== "room")
        throw new Error("The Dog only leaves items in rooms");
      return `The Dog leaves the ${words.card(d.card)} in the ${words.room(d.destination.room)}`;
    },
  },
};

/** Omen cards, from content/cards/omens.md. Every omen also triggers the haunt roll, which the engine makes. */
export const OMENS: BehaviourGroup = {
  cards: {
    bite: {
      onDraw: (state, seat) => [
        cardAttack(state, seat, "might", 4, card("bite")),
      ],
    },
    book: heldTraits("book", [["knowledge", 2]]),
    dog: DOG_BEHAVIOUR,
    girl: heldTraits("girl", [
      ["sanity", 1],
      ["knowledge", 1],
    ]),
    "holy-symbol": heldTraits("holy-symbol", [["sanity", 2]]),
    madman: heldTraits("madman", [
      ["might", 2],
      ["sanity", -1],
    ]),

    "crystal-ball": {
      actions: {
        gaze: {
          label: "Look into the Crystal Ball (Knowledge roll)",
          available: (state) => state.status === "haunt",
          steps: (_state, seat) => {
            const rule = card("crystal-ball");
            return [
              roll(
                seat,
                { kind: "trait", trait: "knowledge" },
                rule,
                table([
                  {
                    min: 4,
                    max: null,
                    steps: [local("crystal-ball", "search", { seat })],
                  },
                  { min: 1, max: 3, steps: [gain(seat, "sanity", -1, rule)] },
                  { min: 0, max: 0, steps: [gain(seat, "sanity", -2, rule)] },
                ]),
              ),
            ];
          },
        },
      },
      steps: {
        // Only the undrawn stack is searched, never the discards (1st-edition FAQ).
        search: defineStep<{ seat: number }>((state, { seat }, ctx) => {
          const rule = card("crystal-ball");
          const types = (["item", "event"] as const).filter(
            (type) => state.decks[type].draw.length > 0,
          );
          if (types.length === 0) {
            ctx.emit("search-found-nothing", rule, { seat });
            return;
          }
          ctx.push(
            chooseOne(
              seat,
              types.map((type) => ({
                label: `Search the ${type} stack`,
                steps: [local("crystal-ball", "pick", { seat, type })],
              })),
              rule,
            ),
          );
        }),
        pick: defineStep<Search>((state, { seat, type }, ctx) => {
          ctx.push(
            chooseOne(
              seat,
              state.decks[type].draw.map((chosen) => ({
                label: `Put the ${CATALOG.cards[chosen].name} on top of the ${type} stack`,
                steps: [
                  local("crystal-ball", "stack", { seat, type, card: chosen }),
                ],
              })),
              card("crystal-ball"),
            ),
          );
        }),
        stack: defineStep<Search & { card: string }>((state, p, ctx) => {
          const deck = state.decks[p.type];
          deck.draw = [
            p.card,
            ...ctx.random.shuffle(deck.draw.filter((c) => c !== p.card)),
          ];
          ctx.emit("deck-stacked", card("crystal-ball"), {
            seat: p.seat,
            type: p.type,
            card: p.card,
          });
        }),
      },
    },

    mask: {
      actions: {
        use: {
          label: "Use the Mask (Sanity roll)",
          available: () => true,
          steps: (_state, seat) => [
            roll(
              seat,
              { kind: "trait", trait: "sanity" },
              card("mask"),
              table([
                {
                  min: 4,
                  max: null,
                  steps: [local("mask", "put-on-or-off", { seat })],
                },
                { min: 0, max: 3, steps: [] },
              ]),
            ),
          ],
        },
      },
      steps: {
        "put-on-or-off": defineStep<{ seat: number }>(
          (state, { seat }, ctx) => {
            const worn = cardFlag(state, "mask", "worn");
            ctx.push(
              chooseOne(
                seat,
                [
                  worn
                    ? { label: "Take off the Mask", steps: maskOff(seat) }
                    : { label: "Put on the Mask", steps: maskOn(seat) },
                  {
                    label: worn ? "Keep the Mask on" : "Leave the Mask off",
                    steps: [],
                  },
                ],
                card("mask"),
              ),
            );
          },
        ),
      },
      // A project ruling: losing the Mask while wearing it takes it off.
      onLose: (state, seat) =>
        cardFlag(state, "mask", "worn") ? maskTraits(seat, -1) : [],
      describe: {
        "card-marked": (event) =>
          eventData<{ value: boolean }>(event).value
            ? "The Mask is put on"
            : "The Mask is taken off",
      },
    },

    // The explorer you attack is your opponent for the Ring, before the
    // haunt too (the card's project ruling).
    ring: { modifiers: attackWith("ring", "sanity", 0) },

    skull: { damageAs: "physical" },

    spear: { modifiers: attackWith("spear", "might", 2) },

    "spirit-board": {
      actions: {
        look: {
          label: "Use the Spirit Board: look at the top room tile",
          // The card's effect after the haunt (moving monsters) waits for the haunt milestone.
          available: (state) =>
            state.status === "exploring" &&
            state.turn?.moved === 0 &&
            state.board.stack.length > 0,
          steps: (_state, seat) => [local("spirit-board", "look", { seat })],
        },
      },
      steps: {
        look: defineStep<{ seat: number }>((state, { seat }, ctx) => {
          ctx.emit("room-stack-seen", card("spirit-board"), {
            seat,
            tile: state.board.stack[0],
          });
        }),
      },
    },
  },
};
