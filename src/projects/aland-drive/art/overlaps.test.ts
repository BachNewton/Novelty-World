import { BoxGeometry, BufferAttribute, type BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import { overlapsOf } from "./overlaps";

/** A box a metre long along +x, from x = 0, standing `base` metres off the ground, in one shade of paint. */
function block(base: number, shade: number): BufferGeometry {
  const box = new BoxGeometry(1, 0.5, 0.4).translate(0.5, base + 0.25, 0);
  box.setAttribute("tint", new BufferAttribute(new Float32Array(box.getAttribute("position").count).fill(shade), 1));
  return box;
}

describe("a placement's overlaps", () => {
  it("counts a base lying on the ground, and not one sunk into it", () => {
    expect(overlapsOf(block(0, 0.5), {}).onGround).toBeGreaterThan(0);
    expect(overlapsOf(block(-0.02, 0.5), {}).onGround).toBe(0);
  });

  it("counts nothing for what isn't stood on the ground", () => {
    expect(overlapsOf(block(0, 0.5), { onGround: false }).onGround).toBe(0);
  });

  it("counts sections that overlap their neighbour, and not ones that only meet it", () => {
    const shaded = [block(0.1, 0.2), block(0.1, 0.8)];
    expect(overlapsOf(shaded, { laid: { alongM: 0.8 } }).beside).toBeGreaterThan(0);
    expect(overlapsOf(shaded, { laid: {} }).beside).toBe(0);
  });
});
