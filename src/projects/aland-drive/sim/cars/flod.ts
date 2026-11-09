import { tuned, type CarEntry } from "./character";

/**
 * Valtor's super-estate: a twin-turbo V8 under the hood of a long five-door estate, all four wheels driven. A wall of
 * torque and launch control make it as quick off the line as a supercar and it will sit at 290 km/h with the family
 * aboard, soft and planted; but it carries two tonnes, high, so it leans in a tight bend and runs wide before the
 * tail moves.
 */
export const flod: CarEntry = {
  tier: "A4",
  maker: "Valtor",
  engine: "Twin-turbo V8",
  from: "harbour",
  tuning: tuned({
    name: "Flod",
    class: "sports",
    massKg: 2150,
    outline: [5.02, 1.98, 1.47, 0.14],
    axleZ: [-1.45, 1.55],
    trackM: 1.68,
    wheelRadiusM: 0.36,
    massHeightM: 0.55,
    rideHz: 1.5,
    damping: 0.46,
    rollStiffness: 0.45,
    travelM: 0.3,
    grip: [1.38, 1.52],
    peakSlip: 0.11,
    slideShare: 0.82,
    handbrakeRearShare: 0.36,
    engine: {
      peakTorqueNm: 800,
      torqueCurve: [
        [0.12, 0.6],
        [0.24, 0.95],
        [0.3, 1],
        [0.7, 1],
        [0.85, 0.9],
        [1, 0.76],
      ],
      engineBrakeNm: 75,
    },
    gearbox: { idleRpm: 700, redlineRpm: 6800, gearTopMS: [19, 31, 43, 54, 64, 73, 80, 86], shiftS: 0.08, gentleShift: 0.34 },
    launchMS2: 7.65,
    rearShare: 0.6,
    brakeMS2: 13,
    dragPerMS2: 0.775,
    aero: 1,
    lock: 0.55,
    turnPerS: 2.4,
  }),
};
