import { beforeAll, describe, expect, it } from "vitest";
import { loadRuleNotes, type RuleNotes } from "../data/rule-notes";
import { viewFor, type EventView, type GameView } from "../engine/view";
import { ENGINE } from "../game";
import { simulate } from "../simulation";
import { isRuleDriven, lineText, ruleName, ruleStatement, whyItems } from "./status";

/** Every write of a seeded game, as a spectator sees it, then as each seat does. */
function writes(seed: string, haunt?: number): GameView[] {
  const views: GameView[] = [];
  simulate(
    seed,
    ENGINE,
    (state) => views.push(...[null, ...state.seats.keys()].map((seat) => viewFor(ENGINE, state, seat))),
    { haunt, checks: false },
  );
  return views;
}

let notes: RuleNotes;
let game: GameView[];
let haunted: GameView[];
beforeAll(async () => {
  notes = await loadRuleNotes();
  game = writes("probe-1");
  haunted = writes("status-3", 13);
});

/** The first write with an event passing `test`, and that event. */
function first(views: GameView[], test: (event: EventView) => boolean): { view: GameView; event: EventView } {
  for (const view of views) {
    const event = view.events.find(test);
    if (event) return { view, event };
  }
  throw new Error("No write has such an event");
}

const roomRoll = (room: string) => (event: EventView) => event.type === "rolled" && event.rule.source === "room" && event.rule.room === room;

describe("isRuleDriven", () => {
  it("leaves out the rulebook's plain flow: turns, moves and discoveries", () => {
    for (const type of ["turn-started", "turn-ended", "entered", "discovered"]) {
      const { event } = first(game, (e) => e.type === type && e.rule.source === "rulebook");
      expect(isRuleDriven(event)).toBe(false);
    }
  });

  it("explains a room's, a card's and a haunt's rules, and the rulebook's beyond a plain move", () => {
    expect(isRuleDriven(first(game, (e) => e.rule.source === "room").event)).toBe(true);
    expect(isRuleDriven(first(game, (e) => e.rule.source === "card").event)).toBe(true);
    expect(isRuleDriven(first(haunted, (e) => e.rule.source === "haunt").event)).toBe(true);
    expect(isRuleDriven(first(game, (e) => e.type === "card-drawn" && e.rule.source === "rulebook").event)).toBe(true);
  });

  it("explains nothing a playtesting scenario set up", () => {
    expect(isRuleDriven({ type: "entered", rule: { source: "scenario" } })).toBe(false);
  });
});

describe("ruleStatement", () => {
  it("states a room's rule from its text, the room named", () => {
    const { event } = first(game, roomRoll("junk-room"));
    expect(ruleStatement(ENGINE, notes, event.rule, event)).toBe("Junk Room: Whenever you leave this room, you must try a Might roll of 3+.");
  });

  it("states a card's rule from its text, the card named", () => {
    const { event } = first(game, (e) => e.rule.source === "card" && e.rule.card === "the-voice");
    expect(ruleStatement(ENGINE, notes, event.rule, event)).toBe("The Voice: You must make a Knowledge roll.");
  });

  it("states a haunt's ruling by its resolution, and its own rules as the haunt's", () => {
    const ruled = first(haunted, (e) => e.rule.source === "haunt" && e.rule.ruling !== undefined && !e.rule.hiddenRuling).event;
    expect(ruleStatement(ENGINE, notes, ruled.rule, ruled)).toMatch(/^Haunt 13, [^:]+: [A-Z].+\.$/);
    const own = first(haunted, (e) => e.rule.source === "haunt" && e.rule.ruling === undefined).event;
    const statement = ruleStatement(ENGINE, notes, own.rule, own);
    expect(statement.startsWith("Haunt 13")).toBe(true);
    expect(statement.endsWith(": this haunt's own rule, in its half of the haunt book.")).toBe(true);
  });

  it("words the rulebook's rule for the event, with no page number", () => {
    const drawn = first(game, (e) => e.type === "card-drawn" && e.rule.source === "rulebook").event;
    expect(ruleStatement(ENGINE, notes, drawn.rule, drawn)).toBe("The first explorer to discover a room with a card symbol draws that card.");
    const forced = first(game, (e) => e.type === "forced" && (e.data as { kind: string }).kind === "rotation").event;
    expect(ruleStatement(ENGINE, notes, forced.rule, forced)).toBe("A room that fits only one way round goes in that way, with no question asked.");
  });

  it("names a rulebook rule by its page's sections, never the page", () => {
    expect(ruleName(ENGINE, notes, { source: "rulebook", page: 6 })).toBe("On Your Turn, Move, Discover a New Room");
    expect(ruleStatement(ENGINE, notes, { source: "rulebook", page: 6 }, { type: "stayed", data: {} })).toBe("On Your Turn, Move, Discover a New Room.");
  });
});

describe("lineText", () => {
  it("shows a roll's dice, total, and the row of its table it landed on", () => {
    const { view, event } = first(game, roomRoll("junk-room"));
    const { figure, dice, result } = event.data as { figure: string; dice: number[]; result: number };
    const beat = view.events.slice(view.events.indexOf(event), view.events.indexOf(event) + 2);
    expect(beat[1].type).toBe("table-row");
    const row = result >= 3 ? "3+: go on." : "0–2: lose 1 Speed and go on, or stop.";
    expect(lineText(ENGINE, view, event, beat)).toBe(`Junk Room: ${view.figures[figure].name}'s Might roll: ${dice.join(" + ")} = ${result}. ${row}`);
    // Told alone, without its beat, it is the dice and total.
    expect(lineText(ENGINE, view, event)).toBe(`Junk Room: ${view.figures[figure].name}'s Might roll: ${dice.join(" + ")} = ${result}.`);
  });
});

describe("whyItems", () => {
  it("gives each rule behind a beat once, named, and none for a plain move", () => {
    const { view } = first(game, roomRoll("junk-room"));
    const items = whyItems(ENGINE, notes, view.events, null);
    expect(items.map((item) => item.statement)).toContain("Junk Room: Whenever you leave this room, you must try a Might roll of 3+.");
    expect(items.find((item) => item.statement.startsWith("Junk Room"))?.name).toBe("Junk Room");
    expect(new Set(items.map((item) => item.statement)).size).toBe(items.length);
    const plain = first(game, (e) => e.type === "turn-started");
    expect(whyItems(ENGINE, notes, [plain.event], null)).toEqual([]);
  });
});
