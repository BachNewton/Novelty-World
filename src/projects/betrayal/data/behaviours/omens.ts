import { attackWith, cardAttack } from "../../engine/combat";
import {
  cardFlag,
  chooseOne,
  defineStep,
  gain,
  gainCard,
  handle,
  IN_HAND,
  isHandled,
  loseCard,
  markCard,
  moveCard,
  placeToken,
  removeToken,
  roll,
  table,
} from "../../engine/effects";
import { figureOf, placeOf, roomOf } from "../../engine/figures";
import { pullMonsters } from "../../engine/monsters";
import { routeDistances } from "../../engine/movement";
import type { Mover } from "../../engine/questions";
import {
  type Behaviour,
  type BehaviourGroup,
  ownSteps,
} from "../../engine/sources";
import type { Engine } from "../../engine/step-loop";
import type { FigureId, GameState, RuleRef, Step, Trait } from "../../types";
import { CATALOG } from "..";

const card = (id: string): RuleRef => ({ source: "card", card: id });

/** An omen that changes traits while you have it: the changes when you get it, reversed when you lose it.
 *  Only a gain is tied to the card, so that losing the card takes back the spaces it pushed past the maximum (p. 11). */
function heldTraits(id: string, changes: [Trait, number][]): Behaviour {
  const apply = (figure: FigureId, sign: 1 | -1) =>
    changes.map(([trait, amount]) =>
      gain(figure, trait, sign * amount, card(id), amount > 0 ? id : null),
    );
  return {
    onGain: (_state, figure) => apply(figure, 1),
    onLose: (_state, figure) => apply(figure, -1),
  };
}

/** Putting the Mask on: gain 2 Knowledge and lose 2 Sanity. Taking it off reverses that. Only the
 *  gain is tied to the card, as with the omens that change traits while held. */
function maskTraits(figure: FigureId, sign: 1 | -1): Step[] {
  return [
    gain(figure, "knowledge", 2 * sign, card("mask"), "mask"),
    gain(figure, "sanity", -2 * sign, card("mask")),
  ];
}

const maskOn = (figure: FigureId): Step[] => [
  ...maskTraits(figure, 1),
  markCard("mask", "worn", true, "holder", card("mask")),
];

const maskOff = (figure: FigureId): Step[] => [
  ...maskTraits(figure, -1),
  markCard("mask", "worn", false, "holder", card("mask")),
];

const MEDALLION_ROOMS = ["pentagram-chamber", "crypt", "graveyard"];

/** Whether an explorer is immune to a room's effects because they hold the Medallion. */
export function immuneToRoom(
  state: GameState,
  figure: FigureId,
  room: string,
): boolean {
  return (
    MEDALLION_ROOMS.includes(room) &&
    figureOf(state, figure).cards.includes("medallion")
  );
}

type Search = { figure: FigureId; type: "item" | "event" };

const DOG = card("dog");
/** The small monster token standing for the Dog. Before the haunt no monster
 *  has a colour yet, so any colour differs from theirs. */
const DOG_TOKEN = "dog";
/** Rooms the Dog can't go into: the one-way Coal Chute and the Mystic
 *  Elevator (the card's official ruling), and the rooms that take a roll to
 *  leave, as it could never come back out (the card's project ruling). The
 *  Gallery and the Collapsed Room are one-way only by their falls, which the
 *  Dog never takes, so it may go in by their doors (project ruling). */
const NO_DOG = [
  "coal-chute",
  "mystic-elevator",
  "junk-room",
  "attic",
  "graveyard",
  "pentagram-chamber",
];
const DOG_RANGE = 6;

const dogMover = (holder: FigureId): Mover => ({
  kind: "companion",
  card: "dog",
  holder,
});

/** The rooms the Dog can run to, by doors and stairs: never across a barrier,
 *  which takes a roll, and never out of a room it couldn't leave. */
function dogRuns(engine: Engine, state: GameState, figure: FigureId): string[] {
  const here = placeOf(state, figure);
  if (NO_DOG.includes(here.room)) return [];
  const rooms = routeDistances(engine, state, dogMover(figure), here, false)
    .filter(
      (r) =>
        r.distance > 0 &&
        r.distance <= DOG_RANGE &&
        r.place.room !== here.room,
    )
    .map((r) => r.place.room);
  return [...new Set(rooms)].sort();
}

const dogTraits = (figure: FigureId, sign: 1 | -1) => [
  gain(figure, "might", sign, DOG, sign > 0 ? "dog" : null),
  gain(figure, "sanity", sign, DOG, sign > 0 ? "dog" : null),
];

type DogRun = { figure: FigureId; room: string };
type DogCarry = DogRun & { card: string };

const DOG_STEPS = ownSteps("dog", {
  run: defineStep<{ figure: FigureId }>((state, p, ctx) => {
    ctx.push(
      chooseOne(
        p.figure,
        dogRuns(ctx.engine, state, p.figure).map((room) => ({
          label: `Send the Dog to the ${CATALOG.rooms[room].name}`,
          steps: [DOG_STEPS.step("there", { figure: p.figure, room })],
          room,
        })),
        DOG,
      ),
    );
  }),
  there: defineStep<DogRun>((state, p, ctx) => {
    ctx.emit("dog-ran", DOG, p);
    const isItem = (c: string) => CATALOG.cards[c].type === "item";
    const fetch = (state.piles[p.room] ?? [])
      .filter((c) => isItem(c) && !isHandled(state, c))
      .map((c) => ({
        label: `The Dog brings back the ${CATALOG.cards[c].name}`,
        steps: [DOG_STEPS.step("fetch", { ...p, card: c })],
      }));
    const leave = figureOf(state, p.figure)
      .cards.filter(
        (c) =>
          isItem(c) && CATALOG.cards[c].transfer.drop && !isHandled(state, c),
      )
      .map((c) => ({
        label: `The Dog leaves your ${CATALOG.cards[c].name} there`,
        steps: [DOG_STEPS.step("leave", { ...p, card: c })],
      }));
    ctx.push(
      chooseOne(
        p.figure,
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
    moveCard(state, p.card, { at: "pile", room: p.room }, IN_HAND);
    handle(state, p.card);
    ctx.push(gainCard(p.figure, p.card, "picked-up", DOG));
  }),
  leave: defineStep<DogCarry>((state, p, ctx) => {
    handle(state, p.card);
    ctx.push(loseCard(p.figure, p.card, { to: "room", room: p.room }, DOG));
  }),
});

/** The Dog: its token follows its holder, and once a turn it runs to a room
 *  and back, fetching or leaving one item, never an omen. The run ends back
 *  with its holder, so it never holds an item between turns (the card's
 *  project rulings). */
const DOG_BEHAVIOUR: Behaviour = {
  onGain: (state, figure) => [
    ...dogTraits(figure, 1),
    placeToken(DOG_TOKEN, roomOf(state, figure), DOG, { holder: figure }),
  ],
  onLose: (state, figure) => [
    ...dogTraits(figure, -1),
    removeToken(DOG_TOKEN, roomOf(state, figure), DOG),
  ],
  modifiers: [
    {
      question: "connections",
      when: (_state, { mover }, source) =>
        mover.kind === "companion" &&
        mover.card === "dog" &&
        mover.holder === source.holder,
      change: { remove: () => NO_DOG },
    },
  ],
  actions: {
    run: {
      label: `Send the Dog to a room up to ${DOG_RANGE} spaces away and back`,
      available: (state, figure, _source, engine) =>
        dogRuns(engine, state, figure).length > 0,
      steps: (_state, figure) => [DOG_STEPS.step("run", { figure })],
    },
  },
  steps: DOG_STEPS.steps,
  describe: {
    "dog-ran": (event, words) => {
      const d = event.data;
      return `${words.figure(d.figure)}'s Dog runs to the ${words.room(d.room)}`;
    },
    "token-placed": (event, words) =>
      `The Dog's token goes in the ${words.room(event.data.room)}, and goes wherever its holder goes`,
    "token-removed": () => "The Dog's token is taken away",
    "card-gained": (event, words) => {
      const d = event.data;
      return `The Dog brings ${words.figure(d.figure)} the ${words.card(d.card)}`;
    },
    "card-lost": (event, words) => {
      const d = event.data;
      if (d.destination.to !== "room")
        throw new Error("The Dog only leaves items in rooms");
      return `The Dog leaves the ${words.card(d.card)} in the ${words.room(d.destination.room)}`;
    },
  },
};

const CRYSTAL_BALL = ownSteps("crystal-ball", {
  // Only the undrawn stack is searched, never the discards (1st-edition FAQ).
  search: defineStep<{ figure: FigureId }>((state, { figure }, ctx) => {
    const rule = card("crystal-ball");
    const types = (["item", "event"] as const).filter(
      (type) => state.decks[type].draw.length > 0,
    );
    if (types.length === 0) {
      ctx.emit("search-found-nothing", rule, { figure });
      return;
    }
    ctx.push(
      chooseOne(
        figure,
        types.map((type) => ({
          label: `Search the ${type} stack`,
          steps: [CRYSTAL_BALL.step("pick", { figure, type })],
        })),
        rule,
      ),
    );
  }),
  pick: defineStep<Search>((state, { figure, type }, ctx) => {
    ctx.push(
      chooseOne(
        figure,
        state.decks[type].draw.map((chosen) => ({
          label: `Put the ${CATALOG.cards[chosen].name} on top of the ${type} stack`,
          steps: [
            CRYSTAL_BALL.step("stack", { figure, type, card: chosen }),
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
      figure: p.figure,
      type: p.type,
      card: p.card,
    });
  }),
});

const MASK = ownSteps("mask", {
  "put-on-or-off": defineStep<{ figure: FigureId }>(
    (state, { figure }, ctx) => {
      const worn = cardFlag(state, "mask", "worn");
      ctx.push(
        chooseOne(
          figure,
          [
            worn
              ? { label: "Take off the Mask", steps: maskOff(figure) }
              : { label: "Put on the Mask", steps: maskOn(figure) },
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
});

const SPIRIT_BOARD = ownSteps("spirit-board", {
  look: defineStep<{ figure: FigureId }>((state, { figure }, ctx) => {
    ctx.emit("room-stack-seen", card("spirit-board"), {
      figure,
      tile: state.board.stack[0],
    });
  }),
});

/** Omen cards, from content/cards/omens.md. Every omen also triggers the haunt roll, which the engine makes. */
export const OMENS: BehaviourGroup = {
  cards: {
    // The traitor may choose not to be affected by it (rules p. 17).
    bite: {
      refusable: true,
      onDraw: (state, figure) => [
        cardAttack(figure, "might", 4, card("bite")),
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
          steps: (_state, figure) => {
            const rule = card("crystal-ball");
            return [
              roll(
                figure,
                { kind: "trait", trait: "knowledge" },
                rule,
                table([
                  {
                    min: 4,
                    max: null,
                    steps: [CRYSTAL_BALL.step("search", { figure })],
                    does: "search",
                  },
                  { min: 1, max: 3, steps: [gain(figure, "sanity", -1, rule)] },
                  { min: 0, max: 0, steps: [gain(figure, "sanity", -2, rule)] },
                ]),
              ),
            ];
          },
        },
      },
      steps: CRYSTAL_BALL.steps,
    },

    mask: {
      actions: {
        use: {
          label: "Use the Mask (Sanity roll)",
          available: () => true,
          steps: (_state, figure) => [
            roll(
              figure,
              { kind: "trait", trait: "sanity" },
              card("mask"),
              table([
                {
                  min: 4,
                  max: null,
                  steps: [MASK.step("put-on-or-off", { figure })],
                  does: "mask",
                },
                { min: 0, max: 3, steps: [] },
              ]),
            ),
          ],
        },
      },
      steps: MASK.steps,
      // A project ruling: losing the Mask while wearing it takes it off.
      onLose: (state, figure) =>
        cardFlag(state, "mask", "worn") ? maskTraits(figure, -1) : [],
      describe: {
        "card-marked": (event) =>
          event.data.value
            ? "The Mask is put on"
            : "The Mask is taken off",
      },
    },

    // The explorer you attack is your opponent for the Ring, before the
    // haunt too (the card's project ruling).
    ring: { modifiers: attackWith("ring", "sanity", 0) },

    skull: { damageAs: "physical" },

    spear: { modifiers: attackWith("spear", "might", 2) },

    // After the haunt, using it also lets the traitor pull any number of
    // monsters 1 space closer to the user, the traitor's own use included;
    // with no traitor, every monster comes.
    "spirit-board": {
      actions: {
        look: {
          label: "Use the Spirit Board: look at the top room tile",
          available: (state, figure) =>
            state.turn !== null &&
            (state.turn.moved[figure] ?? 0) === 0 &&
            state.board.stack.length > 0,
          steps: (state, figure) => [
            SPIRIT_BOARD.step("look", { figure }),
            ...(state.status === "haunt"
              ? [pullMonsters(figure, card("spirit-board"))]
              : []),
          ],
        },
      },
      steps: SPIRIT_BOARD.steps,
    },
  },
};
