import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { flip } from "./flip";

/*
 * `flip-reference.bin` is a 32×32 crop of a cyclist's near and far versions in linear RGB, and the error NVIDIA's
 * own package (`flip-evaluator`, LDR, 53 pixels a degree) gives it, as little-endian floats one after another.
 */
test("the port gives NVIDIA's FLIP error at every pixel", () => {
  const bytes = readFileSync(path.resolve(__dirname, "flip-reference.bin"));
  const floats = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const side = 32;
  const pixels = side * side;
  const [near, far, theirs] = [floats.subarray(0, pixels * 3), floats.subarray(pixels * 3, pixels * 6), floats.subarray(pixels * 6)];
  const ours = flip({ width: side, height: side, rgb: near }, { width: side, height: side, rgb: far }, 53);
  const worst = ours.reduce((most, value, at) => Math.max(most, Math.abs(value - theirs[at])), 0);
  expect(worst).toBeLessThan(1e-4);
});
