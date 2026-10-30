import RAPIER from "@dimforge/rapier3d-compat";
import { Car, type DriveInput } from "./car";
import { blendCarStates, headingOf, speedOf, type CarState } from "./car-state";
import { GroundBlocks } from "./ground";
import type { RoadPoint } from "./road-net";
import { STEP_S, WORLD as PHYSICS } from "./tuning";
import type { World } from "./world";

/*
 * One car in the world, stepped at a fixed rate and shaped for drawing between
 * steps. It holds no clock: given the same inputs it plays out the same, which
 * is what the scripted drive and the tests rely on. Rendering reads `stateAt`.
 */

/** What a drive has done, counted step by step. */
export interface DriveLog {
  steps: number;
  metres: number;
  topSpeedMS: number;
  /** Times a wheel left the ground. */
  contactLosses: number;
  /** Steps with no wheel on the ground at all. */
  airborneSteps: number;
  /** The sharpest change in the car's vertical speed, in g, over JOLT_WINDOW_STEPS. */
  worstJoltG: number;
  /** Furthest from the nearest road's centre. */
  furthestOffRoadM: number;
  respawns: number;
  /** Steps with the car on ground whose detail hadn't arrived. */
  farGroundSteps: number;
}

const JOLT_WINDOW_STEPS = 6;
export const START_ALONG_M = 220;

export const emptyLog = (): DriveLog => ({ steps: 0, metres: 0, topSpeedMS: 0, contactLosses: 0, airborneSteps: 0, worstJoltG: 0, furthestOffRoadM: 0, respawns: 0, farGroundSteps: 0 });

export async function initPhysics(): Promise<void> {
  await RAPIER.init();
}

export class Drive {
  readonly rapier: RAPIER.World;
  readonly ground: GroundBlocks;
  private readonly car: Car;
  private before!: CarState;
  private after!: CarState;
  private wetSteps = 0;
  private flippedSteps = 0;
  private readonly recentVerticalSpeeds: number[] = [];
  private touching = [true, true, true, true];
  log = emptyLog();

  constructor(
    private readonly world: World,
    start: RoadPoint,
  ) {
    this.rapier = new RAPIER.World({ x: 0, y: -PHYSICS.gravity, z: 0 });
    this.rapier.timestep = STEP_S;
    this.ground = new GroundBlocks(this.rapier, world);
    this.addWalls();
    this.car = new Car(this.rapier);
    this.placeAt(start);
  }

  /** A wall on every side of a tile that has no tile beyond it: the world's deliberate end. */
  private addWalls(): void {
    const { tileM } = this.world;
    const { wallHeightM: tall, wallThicknessM: thick } = PHYSICS;
    const half = tileM / 2;
    const wall = (x: number, z: number, halfX: number, halfZ: number) => {
      this.rapier.createCollider(RAPIER.ColliderDesc.cuboid(halfX, tall, halfZ).setTranslation(x, 0, z).setFriction(0.05));
    };
    for (const { column, row } of this.world.all()) {
      const west = column * tileM;
      const top = row * tileM;
      if (!this.world.has(column - 1, row)) wall(west - thick, top + half, thick, half + 2 * thick);
      if (!this.world.has(column + 1, row)) wall(west + tileM + thick, top + half, thick, half + 2 * thick);
      if (!this.world.has(column, row - 1)) wall(west + half, top - thick, half + 2 * thick, thick);
      if (!this.world.has(column, row + 1)) wall(west + half, top + tileM + thick, half + 2 * thick, thick);
    }
  }

  placeAt(road: RoadPoint): void {
    this.ground.around(road.x, road.z);
    this.car.place([road.x, road.y, road.z], road.heading);
    this.rapier.step();
    this.before = this.after = this.car.state();
    this.wetSteps = 0;
    this.flippedSteps = 0;
    this.recentVerticalSpeeds.length = 0;
  }

  /** Back to the nearest road, facing the way along it nearest the way the car faced. */
  respawn(): void {
    const { position, rotation } = this.car.state();
    const road = this.world.roads.nearest(position[0], position[2]);
    if (!road) throw new Error(`no road loaded anywhere near ${position[0]}, ${position[2]}`);
    const facingAlong = Math.cos(headingOf(rotation) - road.heading) >= 0;
    this.placeAt({ ...road, heading: facingAlong ? road.heading : road.heading + Math.PI });
    this.log.respawns++;
  }

  private overWater(x: number, z: number): boolean {
    if (!this.world.isWater(x, z)) return false;
    const road = this.world.roads.nearest(x, z);
    return !road || road.distance > 6;
  }

  step(input: DriveInput): void {
    this.before = this.after;
    const { position } = this.before;
    this.ground.around(position[0], position[2]);
    this.car.step(input);
    if (this.overWater(position[0], position[2])) {
      this.car.addDrag(PHYSICS.waterDrag);
      this.wetSteps++;
    } else {
      this.wetSteps = 0;
    }
    this.flippedSteps = this.car.uprightness() < 0.2 ? this.flippedSteps + 1 : 0;
    this.rapier.step();
    this.after = this.car.state();
    this.record();
    if (this.wetSteps > PHYSICS.waterStepsToRespawn || this.flippedSteps > PHYSICS.flippedStepsToRespawn) this.respawn();
  }

  private record(): void {
    const log = this.log;
    const { position, velocity } = this.after;
    log.steps++;
    log.metres += Math.hypot(position[0] - this.before.position[0], position[2] - this.before.position[2]);
    log.topSpeedMS = Math.max(log.topSpeedMS, speedOf(this.after));
    this.car.contact.forEach((touching, wheel) => {
      if (this.touching[wheel] && !touching) log.contactLosses++;
      this.touching[wheel] = touching;
    });
    if (!this.car.contact.some(Boolean)) log.airborneSteps++;
    const speeds = this.recentVerticalSpeeds;
    speeds.push(velocity[1]);
    if (speeds.length > JOLT_WINDOW_STEPS) {
      const change = Math.abs(velocity[1] - speeds[0]) / (JOLT_WINDOW_STEPS * STEP_S);
      log.worstJoltG = Math.max(log.worstJoltG, change / PHYSICS.gravity);
      speeds.shift();
    }
    log.furthestOffRoadM = Math.max(log.furthestOffRoadM, this.world.roads.nearest(position[0], position[2])?.distance ?? 0);
    if (!this.world.tileAt(position[0], position[2])?.detail) log.farGroundSteps++;
  }

  /** The car a share of the way from the last step to this one. */
  stateAt(share: number): CarState {
    return blendCarStates(this.before, this.after, share);
  }

  dispose(): void {
    this.rapier.free();
  }
}
