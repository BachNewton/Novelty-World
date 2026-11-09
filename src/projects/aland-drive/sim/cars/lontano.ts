import { tuned, type CarEntry } from "./character";

/**
 * Castellane's 1960s grand tourer, found in a barn: a racer for the road, a V12 on triple carburettors under a long
 * bonnet, the cabin set back and all of it through the rear wheels on a five-speed box that wants a slow, deliberate
 * hand. Light for a V12 and evenly balanced, it runs long-legged to a top speed few cars of its age reached, but its
 * narrow period tyres give up early and its soft springs lean and float: the tail steps out gently and keeps sliding,
 * and the driver is the one who catches it.
 */
export const lontano: CarEntry = {
  tier: "C2",
  maker: "Castellane",
  engine: "V12 on triple carbs",
  from: "barn",
  tuning: tuned({
    name: "Lontano",
    class: "sports",
    massKg: 1240,
    outline: [4.42, 1.74, 1.2, 0.15],
    axleZ: [-1.2, 1.22],
    trackM: 1.42,
    wheelRadiusM: 0.325,
    massHeightM: 0.46,
    rideHz: 1.45,
    damping: 0.33,
    rollStiffness: 0.36,
    travelM: 0.28,
    grip: [1.17, 1.2],
    peakSlip: 0.14,
    slideShare: 0.86,
    handbrakeRearShare: 0.48,
    engine: {
      peakTorqueNm: 430,
      torqueCurve: [
        [0.12, 0.5],
        [0.3, 0.68],
        [0.5, 0.86],
        [0.7, 1],
        [0.85, 0.97],
        [1, 0.86],
      ],
      engineBrakeNm: 60,
    },
    gearbox: { idleRpm: 950, redlineRpm: 7600, gearTopMS: [18, 31, 46, 63, 81], shiftS: 0.32, gentleShift: 0.45 },
    launchMS2: 5.15,
    rearShare: 1,
    brakeMS2: 9.8,
    dragPerMS2: 0.58,
    aero: 0.3,
    lock: 0.6,
    turnPerS: 2.4,
  }),
};
