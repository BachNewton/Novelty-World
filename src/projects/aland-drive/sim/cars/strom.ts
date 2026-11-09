import { tuned, type CarEntry } from "./character";

/** An electric car: one gear, all its shove at once, a low battery floor, regeneration on the lift, and a limit at 230. */
export const strom: CarEntry = {
  tier: "A5",
  tuning: tuned({
    name: "Ström",
    class: "road",
    massKg: 2120,
    outline: [4.5, 1.9, 1.62, 0.26],
    axleZ: [-1.425, 1.425],
    trackM: 1.635,
    wheelRadiusM: 0.36,
    massHeightM: 0.46,
    rideHz: 1.5,
    damping: 0.42,
    rollStiffness: 0.5,
    grip: [1.275, 1.3],
    peakSlip: 0.13,
    slideShare: 0.8,
    engine: {
      peakTorqueNm: 600,
      // Full torque to the motor's base speed, then its power held: about 280 kW.
      torqueCurve: [
        [0, 1],
        [0.3, 1],
        [0.5, 0.62],
        [0.75, 0.42],
        [1, 0.32],
      ],
      engineBrakeNm: 160,
    },
    gearbox: { idleRpm: 0, redlineRpm: 15000, gearTopMS: [64], shiftS: 0, gentleShift: 1 },
    launchMS2: 7.2,
    rearShare: 0.6,
    brakeMS2: 11.5,
    dragPerMS2: 0.42,
    aero: 1,
    lock: 0.6,
    turnPerS: 2.6,
  }),
};
