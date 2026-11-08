import { describe, expect, it } from "vitest";
import { curve } from "../curve";
import { CARS } from "../specs";
import { buildCockpit } from "./interior";

// A car session changes its shell and cabin; the cockpit follows from them, so these hold that it still fits: nothing
// of it pokes out through the body, the driver sees over the dash with room under the roof, and the wheel sits between
// the driver and the dash.

describe.each(CARS.map((spec) => [spec.name, spec] as const))("%s's cockpit", (_, spec) => {
  const parts = buildCockpit(spec);
  const { frame } = parts;
  const halfWidth = curve(spec.body.halfWidth);
  const lowestSill = Math.min(...spec.body.sill.map(([, h]) => h));

  // The shell's own inner skin is inside it by how it's made, and in an open car's opening the seats stand above its body.
  it("stays inside the body", () => {
    const out: string[] = [];
    const { positions, paintOf, paints } = parts.soup;
    for (let at = 0; at < positions.length; at += 3) {
      const [x, y, z] = [positions[at], positions[at + 1], positions[at + 2]];
      const h = y - frame.ground;
      const skin = paints[paintOf[at / 3]].token === frame.style.colours.headliner;
      // An open car's mirror hangs from its windscreen's frame, above the body just behind it.
      const fromScreen = frame.open && z < frame.header.z + 0.12;
      const inOpening = frame.opening !== null && z > frame.opening[0] && z < frame.opening[1];
      const tooHigh = !skin && !inOpening && !fromScreen && z > frame.header.z && h > frame.roofAt(x, z) + 0.005;
      if (Math.abs(x) > halfWidth(z) + spec.body.flareM + 0.005 || tooHigh || h < lowestSill) out.push(`${x.toFixed(3)}, ${h.toFixed(3)}, ${z.toFixed(3)}`);
    }
    expect(out.slice(0, 5)).toEqual([]);
  });

  it("seats the driver to see the road over the dash, under the roof", () => {
    const { eye, cowl, dash, open } = frame;
    expect(eye.h - dash.topH).toBeGreaterThan(0.18);
    expect(eye.h - cowl.h).toBeGreaterThan(0.2);
    if (!open) expect(frame.top(eye.z) - eye.h).toBeGreaterThan(0.1);
  });

  it("puts the wheel between the driver and the dash", () => {
    const { eye, dash, wheel } = frame;
    expect(eye.z - wheel.centre.z).toBeGreaterThan(0.35);
    expect(wheel.centre.z - dash.lowZ).toBeGreaterThan(0.05);
    expect(eye.h - wheel.centre.h).toBeGreaterThan(0.25);
  });
});
