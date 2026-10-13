import { describe, expect, it } from "vitest";
import type { AimReading } from "../../art/house-scene";
import { reticleTarget, type ReticleWeighing, type Target } from "../../input/navigate";
import { aimStory } from "./aim-debug";

const SNAP = 72;
const square = (id: string, x: number, y: number, half = 24): Target => ({
  id,
  anchor: { x, y },
  outline: [
    { x: x - half, y: y - half },
    { x: x + half, y: y - half },
    { x: x + half, y: y + half },
    { x: x - half, y: y + half },
  ],
});

/** A reading as the scene takes it: the rule weighed with `focused` held, and again with nothing held. */
function reading(targets: Target[], centre: { x: number; y: number }, focused: string | null): AimReading {
  const weighed: ReticleWeighing[] = [];
  const picked = reticleTarget(targets, centre, { snap: SNAP, held: focused }, (weighing) => weighed.push(weighing));
  const fresh = reticleTarget(targets, centre, { snap: SNAP, held: null });
  return { active: true, centre, snap: SNAP, weighed, fresh: fresh?.id ?? null, picked: picked?.id ?? null, focused, pinned: null, dismissed: null };
}

const nameOf = (id: string) => id[0].toUpperCase() + id.slice(1);

describe("aimStory", () => {
  it("says what was caught, and how far into its area", () => {
    expect(aimStory(reading([square("kitchen", 140, 100)], { x: 100, y: 100 }, null), nameOf)).toBe("Caught Kitchen: 40 px into its 72 px area (score 0.56)");
  });

  it("says a held target is kept by its release ring once the centre is past its area", () => {
    expect(aimStory(reading([square("library", 190, 100)], { x: 100, y: 100 }, "library"), nameOf)).toBe(
      "Holding Library: centre past its 72 px area but inside its release ring (90 of 108 px)",
    );
  });

  it("says nothing is in reach, and how far the nearest is", () => {
    expect(aimStory(reading([square("crypt", 300, 100)], { x: 100, y: 100 }, null), nameOf)).toBe(
      "Nothing: no target within reach (nearest Crypt, 200 px from the centre, beyond its 72 px area)",
    );
  });

  it("is off without a controller", () => {
    expect(aimStory({ ...reading([], { x: 0, y: 0 }, null), active: false }, nameOf)).toMatch(/^Reticle off/);
  });
});
