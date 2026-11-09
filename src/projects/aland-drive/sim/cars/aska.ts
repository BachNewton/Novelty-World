import { tuned, type CarEntry } from "./character";

/**
 * Tärna's hybrid hypercar: a twin-turbo V8 behind the seats and an electric motor on each axle. The motors fill
 * the bottom of the rev range, so the whole of its shove is there from a standstill and only the tyres hold it
 * back: a savage, traction-limited launch on all four wheels. Downforce several times a sports car's holds it flat
 * and calm at speeds nothing else on the island reaches.
 */
export const aska: CarEntry = {
  tier: "A1",
  tuning: tuned({
    name: "Åska",
    class: "sports",
    massKg: 1520,
    outline: [4.62, 2.06, 1.15, 0.11],
    axleZ: [-1.33, 1.39],
    trackM: 1.72,
    wheelRadiusM: 0.36,
    massHeightM: 0.4,
    rideHz: 2.0,
    damping: 0.5,
    rollStiffness: 0.65,
    travelM: 0.24,
    grip: [1.66, 1.72],
    peakSlip: 0.11,
    slideShare: 0.78,
    handbrakeRearShare: 0.5,
    engine: {
      peakTorqueNm: 1100,
      torqueCurve: [
        [0.1, 0.92],
        [0.3, 1],
        [0.6, 1],
        [0.8, 0.96],
        [0.92, 0.9],
        [1, 0.82],
      ],
      engineBrakeNm: 90,
    },
    gearbox: { idleRpm: 1000, redlineRpm: 8500, gearTopMS: [24, 39, 55, 71, 86, 98, 108], shiftS: 0.05, gentleShift: 0.45 },
    launchMS2: 11.5,
    rearShare: 0.6,
    brakeMS2: 15,
    dragPerMS2: 0.64,
    aero: 2.6,
    lock: 0.55,
    turnPerS: 3.0,
  }),
};
