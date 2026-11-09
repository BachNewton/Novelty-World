import { tuned, type CarEntry } from "./character";

/**
 * Ödmark's top-class rally car: a small turbo four on anti-lag with a hybrid unit that fills every gap in its pull,
 * so there is no lag to wait for, only shove from the bottom of the revs. Five short gears run it out of breath at
 * about 210 km/h, where a rally stage never goes faster. Long, stiff travel keeps it flat over crests; a fixed even
 * split, a quick rack and a big lock let it be turned on the throttle and swung on the handbrake, and its tyres hold a
 * slide on gravel rather than snap out of it. Grus, its road-going sibling, has the lag and the wing; this has neither
 * the lag nor the patience.
 */
export const hagel: CarEntry = {
  tier: "B1",
  maker: "Ödmark",
  engine: "Turbo four hybrid",
  from: "club",
  tuning: tuned({
    name: "Hagel",
    class: "rally",
    massKg: 1260,
    outline: [4.12, 1.89, 1.36, 0.22],
    axleZ: [-1.32, 1.3],
    trackM: 1.62,
    wheelRadiusM: 0.33,
    massHeightM: 0.48,
    rideHz: 1.75,
    damping: 0.5,
    rollStiffness: 0.55,
    droopM: 0.42,
    travelM: 0.38,
    grip: [1.43, 1.44],
    peakSlip: 0.15,
    slideShare: 0.88,
    handbrakeRearShare: 0.5,
    engine: {
      peakTorqueNm: 520,
      torqueCurve: [
        [0.1, 0.86],
        [0.28, 1],
        [0.72, 1],
        [0.88, 0.93],
        [1, 0.8],
      ],
      engineBrakeNm: 55,
    },
    gearbox: { idleRpm: 1100, redlineRpm: 7800, gearTopMS: [17, 27, 37, 48, 59], shiftS: 0.04, gentleShift: 0.5 },
    launchMS2: 9.5,
    rearShare: 0.5,
    brakeMS2: 13,
    dragPerMS2: 0.72,
    aero: 1.7,
    lock: 0.72,
    turnPerS: 3.7,
  }),
};
