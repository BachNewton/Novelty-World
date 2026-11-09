import { tuned, type CarEntry } from "./character";

/**
 * Fjäder's lightweight track car: barely a body round a supercharged two-litre four that screams to 8,800, behind
 * the seats, driving the rear wheels. It weighs less than any car here and carries a big wing, so it corners and
 * brakes harder than anything in its tier, steers quick and twitchy, and barely rolls; its drag and its small engine
 * make it the slowest of the tier at the top.
 */
export const span: CarEntry = {
  tier: "A3",
  maker: "Fjäder",
  engine: "Supercharged four",
  from: "harbour",
  tuning: tuned({
    name: "Spån",
    class: "sports",
    massKg: 640,
    outline: [3.78, 1.84, 1.12, 0.09],
    axleZ: [-1.38, 0.97],
    trackM: 1.56,
    wheelRadiusM: 0.31,
    massHeightM: 0.32,
    rideHz: 2.5,
    damping: 0.55,
    rollStiffness: 0.85,
    travelM: 0.16,
    grip: [1.7, 1.78],
    peakSlip: 0.1,
    slideShare: 0.72,
    handbrakeRearShare: 0.5,
    engine: {
      peakTorqueNm: 300,
      torqueCurve: [
        [0.12, 0.55],
        [0.35, 0.8],
        [0.6, 0.95],
        [0.78, 1],
        [0.92, 0.96],
        [1, 0.88],
      ],
      engineBrakeNm: 45,
    },
    gearbox: { idleRpm: 1100, redlineRpm: 8800, gearTopMS: [18, 29, 40, 51, 62, 74], shiftS: 0.06, gentleShift: 0.45 },
    launchMS2: 9.2,
    rearShare: 1,
    brakeMS2: 16,
    dragPerMS2: 0.6,
    aero: 1.6,
    lock: 0.6,
    turnPerS: 3.8,
  }),
};
