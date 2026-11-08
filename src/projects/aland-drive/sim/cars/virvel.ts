import { tuned, type CarEntry } from "./character";

/**
 * Tärna's supercar: a twin-turbo flat-plane V8 behind the seats and all of it through the rear wheels. Lighter, shorter
 * and stiffer than Åska, it turns in sharper and rotates sooner; the rear tyres are the limit off the line, and past
 * the grip its tail steps out quicker but comes back. Less downforce than the hypercar, so it is busier at the top.
 */
export const virvel: CarEntry = {
  tier: "A2",
  tuning: tuned({
    name: "Virvel",
    class: "sports",
    massKg: 1430,
    outline: [4.52, 2.0, 1.17, 0.12],
    axleZ: [-1.42, 1.22],
    trackM: 1.68,
    wheelRadiusM: 0.35,
    massHeightM: 0.42,
    rideHz: 2.1,
    damping: 0.48,
    rollStiffness: 0.62,
    travelM: 0.24,
    grip: [1.63, 1.69],
    peakSlip: 0.1,
    slideShare: 0.84,
    handbrakeRearShare: 0.52,
    engine: {
      peakTorqueNm: 740,
      torqueCurve: [
        [0.12, 0.5],
        [0.3, 0.9],
        [0.42, 1],
        [0.75, 1],
        [0.9, 0.94],
        [1, 0.84],
      ],
      engineBrakeNm: 65,
    },
    gearbox: { idleRpm: 1050, redlineRpm: 8700, gearTopMS: [25, 40, 55, 68, 79, 88, 96], shiftS: 0.06, gentleShift: 0.45 },
    launchMS2: 10.4,
    rearShare: 1,
    brakeMS2: 14.5,
    dragPerMS2: 0.705,
    aero: 1.9,
    lock: 0.57,
    turnPerS: 3.2,
  }),
};
