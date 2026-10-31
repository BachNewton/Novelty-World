// The gallery's places. Each subject is a point in the scene (x east, z south) and a compass bearing, seen from 2, 10 and
// 30 m at a driver's height, so every surface is judged close up, at road distance and where its detail has gone.
const ORIGIN = { east: 110000, north: 6690000 };
const EYE_M = 1.3;

function look(name, x, z, bearing, away, extra = {}) {
  const [aheadX, aheadZ] = [Math.sin(bearing), -Math.cos(bearing)];
  const eye = extra.eye ?? EYE_M;
  return {
    name: extra.add?.startsWith("street") ? name : `${name}-${away}m`,
    at: { east: ORIGIN.east + x - aheadX * away, north: ORIGIN.north - (z - aheadZ * away), height: eye, yaw: -bearing, pitch: extra.pitch ?? -Math.atan(eye / away) },
    add: extra.add,
    away,
    measure: extra.measure,
  };
}

// A sign's cross is `add` at the look's own point, not the camera: the set works that out from the distance.
const threeWays = (name, x, z, bearing) => [2, 10, 30].map((away) => look(name, x, z, bearing, away));

export const LOOKS = [
  ...threeWays("grass", -9210, -5190, 0.7),
  ...threeWays("field", -9330, -3150, 0.3),
  ...threeWays("rock", -9690, -3030, 2.0),
  ...threeWays("forest-floor", -8070, -2370, 1.0),
  ...threeWays("asphalt", -7640, -4819, 1.3),
  ...threeWays("gravel", -8585, -5349, 0.25),
  ...threeWays("town-street", -1686, 4094, 0.12),
  ...threeWays("town-strand", -1954, 5299, -0.28),
  ...threeWays("junction-town", -2073, 4886, -0.25),
  ...threeWays("junction-country", -7551, -4844, -0.2),
  look("shops-2m", -9330, -3150, 0.3, 2, { eye: 1.7, pitch: 0.1, add: "street:7" }),
  look("shops-10m", -9330, -3150, 0.3, 2, { eye: 1.7, pitch: 0.18, add: "street:12" }),
  look("shops-30m", -9330, -3150, 0.3, 2, { eye: 2.6, pitch: 0.1, add: "street:30" }),
  look("roofs-2m", -9330, -3150, 0.3, 2, { eye: 12, pitch: -0.3, add: "street:3" }),
  look("roofs-10m", -9330, -3150, 0.3, 2, { eye: 15, pitch: -0.3, add: "street:12" }),
  look("roofs-30m", -9330, -3150, 0.3, 2, { eye: 18, pitch: -0.3, add: "street:30" }),
  // The lineup stands across the road's direction at the look's point, so its distance is the look's own.
  look("signs", -7640, -4819, 1.3, 8, { eye: 1.6, pitch: 0.1, add: "signs" }),
  look("signs", -7640, -4819, 1.3, 20, { eye: 1.6, pitch: 0.05, add: "signs" }),
  look("signs", -7640, -4819, 1.3, 40, { eye: 1.6, pitch: 0.03, add: "signs" }),
  look("signs-back", -7640, -4819, 1.3, 8, { eye: 1.6, pitch: 0.1, add: "signs-back" }),
  look("chase", -9749, -3084, -0.05, 30, { eye: 2.6, pitch: -0.12, measure: ["ground", "road"] }),
  look("town-chase", -1686, 4094, 0.12, 30, { eye: 2.6, pitch: -0.1, measure: ["ground", "road", "walls"] }),
];
