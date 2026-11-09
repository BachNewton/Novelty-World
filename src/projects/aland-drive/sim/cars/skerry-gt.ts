import type { CarEntry } from "./character";

/** The sports fastback the game starts in: a straight six that loves to rev, and a tail that stays planted. Written out in full: every other car is a character. */
export const skerryGt: CarEntry = {
  tier: "A5",
  tuning: {
    name: "Skerry GT",
    class: "sports",
    car: {
      massKg: 1400,
      halfSize: [0.9, 0.42, 2.2],
      boxUpM: 0.2,
      massUpM: -0.14,
      inertia: [2500, 2650, 620],
      axleZ: [-1.3, 1.3],
      trackM: 1.6,
      wheelRadiusM: 0.33,
    },
    suspension: {
      droopM: 0.4,
      travelM: 0.3,
      springNPerM: 30000,
      damperNPerMS: 2600,
      bumpStopNPerM: 120000,
      antiRollNPerM: 14000,
    },
    grip: {
      frontMu: 1.35,
      rearMu: 1.4,
      peakSlip: 0.14,
      slideShare: 0.8,
      lowSpeedMS: 3,
      handbrakeRearShare: 0.42,
      forceLiftM: 0.28,
    },
    engine: {
      peakTorqueNm: 320,
      // About 205 kW at its best, near 6,800 rpm.
      torqueCurve: [
        [0.12, 0.6],
        [0.35, 0.9],
        [0.6, 1],
        [0.85, 0.93],
        [1, 0.78],
      ],
      engineBrakeNm: 40,
    },
    gearbox: {
      idleRpm: 900,
      redlineRpm: 7800,
      // Top gear is long enough that drag, not the redline, ends the car's speed: about 260 km/h.
      gearTopMS: [17, 28, 40, 52, 64, 78],
      shiftS: 0.11,
      gentleShift: 0.42,
    },
    power: {
      launchN: 9500,
      rearShare: 0.65,
      reverseSpeedMS: 13,
      reverseN: 5000,
      brakeN: 17000,
      brakeFrontShare: 0.6,
      handbrakeN: 7000,
      rollingN: 220,
      dragPerMS2: 0.51,
      downforcePerMS2: 1.6,
    },
    steering: {
      lock: 0.6,
      cornerMS2: 14,
      cornerMargin: 1.5,
      turnPerS: 2.6,
      returnPerS: 4.5,
      handbrakeLock: 1.8,
      yawAssist: 2600,
    },
  },
};
