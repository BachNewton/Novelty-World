import { tuned, type CarEntry } from "./character";

/**
 * Aurelle's grand tourer: a naturally aspirated V12 under a very long bonnet, the cabin set back near the rear axle,
 * a transaxle behind it and all its drive at the back. Heavy and long-legged, it pulls harder the higher it revs and
 * sits calm and settled at 300 km/h; softer than a supercar, it leans and breathes through a bend, and a lift or a
 * stab of throttle swings its long tail gently round.
 */
export const dyning: CarEntry = {
  tier: "A3",
  maker: "Aurelle",
  engine: "Free-breathing V12",
  from: "harbour",
  tuning: tuned({
    name: "Dyning",
    class: "sports",
    massKg: 1780,
    outline: [4.78, 1.98, 1.27, 0.14],
    axleZ: [-1.47, 1.33],
    trackM: 1.68,
    wheelRadiusM: 0.36,
    massHeightM: 0.47,
    rideHz: 1.55,
    damping: 0.42,
    rollStiffness: 0.5,
    grip: [1.5, 1.58],
    peakSlip: 0.13,
    slideShare: 0.82,
    handbrakeRearShare: 0.46,
    engine: {
      peakTorqueNm: 720,
      torqueCurve: [
        [0.12, 0.52],
        [0.3, 0.72],
        [0.55, 0.9],
        [0.76, 1],
        [0.9, 0.97],
        [1, 0.9],
      ],
      engineBrakeNm: 70,
    },
    gearbox: { idleRpm: 800, redlineRpm: 8700, gearTopMS: [22, 36, 50, 63, 76, 87, 97], shiftS: 0.07, gentleShift: 0.4 },
    launchMS2: 8.65,
    rearShare: 1,
    brakeMS2: 12.5,
    dragPerMS2: 0.71,
    aero: 1.3,
    lock: 0.56,
    turnPerS: 2.6,
  }),
};
