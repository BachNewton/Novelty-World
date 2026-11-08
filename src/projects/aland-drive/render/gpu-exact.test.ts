/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

const sources = import.meta.glob<string>(["../**/*.ts", "!../**/*.test.ts"], { query: "?raw", import: "default", eager: true });
const shaders = Object.entries(sources).filter(([, source]) => source.includes('from "three/tsl"'));

// fract(sin(x) * big) turns the last bit of x into noise, and GPUs differ in that bit: the sheep and facades sparkled on
// Nvidia and not on AMD. Shaders roll through the integer hash in `art/hash.ts` instead.
describe("shaders roll the same on every GPU", () => {
  it("finds the shaders", () => {
    expect(shaders.length).toBeGreaterThan(20);
  });

  it.each(shaders.map(([path, source]) => [path.slice(3), source]))("%s rolls no sine hash", (_, source) => {
    expect(source).not.toMatch(/fract\(\s*sin\(/);
  });

  // A whole number stored as a float reaches a pixel a hair under on Nvidia, and int() cuts it to the one below: the
  // walkers' pixels read each other's places by their slot and dissolved into dots. So it's rounded first.
  it.each(shaders.map(([path, source]) => [path.slice(3), source]))("%s cuts no attribute to an integer unrounded", (_, source) => {
    expect(source).not.toMatch(/\b(int|uint)\(\s*attribute\b/);
  });
});
