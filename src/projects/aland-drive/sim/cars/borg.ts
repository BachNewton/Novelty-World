import { tuned, type CarEntry } from "./character";

/**
 * Valtor's luxury four-by-four: a tall, square, two-and-a-half-tonne body on big wheels and road tyres, a loud
 * twin-turbo V8 and all four wheels driven, biased to the rear. On tarmac it launches like a sports car and runs to
 * 240 km/h; but its tyres are made for the road and its weight sits high, so on gravel it can put down far less of
 * that shove, and in a bend it rolls onto its outside wheels, pitches under the brakes and runs wide long before it
 * would slide.
 */
export const borg: CarEntry = {
  tier: "B3",
  maker: "Valtor",
  engine: "Twin-turbo V8",
  from: "harbour",
  tuning: tuned({
    name: "Borg",
    class: "road",
    massKg: 2550,
    outline: [4.92, 2.02, 1.96, 0.42],
    axleZ: [-1.47, 1.48],
    trackM: 1.7,
    wheelRadiusM: 0.41,
    massHeightM: 0.78,
    rideHz: 1.3,
    damping: 0.34,
    rollStiffness: 0.3,
    droopM: 0.42,
    travelM: 0.32,
    grip: [0.86, 0.9],
    peakSlip: 0.14,
    slideShare: 0.84,
    engine: {
      peakTorqueNm: 900,
      torqueCurve: [
        [0.12, 0.6],
        [0.26, 0.95],
        [0.32, 1],
        [0.72, 1],
        [0.88, 0.9],
        [1, 0.78],
      ],
      engineBrakeNm: 85,
    },
    gearbox: { idleRpm: 650, redlineRpm: 6500, gearTopMS: [16, 26, 36, 45, 53, 60, 67, 72], shiftS: 0.12, gentleShift: 0.32 },
    launchMS2: 7.4,
    rearShare: 0.85,
    brakeMS2: 10.5,
    dragPerMS2: 1.5,
    aero: 0.4,
    lock: 0.55,
    turnPerS: 2.1,
  }),
};
