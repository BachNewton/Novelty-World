import { tuned, type CarEntry } from "./character";

/**
 * Norrsken's electric pickup: a motor on each axle, one gear, and a battery the length of the floor that makes it the
 * heaviest thing on the island and sits its weight low under a tall body. On a road it shoves off the line with all
 * its torque at once and stops on its regeneration; on loose ground its traction control holds that torque back so
 * the big all-terrain tyres don't dig in, and it pulls steadily rather than hard. Soft and long in its travel, but its
 * low weight keeps it flat: it soaks up a rough road where Holm wallows, and leans on its mass in a quick change of
 * direction.
 */
export const myr: CarEntry = {
  tier: "B3",
  tuning: tuned({
    name: "Myr",
    class: "offroad",
    massKg: 2800,
    outline: [5.32, 2.04, 1.88, 0.42],
    axleZ: [-1.74, 1.74],
    trackM: 1.72,
    wheelRadiusM: 0.41,
    massHeightM: 0.64,
    rideHz: 1.25,
    damping: 0.4,
    rollStiffness: 0.52,
    droopM: 0.45,
    travelM: 0.38,
    grip: [1.02, 1.05],
    peakSlip: 0.16,
    slideShare: 0.84,
    engine: {
      peakTorqueNm: 1000,
      // Full torque to the motors' base speed, then their power held to the limit.
      torqueCurve: [
        [0, 1],
        [0.32, 1],
        [0.5, 0.7],
        [0.75, 0.48],
        [1, 0.38],
      ],
      engineBrakeNm: 300,
    },
    // One gear: the motors' limit is the top speed.
    gearbox: { idleRpm: 0, redlineRpm: 15000, gearTopMS: [56.5], shiftS: 0, gentleShift: 1 },
    launchMS2: 6.5,
    looseLaunchMS2: 4.2,
    rearShare: 0.55,
    brakeMS2: 9.2,
    dragPerMS2: 1.25,
    aero: 0.5,
    lock: 0.55,
    turnPerS: 1.9,
  }),
};
