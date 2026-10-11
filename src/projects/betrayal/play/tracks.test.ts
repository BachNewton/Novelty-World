import { describe, expect, it } from "vitest";
import { viewFor } from "../engine/view";
import { ENGINE } from "../game";
import { testGame } from "../testing";
import { figureTracks, landing, skullState, stepsAboveSkull, traitTrack } from "./tracks";

describe("a trait's track", () => {
  it("moves the clip a step per point, and never past the top", () => {
    expect(landing(8, 3, 2, "locked")).toBe(5);
    expect(landing(8, 3, -2, "live")).toBe(1);
    expect(landing(8, 6, 3, "live")).toBe(7);
  });

  it("stops a loss at the lowest step before the haunt: the skull is locked", () => {
    expect(landing(8, 1, -3, "locked")).toBe(0);
    expect(landing(8, 0, -1, "locked")).toBe(0);
  });

  it("takes a loss past the lowest step to the skull from the haunt on", () => {
    expect(landing(8, 1, -2, "live")).toBe("skull");
    expect(landing(8, 1, -1, "live")).toBe(0);
  });

  it("locks the skull only before the haunt", () => {
    expect(skullState("exploring")).toBe("locked");
    expect(skullState("haunt")).toBe("live");
    expect(skullState("finished")).toBe("live");
  });

  it("counts the losses left before the skull", () => {
    expect(stepsAboveSkull(0)).toBe(1);
    expect(stepsAboveSkull(4)).toBe(5);
  });

  it("shows a character's own printed values, the clip on its starting step", () => {
    const state = testGame({ seed: "tracks" });
    const view = viewFor(ENGINE, state, 0);
    const zoe = Object.values(view.figures).find((figure) => figure.definition === "zoe-ingstrom");
    if (!zoe) throw new Error("No Zoe in the test game");
    const sanity = figureTracks(ENGINE, view, zoe.id).find((track) => track.trait === "sanity");
    // Zoe's Sanity: 3 4 [5] 5 6 6 7 8 (content/characters.md).
    expect(sanity).toMatchObject({ values: [3, 4, 5, 5, 6, 6, 7, 8], start: 2, clip: 2, skull: "locked", lands: null, stopped: false });
  });

  it("previews a loss past the lowest step as stopped by the lock before the haunt, and as the skull after", () => {
    const view = viewFor(ENGINE, testGame({ seed: "tracks" }), 0);
    // Zoe's Sanity clip starts on its third step, so 3 losses pass the lowest.
    expect(traitTrack(ENGINE, view, "zoe-ingstrom", "sanity", -3)).toMatchObject({ lands: 0, stopped: true });
    expect(traitTrack(ENGINE, { ...view, status: "haunt" }, "zoe-ingstrom", "sanity", -3)).toMatchObject({ lands: "skull", stopped: false });
    expect(traitTrack(ENGINE, view, "zoe-ingstrom", "sanity", 9)).toMatchObject({ lands: 7, stopped: false });
  });
});
