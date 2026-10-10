import { beforeAll, describe, expect, it } from "vitest";
import { loadRuleNotes, type RuleNotes } from "../data/rule-notes";
import { viewFor } from "../engine/view";
import { ENGINE } from "../game";
import { testGame } from "../testing";
import { playChoices } from "./choices";
import { lookahead } from "./lookahead";
import { costText, routeRooms, warningLines, type RoutePreview } from "./preview";

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
    const lines = warningLines(ENGINE, notes, previewOf({}, "doorway:foyer:top"));
    expect(lines).toEqual([
      "Rulebook, p. 10: The first explorer to discover a room with a card symbol draws that card.",
      "Rulebook, p. 6: Drawing a card ends your movement for the rest of the turn.",
    ]);
  });

  it("counts a barrier room's sides as one room to walk", () => {
    expect(routeRooms({ route: [{ room: "foyer", side: null }, { room: "chasm", side: "top" }, { room: "chasm", side: "bottom" }] })).toEqual(["foyer", "chasm"]);
  });
});
