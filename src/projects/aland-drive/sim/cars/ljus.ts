import { tuned, type CarEntry } from "./character";

/**
 * A small five-door with its turbo triple made hot: light and eager, quick to turn in and a little loose on a lift,
 * five short gears through a hand-shifted box, out of breath past 190, and the front tyres do everything. Smaller,
 * lighter and quicker to steer than Pil, with less grip and none of its shove.
 */
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
    rideHz: 1.55,
    damping: 0.4,
    rollStiffness: 0.5,
    grip: [1.21, 1.19],
    peakSlip: 0.12,
    slideShare: 0.82,
    engine: {
      peakTorqueNm: 200,
      torqueCurve: [
        [0.12, 0.55],
        [0.22, 0.9],
        [0.32, 1],
        [0.7, 1],
        [0.88, 0.88],
        [1, 0.74],
      ],
      engineBrakeNm: 22,
    },
    gearbox: { idleRpm: 850, redlineRpm: 6300, gearTopMS: [12, 21.5, 32, 44, 58], shiftS: 0.15, gentleShift: 0.4 },
    launchMS2: 5.4,
    rearShare: 0,
    brakeMS2: 11,
    dragPerMS2: 0.476,
    aero: 0.8,
    lock: 0.62,
    turnPerS: 3.3,
  }),
};
