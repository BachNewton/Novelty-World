import { describe, expect, it } from "vitest";
import type { CardId } from "../contract";
import { setsIn, setValue, symbolOf, TERRITORY_CARDS, WILDS } from "../cards";
import { bestSetValue } from "./shape";

const BY_SYMBOL = (["infantry", "cavalry", "artillery"] as const).map((symbol) =>
  TERRITORY_CARDS.filter((card) => symbolOf(card) === symbol),
);

describe("bestSetValue", () => {
  it("is the best set the card rules find in a hand of that shape", () => {
    for (let size = 0; size <= 7; size++) {
      for (let wilds = 0; wilds <= Math.min(2, size); wilds++) {
        for (let infantry = 0; infantry <= size - wilds; infantry++) {
          for (let cavalry = 0; cavalry <= size - wilds - infantry; cavalry++) {
            const artillery = size - wilds - infantry - cavalry;
            const hand: CardId[] = [
              ...BY_SYMBOL[0].slice(0, infantry),
              ...BY_SYMBOL[1].slice(0, cavalry),
              ...BY_SYMBOL[2].slice(0, artillery),
              ...WILDS.slice(0, wilds),
            ];
            const best = Math.max(0, ...setsIn(hand).map(setValue));
            expect(bestSetValue([infantry, cavalry, artillery, wilds]), hand.join(" ")).toBe(best);
          }
        }
      }
    }
  });
});
