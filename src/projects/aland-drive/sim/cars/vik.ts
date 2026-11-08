import { tuned, type CarEntry } from "./character";

/** A tiny open roadster on skinny tyres with a twin-carb four: light as a feather, quick to turn, happy to slide. */
export const vik: CarEntry = {
  tier: "C3",
  tuning: tuned({
    name: "Vik",
    class: "road",
    massKg: 900,
    outline: [3.95, 1.55, 1.12, 0.17],
    axleZ: [-1.15, 1.15],
    trackM: 1.355,
    wheelRadiusM: 0.3,
    massHeightM: 0.42,
    rideHz: 1.5,
    damping: 0.33,
    rollStiffness: 0.35,
    grip: [1.075, 1.1],
    peakSlip: 0.13,
    slideShare: 0.8,
    engine: {
      peakTorqueNm: 125,
      torqueCurve: [
        [0.15, 0.55],
        [0.4, 0.85],
        [0.7, 1],
        [0.88, 0.95],
        [1, 0.8],
      ],
      engineBrakeNm: 20,
    },
    gearbox: { idleRpm: 900, redlineRpm: 6800, gearTopMS: [14, 25, 36, 46, 56], shiftS: 0.15, gentleShift: 0.45 },
    launchMS2: 6,
    rearShare: 1,
    brakeMS2: 9.5,
    dragPerMS2: 0.52,
    aero: 0.6,
    lock: 0.62,
    turnPerS: 3.2,
  }),
};
