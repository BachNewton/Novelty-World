import { damage, gain, roll, table } from "../../engine/effects";
import type { Behaviour } from "../../engine/sources";
import type { RuleRef } from "../../types";

const card = (id: string): RuleRef => ({ source: "card", card: id });

/** Event cards, from content/cards/events.md. */
export const EVENTS: Record<string, Behaviour> = {
  "angry-being": {
    onDraw: (_state, seat) => {
      const rule = card("angry-being");
      return [
        roll(
          seat,
          { kind: "trait", trait: "speed" },
          rule,
          table([
            { min: 5, max: null, steps: [gain(seat, "speed", 1, rule)] },
            {
              min: 2,
              max: 4,
              steps: [damage(seat, "mental", { dice: 1 }, rule)],
            },
            {
              min: 0,
              max: 1,
              steps: [
                damage(seat, "mental", { dice: 1 }, rule),
                damage(seat, "physical", { dice: 1 }, rule),
              ],
            },
          ]),
        ),
      ];
    },
  },
};
