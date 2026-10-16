import { describe, expect, it } from "vitest";
import type { GameEvent } from "../contract";
import { cardSymbol, describeEvents } from "./describe";

describe("describeEvents", () => {
  it("tells a run of battles between the same territories as one line, with its last dice", () => {
    const battle = (attackerLosses: number, defenderLosses: number): GameEvent => ({ kind: "battle", rule: "COMBAT-4", from: "brazil", to: "peru", attackerDice: [6, 3, 1], defenderDice: [5, 4], attackerLosses, defenderLosses });
    const lines = describeEvents([battle(1, 1), battle(0, 2), battle(2, 0), { kind: "captured", rule: "COMBAT-6", seat: 0, territory: "peru", from: 1 }]);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("Brazil attacked Peru 3 times: attacker lost 3, defender lost 3.");
    expect(lines[0].dice?.defender).toEqual([5, 4]);
    expect(lines[1]).toMatchObject({ text: "Crimson captured Peru from Cobalt." });
  });

  it("breaks reinforcements down by where they come from", () => {
    const [line] = describeEvents([{ kind: "reinforcements", rule: "REINF-2", seat: 2, fromTerritories: 4, fromContinents: [{ continent: "australia", bonus: 2 }], firstTurnBonus: 0 }]);
    expect(line.text).toBe("Ochre gets 6: 4 for territories + 2 for Australia.");
    const [first] = describeEvents([{ kind: "reinforcements", rule: "REINF-1", seat: 2, fromTerritories: 3, fromContinents: [], firstTurnBonus: 1 }]);
    expect(first.text).toBe("Ochre gets 4: 3 for territories + 1 for moving later.");
  });

  it("names a drawn card only where the event shows it", () => {
    expect(describeEvents([{ kind: "card-drawn", rule: "CARDS-1", seat: 0, card: "japan" }])[0].text).toBe("Crimson drew Japan (infantry).");
    expect(describeEvents([{ kind: "card-drawn", rule: "CARDS-1", seat: 0 }])[0].text).toBe("Crimson drew a card.");
  });

  it("tells a blitz as one line with its losses and no dice", () => {
    const [line] = describeEvents([{ kind: "blitzed", rule: "COMBAT-8", from: "brazil", to: "peru", attackerLosses: 2, defenderLosses: 5 }]);
    expect(line).toMatchObject({ text: "Brazil blitzed Peru: attacker lost 2, defender lost 5.", battle: { battles: 1, attackerLost: 2, defenderLost: 5 } });
    expect(line.dice).toBeUndefined();
  });

  it("leaves phase changes out", () => {
    expect(describeEvents([{ kind: "phase", rule: "TURN-1", phase: "attack" }])).toEqual([]);
  });

  it("reads wilds as wild", () => {
    expect(cardSymbol("wild-2")).toBe("wild");
    expect(cardSymbol("ural")).toBe("cavalry");
  });
});
