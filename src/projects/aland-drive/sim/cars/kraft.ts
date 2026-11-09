import { tuned, type CarEntry } from "./character";

/**
 * Ridgeway's 1970s muscle coupé: a big-block cross-plane V8 with torque everywhere and nowhere to put it, through a
 * three-speed automatic to skinny period tyres on the rear. It lights them up off the line and steps its tail out on
 * the throttle out of any bend, floats and leans on soft springs at speed, and its drum-feel brakes take their time.
 * Vik, the other C3, is a feather that turns on a thought; this is a hammer that goes straight.
 */
export const kraft: CarEntry = {
  tier: "C3",
  tuning: tuned({
    name: "Kraft",
    class: "road",
    massKg: 1690,
    outline: [5.12, 1.94, 1.3, 0.17],
    axleZ: [-1.5, 1.4],
    trackM: 1.56,
    wheelRadiusM: 0.34,
    massHeightM: 0.53,
    rideHz: 1.05,
    damping: 0.24,
    rollStiffness: 0.26,
    travelM: 0.32,
    grip: [0.96, 0.98],
    peakSlip: 0.12,
    slideShare: 0.77,
    handbrakeRearShare: 0.44,
    engine: {
      peakTorqueNm: 560,
      torqueCurve: [
        [0.14, 0.74],
        [0.3, 0.95],
        [0.48, 1],
        [0.7, 0.9],
        [0.88, 0.78],
        [1, 0.66],
      ],
      engineBrakeNm: 80,
    },
    gearbox: { idleRpm: 700, redlineRpm: 5600, gearTopMS: [26, 44, 64], shiftS: 0.38, gentleShift: 0.32 },
    launchMS2: 4.95,
    rearShare: 1,
    brakeMS2: 7.8,
    dragPerMS2: 1.0,
    aero: 0,
    lock: 0.58,
    turnPerS: 1.9,
  }),
};
