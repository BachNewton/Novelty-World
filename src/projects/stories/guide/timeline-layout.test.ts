import { describe, expect, it } from "vitest";
import { placeLabels, settled, yearOf, type LabelBox } from "./timeline-layout";

function crowd(count: number, spacing: number, height: number): LabelBox[] {
  return Array.from({ length: count }, (_, i) => ({ key: `l${i}`, want: 200 + i * spacing, height, rank: i % 3 }));
}

describe("placing labels", () => {
  it("never overlaps two labels, keeps date order, and stays within reach", () => {
    // reach is 56, or twice a label's height and the gap: 68 here.
    const boxes = crowd(40, 9, 30);
    const tops = placeLabels(boxes, 8, 56);
    const shown = boxes.filter((b) => tops.has(b.key)).map((b) => ({ ...b, top: tops.get(b.key) ?? 0 }));
    expect(shown.length).toBeGreaterThan(1);
    expect(shown.length).toBeLessThan(boxes.length);
    for (let i = 1; i < shown.length; i++) {
      expect(shown[i].top).toBeGreaterThanOrEqual(shown[i - 1].top + shown[i - 1].height + 8);
    }
    for (const b of shown) expect(Math.abs(b.top - (b.want - 15))).toBeLessThanOrEqual(68);
  });

  it("stacks two labels dated close together, however tall they are", () => {
    const tops = placeLabels([{ key: "a", want: 100, height: 60, rank: 0 }, { key: "b", want: 104, height: 60, rank: 0 }], 8, 20);
    expect([...tops.keys()].sort()).toEqual(["a", "b"]);
  });

  it("gives the higher-ranked label the room when two want the same spot", () => {
    const tops = placeLabels([{ key: "minor", want: 100, height: 30, rank: 3 }, { key: "chapter", want: 100, height: 30, rank: 0 }], 8, 10);
    expect(tops.get("chapter")).toBe(85);
    expect(tops.get("minor")).not.toBe(85);
  });
});

describe("dates", () => {
  it("puts a date known only to the year or month in its middle", () => {
    expect(yearOf("2030")).toBe(2030.5);
    expect(yearOf("2030-07")).toBeCloseTo(2030.54, 2);
    expect(yearOf("2030-01-01")).toBe(2030);
  });
});

it("drops the notes that say where a fact came from", () => {
  expect(settled("Ohio announces its first cases the same day (real)")).toBe("Ohio announces its first cases the same day");
  expect(settled("something fires on the complex (canon: the Borg); the camp blames the Coalition")).toBe("something fires on the complex; the camp blames the Coalition");
  expect(settled("Walt (aged 82) dies")).toBe("Walt (aged 82) dies");
});
