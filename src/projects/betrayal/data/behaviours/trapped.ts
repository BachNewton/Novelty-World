import {
  cardCount,
  defineStep,
  discardCard,
  markCard,
  roll,
  table,
} from "../../engine/effects";
import {
  eventData,
  local,
  type Behaviour,
  type Source,
} from "../../engine/sources";
import type { FigureId, GameState, RuleRef, Step } from "../../types";

const FAILED = "failed";
const ATTEMPTS = 3;

function holder(source: Source): FigureId {
  if (source.holder === null) throw new Error(`${source.id} isn't held`);
  return source.holder;
}

/** Failed attempts so far to free the holder of a card that traps them. */
function failedAttempts(state: GameState, id: string): number {
  return cardCount(state, id, FAILED);
}

/** Records the failed attempts so far to free the holder. */
export function markFailed(id: string, count: number): Step {
  return markCard(id, FAILED, count, "holder", { source: "card", card: id });
}

/** A kept event that traps its holder (the Webs, the Debris). While they
 *  hold it they can't do anything. Once during each explorer's turn, that
 *  explorer, if they are with the holder, may make a Might roll of 4+ to free
 *  them; so may the holder on their own turn. After 3 failed attempts the
 *  holder breaks free at the start of their next turn and takes it normally.
 *  Freed, they discard the card. `failing` is what else a failed attempt does
 *  to whoever made it. */
export function trap(
  id: string,
  label: string,
  failing: (figure: FigureId, rule: RuleRef) => Step[],
): Behaviour {
  const rule: RuleRef = { source: "card", card: id };
  return {
    modifiers: [
      {
        question: "canAct",
        when: (_state, { figure }, source) => figure === source.holder,
        change: { deny: true },
      },
    ],
    actions: {
      free: {
        label,
        offeredTo: "room",
        escape: true,
        available: (state) => !(state.turn?.rolls.includes(id) ?? true),
        steps: (_state, figure, source) => [
          roll(
            figure,
            { kind: "trait", trait: "might" },
            rule,
            table([
              {
                min: 4,
                max: null,
                steps: [local(id, "freed", { figure: holder(source) })],
              },
              {
                min: 0,
                max: 3,
                steps: [local(id, "failed"), ...failing(figure, rule)],
              },
            ]),
            { id },
          ),
        ],
      },
    },
    reactions: [
      {
        event: "turn-started",
        when: (state, event, source) =>
          eventData<{ figure: FigureId }>(event).figure === source.holder &&
          failedAttempts(state, id) >= ATTEMPTS,
        steps: (_state, event) => [
          local(id, "freed", { figure: eventData<{ figure: FigureId }>(event).figure }),
        ],
      },
    ],
    steps: {
      freed: defineStep<{ figure: FigureId }>((_state, p, ctx) => {
        ctx.push(discardCard(p.figure, id));
      }),
      failed: defineStep((state, _p, ctx) => {
        ctx.push(markFailed(id, failedAttempts(state, id) + 1));
      }),
    },
    describe: {
      "card-marked": (event) => {
        const count = eventData<{ value: number }>(event).value;
        return `${count} failed ${count === 1 ? "attempt" : "attempts"} to break free so far`;
      },
      "card-lost": (event, words) =>
        `${words.figure(eventData<{ figure: FigureId }>(event).figure)} is free, and discards the card`,
    },
  };
}
