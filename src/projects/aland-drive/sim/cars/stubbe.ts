import { tuned, type CarEntry } from "./character";

/** A modern utility four-by-four with a turbo-diesel six and eight gears: tall, heavy and soft, all shove low down, leaning through bends and never stopping on loose ground. */
export const stubbe: CarEntry = {
  tier: "B4",
  tuning: tuned({
    name: "Stubbe",
    class: "offroad",
    massKg: 2350,
    outline: [4.72, 1.96, 1.94, 0.44],
    axleZ: [-1.45, 1.45],
    trackM: 1.68,
    wheelRadiusM: 0.4,
    massHeightM: 0.8,
    rideHz: 1.15,
    damping: 0.32,
    rollStiffness: 0.26,
    droopM: 0.46,
    travelM: 0.38,
    grip: [0.95, 0.97],
    peakSlip: 0.17,
    slideShare: 0.9,
    engine: {
      peakTorqueNm: 500,
      torqueCurve: [
        [0.15, 0.62],
        [0.28, 0.97],
        [0.36, 1],
        [0.6, 0.98],
        [0.8, 0.84],
        [1, 0.6],
      ],
      engineBrakeNm: 75,
    },
    gearbox: { idleRpm: 700, redlineRpm: 4600, gearTopMS: [8, 13, 19, 25.5, 32, 39, 46, 53], shiftS: 0.22, gentleShift: 0.4 },
    launchMS2: 4.8,
    rearShare: 0.55,
    brakeMS2: 9,
    dragPerMS2: 1.2,
    aero: 0.5,
    lock: 0.56,
    turnPerS: 1.9,
  }),
};
