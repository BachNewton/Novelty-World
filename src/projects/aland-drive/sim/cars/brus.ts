import { tuned, type CarEntry } from "./character";

/**
 * Aurelle's sports coupé: a twin-turbo V8 set back behind the front axle, a transaxle and all its drive at the back,
 * two small seats behind the front pair. Shorter, lighter and quicker to turn than Dyning, heavier and softer than
 * Sund: its torque arrives in one wave low in the revs and stays, so it pulls hard from anywhere, and the tail steps
 * out under power and comes back on a lift. Supple enough to cross the island in comfort.
 */
export const brus: CarEntry = {
  tier: "A4",
  tuning: tuned({
    name: "Brus",
    class: "sports",
    massKg: 1660,
    outline: [4.56, 1.96, 1.29, 0.14],
    axleZ: [-1.36, 1.27],
    trackM: 1.66,
    wheelRadiusM: 0.35,
    massHeightM: 0.45,
    rideHz: 1.65,
    damping: 0.44,
    rollStiffness: 0.5,
    grip: [1.51, 1.54],
    peakSlip: 0.13,
    slideShare: 0.8,
    handbrakeRearShare: 0.47,
    engine: {
      peakTorqueNm: 800,
      torqueCurve: [
        [0.1, 0.5],
        [0.22, 0.84],
        [0.3, 1],
        [0.68, 1],
        [0.86, 0.91],
        [1, 0.78],
      ],
      engineBrakeNm: 65,
    },
    gearbox: { idleRpm: 750, redlineRpm: 7200, gearTopMS: [20, 33, 46, 58, 70, 80, 89], shiftS: 0.08, gentleShift: 0.42 },
    launchMS2: 7.7,
    rearShare: 1,
    brakeMS2: 12.8,
    dragPerMS2: 0.705,
    aero: 1.3,
    lock: 0.57,
    turnPerS: 2.85,
  }),
};
