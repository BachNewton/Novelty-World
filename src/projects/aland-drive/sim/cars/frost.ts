import { tuned, type CarEntry } from "./character";

/**
 * Ödmark's Group B car of the 1980s, found in a barn: a short, light shell with a turbo four behind the seats on
 * enormous boost. Below half its revs it barely pulls, then the turbo lights and the whole torque arrives at once, so
 * every gear is a wait and then a kick. A rear-biased split, a short wheelbase, quick steering and tyres that let go
 * sharply past their peak make it twitchy on tarmac and savage on gravel: wilder and far less tidy than Hagel, its
 * grandchild, which fills every gap its lag leaves.
 */
export const frost: CarEntry = {
  tier: "C1",
  tuning: tuned({
    name: "Frost",
    class: "rally",
    massKg: 1120,
    outline: [3.94, 1.86, 1.36, 0.22],
    axleZ: [-1.2, 1.2],
    trackM: 1.56,
    wheelRadiusM: 0.32,
    massHeightM: 0.47,
    rideHz: 1.85,
    damping: 0.34,
    rollStiffness: 0.5,
    droopM: 0.4,
    travelM: 0.32,
    grip: [1.42, 1.34],
    peakSlip: 0.11,
    slideShare: 0.66,
    handbrakeRearShare: 0.55,
    engine: {
      peakTorqueNm: 500,
      torqueCurve: [
        [0.1, 0.3],
        [0.35, 0.4],
        [0.48, 0.62],
        [0.58, 1],
        [0.85, 0.96],
        [1, 0.8],
      ],
      engineBrakeNm: 38,
    },
    gearbox: { idleRpm: 1200, redlineRpm: 7600, gearTopMS: [17, 28, 40, 52, 63.5], shiftS: 0.11, gentleShift: 0.55 },
    launchMS2: 9,
    rearShare: 0.66,
    brakeMS2: 11.5,
    dragPerMS2: 0.7,
    aero: 1.1,
    lock: 0.74,
    turnPerS: 4.6,
  }),
};
