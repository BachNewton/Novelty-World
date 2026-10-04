import { chooseOne, defineStep, gain, roll, table } from "../../engine/effects";
import { explorerAt } from "../../engine/explorers";
import {
  local,
  type Behaviour,
  type BehaviourGroup,
} from "../../engine/sources";
import type { GameState, RuleRef, Trait } from "../../types";
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

/** Omen cards, from content/cards/omens.md. Every omen also triggers the haunt roll, which the engine makes. */
export const OMENS: BehaviourGroup = {
  cards: {
    book: heldTraits("book", [["knowledge", 2]]),
    dog: heldTraits("dog", [
      ["might", 1],
      ["sanity", 1],
    ]),
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
