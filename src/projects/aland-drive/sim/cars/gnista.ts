import { tuned, type CarEntry } from "./character";

/**
 * Norrsken's electric rallycross car: a motor on each axle, a battery low under a short, wide hatch, and one gear.
 * All of its torque is there at once and split evenly front and rear, so it leaves the line on loose ground harder
 * than anything else on the island, and its short wheelbase and quick rack throw it into a hairpin. Its motors run
 * out of breath early: past 160 km/h the shove fades, and it tops out near 200 behind its big wing.
 */
export const gnista: CarEntry = {
  tier: "B1",
  maker: "Norrsken",
  engine: "Two electric motors",
  from: "club",
  tuning: tuned({
    name: "Gnista",
    class: "rally",
    massKg: 1350,
    outline: [4.12, 1.98, 1.38, 0.17],
    axleZ: [-1.3, 1.26],
    trackM: 1.68,
    wheelRadiusM: 0.32,
    massHeightM: 0.44,
    rideHz: 1.75,
    damping: 0.46,
    rollStiffness: 0.58,
    travelM: 0.28,
    grip: [1.42, 1.42],
    peakSlip: 0.13,
    slideShare: 0.84,
    handbrakeRearShare: 0.34,
    engine: {
      peakTorqueNm: 620,
      // Full torque to the motors' base speed, then their power held only a little way before it fades: short legs.
      torqueCurve: [
        [0, 1],
        [0.38, 1],
        [0.6, 0.6],
        [0.8, 0.34],
        [0.95, 0.22],
        [1, 0.19],
      ],
      engineBrakeNm: 150,
    },
    // One gear: the motors' limit sits just past where the air stops it.
    gearbox: { idleRpm: 0, redlineRpm: 16000, gearTopMS: [59], shiftS: 0, gentleShift: 1 },
    launchMS2: 10.8,
    rearShare: 0.52,
    brakeMS2: 13,
    dragPerMS2: 0.95,
    aero: 1.4,
    lock: 0.64,
    turnPerS: 3.4,
  }),
};
