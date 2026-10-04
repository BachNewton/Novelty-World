import { discardCard, gain } from "../../engine/effects";
import { TRAITS } from "../../engine/explorers";
import { eventData, type BehaviourGroup } from "../../engine/sources";
import type { RuleRef } from "../../types";

const card = (id: string): RuleRef => ({ source: "card", card: id });

/** Item cards, from content/cards/items.md. */
export const ITEMS: BehaviourGroup = {
  cards: {
    "adrenaline-shot": {
      rollOptions: [
        {
          timing: "before",
          applies: (_state, _seat, roll) => roll.spec.kind === "trait",
          effect: { kind: "add", amount: 4 },
        },
      ],
      reactions: [
        {
          event: "card-used",
          when: (_state, event) =>
            eventData<{ card: string }>(event).card === "adrenaline-shot",
          steps: (_state, _event, source) =>
            source.holder === null
              ? []
              : [discardCard(source.holder, "adrenaline-shot")],
        },
      ],
    },

    "amulet-of-the-ages": {
      onGain: (_state, seat) =>
        TRAITS.map((trait) =>
          gain(
            seat,
            trait,
            1,
            card("amulet-of-the-ages"),
            "amulet-of-the-ages",
          ),
        ),
      onLose: (_state, seat) =>
        TRAITS.map((trait) =>
          gain(
            seat,
            trait,
            -3,
            card("amulet-of-the-ages"),
            "amulet-of-the-ages",
          ),
        ),
    },
  },
};
