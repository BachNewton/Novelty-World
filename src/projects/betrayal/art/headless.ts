import { vi } from "vitest";

/*
 * Textures draw on a 2D canvas, which Node lacks. The tests read geometry and
 * light, and a texture's pixels never change either (only its size does,
 * which the stand-in canvas keeps), so a canvas that draws nothing builds
 * every room headless.
 */
export function stubCanvas() {
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
}
