import { tuned, type CarEntry } from "./character";

/**
 * The road car Ã–dmark built so Hagel could rally: a short, wide three-door hatch on a two-litre turbo four and a
 * rear-biased four-wheel drive. Below 3,000 rpm it waits for its turbo, then it shoves to the redline; its springs are
 * a road car's, softer than Hagel's, but its travel is long and its tyres let go gently and come back, so on a gravel
 * lane it leans, squirms, steps its tail out on the throttle and is caught again. FjÃ¤rd is calm and front-led on the
 * same roads; this is the one that wants to be driven sideways.
 */
export const lera: CarEntry = {
  tier: "B2",
  tuning: tuned({
    name: "Lera",
    class: "rally",
    massKg: 1380,
    outline: [4.02, 1.85, 1.43, 0.19],
    axleZ: [-1.28, 1.27],
    trackM: 1.58,
    wheelRadiusM: 0.32,
    massHeightM: 0.52,
    rideHz: 1.45,
    damping: 0.4,
    rollStiffness: 0.46,
    droopM: 0.41,
    travelM: 0.33,
    grip: [1.3, 1.31],
    peakSlip: 0.145,
    slideShare: 0.87,
    handbrakeRearShare: 0.46,
    engine: {
      peakTorqueNm: 390,
      torqueCurve: [
        [0.13, 0.36],
        [0.3, 0.55],
        [0.42, 0.97],
        [0.5, 1],
        [0.78, 0.98],
        [0.9, 0.84],
        [1, 0.66],
      ],
      engineBrakeNm: 42,
    },
    gearbox: { idleRpm: 900, redlineRpm: 7000, gearTopMS: [14.5, 24, 34, 44.5, 54.5, 65.5], shiftS: 0.12, gentleShift: 0.42 },
    launchMS2: 5.9,
    rearShare: 0.6,
    brakeMS2: 11.5,
    dragPerMS2: 0.66,
    aero: 0.6,
    lock: 0.66,
    turnPerS: 3.1,
  }),
};
