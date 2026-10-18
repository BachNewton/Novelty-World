import { describe, expect, it } from "vitest";
import { headingTo, talkView } from "./talk-camera";

describe("the camera in conversation", () => {
  const elliott = { x: 0, y: 10, z: 0 };
  const face = { x: 0, y: 11.35, z: 2 };

  it("looks from Elliott's eyes at the person, aiming a little below the face so it sits above the panel", () => {
    const { eye, look } = talkView("first", elliott, face, 1.4);
    expect(eye).toEqual({ x: 0, y: 11.4, z: 0 });
    expect(look.z).toBe(2);
    expect(look.y).toBeLessThan(face.y);
  });

  it("from behind, sits back over Elliott's right shoulder and looks most of the way to the person", () => {
    const { eye, look } = talkView("third", elliott, face, 1.4);
    expect(eye.z).toBeLessThan(0);
    // Facing +z, Elliott's right is -x.
    expect(eye.x).toBeLessThan(0);
    expect(look.z).toBeCloseTo(1.4);
  });

  it("turns Elliott to face the person as the walker's heading does", () => {
    expect(headingTo({ x: 0, z: 0 }, { x: 0, z: 5 })).toBe(0);
    expect(headingTo({ x: 0, z: 0 }, { x: 5, z: 0 })).toBeCloseTo(Math.PI / 2);
  });
});
