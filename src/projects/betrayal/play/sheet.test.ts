import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { viewFor } from "../engine/view";
import { testGame, waitingOn } from "../testing";
import { playChoices } from "./choices";
import { boxActions, explorerActions, tradeOffer, tradeSides } from "./sheet";

// Zoe holds the Music Box and the Lucky Stone, and Ox the Rabbit's Foot; all three explorers start in the Entrance Hall.
const state = testGame({
  explorers: [
    { seat: 0, cards: ["music-box", "lucky-stone"] },
    { seat: 1, cards: ["rabbits-foot"] },
  ],
});
const view = viewFor(ENGINE, state, waitingOn(state));
const { panel } = playChoices(view);

describe("explorerActions", () => {
  it("puts each card held on a row of its own, in the order held, with its uses and Drop", () => {
    const { held } = explorerActions(["music-box", "lucky-stone"], panel);
    expect(held.map((row) => row.card)).toEqual(["music-box", "lucky-stone"]);
    expect(held[0].uses.map((use) => use.label)).toEqual(["Open the Music Box"]);
    expect(held[0].drop?.label).toBe("Drop the Music Box");
    expect(held[1].uses).toEqual([]);
    expect(held[1].drop?.label).toBe("Drop the Lucky Stone");
  });

  it("puts each explorer who can trade on one row, and counts the actions", () => {
    const actions = explorerActions(["music-box", "lucky-stone"], panel);
    expect(actions.trades.map((row) => row.with)).toEqual(["ox-bellows", "father-rhinehardt"]);
    expect(actions.floor).toEqual([]);
    // One use, two drops and two trade rows.
    expect(actions.count).toBe(5);
  });
});

describe("the trade sheet", () => {
  const ox = explorerActions(["music-box", "lucky-stone"], panel).trades[0];

  it("offers your cards to give and theirs to take, one each way at most", () => {
    expect(tradeSides(ox)).toEqual({ gives: ["music-box", "lucky-stone"], takes: ["rabbits-foot"] });
    expect(tradeOffer(ox, "music-box", "rabbits-foot")?.label).toBe("Offer Ox Bellows your Music Box for their Rabbit's Foot");
    expect(tradeOffer(ox, null, "rabbits-foot")?.label).toBe("Ask Ox Bellows for their Rabbit's Foot");
    expect(tradeOffer(ox, null, null)).toBeNull();
  });
});

describe("boxActions", () => {
  it("keeps every other action as it is, and every trade with one explorer behind one button", () => {
    const entries = boxActions(panel);
    expect(entries.filter((entry) => entry.kind === "trade").map((entry) => entry.row.with)).toEqual(["ox-bellows", "father-rhinehardt"]);
    expect(entries.flatMap((entry) => (entry.kind === "choice" ? [entry.choice.label] : []))).toEqual(["Open the Music Box", "Drop the Music Box", "Drop the Lucky Stone"]);
  });
});
