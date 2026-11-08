import { tuned, type CarEntry } from "./character";

/** A long black saloon with a V12 and eight gears: silk at a cruise, a wall of pull flat out, heavy and planted. */
export const ankar: CarEntry = {
  tier: "A5",
  tuning: tuned({
    name: "Ankar",
    class: "sports",
    massKg: 2080,
    outline: [5.1, 1.92, 1.46, 0.19],
    axleZ: [-1.525, 1.525],
    trackM: 1.645,
    wheelRadiusM: 0.35,
    massHeightM: 0.55,
    rideHz: 1.25,
    damping: 0.42,
    rollStiffness: 0.45,
    grip: [1.275, 1.3],
    peakSlip: 0.14,
    slideShare: 0.8,
    engine: {
      peakTorqueNm: 580,
      torqueCurve: [
        [0.12, 0.6],
        [0.3, 0.88],
        [0.5, 1],
        [0.75, 0.97],
        [0.9, 0.88],
        [1, 0.78],
      ],
      engineBrakeNm: 60,
    },
    gearbox: { idleRpm: 650, redlineRpm: 7000, gearTopMS: [13, 21, 30, 40, 51, 62, 74, 88], shiftS: 0.09, gentleShift: 0.38 },
    launchMS2: 6,
    rearShare: 1,
    brakeMS2: 11.5,
    dragPerMS2: 0.56,
    aero: 0.9,
    lock: 0.58,
    turnPerS: 2.3,
  }),
};
