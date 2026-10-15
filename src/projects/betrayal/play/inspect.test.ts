import { describe, expect, it } from "vitest";
import notesJson from "../data/rule-notes.json";
import type { RuleNotes } from "../data/rule-notes";
import { viewFor } from "../engine/view";
import { ENGINE } from "../game";
import { pointAtFirst } from "@/shared/lib/input";
import { explorer, testGame } from "../testing";
import { bonusLines, figureLines, roomLines, showsPointingTag, thingLines } from "./inspect";

const NOTES = notesJson as RuleNotes;

describe("inspecting while the details are held", () => {
  it("expands a room effect, a token and a card on the floor to the first line of their rules' text", () => {
    expect(thingLines(NOTES, { token: "blessing", card: "a-moment-of-hope", things: ["b"] })).toEqual([NOTES.tokens.blessing.lines[0]]);
    expect(thingLines(NOTES, { token: "blessing", card: "a-moment-of-hope", things: ["b"] })[0]).toMatch(/extra die/);
    expect(thingLines(NOTES, { token: null, card: "revolver", things: ["r"] })).toEqual([NOTES.cards.revolver.lines[0]]);
    // A pile of the rest stands for several things: it has no one line.
    expect(thingLines(NOTES, { token: null, card: null, things: ["a", "b"] })).toEqual([]);
  });

  it("expands a room to its own rule, short, and a room without one to nothing", () => {
    expect(roomLines(NOTES, "tower")).toEqual([NOTES.rooms.tower.lines[0]]);
    expect(roomLines(NOTES, "foyer")).toEqual([]);
  });

  it("expands an explorer to what they hold", () => {
    const state = testGame();
    const zoe = explorer(state, 0);
    zoe.cards.push("revolver", "skull");
    const view = viewFor(ENGINE, state, null);
    expect(figureLines(ENGINE, view, zoe.id)).toEqual(["Holds the Revolver and the Skull"]);
    expect(figureLines(ENGINE, view, explorer(state, 1).id)).toEqual(["Holds no cards"]);
  });

  it("expands a room bonus badge to the room's rule and who has taken it", () => {
    const state = testGame();
    const token = ENGINE.catalog.figures[explorer(state, 0).definition].token ?? "";
    const before = viewFor(ENGINE, state, null);
    expect(bonusLines(ENGINE, before, NOTES, "gymnasium")).toEqual([NOTES.rooms.gymnasium.lines[0], "No one has taken it yet"]);
    state.tokens.push({ token, room: "gymnasium" });
    expect(bonusLines(ENGINE, viewFor(ENGINE, state, null), NOTES, "gymnasium")[1]).toBe("Taken by Zoe");
  });

  it("never shows the pointing tag while inspecting, whatever is pointed at", () => {
    expect(showsPointingTag({ showMarks: true, inspecting: false }, false)).toBe(true);
    expect(showsPointingTag({ showMarks: true, inspecting: true }, false)).toBe(false);
    expect(showsPointingTag({ showMarks: true, inspecting: false }, true)).toBe(false);
  });

  it("points at a thing or a figure before the room it is in", () => {
    const square = (x: number, y: number, r: number) => [
      { x: x - r, y: y - r },
      { x: x + r, y: y - r },
      { x: x + r, y: y + r },
      { x: x - r, y: y + r },
    ];
    const blessing = { id: "token:blessing:foyer:0", anchor: { x: 120, y: 120 }, outline: square(120, 120, 24) };
    const room = { id: "room:foyer", anchor: { x: 100, y: 100 }, outline: square(100, 100, 100) };
    expect(pointAtFirst([[blessing], [room]], { x: 125, y: 118 })).toBe(blessing.id);
    expect(pointAtFirst([[blessing], [room]], { x: 30, y: 30 })).toBe(room.id);
    expect(pointAtFirst([[blessing], [room]], { x: 400, y: 400 })).toBeNull();
  });
});
