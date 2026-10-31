// The gallery's places, all on L2334E. Each is a point in the scene (x east, z south) that the camera looks at from `away`
// metres back along a bearing, at a driver's height unless it says otherwise.
const ORIGIN = { east: 110000, north: 6690000 };
const EYE_M = 1.3;

function look(name, x, z, bearing, away, { eye = EYE_M, pitch, measure = false } = {}) {
  const [aheadX, aheadZ] = [Math.sin(bearing), -Math.cos(bearing)];
  return {
    name,
    at: { east: ORIGIN.east + x - aheadX * away, north: ORIGIN.north - (z - aheadZ * away), height: eye, yaw: -bearing, pitch: pitch ?? -Math.atan(eye / away) },
    measure,
  };
}

export const LOOKS = [
  look("torggatan-setts", -1996, 6640, 0, 10),
  look("torggatan-pedestrian", -1998, 6520, 0, 14, { eye: 1.6 }),
  look("torget-square", -1945, 6713, 1.57, 16),
  look("storagatan-kerb", -2300, 6792, 1.55, 16),
  look("storagatan-chase", -2300, 6786, 1.55, 30, { eye: 2.6, pitch: -0.1, measure: true }),
  look("esplanaden-strip", -2300, 6764, 1.57, 20),
  look("esplanaden-junction", -2190, 6752, 1.6, 26, { eye: 2.6, pitch: -0.1 }),
  look("badhusparken", -2842, 6517, 0.8, 24, { eye: 1.6 }),
  look("fountain", -1917, 6690, 1.2, 9, { eye: 1.6, pitch: 0.06 }),
  look("car-park-big", -2017, 8082, 1.2, 34, { eye: 3, pitch: -0.14 }),
  look("residential-block", -2410, 7050, 1.57, 30, { eye: 2.6, pitch: -0.1, measure: true }),
  look("ground-closeup", -1996, 6530, 0, 2.5, { eye: 1.3, pitch: -0.5 }),
  look("from-above-centre", -2100, 6700, 0.5, 120, { eye: 60, pitch: -0.55 }),
];
