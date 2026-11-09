import { tuned, type CarEntry } from "./character";

/**
 * Kamrat's people's car: a small air-cooled flat four hung behind the rear axle, four gears and skinny tyres. Most of
 * its weight sits over the driven rear wheels, so it pulls away cleanly and then takes its time; the nose is light,
 * wanders on its slow steering and gives up first, and a lifted throttle in a bend lets the heavy tail swing wide.
 * Soft and tall, it leans and bobs, and stops on drums from a long way off.
 */
export const kula: CarEntry = {
  tier: "C4",
  maker: "Kamrat",
  engine: "Air-cooled flat four",
  from: "barn",
  tuning: tuned({
    name: "Kula",
    class: "road",
    massKg: 790,
    outline: [3.95, 1.56, 1.48, 0.2],
    axleZ: [-1.38, 0.92],
    trackM: 1.31,
    wheelRadiusM: 0.305,
    massHeightM: 0.53,
    rideHz: 1.15,
    damping: 0.27,
    rollStiffness: 0.18,
    grip: [0.93, 0.955],
    peakSlip: 0.17,
    slideShare: 0.74,
    handbrakeRearShare: 0.46,
    engine: {
      peakTorqueNm: 66,
      torqueCurve: [
        [0.15, 0.72],
        [0.35, 0.94],
        [0.55, 1],
        [0.8, 0.9],
        [1, 0.7],
      ],
      engineBrakeNm: 16,
    },
    gearbox: { idleRpm: 850, redlineRpm: 4600, gearTopMS: [9.5, 17.5, 26.5, 35], shiftS: 0.4, gentleShift: 0.5 },
    launchMS2: 4,
    rearShare: 1,
    brakeMS2: 8,
    dragPerMS2: 0.5,
    aero: 0.1,
    lock: 0.62,
    turnPerS: 1.8,
  }),
};
