import { tuned, type CarEntry } from "./character";

/** An open four-seat cruiser with a gruff V6: comfortable, rear-driven, quick enough, made for the coast road. */
export const bris: CarEntry = {
  tier: "A6",
  maker: "Aurelle",
  engine: "V6",
  from: "dealer",
  tuning: tuned({
    name: "Bris",
    class: "road",
    massKg: 1600,
    outline: [4.3, 1.8, 1.3, 0.18],
    axleZ: [-1.275, 1.275],
    trackM: 1.545,
    wheelRadiusM: 0.32,
    massHeightM: 0.5,
    rideHz: 1.3,
    damping: 0.36,
    rollStiffness: 0.4,
    grip: [1.25, 1.3],
    peakSlip: 0.14,
    slideShare: 0.8,
    engine: {
      peakTorqueNm: 370,
      torqueCurve: [
        [0.12, 0.65],
        [0.3, 0.9],
        [0.55, 1],
        [0.8, 0.92],
        [1, 0.75],
      ],
      engineBrakeNm: 45,
    },
    gearbox: { idleRpm: 750, redlineRpm: 6800, gearTopMS: [14, 24, 34, 45, 56, 66, 76], shiftS: 0.12, gentleShift: 0.4 },
    launchMS2: 6,
    rearShare: 1,
    brakeMS2: 11,
    dragPerMS2: 0.58,
    aero: 0.8,
    lock: 0.6,
    turnPerS: 2.5,
  }),
};
