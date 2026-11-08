import { tuned, type CarEntry } from "./character";

/** A small five-door with a turbo triple: light, eager, out of breath past 180, and the front tyres do everything. */
export const ljus: CarEntry = {
  tier: "A7",
  tuning: tuned({
    name: "Ljus",
    class: "road",
    massKg: 1080,
    outline: [3.92, 1.72, 1.5, 0.2],
    axleZ: [-1.23, 1.23],
    trackM: 1.5,
    wheelRadiusM: 0.31,
    massHeightM: 0.52,
    rideHz: 1.45,
    damping: 0.38,
    rollStiffness: 0.4,
    grip: [1.175, 1.2],
    peakSlip: 0.12,
    slideShare: 0.82,
    engine: {
      peakTorqueNm: 170,
      torqueCurve: [
        [0.12, 0.55],
        [0.25, 0.95],
        [0.45, 1],
        [0.75, 0.92],
        [1, 0.7],
      ],
      engineBrakeNm: 22,
    },
    gearbox: { idleRpm: 850, redlineRpm: 6300, gearTopMS: [12, 22, 33, 45, 57], shiftS: 0.16, gentleShift: 0.4 },
    launchMS2: 5.5,
    rearShare: 0,
    brakeMS2: 10.5,
    dragPerMS2: 0.5,
    aero: 0.8,
    lock: 0.62,
    turnPerS: 3,
  }),
};
