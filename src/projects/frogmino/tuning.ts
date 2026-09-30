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
  // How many lanes wide a pull-off is.
  pullOffWidth: number;
  // How far along the course a pull-off's stretch reaches, between its
  // barriers, in units. It must hold the frog wherever a jump from outside
  // lands, so at least the frog's depth plus a jump.
  pullOffLength: number;
  // The pace the course expects the frog to advance at, in units per second,
  // counting the time it waits for rows. Rows come at the frog as it goes, so
  // it meets a row well short of where the row starts; the course places each
  // pull-off where a frog at this pace would be between the rows either side.
  pullOffPace: number;
  // How far ahead of a pull-off the camera starts making room for it, in
  // units.
  cameraPullOffReach: number;
  // Roughly how long the camera takes to make room for a pull-off, or to
  // settle back, in seconds.
  cameraPullOffEase: number;
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
  pullOffWidth: 3,
  pullOffLength: 6,
  pullOffPace: 4.5,
  cameraPullOffReach: 12,
  cameraPullOffEase: 0.6,
};
