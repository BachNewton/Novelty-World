import { beforeAll, describe, expect, it } from "vitest";
import { loadRuleNotes, type RuleNotes } from "../data/rule-notes";
import { viewFor, type GameView } from "../engine/view";
import { ENGINE } from "../game";
import { choose, offered, pendingDecision, testGame } from "../testing";
import type { GameState } from "../types";
import { damageTracks, splitOf } from "./damage";
import { rerollCards, rerollChoice, rollMeaning, rollShown, type RollParams } from "./dice";

/** Zoe, holding the Lucky Stone and the Skull, explores into the Game Room
 *  and draws Skeletons: a die of mental damage, which the Stone can reroll. */
function skeletons(): GameState {
  let state = testGame({ seed: "dice", stack: ["game-room"], decks: { event: ["skeletons"] }, explorers: [{ seat: 0, cards: ["lucky-stone", "skull"] }] });
  state = choose(state, "Explore through the north door");
  return choose(state, "turned 0°");
}

const zoe = (state: GameState): GameView => viewFor(ENGINE, state, 0);

let notes: RuleNotes;
beforeAll(async () => {
  notes = await loadRuleNotes();
});

describe("a roll in the box", () => {
  it("shows the dice, the total and the damage it deals, and rerolls the dice picked", () => {
    const state = skeletons();
    const decision = pendingDecision(state);
    expect(decision.kind).toBe("roll-after");
    const view = zoe(state);
    const params = decision.params as unknown as RollParams;
    const shown = rollShown(view, notes, params, true);
    expect(shown.name).toBe("1-dice roll");
    expect(shown.dice).toHaveLength(1);
    expect(shown.damage).toEqual({ kind: "mental", amount: shown.total });

    const choices = offered(state);
    expect(rerollCards(choices)).toEqual(["lucky-stone"]);
    const die = params.dice[0];
    expect(rerollChoice(choices, "lucky-stone", [die])?.label).toBe(`Use Lucky Stone: reroll ${die}`);
    expect(rerollChoice(choices, "lucky-stone", [])).toBeNull();
    expect(rerollChoice(choices, "lucky-stone", [die, die])).toBeNull();
  });

  it("gives a trait roll's target before it, and whether it passed after", () => {
    const view = zoe(skeletons());
    const roll = { spec: { kind: "trait", trait: "might" }, rule: { source: "room", room: "junk-room" }, then: { kind: "x", params: {} } } as const;
    expect(rollMeaning(view, notes, roll, null)).toMatchObject({ target: 3, verdict: null });
    expect(rollMeaning(view, notes, roll, 3)).toMatchObject({ target: 3, verdict: "pass" });
    expect(rollMeaning(view, notes, roll, 2)).toMatchObject({ target: 3, verdict: "fail" });
  });

  it("sets the haunt roll against the omens, and a defence against the attack's total", () => {
    const view = { ...zoe(skeletons()), omensDrawn: 3 };
    const haunt = { spec: { kind: "haunt" }, rule: { source: "rulebook", page: 15 }, then: { kind: "haunt-check", params: {} } } as const;
    expect(rollMeaning(view, notes, haunt, 2)).toMatchObject({ target: 3, verdict: "fail", note: "the haunt begins" });
    expect(rollMeaning(view, notes, haunt, 3)).toMatchObject({ target: 3, verdict: "pass", note: "the haunt holds off" });
    const defence = { spec: { kind: "attack", trait: "might", role: "defender", card: null, dice: null }, rule: { source: "rulebook", page: 13 }, then: { kind: "attack-compare", params: { attackResult: 4 } } } as const;
    expect(rollMeaning(view, notes, defence, 5)).toMatchObject({ target: 4, verdict: "pass" });
    expect(rollMeaning(view, notes, defence, 4)).toMatchObject({ target: 4, verdict: null, note: "a tie: no one is hurt" });
  });
});

describe("damage on the tracks", () => {
  it("previews where each way of taking it would leave the clips", () => {
    let state = skeletons();
    state = choose(state, "Keep the result");
    // The seed rolls more than 0, so there is damage to take.
    const decision = pendingDecision(state);
    expect(decision.kind).toBe("damage-kind");
    state = choose(state, "mental damage");
    const view = zoe(state);
    const split = offered(state).find((choice) => choice.label.startsWith("Take 1 Sanity"));
    if (!split) throw new Error(`No split: ${offered(state).map((c) => c.label).join(" | ")}`);
    const [sanity, knowledge] = damageTracks(ENGINE, view, "zoe-ingstrom", "mental", splitOf(split.choice));
    expect([sanity.trait, knowledge.trait]).toEqual(["sanity", "knowledge"]);
    expect(sanity.lands).toBe(sanity.clip - 1);
    expect(sanity.values[sanity.clip]).toBe(view.figures["zoe-ingstrom"].traits.sanity);
  });
});
