import { describe, expect, it } from "vitest";
import { cloudPixels } from "./cloud-noise";

const SIZE = 64;

describe("the clouds' texture", () => {
  const pixels = cloudPixels(SIZE);
  const read = (column: number, row: number, channel: number) => pixels[(((row + SIZE) % SIZE) * SIZE + ((column + SIZE) % SIZE)) * 4 + channel];

  it("steps across its seams no more than it does inside, so it tiles", () => {
    for (let channel = 0; channel < 4; channel++) {
      let inside = 0;
      let seam = 0;
      for (let along = 0; along < SIZE; along++) {
        seam = Math.max(seam, Math.abs(read(0, along, channel) - read(-1, along, channel)), Math.abs(read(along, 0, channel) - read(along, -1, channel)));
        for (let across = 1; across < SIZE; across++) inside = Math.max(inside, Math.abs(read(across, along, channel) - read(across - 1, along, channel)));
      }
      expect(seam).toBeLessThanOrEqual(inside);
    }
  });

  it("spreads each channel evenly, so a threshold is a share of the sky", () => {
    for (let channel = 0; channel < 4; channel++) {
      let over = 0;
      for (let at = 0; at < SIZE * SIZE; at++) if (pixels[at * 4 + channel] > 153) over++;
      expect(over / (SIZE * SIZE)).toBeCloseTo(0.4, 1);
    }
  });
});
