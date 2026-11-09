import { tuned, type CarEntry } from "./character";

/**
 * Västan's hot hatch: the family five-door with a two-litre turbo four, a broad shove from low revs through a quick
 * twin-clutch box, all of it through the front wheels. The nose bites eagerly and tugs at the wheel under power, and
 * a lift mid-corner tucks the tail in: the everyday car made quick, livelier than the little Ljus and softer-edged
 * than Sten, which wants to be revved.
 */
export const pil: CarEntry = {
  tier: "A7",
  tuning: tuned({
    name: "Pil",
    class: "road",
    massKg: 1390,
    outline: [4.28, 1.8, 1.45, 0.18],
    axleZ: [-1.26, 1.36],
    trackM: 1.56,
    wheelRadiusM: 0.33,
    massHeightM: 0.52,
    rideHz: 1.6,
    damping: 0.4,
    rollStiffness: 0.6,
    grip: [1.27, 1.24],
    peakSlip: 0.13,
    slideShare: 0.8,
    handbrakeRearShare: 0.45,
    engine: {
      peakTorqueNm: 345,
      torqueCurve: [
        [0.12, 0.5],
        [0.22, 0.85],
        [0.28, 1],
        [0.68, 1],
        [0.85, 0.9],
        [1, 0.76],
      ],
      engineBrakeNm: 45,
    },
    gearbox: { idleRpm: 850, redlineRpm: 6600, gearTopMS: [14, 23, 34, 46, 58, 70], shiftS: 0.09, gentleShift: 0.4 },
    launchMS2: 5.08,
    rearShare: 0,
    brakeMS2: 11.5,
    dragPerMS2: 0.52,
    aero: 0.9,
    lock: 0.62,
    turnPerS: 3.2,
  }),
};
