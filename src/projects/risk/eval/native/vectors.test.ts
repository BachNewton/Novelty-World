import { describe, expect, it } from "vitest";
import { digest, fromWords, hex, hexes } from "./vectors";

describe("the vectors' float encoding", () => {
  it("writes a float as its bits, most significant first", () => {
    expect(hex(1)).toBe("3ff0000000000000");
    expect(hex(-0)).toBe("8000000000000000");
    expect(hex(Number.MIN_VALUE)).toBe("0000000000000001");
    expect(hex(-Infinity)).toBe("fff0000000000000");
    expect(hexes([2, 0.5])).toBe("40000000000000003fe0000000000000");
  });

  it("reads back what it writes, every bit", () => {
    for (const x of [0.1, -1e-310, 1.7976931348623157e308, Math.PI]) {
      const bits = hex(x);
      expect(fromWords(parseInt(bits.slice(0, 8), 16), parseInt(bits.slice(8), 16))).toBe(x);
    }
  });

  it("digests the bits, so a float that differs by one bit changes it", () => {
    expect(digest([1, 2])).toMatch(/^[0-9a-f]{16}$/);
    expect(digest([1, 2])).not.toBe(digest([1, fromWords(0x40000000, 1)]));
  });
});
