// The knobs that set how Frogmino feels. Depths and distances are in world
// units: one unit is one cube, the width of a corridor column.
export interface Tuning {
  // How fast the walls come at the frog, in units per second.
  wallSpeed: number;
  // The gap between one wall and the next, in units.
  wallSpacing: number;
  // How long a hop keeps the frog one cell up, in seconds.
  hopAirtime: number;
  // Roughly how long the drawn frog takes to catch up with a move, in seconds.
  easeDuration: number;
  // How many depth steps a bonk shoves the frog back.
  bonkKnockback: number;
  // Columns across the corridor.
  corridorCols: number;
  // Depth steps the frog can stand on, from the corridor start.
  corridorSteps: number;
  // Rows of cubes in a wall.
  wallRows: number;
  // The distance between two depth steps, in units.
  depthStep: number;
  // The depth step a run starts on.
  startStep: number;
  // The longest frame the rules will advance by, in seconds, so returning to
  // a backgrounded tab doesn't lurch the walls forward.
  maxFrameDelta: number;
  // How long the pass or bonk flash lasts, in seconds.
  flashDuration: number;
}

export const TUNING: Tuning = {
  wallSpeed: 3,
  wallSpacing: 15,
  hopAirtime: 0.6,
  easeDuration: 0.1,
  bonkKnockback: 3,
  corridorCols: 7,
  corridorSteps: 10,
  wallRows: 4,
  depthStep: 1.5,
  startStep: 2,
  maxFrameDelta: 0.1,
  flashDuration: 0.35,
};
