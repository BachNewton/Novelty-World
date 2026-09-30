// The knobs that set how Frogmino feels. Depths and distances are in world
// units: one unit is one cube, the width of a corridor column. Depth is
// measured forward from the start zone's edge.
export interface Tuning {
  // How fast the walls come at the frog, in units per second.
  wallSpeed: number;
  // Where the first wall starts.
  firstWallDepth: number;
  // The gap between one wall and the next, in units.
  wallSpacing: number;
  // How far the seed may shift each wall from even spacing, either way.
  wallJitter: number;
  // Where the end zone begins.
  courseLength: number;
  // How long a hop keeps the frog one cell up, in seconds.
  hopAirtime: number;
  // Roughly how long the drawn frog takes to catch up with a move, in seconds.
  easeDuration: number;
  // Columns across the corridor.
  corridorCols: number;
  // Rows of cubes in a wall.
  wallRows: number;
  // How far one jump carries the frog, in units.
  depthStep: number;
  // How often a held jump key jumps again, in seconds.
  jumpRepeatInterval: number;
  // How many jumps' distance a bonk knocks the frog back.
  bonkKnockback: number;
  // The longest frame the rules will advance by, in seconds, so returning to
  // a backgrounded tab doesn't lurch the walls forward.
  maxFrameDelta: number;
  // How long the bonk flash lasts, in seconds.
  flashDuration: number;
  // The camera's height above the floor. It must stay above the tallest
  // wall so walls pass beneath it.
  cameraHeight: number;
  // How far behind the frog the camera follows.
  cameraFollow: number;
  // How far ahead of the frog the camera looks, at floor level. It sets the
  // camera's downward pitch.
  cameraLookAhead: number;
}

export const TUNING: Tuning = {
  wallSpeed: 2.5,
  firstWallDepth: 15,
  wallSpacing: 14,
  wallJitter: 2,
  courseLength: 214,
  hopAirtime: 0.7,
  easeDuration: 0.1,
  corridorCols: 7,
  wallRows: 4,
  depthStep: 1.5,
  jumpRepeatInterval: 0.22,
  bonkKnockback: 3,
  maxFrameDelta: 0.1,
  flashDuration: 0.35,
  cameraHeight: 8.5,
  cameraFollow: 7,
  cameraLookAhead: 6,
};
