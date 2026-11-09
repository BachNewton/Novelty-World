import { tuned, type CarEntry } from "./character";

/**
 * Ridgeway's desert pickup: a crew cab high on tall all-terrain tyres and long-travel suspension, a big twin-turbo V6
 * up front and all four wheels driven, the rear taking most. Its springs are the softest of any car, so it soaks up
 * ruts and crests and lands flat off a jump, and on tarmac it leans, squats and floats like the truck it is. Quicker
 * and far softer than Holm, the working pickup; heavier and lazier to turn than the gravel estates and rally hatches it
 * races, but nothing in its tier cares less what the road is made of.
 */
export const dyn: CarEntry = {
  tier: "B2",
  tuning: tuned({
    name: "Dyn",
    class: "offroad",
    massKg: 2290,
    outline: [5.28, 2.2, 1.98, 0.5],
    axleZ: [-1.86, 1.84],
    trackM: 1.86,
    wheelRadiusM: 0.44,
    massHeightM: 0.86,
    rideHz: 0.95,
    damping: 0.4,
    rollStiffness: 0.2,
    droopM: 0.55,
    travelM: 0.56,
    grip: [1.04, 1.06],
    peakSlip: 0.19,
    slideShare: 0.88,
    handbrakeRearShare: 0.46,
    engine: {
      peakTorqueNm: 640,
      torqueCurve: [
        [0.12, 0.5],
        [0.24, 0.86],
        [0.32, 1],
        [0.7, 1],
        [0.85, 0.9],
        [1, 0.68],
      ],
      engineBrakeNm: 60,
    },
    gearbox: { idleRpm: 700, redlineRpm: 6000, gearTopMS: [13, 20, 27, 34, 41, 48, 56], shiftS: 0.22, gentleShift: 0.36 },
    launchMS2: 6.25,
    rearShare: 0.62,
    brakeMS2: 9,
    dragPerMS2: 2.1,
    aero: 0.2,
    lock: 0.6,
    turnPerS: 2.1,
  }),
};
