import { describe, expect, it } from "vitest";
import { CATALOG } from "../../data";
import { ITEM_MODELS, ITEM_PARTS } from ".";

describe("the item models' registry", () => {
  it("names each model by its card's id, an item or an omen", () => {
    for (const [id, model] of Object.entries(ITEM_MODELS)) {
      expect(model.card, id).toBe(id);
      expect(id in CATALOG.cards, id).toBe(true);
      expect(["item", "omen"], id).toContain(CATALOG.cards[id].type);
    }
  });

  it("gives every model's parts their own id, for the workers to mesh by", () => {
    const ids = ITEM_PARTS.map((parts) => parts.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^item:/);
  });
});
