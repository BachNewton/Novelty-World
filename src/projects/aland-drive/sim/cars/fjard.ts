import { tuned, type CarEntry } from "./character";

/** A long Nordic estate with a turbo five: a broad shove from low revs, grip from all four wheels on tyres made for gravel, calm at 240. */
export const fjard: CarEntry = {
  tier: "B2",
  tuning: tuned({
    name: "Fjärd",
    class: "rally",
    massKg: 1640,
    outline: [4.76, 1.82, 1.48, 0.2],
    axleZ: [-1.42, 1.38],
    trackM: 1.58,
    wheelRadiusM: 0.33,
    massHeightM: 0.55,
    rideHz: 1.35,
    damping: 0.38,
    rollStiffness: 0.42,
    grip: [1.24, 1.26],
    peakSlip: 0.14,
    slideShare: 0.82,
    engine: {
      peakTorqueNm: 360,
      torqueCurve: [
        [0.12, 0.6],
        [0.25, 0.95],
        [0.35, 1],
        [0.7, 1],
        [0.85, 0.9],
        [1, 0.72],
      ],
      engineBrakeNm: 45,
    },
    gearbox: { idleRpm: 800, redlineRpm: 6600, gearTopMS: [14, 25, 37, 50, 61, 73], shiftS: 0.13, gentleShift: 0.38 },
    launchMS2: 6,
    rearShare: 0.35,
    brakeMS2: 11,
    dragPerMS2: 0.53,
    aero: 1,
    lock: 0.6,
    turnPerS: 2.5,
  }),
};
