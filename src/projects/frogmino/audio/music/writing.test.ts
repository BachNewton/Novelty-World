import { describe, expect, it } from "vitest";
import { perBar, repeat, Scale, spread, transpose } from "./writing";

describe("writing themes", () => {
  it("spreads a line onto a coarser grid, keeping bar lines", () => {
    expect(spread("C5 . | E5 -", 2)).toBe("C5 . . . | E5 . - .");
  });

  it("writes a bar per chord", () => {
    expect(perBar(["C3", "G2"], (root, i) => `${root} ${String(i)}`)).toBe("C3 0 | G2 1");
  });

  it("repeats a bar", () => {
    expect(repeat("C5 . | x -", 2)).toBe("C5 . | x - | C5 . | x -");
  });

  it("transposes notes, keeping rests, releases, drum hits and how much quieter a note is", () => {
    expect(transpose("C5 . - x | Bb4.4", 3)).toBe("D#5 . - x | C#5.4");
    expect(transpose("C5", -13)).toBe("B3");
  });

  const eMinor = new Scale(["E", "F#", "G", "A", "B", "C", "D"]);

  it("mirrors a line about an axis along the scale", () => {
    expect(eMinor.mirror("E5 G5 B5 B4 C6", "G5")).toBe("B5 G5 E5 E6 D5");
  });

  it("shifts a line along the scale", () => {
    expect(eMinor.shift("E5 B5 C5", -2)).toBe("C5 G5 A4");
  });

  it("fails loudly on a note off the scale", () => {
    expect(() => eMinor.shift("F5", 1)).toThrow(/F5 is off the scale/);
  });
});
