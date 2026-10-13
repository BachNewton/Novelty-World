import { beforeAll, describe, expect, it } from "vitest";
import { loadRuleNotes, type RuleNotes } from "../data/rule-notes";
import { viewFor } from "../engine/view";
import { ENGINE } from "../game";
import { testGame } from "../testing";
import { playChoices } from "./choices";
import { lookahead } from "./lookahead";
import { chanceAtLeast, costText, percentText, routeRooms, throughText, warningLines, type RoutePreview } from "./preview";

let notes: RuleNotes;
beforeAll(async () => {
  notes = await loadRuleNotes();
});

/** The preview of a target, as the play screen offers it to seat 0. */
function previewOf(options: Parameters<typeof testGame>[0], id: string): RoutePreview {
  const state = testGame(options);
  const target = playChoices(viewFor(ENGINE, state, 0), lookahead(ENGINE, state, 0)).targets.find((t) => t.id === id);
  if (!target?.preview) throw new Error(`No preview for ${id}`);
  return target.preview;
}

describe("the route preview", () => {
  it("is one small plain value: the target, who walks, the route, its cost and its warnings", () => {
    const preview = previewOf({}, "room:upper-landing");
    expect(JSON.parse(JSON.stringify(preview))).toEqual(preview);
    expect(Object.keys(preview).sort()).toEqual(["figure", "left", "route", "spaces", "target", "warnings"]);
    expect(preview).toMatchObject({ target: "room:upper-landing", figure: "zoe-ingstrom", spaces: 3, left: 4, warnings: [] });
    expect(routeRooms(preview)).toEqual(["entrance-hall", "foyer", "grand-staircase", "upper-landing"]);
  });

  it("words its cost as spaces of the movement left", () => {
    expect(costText({ spaces: 3, left: 4 })).toBe("3 of 4 spaces");
    expect(costText({ spaces: 1, left: 1 })).toBe("1 of 1 space");
  });

  it("words each rule a route sets off once, from the rule's own text with its source named", () => {
    const preview = previewOf({ rooms: ["junk-room"], explorers: [{ seat: 0, room: "foyer" }] }, "room:junk-room");
    const lines = warningLines(ENGINE, notes, preview);
    expect(lines).toHaveLength(new Set(lines).size);
    expect(lines.some((line) => line.startsWith("Junk Room: ") && line.includes("Might roll"))).toBe(true);
  });

  it("warns that exploring may draw a card and end the move", () => {
    const lines = warningLines(ENGINE, notes, previewOf({}, "explore:ground:1:-1"));
    expect(lines).toEqual([
      "The first explorer to discover a room with a card symbol draws that card.",
      "Drawing a card ends your movement for the rest of the turn.",
    ]);
  });

  it("counts a barrier room's sides as one room to walk", () => {
    expect(routeRooms({ route: [{ room: "foyer", side: null }, { room: "chasm", side: "top" }, { room: "chasm", side: "bottom" }] })).toEqual(["foyer", "chasm"]);
  });
});

describe("going through a connection", () => {
  it("names the connection and the roll it takes", () => {
    expect(throughText({ token: "wall-switch", roll: { trait: "knowledge", dice: 3, min: 3 } })).toBe("Wall Switch: Knowledge roll 3+");
    expect(throughText({ token: "wall-switch", roll: null })).toBe("Wall Switch: no roll");
  });

  it("works out the exact odds of a total, each die showing 0, 1 or 2 alike", () => {
    expect(chanceAtLeast(1, 1)).toBeCloseTo(2 / 3);
    // Two dice make 0 to 4 in 1, 2, 3, 2 and 1 ways of 9.
    expect(chanceAtLeast(2, 3)).toBeCloseTo(3 / 9);
    expect(chanceAtLeast(0, 1)).toBe(0);
    expect(chanceAtLeast(0, 0)).toBe(1);
    expect(chanceAtLeast(2, 5)).toBe(0);
  });

  it("shows a chance as a whole percent, never 0% or 100% while it can go either way", () => {
    expect([percentText(0), percentText(1 / 3), percentText(0.001), percentText(0.999), percentText(1)]).toEqual(["0%", "33%", "1%", "99%", "100%"]);
  });
});
