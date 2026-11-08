import { describe, expect, it } from "vitest";
import { renderSound, type SoundDesign } from "./design";

describe("renderSound", () => {
  it("mixes each layer in at its offset", () => {
    const design: SoundDesign = {
      label: "test",
      trigger: "test",
      layers: [
        { at: 0, zzfx: { volume: 1 } },
        { at: 0.002, zzfx: { volume: 2 } },
      ],
      variation: { pitch: 0, volume: 0 },
      minGap: 0,
      busiestEvery: 0,
    };
    // A stand-in builder: three samples at the layer's volume.
    const mixed = renderSound(design, 1000, (params) => [params[0], params[0], params[0]]);
    expect([...mixed]).toEqual([1, 1, 3, 2, 2]);
  });
});
