import type RAPIER from "@dimforge/rapier3d-compat";
import type { Vector3 } from "./car-state";

/*
 * Rapier keeps every position as a 32-bit float, whose steps grow with the
 * distance from its origin: at 22 km they are 2 mm, and a car's body moves in
 * jumps of a few of them a step, so a car crawling or reversing there moves in
 * jerks of nearly 1 m/s. So Rapier's origin isn't the world's: it is the
 * physics centre, a place near the player's car, and every position goes to
 * Rapier less the centre and comes back plus it. Everything outside the four
 * files that talk to Rapier sees world places only.
 *
 * When the player's car gets far enough from the centre the centre moves to it,
 * and every body and collider in the world moves by the same amount, just before
 * the world steps: a ray only finds a moved collider once the world has stepped,
 * so the move comes after the step's rays, never between them and the step. The
 * centre sits on whole metres, so the move is exact: a float's place less a
 * whole number of metres, inside the range it is moved to, is a float again,
 * and nothing in the world shifts by so much as a rounding.
 */

/**
 * How far the player's car gets from the centre, along either axis, before the centre moves to it. Within 1024 m a
 * float's step is 61 µm, so a car's speed moves in steps of at most 0.03 m/s, a thirty-second of what the farthest
 * corner of the map showed; moving the centre costs a pass over the loaded ground and the cars, too little to matter
 * at once a kilometre.
 */
export const RECENTRE_M = 1000;

export class PhysicsCentre {
  /** Where Rapier's origin is in the world: whole metres east and south. */
  x = 0;
  z = 0;

  /** A place in the world, as Rapier has it. */
  toPhysics([x, y, z]: Vector3): RAPIER.Vector {
    return { x: x - this.x, y, z: z - this.z };
  }

  /** A place Rapier has, in the world. */
  fromPhysics({ x, y, z }: RAPIER.Vector): Vector3 {
    return [x + this.x, y, z + this.z];
  }

  /** Whether a place is far enough from the centre that the centre should move to it. */
  isFar([x, , z]: Vector3): boolean {
    return Math.max(Math.abs(x - this.x), Math.abs(z - this.z)) > RECENTRE_M;
  }

  /** Moves the centre to a place, and every body and collider in Rapier with it, so nothing moves in the world. */
  moveTo(rapier: RAPIER.World, x: number, z: number): void {
    const dx = Math.round(x) - this.x;
    const dz = Math.round(z) - this.z;
    if (dx === 0 && dz === 0) return;
    this.x += dx;
    this.z += dz;
    rapier.forEachRigidBody((body) => {
      const at = body.translation();
      body.setTranslation({ x: at.x - dx, y: at.y, z: at.z - dz }, false);
    });
    rapier.forEachCollider((collider) => {
      // A body's colliders move with it.
      if (collider.parent()) return;
      const at = collider.translation();
      collider.setTranslation({ x: at.x - dx, y: at.y, z: at.z - dz });
    });
  }
}
