import { describe, expect, it } from "vitest";
import { viewFor, type GameView } from "../engine/view";
import { ENGINE } from "../game";
import { choose, offered, pendingDecision, testGame } from "../testing";
import type { GameState } from "../types";
import { damageTracks, splitOf } from "./damage";
import { rerollCards, rerollChoice, rollMeaning, rollOffers, rollShown, type RollParams } from "./dice";

/** Zoe, holding the Lucky Stone and the Skull, explores into the Game Room
 *  and draws Skeletons: a die of mental damage, which the Stone can reroll. */
function skeletons(): GameState {
  let state = testGame({ seed: "dice-box", stack: ["game-room"], decks: { event: ["skeletons"] }, explorers: [{ seat: 0, cards: ["lucky-stone", "skull"] }] });
  state = choose(state, "Explore through the north door");
  return choose(state, "turned 0°");
}

const zoe = (state: GameState): GameView => viewFor(ENGINE, state, 0);

describe("a roll in the box", () => {
  it("shows the dice, the total and the damage it deals, and rerolls the dice picked", () => {
    const state = skeletons();
    const decision = pendingDecision(state);
    expect(decision.kind).toBe("roll-after");
    const view = zoe(state);
    const params = decision.params as unknown as RollParams;
    const shown = rollShown(view, params, true);
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

  it("shows a roll's table from the engine: each row's odds before it, and the row it landed on after", () => {
    // Zoe, holding the Angel Feather, draws Creepy Crawlies: a Sanity roll of 5+, 1–4 or 0, she may act on first.
    let state = testGame({ stack: ["game-room"], decks: { event: ["creepy-crawlies"] }, explorers: [{ seat: 0, cards: ["angel-feather"] }] });
    state = choose(choose(state, "Explore through the north door"), "turned 0°");
    const decision = pendingDecision(state);
    expect(decision.kind).toBe("roll-before");
    const params = decision.params as unknown as RollParams;
    const before = rollShown(zoe(state), params, false);
    expect(before.table?.rows.map((row) => [row.min, row.max, row.outcome])).toEqual([
      [5, null, [{ kind: "gain", trait: "sanity", amount: 1 }]],
      [1, 4, [{ kind: "gain", trait: "sanity", amount: -1 }]],
      [0, 0, [{ kind: "gain", trait: "sanity", amount: -2 }]],
    ]);
    expect(before.table?.lit).toBeNull();
    expect(before.table?.odds.reduce((sum, odds) => sum + odds, 0)).toBeCloseTo(1, 12);
    expect(before.target).toBeNull();
    const after = rollShown(zoe(state), { ...params, dice: [2, 2, 1] }, true);
    expect(after.table?.lit).toBe(0);
    expect(rollShown(zoe(state), { ...params, dice: [0, 0, 0] }, true).table?.lit).toBe(2);
  });

  it("sets the haunt roll against the omens, and a defence against the attack's total", () => {
    const view = { ...zoe(skeletons()), omensDrawn: 3 };
    const haunt = { spec: { kind: "haunt" }, rule: { source: "rulebook", page: 15 }, then: { kind: "haunt-check", params: {} } } as const;
    expect(rollMeaning(view, haunt, 2)).toMatchObject({ target: 3, verdict: "fail", note: "the haunt begins" });
    expect(rollMeaning(view, haunt, 3)).toMatchObject({ target: 3, verdict: "pass", note: "the haunt holds off" });
    const defence = { spec: { kind: "attack", trait: "might", role: "defender", card: null, dice: null }, rule: { source: "rulebook", page: 13 }, then: { kind: "attack-compare", params: { attackResult: 4 } } } as const;
    expect(rollMeaning(view, defence, 5)).toMatchObject({ target: 4, verdict: "pass" });
    expect(rollMeaning(view, defence, 4)).toMatchObject({ target: 4, verdict: null, note: "a tie: no one is hurt" });
  });
});

describe("cards offered before a roll", () => {
  it("make a card whose options differ only by a number one picker, and keep every other card one offer", () => {
    // Zoe, holding the Angel Feather and the Adrenaline Shot, draws Creepy Crawlies: a Sanity roll she may act on first.
    let state = testGame({ stack: ["game-room"], decks: { event: ["creepy-crawlies"] }, explorers: [{ seat: 0, cards: ["angel-feather", "adrenaline-shot"] }] });
    state = choose(choose(state, "Explore through the north door"), "turned 0°");
    expect(pendingDecision(state).kind).toBe("roll-before");
    const offers = rollOffers(offered(state));
    expect(offers.map((offer) => offer.card)).toEqual(["angel-feather", "adrenaline-shot"]);
    expect(offers[0].picks?.map((pick) => pick.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(offers[0].picks?.[3].choice.label).toBe("Use Angel Feather: the result is 3");
    expect(offers[1]).toMatchObject({ picks: null, choice: { label: "Use Adrenaline Shot" } });
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
