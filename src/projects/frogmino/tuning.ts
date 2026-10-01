// The knobs that set how Frogmino feels. Depths and distances are in world
// units: one unit is one cube, the width of a corridor column. Depth is
// measured forward from the course's start, at the foot of the overpass.
export interface Tuning {
  // How fast the walls come at the frog, in units per second.
  wallSpeed: number;
  // Where the first row's front starts.
  firstWallDepth: number;
  // The gap from one row's back (its longest vehicle's) to the next row's
  // front, in units: the reading time between rows, whatever their vehicles'
  // lengths.
  wallSpacing: number;
  // How far the seed may shift each gap from the spacing, either way.
  wallJitter: number;
  // Where the finish line is, under the finish gantry.
  courseLength: number;
  // How far behind the frog a row's back must be before it is recycled:
  // well behind the camera, which follows the frog, so a row never vanishes
  // on screen, and further than a frog knocked back by a needs-gate row ever
  // is from the gate it needs, so that row is still there to go back for.
  recycleBehind: number;
  // How far ahead of the frog a recycled row reappears, at the least: beyond
  // the world's fog, so a row never appears on screen. The traffic is laid
  // out this far ahead from the start.
  trafficHorizon: number;
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
  // How long the drawn frog takes to drop from the overpass to the road, in
  // seconds.
  dropDuration: number;
  // How long the drawn frog's leap from the spring pad onto the finish
  // gantry takes, in seconds. The done screen waits for it to land.
  finishLeapDuration: number;
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
  wallSpacing: 13,
  wallJitter: 2,
  courseLength: 214,
  recycleBehind: 36,
  trafficHorizon: 540,
  hopAirtime: 0.7,
  easeDuration: 0.1,
  corridorCols: 7,
  wallRows: 4,
  depthStep: 1.5,
  jumpRepeatInterval: 0.22,
  bonkKnockback: 3,
  maxFrameDelta: 0.1,
  dropDuration: 0.45,
  finishLeapDuration: 0.9,
  cameraHeight: 8.5,
  cameraFollow: 7,
  cameraLookAhead: 6,
};
