import { tuned, type CarEntry } from "./character";

/**
 * Tärna's mid-engined sports car, Virvel's smaller sibling: a free-breathing flat six behind the seats that wails to
 * 9,000, all of it through the rear wheels. Short, light and low, with fronts that grip nearly as hard as the rears,
 * it turns in the moment it's asked and rotates when the throttle lifts, and its tyres let go slowly enough to be
 * played with: the driver's car of its tier rather than the fastest in a straight line.
 */
export const strimma: CarEntry = {
  tier: "A3",
  tuning: tuned({
    name: "Strimma",
    class: "sports",
    massKg: 1330,
    outline: [4.2, 1.9, 1.16, 0.12],
    axleZ: [-1.3, 1.18],
    trackM: 1.6,
    wheelRadiusM: 0.335,
    massHeightM: 0.41,
    rideHz: 2.0,
    damping: 0.5,
    rollStiffness: 0.58,
    travelM: 0.24,
    grip: [1.62, 1.63],
    peakSlip: 0.11,
    slideShare: 0.87,
    handbrakeRearShare: 0.55,
    engine: {
      peakTorqueNm: 470,
      torqueCurve: [
        [0.12, 0.55],
        [0.35, 0.8],
        [0.6, 0.94],
        [0.78, 1],
        [0.9, 0.98],
        [1, 0.88],
      ],
      engineBrakeNm: 100,
    },
    gearbox: { idleRpm: 1000, redlineRpm: 9000, gearTopMS: [23, 37, 51, 64, 76, 87, 96], shiftS: 0.06, gentleShift: 0.45 },
    launchMS2: 9.0,
    rearShare: 1,
    brakeMS2: 14,
    dragPerMS2: 0.56,
    aero: 1.4,
    lock: 0.6,
    turnPerS: 3.4,
  }),
};
