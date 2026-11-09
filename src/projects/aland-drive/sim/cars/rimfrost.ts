import { tuned, type CarEntry } from "./character";

/**
 * Ödmark's 1990s homologation saloon, found in a barn: four doors, a turbo four with a broad, even pull from the middle
 * of its revs, an even split of drive and a big wing. Softly sprung for a road car's comfort, with tyres that keep a
 * good share of their grip past the peak, so on gravel it drifts on a feathered throttle and gathers itself up
 * without a fuss: the friendly, grippy one of the family, where Frost before it bites and Hagel after it attacks.
 */
export const rimfrost: CarEntry = {
  tier: "C2",
  tuning: tuned({
    name: "Rimfrost",
    class: "rally",
    massKg: 1390,
    outline: [4.42, 1.76, 1.42, 0.2],
    axleZ: [-1.32, 1.3],
    trackM: 1.5,
    wheelRadiusM: 0.315,
    massHeightM: 0.52,
    rideHz: 1.45,
    damping: 0.4,
    rollStiffness: 0.46,
    travelM: 0.3,
    grip: [1.3, 1.33],
    peakSlip: 0.15,
    slideShare: 0.9,
    handbrakeRearShare: 0.4,
    engine: {
      peakTorqueNm: 340,
      torqueCurve: [
        [0.12, 0.5],
        [0.3, 0.82],
        [0.42, 1],
        [0.78, 0.97],
        [0.9, 0.86],
        [1, 0.74],
      ],
      engineBrakeNm: 42,
    },
    gearbox: { idleRpm: 850, redlineRpm: 6900, gearTopMS: [14.5, 25, 36, 48, 63], shiftS: 0.16, gentleShift: 0.42 },
    launchMS2: 5.65,
    rearShare: 0.52,
    brakeMS2: 11,
    dragPerMS2: 0.66,
    aero: 0.9,
    lock: 0.62,
    turnPerS: 2.8,
  }),
};
