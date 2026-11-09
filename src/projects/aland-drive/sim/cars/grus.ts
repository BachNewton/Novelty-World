import { tuned, type CarEntry } from "./character";

/** A rally special with a turbo flat four: lag, then a rush; four-wheel drive, a wing, and a tail that swings on the handbrake. */
export const grus: CarEntry = {
  tier: "B1",
  tuning: tuned({
    name: "Grus",
    class: "rally",
    massKg: 1330,
    outline: [4.2, 1.88, 1.34, 0.2],
    axleZ: [-1.25, 1.25],
    trackM: 1.605,
    wheelRadiusM: 0.32,
    massHeightM: 0.5,
    rideHz: 1.55,
    damping: 0.42,
    rollStiffness: 0.5,
    travelM: 0.32,
    grip: [1.375, 1.4],
    peakSlip: 0.14,
    slideShare: 0.82,
    handbrakeRearShare: 0.38,
    engine: {
      peakTorqueNm: 400,
      torqueCurve: [
        [0.12, 0.4],
        [0.3, 0.75],
        [0.42, 1],
        [0.75, 0.98],
        [0.9, 0.85],
        [1, 0.7],
      ],
      engineBrakeNm: 40,
    },
    gearbox: { idleRpm: 900, redlineRpm: 7400, gearTopMS: [15, 25, 35, 46, 57, 71], shiftS: 0.09, gentleShift: 0.45 },
    launchMS2: 8,
    rearShare: 0.55,
    brakeMS2: 12.5,
    dragPerMS2: 0.6,
    aero: 1.3,
    lock: 0.62,
    turnPerS: 3,
  }),
};
