import { tuned, type CarEntry } from "./character";

/**
 * Castellane's 1990s supercar, found in a barn: a free-breathing V12 behind a central driving seat, light for its
 * size, with all of it through the rear wheels. Its box is slow and mechanical between gears, its tyres are of their
 * decade, and nothing on it smooths the way they let go: lift mid-bend and the heavy tail and the V12's engine braking
 * swing it round, sharply. Barely any downforce, yet it runs on to a top speed nothing of its age touches.
 */
export const altura: CarEntry = {
  tier: "C1",
  maker: "Castellane",
  engine: "Free-breathing V12",
  from: "barn",
  tuning: tuned({
    name: "Altura",
    class: "sports",
    massKg: 1180,
    outline: [4.36, 1.86, 1.13, 0.11],
    axleZ: [-1.5, 1.21],
    trackM: 1.58,
    wheelRadiusM: 0.335,
    massHeightM: 0.4,
    rideHz: 1.85,
    damping: 0.42,
    rollStiffness: 0.5,
    travelM: 0.24,
    grip: [1.42, 1.46],
    peakSlip: 0.095,
    slideShare: 0.72,
    handbrakeRearShare: 0.52,
    engine: {
      peakTorqueNm: 650,
      torqueCurve: [
        [0.12, 0.6],
        [0.35, 0.82],
        [0.6, 0.96],
        [0.75, 1],
        [0.9, 0.97],
        [1, 0.88],
      ],
      engineBrakeNm: 110,
    },
    gearbox: { idleRpm: 900, redlineRpm: 7500, gearTopMS: [25, 40, 55, 70, 87, 106], shiftS: 0.18, gentleShift: 0.42 },
    launchMS2: 9.0,
    rearShare: 1,
    brakeMS2: 11.5,
    dragPerMS2: 0.4,
    aero: 0.25,
    lock: 0.58,
    turnPerS: 2.8,
  }),
};
