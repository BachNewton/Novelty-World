import { damage, gain, roll, table } from "../../engine/effects";
import type { BehaviourGroup } from "../../engine/sources";
import type { RuleRef } from "../../types";

const card = (id: string): RuleRef => ({ source: "card", card: id });

/** Event cards, from content/cards/events.md. */
export const EVENTS: BehaviourGroup = {
  cards: {
    "angry-being": {
      onDraw: (_state, figure) => {
        const rule = card("angry-being");
        return [
          roll(
            figure,
            { kind: "trait", trait: "speed" },
            rule,
            table([
              { min: 5, max: null, steps: [gain(figure, "speed", 1, rule)] },
              {
                min: 2,
                max: 4,
                steps: [damage(figure, "mental", { dice: 1 }, rule)],
              },
              {
                min: 0,
                max: 1,
                steps: [
                  damage(figure, "mental", { dice: 1 }, rule),
                  damage(figure, "physical", { dice: 1 }, rule),
                ],
              },
            ]),
          ),
        ];
      },
    },
  },
};
