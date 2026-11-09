import { tuned, type CarEntry } from "./character";

/** An old estate with a tired four and a four-speed box: soft, slow to answer, and a long way to stop. */
export const salta: CarEntry = {
  tier: "C4",
  maker: "Västan",
  engine: "Tired four",
  from: "barn",
  tuning: tuned({
    name: "Sälta",
    class: "road",
    massKg: 1320,
    outline: [4.75, 1.72, 1.44, 0.2],
    axleZ: [-1.36, 1.36],
    trackM: 1.505,
    wheelRadiusM: 0.31,
    massHeightM: 0.56,
    rideHz: 1.2,
    damping: 0.3,
    rollStiffness: 0.3,
    grip: [1.025, 1.05],
    peakSlip: 0.16,
    slideShare: 0.85,
    engine: {
      peakTorqueNm: 150,
      torqueCurve: [
        [0.15, 0.7],
        [0.35, 0.92],
        [0.55, 1],
        [0.8, 0.88],
        [1, 0.68],
      ],
      engineBrakeNm: 25,
    },
    gearbox: { idleRpm: 780, redlineRpm: 5200, gearTopMS: [13, 24, 38, 60], shiftS: 0.28, gentleShift: 0.48 },
    launchMS2: 4.5,
    rearShare: 1,
    brakeMS2: 9,
    dragPerMS2: 0.58,
    aero: 0.7,
    lock: 0.6,
    turnPerS: 2.2,
  }),
};
