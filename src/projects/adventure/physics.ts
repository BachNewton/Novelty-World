/**
 * The world as the players' bodies meet it, in Rapier: every piece a few
 * stand-in shapes and the ground boxes (`colliders.ts`), each body a capsule
 * or a cylinder, and a box over every empty cell and along the grid's edge,
 * so no one walks or falls into nothing. Nothing is simulated: the players
 * move by Rapier's kinematic character controller, which slides a move along
 * what it meets, keeps them on the ground up and down its slopes and stands
 * them on top of what they land on; the villagers and animals stand where a
 * ray down meets the ground. So the world never steps but to bring its
 * queries up to date (`ColliderGroups`).
 */

import type RAPIER from "@dimforge/rapier3d-compat";
import { ColliderGroups } from "@/shared/lib/physics/collider-groups";
import type { Rapier } from "@/shared/lib/physics/rapier";
import { GROUND, MAX_HEIGHT } from "./ground";
import type { Mover, Point } from "./player";

/**
 * The player's capsule, slimmer than the drawn character, as games make it: a
 * body has to fit what reads as passable, and a head or an arm brushing into a
 * wall is never seen as wrong. Its width is set by the narrowest ways the
 * kits mean to be walked, measured from the pieces: the walk between a flight's
 * handrails and a hedge's gate, with its skin and `PASS_MARGIN` to spare. It
 * stands as tall as the characters do. The villagers are the same.
 */
export const BODY_RADIUS = 0.14;
export const BODY_HEIGHT = 0.75;
/** How much wider than the body, skin and all, a gap is to be walked through: so a fitted way through is never a squeeze. */
export const PASS_MARGIN = 0.02;
/** How much slimmer the bodies' stand-ins are than what is drawn: the player's against the widest of the characters' torsos. */
export const SLIM = BODY_RADIUS / 0.22;

/**
 * The steepest slope walked up and stood on; anything steeper is slid down.
 * Every flight of stairs is a slope as steep as its steps' noses run, and the
 * kits' stairs, cliff steps and ramps and the town's high roofs all climb
 * about a storey in a cell, its low roofs less: so every flight is climbed and
 * every roof stood on, while a hull's steep flank is slid off.
 */
export const MAX_SLOPE = (50 * Math.PI) / 180;
/** How far below a player on the ground the ground may drop away and still keep them on it: down a cliff's steps, the highest step. */
export const SNAP = 0.25;
/** The gap the controller keeps between a body and what it touches, so a touch is never an overlap. */
export const SKIN = 0.01;
/** How far a body on the ground is pressed down onto it each move, so it rests on it rather than a little above. */
const PRESS = 0.005;
/** How near level a face is to be level ground. */
const FLAT = 0.999;
/** The face of level ground. */
const LEVEL = { x: 0, y: 1, z: 0 };
/** A body's capsule from its feet to its middle. */
const HALF = BODY_HEIGHT / 2;

/** Who meets what: a collision group is the groups a collider is in, by the high half, and those it meets, by the low. */
const WORLD = 1;
const BODIES = 2;
const WALLS = 4;
const groups = (member: number, meets: number): number => (member << 16) | meets;
/** A body meets the world, the walls round where there is no ground, and every other body. */
const BODY_GROUPS = groups(BODIES, WORLD | WALLS | BODIES);
/** The walls round where there is no ground stop bodies, and nothing else. */
const WALL_GROUPS = groups(WALLS, BODIES);
/** A ray for the ground meets only the world: never a body standing on it, nor a wall. */
const GROUND_RAY = groups(WORLD, WORLD);

/** How high the boxes over empty cells and the grid's edge reach: above the highest ground's highest jump. */
const WALL_TOP = MAX_HEIGHT / 2 + 3;
const WALL_FOOT = -2;

/** A standing body that blocks: a villager's capsule, or an animal's cylinder, by where its feet are. */
export interface Body {
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
  round: boolean;
}

/** The work queries did, for tools: character moves and rays cast. */
export interface Queries {
  moves: number;
  rays: number;
}

/** The colliders of a group, made once Rapier is loaded. */
type Make = (rapier: Rapier) => RAPIER.ColliderDesc[];

/** A player's group: their capsule. */
export const playerGroup = (player: number): string => `player ${player}`;

/** A player's capsule, their feet at a point. */
export function playerBody(at: Point): Make {
  return (r) => [r.ColliderDesc.capsule(HALF - BODY_RADIUS, BODY_RADIUS).setTranslation(at.x, at.y + SKIN + HALF, at.z).setCollisionGroups(BODY_GROUPS)];
}

/** The villagers and animals standing, each blocking where it stands. */
export function standingBodies(bodies: readonly Body[]): Make {
  return (r) =>
    bodies.map((b) => (b.round ? r.ColliderDesc.capsule(b.height / 2 - b.radius, b.radius) : r.ColliderDesc.cylinder(b.height / 2, b.radius)).setTranslation(b.x, b.y + b.height / 2, b.z).setCollisionGroups(BODY_GROUPS));
}

/** The cells with no ground, boxed in so no one walks or falls into them. */
export function emptyBoxes(cells: readonly (readonly [number, number])[]): Make {
  return (r) => cells.map(([x, z]) => box(r, x, z, x + 1, z + 1));
}

export class Physics {
  readonly world: RAPIER.World;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly down: RAPIER.Ray;
  /** The queries made since the count was last taken. */
  private queries: Queries = { moves: 0, rays: 0 };
  /** The face each player stood on after their last move, by player, or null in the air. */
  private readonly underfoot = new Map<number, RAPIER.Vector | null>();
  /** Each collider's box on the ground, by its handle, for the overlay. */
  private readonly footprints = new Map<number, readonly [number, number, number, number]>();

  constructor(
    private readonly rapier: Rapier,
    /** Every collider of the world, by group: chunks, bodies, empty cells, the players. */
    readonly colliders: ColliderGroups,
  ) {
    // Nothing falls by itself: the players fall by their own steps, as a jump does.
    this.world = new rapier.World({ x: 0, y: 0, z: 0 });
    const controller = this.world.createCharacterController(SKIN);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.setMaxSlopeClimbAngle(MAX_SLOPE);
    controller.setMinSlopeSlideAngle(MAX_SLOPE);
    controller.enableSnapToGround(SNAP);
    controller.setApplyImpulsesToDynamicBodies(false);
    this.controller = controller;
    this.down = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    colliders.set("edges", (r) => edges(r));
  }

  /** Apply every change to the colliders asked for, and bring the queries up to date with them and every body moved. Says whether the colliders changed. */
  settle(): boolean {
    return this.colliders.settle(this.rapier, this.world);
  }

  /** Whether a player's capsule is in the world, so they can move. */
  has(player: number): boolean {
    return this.colliders.of(playerGroup(player)).length > 0;
  }

  /**
   * How a player moves: their capsule taken from where their feet are by the
   * move, as far as the controller lets it, and left there. The controller
   * slides it along what it meets, takes it up a slope it can climb and down
   * one it can stand on, and keeps it on the ground going down.
   *
   * On the ground the move goes along the ground's face, up or down it as it
   * slopes, and then a sweep straight down presses the body onto what it
   * stands on. The controller fits a level move to a slope by squeezing it
   * onto the face, which at 45° halves its speed across, where a walk up a
   * ramp or a flight goes as fast as one on the level; and a press down mixed
   * into a move across slides it back down a slope, where a press on its own
   * doesn't. In the air, or rising from a jump, a move is as asked.
   */
  mover(player: number): Mover {
    return (from, by) => {
      const held = this.colliders.of(playerGroup(player));
      if (held.length !== 1) throw new Error(`adventure: player ${player + 1} has no body`);
      const capsule = held[0];
      const start = { x: from.x, y: from.y + SKIN + HALF, z: from.z };
      const face = this.underfoot.get(player) ?? null;
      let end: RAPIER.Vector;
      if (face === null || by.y > 0) end = this.sweep(capsule, start, by);
      else {
        end = this.sweep(capsule, start, along(face, by));
        // Run onto a slope from the level, or from another slope: the move goes again, along the slope it met.
        const met = this.slopeMet();
        if (met !== null && Math.abs(met.y - face.y) > 1e-3) end = this.sweep(capsule, start, along(met, by));
        end = across(start, end, by);
        // The press only sets the body down: met on an edge, it would slide it across too.
        end = { ...end, y: this.sweep(capsule, end, { x: 0, y: -PRESS, z: 0 }).y };
      }
      capsule.setTranslation(end);
      const feet = { x: end.x, y: end.y - SKIN - HALF, z: end.z };
      const underfoot = this.controller.computedGrounded() ? this.faceUnder(feet, capsule) : null;
      this.underfoot.set(player, underfoot);
      return { ...feet, grounded: underfoot !== null };
    };
  }

  /** The capsule swept from its middle at one place by a move, as far as the controller lets it: where its middle ends. */
  private sweep(capsule: RAPIER.Collider, from: RAPIER.Vector, by: Point): RAPIER.Vector {
    capsule.setTranslation(from);
    this.queries.moves++;
    this.controller.computeColliderMovement(capsule, by, this.rapier.QueryFilterFlags.EXCLUDE_SENSORS, BODY_GROUPS);
    const moved = this.controller.computedMovement();
    return { x: from.x + moved.x, y: from.y + moved.y, z: from.z + moved.z };
  }


  /**
   * A slope the last sweep met that is gentle enough to walk up: the foot of a
   * ramp or a flight, met before the body's middle is over it.
   */
  private slopeMet(): RAPIER.Vector | null {
    let slope: RAPIER.Vector | null = null;
    for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
      const normal = this.controller.computedCollision(i)?.normal1;
      if (normal === undefined || normal.y < Math.cos(MAX_SLOPE) || normal.y > FLAT) continue;
      if (slope === null || normal.y < slope.y) slope = { x: normal.x, y: normal.y, z: normal.z };
    }
    return slope;
  }

  /**
   * The face under a body standing at its feet, read by a ray straight down
   * from its middle: level where the ray finds nothing within a step (a body
   * standing on an edge with its middle past it), or null where the face is
   * too steep to stand on. The controller counts a body on a steep slope as on
   * the ground, and slides it down only as fast as it is pressed down; taken
   * off the ground there, it falls, and slides off as fast as it falls.
   */
  private faceUnder(feet: Point, capsule: RAPIER.Collider): RAPIER.Vector | null {
    this.queries.rays++;
    this.down.origin = { x: feet.x, y: feet.y + SKIN + HALF, z: feet.z };
    const hit = this.world.castRayAndGetNormal(this.down, HALF + SKIN + SNAP, true, undefined, BODY_GROUPS, capsule);
    if (hit === null) return LEVEL;
    return hit.normal.y >= Math.cos(MAX_SLOPE) ? { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z } : null;
  }

  /** The height of the highest ground under a point no higher than `top`, or null where there is none. */
  groundBelow(x: number, z: number, top: number): number | null {
    this.queries.rays++;
    this.down.origin = { x, y: top, z };
    const hit = this.world.castRay(this.down, top - WALL_FOOT, true, undefined, GROUND_RAY);
    return hit === null ? null : top - hit.timeOfImpact;
  }

  /** The queries made since last asked. */
  takeQueries(): Queries {
    const taken = this.queries;
    this.queries = { moves: 0, rays: 0 };
    return taken;
  }

  /**
   * The colliders' edges within `reach` of a point across the ground, as
   * segments (six numbers each, from x, y, z, to x, y, z): Rapier's own
   * drawing of what it holds, for the debug overlay, asked only of the
   * colliders that come within reach: the bodies (the players', the
   * villagers', the animals'), or everything else, which never moves.
   */
  linesNear(x: number, z: number, reach: number, bodies: boolean): Float32Array {
    const { vertices } = this.world.debugRender(undefined, (collider) => {
      if ((collider.collisionGroups() === BODY_GROUPS) !== bodies) return false;
      const [minX, minZ, maxX, maxZ] = this.footprintOf(collider);
      return maxX >= x - reach && minX <= x + reach && maxZ >= z - reach && minZ <= z + reach;
    });
    const kept: number[] = [];
    const near = (i: number): boolean => Math.abs(vertices[i] - x) <= reach && Math.abs(vertices[i + 2] - z) <= reach;
    for (let i = 0; i < vertices.length; i += 6) {
      if (near(i) && near(i + 3)) for (let k = 0; k < 6; k++) kept.push(vertices[i + k]);
    }
    return Float32Array.from(kept);
  }


  /** The box a collider covers on the ground, from −x, −z to +x, +z: measured once for each, since none is moved but a body, whose footprint is small. */
  private footprintOf(collider: RAPIER.Collider): readonly [number, number, number, number] {
    let footprint = this.footprints.get(collider.handle);
    if (footprint === undefined) {
      const at = collider.translation();
      const { shape } = collider;
      if (shape instanceof this.rapier.ConvexPolyhedron) {
        let [minX, minZ, maxX, maxZ] = [Infinity, Infinity, -Infinity, -Infinity];
        for (let i = 0; i < shape.vertices.length; i += 3) {
          minX = Math.min(minX, shape.vertices[i]);
          maxX = Math.max(maxX, shape.vertices[i]);
          minZ = Math.min(minZ, shape.vertices[i + 2]);
          maxZ = Math.max(maxZ, shape.vertices[i + 2]);
        }
        footprint = [at.x + minX, at.z + minZ, at.x + maxX, at.z + maxZ];
      } else if (shape instanceof this.rapier.Cuboid) {
        const half = shape.halfExtents;
        footprint = [at.x - half.x, at.z - half.z, at.x + half.x, at.z + half.z];
      } else if (shape instanceof this.rapier.Cylinder && collider.collisionGroups() !== BODY_GROUPS) {
        footprint = [at.x - shape.radius, at.z - shape.radius, at.x + shape.radius, at.z + shape.radius];
      } else {
        // A body: a capsule or a cylinder, which moves, so its reach is kept round wherever it is.
        return [at.x - 1, at.z - 1, at.x + 1, at.z + 1];
      }
      this.footprints.set(collider.handle, footprint);
    }
    return footprint;
  }

  dispose(): void {
    this.world.free();
  }
}

/** A box over cells from one corner to the other, from below the grid to above any jump. */
function box(r: Rapier, x0: number, z0: number, x1: number, z1: number): RAPIER.ColliderDesc {
  return r.ColliderDesc.cuboid((x1 - x0) / 2, (WALL_TOP - WALL_FOOT) / 2, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, (WALL_TOP + WALL_FOOT) / 2, (z0 + z1) / 2).setCollisionGroups(WALL_GROUPS);
}

/** A wall of boxes round the grid, a cell thick. */
function edges(r: Rapier): RAPIER.ColliderDesc[] {
  const low = GROUND.min;
  const high = GROUND.max + 1;
  return [box(r, low - 1, low - 1, high + 1, low), box(r, low - 1, high, high + 1, high + 1), box(r, low - 1, low, low, high), box(r, high, low, high + 1, high)];
}

/** A move across the ground, along a face: up or down it as it slopes. */
function along(face: RAPIER.Vector, by: Point): Point {
  return { x: by.x, y: -(face.x * by.x + face.z * by.z) / face.y, z: by.z };
}

/**
 * Where a move on the ground ends, never further across than it asked to go.
 * Where two colliders meet edge to edge, as a roof's pieces or a flight and
 * the plinth at its top do, the controller meets the seam's edge and pushes
 * the body back out to its skin's width along that edge's slant, which on a
 * slope carries it a little further across than asked: kept, it is a walk that
 * speeds up at every seam.
 */
function across(start: RAPIER.Vector, end: RAPIER.Vector, by: Point): RAPIER.Vector {
  const asked = Math.hypot(by.x, by.z);
  const went = Math.hypot(end.x - start.x, end.z - start.z);
  if (went <= asked) return end;
  const keep = asked / went;
  return { x: start.x + (end.x - start.x) * keep, y: end.y, z: start.z + (end.z - start.z) * keep };
}
