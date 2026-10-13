import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { choose, offered, pendingDecision, testGame } from "../testing";
import type { GameState, Json, RuleRef } from "../types";
import { attack, beaten } from "./combat";
import { chooseOne, damage, drawCard, endMovement, gain, keepCard, loseCard, relocate, removeToken, roll, stayInRoom, step, table, tableOf } from "./effects";
import { taskResult } from "./haunt";
import { rowOutcome } from "./outcomes";
import { local } from "./sources";

const rule: RuleRef = { source: "card", card: "bloody-vision" };
const zoe = "zoe-ingstrom";

describe("a table row's outcome, read off its steps", () => {
  it("reads every typed step a table row runs", () => {
    expect(rowOutcome([gain(zoe, "sanity", -1, rule)], null)).toEqual([{ kind: "gain", trait: "sanity", amount: -1 }]);
    expect(rowOutcome([damage(zoe, "mental", { dice: 2 }, rule)], null)).toEqual([{ kind: "damage", damage: "mental", dice: 2, points: null }]);
    expect(rowOutcome([damage(zoe, "physical", { points: 4 }, rule)], null)).toEqual([{ kind: "damage", damage: "physical", dice: null, points: 4 }]);
    expect(rowOutcome([beaten("ox-bellows", zoe, 4, rule)], null)).toEqual([{ kind: "damage", damage: "physical", dice: null, points: 4 }]);
    expect(rowOutcome([drawCard(zoe, "item", rule)], null)).toEqual([{ kind: "draw", type: "item" }]);
    expect(rowOutcome([keepCard(zoe, "debris")], null)).toEqual([{ kind: "keep", card: "debris" }]);
    expect(rowOutcome([loseCard(zoe, "dark-dice", { to: "discard" }, rule)], null)).toEqual([{ kind: "lose", card: "dark-dice" }]);
    expect(rowOutcome([relocate(zoe, "entrance-hall", rule)], null)).toEqual([{ kind: "move", room: "entrance-hall" }]);
    expect(rowOutcome([step("cross-barrier", { figure: zoe })], null)).toEqual([{ kind: "move", room: null }]);
    expect(rowOutcome([endMovement(zoe, rule)], null)).toEqual([{ kind: "stop" }]);
    expect(rowOutcome([stayInRoom(zoe, rule)], null)).toEqual([{ kind: "stop" }]);
    expect(rowOutcome([roll(zoe, { kind: "dice", count: 3 }, rule, table([{ min: 0, max: null, steps: [] }]))], null)).toEqual([{ kind: "roll", spec: { kind: "dice", count: 3 } }]);
    expect(rowOutcome([attack({ kind: "figure", figure: zoe }, "ox-bellows", rule, null)], null)).toEqual([{ kind: "attack" }]);
    expect(rowOutcome([taskResult(zoe, "wake", { success: true, token: null }, rule)], null)).toEqual([{ kind: "pass" }]);
    expect(rowOutcome([taskResult(zoe, "wake", { success: false, token: null }, rule)], null)).toEqual([{ kind: "fail" }]);
    expect(rowOutcome([], null)).toEqual([]);
  });

  it("says nothing for bookkeeping behind another step", () => {
    expect(rowOutcome([drawCard(zoe, "event", rule), removeToken("closet", "attic", rule)], null)).toEqual([{ kind: "draw", type: "event" }]);
  });

  it("reads a choice of one trait to gain as a gain of a trait of your choice, and any other choice as its options", () => {
    const traits = (list: readonly ("might" | "speed" | "knowledge" | "sanity")[], amount: number) =>
      chooseOne(zoe, list.map((trait) => ({ label: trait, steps: [gain(zoe, trait, amount, rule)] })), rule);
    expect(rowOutcome([traits(["might", "speed"], 1)], null)).toEqual([{ kind: "gain", trait: "physical", amount: 1 }]);
    expect(rowOutcome([traits(["sanity", "knowledge"], 1)], null)).toEqual([{ kind: "gain", trait: "mental", amount: 1 }]);
    expect(rowOutcome([traits(["might", "speed", "knowledge", "sanity"], -1)], null)).toEqual([{ kind: "gain", trait: "choice", amount: -1 }]);
    const stayOrGo = chooseOne(zoe, [
      { label: "go", steps: [gain(zoe, "speed", -1, rule), step("leave-heard", { figure: zoe })] },
      { label: "stay", steps: [stayInRoom(zoe, rule)] },
    ], rule);
    expect(rowOutcome([stayOrGo], null)).toEqual([{ kind: "choice", options: [[{ kind: "gain", trait: "speed", amount: -1 }, { kind: "move", room: null }], [{ kind: "stop" }]] }]);
  });

  it("says the same outcome for several figures once, and twice for one figure", () => {
    expect(rowOutcome([damage(zoe, "mental", { dice: 1 }, rule), damage("ox-bellows", "mental", { dice: 1 }, rule)], null)).toHaveLength(1);
    expect(rowOutcome([drawCard(zoe, "item", rule), drawCard(zoe, "item", rule)], null)).toHaveLength(2);
  });

  it("fails loudly on a source's own step with nothing said for it, and reads what is said", () => {
    const own = local("bloody-vision", "attack", { figure: zoe });
    expect(() => rowOutcome([own], null)).toThrow(/bloody-vision:attack/);
    expect(() => table([{ min: 0, max: 1, steps: [own] }])).toThrow(/no note/);
    expect(rowOutcome([own], "attack")).toEqual([{ kind: "note", note: "attack" }]);
    expect(rowOutcome([own], [{ kind: "gain", trait: "physical", amount: 2 }])).toEqual([{ kind: "gain", trait: "physical", amount: 2 }]);
  });

  it("fails loudly on a step kind it can't read", () => {
    expect(() => rowOutcome([step("nonsense", null)], null)).toThrow(/nonsense/);
  });

  it("carries each row's outcome on the table, and gives it without the steps", () => {
    const rows = tableOf(table([{ min: 4, max: null, steps: [gain(zoe, "sanity", 1, rule)] }, { min: 0, max: 3, steps: [] }]));
    expect(rows).toEqual([
      { min: 4, max: null, outcome: [{ kind: "gain", trait: "sanity", amount: 1 }] },
      { min: 0, max: 3, outcome: [] },
    ]);
    expect(tableOf(step("damage-rolled", null))).toBeNull();
  });
});

/** The latest write's events of a type. */
const eventsOf = (state: GameState, type: string) => state.lastEvents.filter((event) => event.type === type);

describe("a roll's table, as events", () => {
  it("shows a roll made at once before its dice, with its table, then the row it landed on", () => {
    // Creepy Crawlies: a Sanity roll Zoe has no card to act on, made at once.
    let state = testGame({ stack: ["game-room"], decks: { event: ["creepy-crawlies"] } });
    state = choose(choose(state, "Explore through the north door"), "turned 0°");
    const types = state.lastEvents.map((event) => event.type);
    expect(types.indexOf("roll-coming")).toBeLessThan(types.indexOf("rolled"));
    expect(types.indexOf("table-row")).toBe(types.indexOf("rolled") + 1);
    const [coming] = eventsOf(state, "roll-coming");
    const data = coming.data as { figure: string; spec: Json; pool: number; bonus: number; rows: { min: number }[] };
    expect(data).toMatchObject({ figure: zoe, spec: { kind: "trait", trait: "sanity" }, bonus: 0 });
    expect(data.rows.map((row) => row.min)).toEqual([5, 1, 0]);
    const [rolled] = eventsOf(state, "rolled");
    const [row] = eventsOf(state, "table-row");
    const { result } = rolled.data as { result: number };
    const { index, rows } = row.data as { index: number; rows: { min: number; max: number | null }[] };
    expect(result >= rows[index].min && (rows[index].max === null || result <= rows[index].max)).toBe(true);
    expect(coming.rule).toEqual({ source: "card", card: "creepy-crawlies" });
  });

  it("shows no roll coming for a roll its roller decides about first: the decision shows its table", () => {
    let state = testGame({ stack: ["game-room"], decks: { event: ["creepy-crawlies"] }, explorers: [{ seat: 0, cards: ["angel-feather"] }] });
    state = choose(choose(state, "Explore through the north door"), "turned 0°");
    expect(pendingDecision(state).kind).toBe("roll-before");
    expect(eventsOf(state, "roll-coming")).toEqual([]);
    expect(offered(state).length).toBeGreaterThan(1);
  });

  it("says a roll with no table is coming, with no rows", () => {
    // Skeletons: a die of mental damage.
    let state = testGame({ stack: ["game-room"], decks: { event: ["skeletons"] } });
    state = choose(choose(state, "Explore through the north door"), "turned 0°");
    const comings = eventsOf(state, "roll-coming").map((event) => (event.data as { rows: unknown }).rows);
    expect(comings).toContain(null);
    expect(eventsOf(state, "table-row")).toEqual([]);
  });
});

/** Every rule of the base game a roll's table can come from: drawn event and omen cards, played with the first choice offered until the turn is back. */
describe("every base-game table row has an outcome", () => {
  const drawn = Object.entries(ENGINE.catalog.cards).filter(([, card]) => card.set === "base" && card.type !== "item").map(([id]) => id);

  it.each(drawn)("%s", (card) => {
    const type = ENGINE.catalog.cards[card].type;
    // The Game Room has an event symbol, the Abandoned Room an omen's.
    let state = testGame({ stack: [type === "event" ? "game-room" : "abandoned-room"], decks: { [type]: [card] } });
    const rowsOf = (event: { type: string; data: Json }) => (event.type === "roll-coming" || event.type === "table-row" ? ((event.data as { rows: { outcome: unknown }[] | null }).rows ?? []) : []);
    let label = "Explore through the north door";
    for (let i = 0; i < 40; i++) {
      state = choose(state, label);
      for (const row of state.lastEvents.flatMap(rowsOf)) expect(Array.isArray(row.outcome)).toBe(true);
      if (state.pending?.type !== "decision" || state.pending.kind === "turn") break;
      label = offered(state)[0].label;
    }
  });
});
