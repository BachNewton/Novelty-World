/*
 * Suggested cameras for riding, in the shape of `CHASE` and `HOOD` in
 * `render/chase-camera.ts`. Closer and lower than the car's, because a rider is
 * 1.8 m tall and half a metre wide, and at 8 m/s the road needs no reading far
 * ahead. Metres from the bike's origin, on the road between the axles.
 */

export const BIKE_CHASE = {
  behindM: 3.6,
  aboveM: 1.7,
  lookAheadM: 4,
  lookAboveM: 0.6,
  speedBackM: 0.6,
  swingPerS: 4,
  heightPerS: 6,
  fieldOfViewDeg: 60,
  speedFieldOfViewDeg: 8,
  fieldOfViewPerS: 3,
  topSpeedMS: 14,
  slowMS: 1,
  aboveGroundM: 0.7,
} as const;

/** Just behind the rider's eyes, the `eye` of a pose, with `firstPerson` on so the bars and arms show and the head doesn't. */
export const BIKE_FIRST_PERSON = {
  lookAheadM: 12,
  /** Below the eyes at that distance: enough to bring the bars into the frame. */
  lookDownM: 4.5,
  fieldOfViewDeg: 82,
  /** How much of the bike's lean the horizon takes. */
  leanShare: 0.45,
} as const;
