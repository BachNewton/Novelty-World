import { describe, expect, it } from "vitest";
import type { GameEvent } from "../contract";
import { describeEvents } from "./describe";

describe("describeEvents", () => {
  it("tells a run of battles between the same territories as one line, with its last dice", () => {
    const battle = (attackerLosses: number, defenderLosses: number): GameEvent => ({ kind: "battle", rule: "COMBAT-4", from: "brazil", to: "peru", attackerDice: [6, 3, 1], defenderDice: [5, 4], attackerLosses, defenderLosses });
    const lines = describeEvents([battle(1, 1), battle(0, 2), battle(2, 0), { kind: "captured", rule: "COMBAT-6", seat: 0, territory: "peru", from: 1 }]);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("Brazil attacked Peru 3 times: attacker lost 3, defender lost 3.");
    expect(lines[0].dice?.defender).toEqual([5, 4]);
    expect(lines[1]).toMatchObject({ text: "Crimson captured Peru from Cobalt." });
  });

  it("names a drawn card only where the event shows it", () => {
    expect(describeEvents([{ kind: "card-drawn", rule: "CARDS-1", seat: 0, card: "japan" }])[0].text).toBe("Crimson drew Japan (infantry).");
    expect(describeEvents([{ kind: "card-drawn", rule: "CARDS-1", seat: 0 }])[0].text).toBe("Crimson drew a card.");
  });
});
