import { tuned, type CarEntry } from "./character";

/**
 * Valtor's grand-sport coupé: a twin-turbo V8 set back behind the front axle, all four wheels driven and a 2+2 cabin.
 * Heavier than the other A2 cars and softer, with a wall of torque from low revs, so it launches without drama and
 * finds grip everywhere: the easiest car in its tier to drive fast, which understeers gently when pushed past it.
 */
export const orkan: CarEntry = {
  tier: "A2",
  maker: "Valtor",
  engine: "Twin-turbo V8",
  from: "harbour",
  tuning: tuned({
    name: "Orkan",
    class: "sports",
    massKg: 1790,
    outline: [4.66, 1.98, 1.28, 0.13],
    axleZ: [-1.3, 1.42],
    trackM: 1.68,
    wheelRadiusM: 0.355,
    massHeightM: 0.47,
    rideHz: 1.8,
    damping: 0.52,
    rollStiffness: 0.7,
    travelM: 0.26,
    grip: [1.54, 1.66],
    peakSlip: 0.12,
    slideShare: 0.84,
    handbrakeRearShare: 0.38,
    engine: {
      peakTorqueNm: 860,
      torqueCurve: [
        [0.12, 0.62],
        [0.25, 0.96],
        [0.32, 1],
        [0.68, 1],
        [0.85, 0.9],
        [1, 0.76],
      ],
      engineBrakeNm: 70,
    },
    gearbox: { idleRpm: 750, redlineRpm: 7200, gearTopMS: [21, 34, 47, 59, 70, 80, 88, 94], shiftS: 0.06, gentleShift: 0.38 },
    launchMS2: 10.2,
    rearShare: 0.55,
    brakeMS2: 14,
    dragPerMS2: 0.66,
    aero: 1.7,
    lock: 0.56,
    turnPerS: 2.7,
  }),
};
