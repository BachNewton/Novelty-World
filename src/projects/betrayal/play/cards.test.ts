import { beforeAll, describe, expect, it } from "vitest";
import { loadRuleNotes, type RuleNotes } from "../data/rule-notes";
import type { EventView } from "../engine/view";
import { ENGINE } from "../game";
import { cardMood, consequence, EVENT_MOODS, heldText, statChanges } from "./cards";

let notes: RuleNotes;
beforeAll(async () => {
  notes = await loadRuleNotes();
});

describe("cardMood", () => {
  it("gives every event a mood, and nothing else one", () => {
    const events = Object.values(ENGINE.catalog.cards).filter((card) => card.type === "event").map((card) => card.id);
    expect(Object.keys(EVENT_MOODS).sort()).toEqual(events.sort());
  });

  it("shows an item amber and an omen violet", () => {
    expect(cardMood(ENGINE, "lucky-stone")).toBe("human");
    expect(cardMood(ENGINE, "skull")).toBe("magic");
    expect(cardMood(ENGINE, "a-moment-of-hope")).toBe("holy");
  });
});

describe("a card's text", () => {
  it("leaves out an omen's haunt roll once it is held", () => {
    expect(heldText(notes, "skull")).toEqual(["Whenever you take mental damage, you may take all of it as physical damage instead."]);
  });

  it("gives what using a card costs in a line", () => {
    expect(consequence(notes, "idol")).toBe("Each time you do, lose 1 Sanity.");
    expect(consequence(notes, "rabbits-foot")).toBe("Once during your turn, you may reroll 1 die. You must keep the second roll.");
  });
});

describe("statChanges", () => {
  const event = (type: string, data: object): EventView => ({ id: `${type}-1`, type, data, rule: { source: "rulebook", page: 1 } }) as unknown as EventView;

  it("floats each trait a change moves, gains and losses alike", () => {
    expect(statChanges([event("trait-changed", { figure: "zoe", trait: "might", spaces: 1 })])).toEqual([{ id: "trait-changed-1", figure: "zoe", trait: "might", spaces: 1 }]);
    expect(statChanges([event("damaged", { figure: "zoe", damage: "mental", split: { sanity: 1, knowledge: 0 } })])).toEqual([
      { id: "damaged-1:sanity", figure: "zoe", trait: "sanity", spaces: -1 },
    ]);
    expect(statChanges([event("trait-changed", { figure: "zoe", trait: "might", spaces: 0 })])).toEqual([]);
  });
});
