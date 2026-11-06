import { describe, expect, it } from "vitest";
import { CAR_CLASSES, GROUND_GRIP, SURFACES, type Condition } from "./surfaces";

/*
 * The tyres' order is the decision the whole winter rests on: the player has to
 * be able to feel that changing tyres was worth it, and never be stuck for not
 * having. Every class on every surface, so a number typed into one row can't
 * quietly turn the order over.
 */

const everywhere = CAR_CLASSES.flatMap((carClass) => SURFACES.map((surface) => ({ carClass, surface })));
const gripOf = (carClass: (typeof CAR_CLASSES)[number], surface: (typeof SURFACES)[number], condition: Condition) => {
  const { summer, winter, studded } = GROUND_GRIP[carClass];
  return { summer: summer[condition][surface], winter: winter[condition][surface], studded: studded[condition][surface] };
};

describe("the tyres", () => {
  it.each(everywhere)("on ice: studs grip best and summer tyres worst, for a $carClass car on $surface", ({ carClass, surface }) => {
    const { summer, winter, studded } = gripOf(carClass, surface, "ice");
    expect(studded.grip).toBeGreaterThan(winter.grip);
    expect(winter.grip).toBeGreaterThan(summer.grip);
  });

  it.each(everywhere)("in snow: both winter tyres beat summer ones, for a $carClass car on $surface", ({ carClass, surface }) => {
    const { summer, winter, studded } = gripOf(carClass, surface, "snow");
    expect(winter.grip).toBeGreaterThan(summer.grip);
    expect(studded.grip).toBeGreaterThan(summer.grip);
  });

  it.each(everywhere)("on summer tyres in winter: clearly worse and looser, not stuck, for a $carClass car on $surface", ({ carClass, surface }) => {
    for (const condition of ["snow", "ice"] as const) {
      const { summer, winter } = gripOf(carClass, surface, condition);
      expect(summer.grip / winter.grip).toBeLessThan(0.8);
      expect(summer.grip / winter.grip).toBeGreaterThan(0.5);
      expect(summer.holdOn).toBeLessThan(winter.holdOn);
    }
  });

  it.each(everywhere)("on a bare road: summer tyres beat winter ones and winter ones beat studs, for a $carClass car on $surface", ({ carClass, surface }) => {
    for (const condition of ["dry", "wet"] as const) {
      const { summer, winter, studded } = gripOf(carClass, surface, condition);
      expect(summer.grip).toBeGreaterThan(winter.grip);
      expect(winter.grip).toBeGreaterThan(studded.grip);
    }
  });

  it.each(CAR_CLASSES)("leave a %s car on summer tyres on dry asphalt exactly as tuned", (carClass) => {
    expect(GROUND_GRIP[carClass].summer.dry.asphalt).toEqual({ grip: 1, peakSlip: 1, holdOn: 0, rolling: 0, rollingPerMS: 0 });
  });

  it("keep a sports car on studs worse in snow than the rally car on studs", () => {
    expect(GROUND_GRIP.sports.studded.snow.gravel.grip).toBeLessThan(GROUND_GRIP.rally.studded.snow.gravel.grip);
  });
});
