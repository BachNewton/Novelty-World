import { tuned, type CarEntry } from "./character";

/**
 * Norrsken's electric hypercar: a motor at each wheel and a battery under the floor. All of its torque is there from
 * a standstill and it never changes gear, so it leaves the line harder than anything else on the island and keeps
 * pulling, silently, until its motors run out of revs. Heavy for its size, but the battery sits low and downforce
 * presses it down: it rides flat and planted, and feels its weight only when it's asked to change direction quickly.
 */
export const blixt: CarEntry = {
  tier: "A1",
  tuning: tuned({
    name: "Blixt",
    class: "sports",
    massKg: 2080,
    outline: [4.58, 2.08, 1.16, 0.1],
    axleZ: [-1.36, 1.38],
    trackM: 1.74,
    wheelRadiusM: 0.36,
    massHeightM: 0.36,
    rideHz: 2.1,
    damping: 0.55,
    rollStiffness: 0.72,
    travelM: 0.22,
    grip: [1.58, 1.66],
    peakSlip: 0.11,
    slideShare: 0.8,
    handbrakeRearShare: 0.45,
    engine: {
      peakTorqueNm: 1500,
      // Full torque to the motors' base speed, then their power held as the revs climb to their limit.
      torqueCurve: [
        [0, 1],
        [0.38, 1],
        [0.6, 0.66],
        [0.8, 0.5],
        [0.95, 0.42],
        [1, 0.4],
      ],
      engineBrakeNm: 260,
    },
    // One gear: the motors' limit is the top speed.
    gearbox: { idleRpm: 0, redlineRpm: 20000, gearTopMS: [101], shiftS: 0, gentleShift: 1 },
    launchMS2: 14.2,
    rearShare: 0.5,
    brakeMS2: 15,
    dragPerMS2: 0.6,
    aero: 3.0,
    lock: 0.55,
    turnPerS: 2.6,
  }),
};
