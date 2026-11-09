import { tuned, type CarEntry } from "./character";

/**
 * Ridgeway's muscle supercar: a huge supercharged cross-plane V8 up front and all of it through the rear wheels. It
 * makes more torque than the tyres can take, so without traction control it spins them through the first three gears
 * and steps its tail out on the throttle; heavy, brutal in a straight line, and the hardest A2 to drive fast, with less
 * downforce than the mid-engined cars and a tyre that lets go sharply past its peak.
 */
export const varg: CarEntry = {
  tier: "A2",
  maker: "Ridgeway",
  engine: "Supercharged V8",
  from: "harbour",
  tuning: tuned({
    name: "Varg",
    class: "sports",
    massKg: 1690,
    outline: [4.74, 2.02, 1.25, 0.12],
    axleZ: [-1.46, 1.32],
    trackM: 1.7,
    wheelRadiusM: 0.36,
    massHeightM: 0.46,
    rideHz: 1.8,
    damping: 0.42,
    rollStiffness: 0.5,
    heave: 0.8,
    travelM: 0.24,
    grip: [1.54, 1.64],
    peakSlip: 0.11,
    slideShare: 0.7,
    handbrakeRearShare: 0.42,
    engine: {
      peakTorqueNm: 1080,
      torqueCurve: [
        [0.12, 0.62],
        [0.3, 0.9],
        [0.5, 1],
        [0.75, 0.98],
        [0.9, 0.9],
        [1, 0.8],
      ],
      engineBrakeNm: 95,
    },
    gearbox: { idleRpm: 800, redlineRpm: 6800, gearTopMS: [21, 35, 49, 62, 74, 85, 95], shiftS: 0.1, gentleShift: 0.4 },
    launchMS2: 10.2,
    rearShare: 1,
    brakeMS2: 12.5,
    dragPerMS2: 0.76,
    aero: 0.7,
    lock: 0.55,
    turnPerS: 2.7,
  }),
};
