import { describe, expect, it } from "vitest";
import { panOnFloor, stepFloor } from "./controls";

describe("panOnFloor", () => {
  const close = (got: { x: number; z: number }, x: number, z: number) => {
    expect(got.x).toBeCloseTo(x);
    expect(got.z).toBeCloseTo(z);
  };

  it("with the camera looking along -z, pushes up into the screen and right along +x", () => {
    close(panOnFloor(0, -1, 0), 0, -1);
    close(panOnFloor(1, 0, 0), 1, 0);
  });

  it("turns with the camera", () => {
    // From +x, looking along -x: up the screen is -x, and the screen's right is -z.
    close(panOnFloor(0, -1, Math.PI / 2), -1, 0);
    close(panOnFloor(1, 0, Math.PI / 2), 0, -1);
  });

  it("is always away from the camera for a push up", () => {
    for (const yaw of [0.3, 1.9, -2.4]) {
      const move = panOnFloor(0, -1, yaw);
      // The camera stands back along (sin yaw, cos yaw).
      expect(move.x * Math.sin(yaw) + move.z * Math.cos(yaw)).toBeCloseTo(-1);
    }
  });
});

describe("stepFloor", () => {
  const floors = ["basement", "ground", "upper"] as const;

  it("goes up and down a floor", () => {
    expect(stepFloor(floors, "ground", 1, "ground")).toBe("upper");
    expect(stepFloor(floors, "ground", -1, "ground")).toBe("basement");
  });

  it("stays at the top and the bottom", () => {
    expect(stepFloor(floors, "upper", 1, "ground")).toBe("upper");
    expect(stepFloor(floors, "basement", -1, "ground")).toBe("basement");
  });

  it("goes from every floor at once to the home floor", () => {
    expect(stepFloor(floors, "all", 1, "basement")).toBe("basement");
  });
});
