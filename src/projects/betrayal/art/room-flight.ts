import * as THREE from "three";

/*
 * A room moved by a rule (the Mystic Elevator, a card) travelling to its new
 * cell, with everything standing in it: lifted off its old cell, carried
 * across (and up or down to its new floor), turning to its new way round on
 * the way, and set down. The game has already moved it: this only shows how.
 */

/** How high the room is lifted above the higher of its two floors, in metres,
 *  and the shares of the flight spent lifting it and setting it down. */
export const FLIGHT = { lift: 1.6, rise: 0.25, fall: 0.25 };

/** One end of a flight: the middle of the room's cell on its floor, in the
 *  scene, and its turn about the vertical, in radians. */
export interface FlightEnd {
  centre: THREE.Vector3;
  turn: number;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const share = (t: number, from: number, to: number) => smooth(THREE.MathUtils.clamp((t - from) / (to - from), 0, 1));

/** The turn from `from` to `to` the short way round, in (-π, π]. */
function shortTurn(from: number, to: number): number {
  const turn = THREE.MathUtils.euclideanModulo(to - from, Math.PI * 2);
  return turn > Math.PI ? turn - Math.PI * 2 : turn;
}

/** Where the room is at `t`, from 0 (on its old cell) to 1 (on its new one). */
export function flightPose(from: FlightEnd, to: FlightEnd, t: number): FlightEnd {
  const { lift, rise, fall } = FLIGHT;
  const top = Math.max(from.centre.y, to.centre.y) + lift;
  const across = share(t, rise, 1 - fall);
  const y = t < rise ? THREE.MathUtils.lerp(from.centre.y, top, share(t, 0, rise)) : THREE.MathUtils.lerp(top, to.centre.y, share(t, 1 - fall, 1));
  return {
    centre: new THREE.Vector3(THREE.MathUtils.lerp(from.centre.x, to.centre.x, across), y, THREE.MathUtils.lerp(from.centre.z, to.centre.z, across)),
    turn: from.turn + shortTurn(from.turn, to.turn) * across,
  };
}

const placing = (end: FlightEnd) => new THREE.Matrix4().makeRotationY(end.turn).setPosition(end.centre);

/** What carries the room and what stands in it at `t`: from where they are at
 *  rest on the new cell to where the room is in its flight. */
export function carrying(from: FlightEnd, to: FlightEnd, t: number): THREE.Matrix4 {
  return placing(flightPose(from, to, t)).multiply(placing(to).invert());
}
