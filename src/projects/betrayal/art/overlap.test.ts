import { beforeAll, describe, expect, it, vi } from "vitest";
import { checkRoom } from "./overlap";
import type { Contact } from "./room";
import { BENCH_ROOMS } from "./rooms";
import { CHAPEL } from "./rooms/chapel";

/**
 * Overlaps the rooms had when the check arrived, which it reports but doesn't
 * fail on, so only new ones fail. The review pass empties it: each entry is
 * fixed, or declared as a contact on its piece with the reason.
 */
const BASELINE: Record<string, string[]> = {
  "drawing-room": [
    "fireplace at (-2.80, -1.60) passes into the left wall",
    "prop at (0.00, 0.00) z-fights with itself",
    "prop at (-0.45, -0.75) z-fights with itself",
    "prop at (-0.45, 0.75) z-fights with itself",
    "prop at (0.45, -0.75) z-fights with itself",
    "prop at (0.50, 0.80) z-fights with itself",
    "prop at (-1.50, 0.10) z-fights with itself",
  ],
  "chapel": [
    "chancel at (0.00, 2.12) passes into lectern at (-1.75, 2.00)",
    "crackedFont at (-2.20, -2.20) passes into prop at (-1.55, -2.00)",
    "stainedWindow at (0.00, 2.80) up 1.00 z-fights with the bottom wall",
    "altar at (0.00, 2.25) up 0.15 z-fights with itself",
    "lectern at (-1.75, 2.00) z-fights with itself",
    "pricket at (-2.55, -0.65) z-fights with itself",
    "pricket at (2.55, 0.25) z-fights with itself",
  ],
  "library": [
    "prop at (0.00, -2.80) up 0.45 passes into the right wall",
    "prop at (0.00, -2.80) up 0.45 passes into the left wall",
    "prop at (0.00, -2.80) up 0.45 passes into prop at (2.80, 0.00) up 0.45",
    "prop at (-2.80, -1.54) up 0.45 passes into prop at (0.00, -2.80) up 0.45",
    "prop at (1.75, 2.80) up 0.45 passes into prop at (2.80, 0.00) up 0.45",
    "prop at (2.80, -1.30) up 0.45 passes into prop at (2.80, 0.00) up 0.45",
    "fallenBookcase at (-1.50, 1.75) passes into prop at (-1.75, 2.80)",
    "prop at (-1.75, 2.80) up 0.45 passes into the left wall",
    "prop at (-1.75, 2.80) up 0.45 passes into prop at (-2.80, 1.54) up 0.45",
    "prop at (1.75, 2.80) up 0.45 passes into the right wall",
    "fallenBookcase at (-1.50, 1.75) passes into prop at (-2.80, 1.54)",
    "prop at (-0.12, -0.80) up 0.77 passes into prop at (0.25, -0.95) up 0.77",
    "fallenBookcase at (-1.50, 1.75) passes into the doorway left",
    "prop at (-0.75, 1.55) passes into the floor",
    "prop at (0.45, -1.85) z-fights with itself",
    "globe at (1.85, 1.00) z-fights with itself",
  ],
  "grand-staircase": [
    "newel at (1.24, -1.50) passes into prop at (0.00, 0.00)",
    "prop at (0.00, 0.00) passes into prop at (0.00, 0.00) up 1.57",
    "cupboardDoor at (-1.00, -1.43) passes into prop at (0.00, 0.00)",
    "newel at (1.24, -1.50) passes into prop at (0.00, 0.00) up 1.57",
    "prop at (0.00, 0.00) up 1.57 passes into the left wall",
    "prop at (0.00, 0.00) z-fights with prop at (0.00, 0.00) up 1.57",
  ],
  "foyer": [
    "deadPalm at (-2.25, 2.20) passes into the bottom wall",
    "shroudedMirror at (-1.65, -2.80) up 1.25 z-fights with itself",
  ],
  "entrance-hall": [
    "umbrellaStand at (2.35, 2.15) z-fights with itself",
  ],
  "upper-landing": [
    "stairHead at (0.00, 0.00) passes into the floor",
    "balustrade at (0.00, 0.00) passes into newel at (-0.79, -1.41)",
    "rockingChair at (1.30, 1.30) passes into the floor",
  ],
};

/*
 * Textures draw on a 2D canvas, which Node lacks. The check reads only
 * geometry, and a texture's pixels never change its shape (only its size
 * does, which the stand-in canvas keeps), so a canvas that draws nothing
 * builds every room headless.
 */
beforeAll(() => {
  const context = new Proxy(
    {},
    {
      get: (_, name) => (name === "getImageData" ? (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }) : () => undefined),
      set: () => true,
    },
  );
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      decode = () => Promise.resolve();
    },
  );
});

describe("room overlaps", () => {
  it("accepts a declared contact, and reports one that no longer happens", () => {
    const font = CHAPEL.props.find((prop) => prop.build.name === "crackedFont");
    if (!font) throw new Error("The Chapel has no font");
    const declared = (contacts: Contact[]) => checkRoom({ ...CHAPEL, props: CHAPEL.props.map((prop) => (prop === font ? { ...prop, contacts } : prop)) });
    const touching = declared([{ with: "prop", because: "the font has been shoved against the pew" }]);
    expect(touching.accepted.map((finding) => finding.key)).toEqual(["crackedFont at (-2.20, -2.20) passes into prop at (-1.55, -2.00)"]);
    expect(touching.unusedContacts).toEqual([]);
    expect(declared([{ with: "right", because: "nothing" }]).unusedContacts).toEqual(["crackedFont at (-2.20, -2.20) with right"]);
  });

  for (const room of BENCH_ROOMS) {
    it(`${room.id}: no piece passes into another, and no faces fight`, () => {
      const { findings, unusedContacts } = checkRoom(room);
      const known = new Set(BASELINE[room.id] ?? []);
      const baselined = findings.filter((finding) => known.has(finding.key));
      if (baselined.length) console.warn(`${room.id}, known overlaps for the review pass:\n  ${baselined.map((finding) => finding.text).join("\n  ")}`);
      expect(findings.filter((finding) => !known.has(finding.key)).map((finding) => finding.text), "new overlaps: fix them, or declare the contact on the piece").toEqual([]);
      expect([...known].filter((key) => !findings.some((finding) => finding.key === key)), "fixed: remove them from the baseline").toEqual([]);
      expect(unusedContacts, "declared contacts that no longer happen, or name nothing").toEqual([]);
    });
  }
});
