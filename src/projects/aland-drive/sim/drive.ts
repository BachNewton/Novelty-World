import RAPIER from "@dimforge/rapier3d-compat";
import { ribbonMesh, type RibbonMesh } from "../render/roads";
import type { TileData } from "../render/tile";
import { Car, type DriveInput } from "./car";
import { blendCarStates, headingOf, speedOf, type CarState } from "./car-state";
import { GroundBlocks } from "./ground";
import { RoadNet, type RoadPoint } from "./road-net";
import { STEP_S, WORLD } from "./tuning";

/*
 * One car on one tile, stepped at a fixed rate and shaped for drawing between
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
}

const JOLT_WINDOW_STEPS = 6;
export const START_ALONG_M = 220;

const emptyLog = (): DriveLog => ({ steps: 0, metres: 0, topSpeedMS: 0, contactLosses: 0, airborneSteps: 0, worstJoltG: 0, furthestOffRoadM: 0, respawns: 0 });

export async function initPhysics(): Promise<void> {
  await RAPIER.init();
}

export class Drive {
  readonly net: RoadNet;
  readonly ribbon: RibbonMesh;
  readonly world: RAPIER.World;
  readonly ground: GroundBlocks;
  private readonly car: Car;
  private before: CarState;
  private after: CarState;
  private wetSteps = 0;
  private flippedSteps = 0;
  private readonly recentVerticalSpeeds: number[] = [];
  private touching = [true, true, true, true];
  log = emptyLog();

  constructor(private readonly tile: TileData) {
    this.ribbon = ribbonMesh(tile.surface);
    this.net = new RoadNet(tile.surface);
    this.world = new RAPIER.World({ x: 0, y: -WORLD.gravity, z: 0 });
    this.world.timestep = STEP_S;
    this.ground = new GroundBlocks(this.world, tile.grid, this.ribbon);
    this.addWalls();
    this.car = new Car(this.world);
    const start = this.net.at(0, START_ALONG_M);
    this.placeAt(start);
    this.before = this.after = this.car.state();
  }

  private addWalls(): void {
    const { west, east, south, north } = this.tile.manifest.bounds;
    const { wallHeightM: tall, wallThicknessM: thick } = WORLD;
    const halfWide = (east - west) / 2;
    const middleX = (west + east) / 2;
    const middleZ = -(south + north) / 2;
    const wall = (x: number, z: number, halfX: number, halfZ: number) => {
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(halfX, tall, halfZ).setTranslation(x, 0, z).setFriction(0.05));
    };
    wall(west - thick, middleZ, thick, halfWide + 2 * thick);
    wall(east + thick, middleZ, thick, halfWide + 2 * thick);
    wall(middleX, -north - thick, halfWide + 2 * thick, thick);
    wall(middleX, -south + thick, halfWide + 2 * thick, thick);
  }

  placeAt(road: RoadPoint): void {
    this.ground.around(road.x, road.z);
    this.car.place([road.x, road.y, road.z], road.heading);
    this.world.step();
    this.wetSteps = 0;
    this.flippedSteps = 0;
    this.recentVerticalSpeeds.length = 0;
  }

  /** Back to the nearest road, facing the way along it nearest the way the car faced. */
  respawn(): void {
    const { position, rotation } = this.car.state();
    const road = this.net.nearest(position[0], position[2]);
    const facingAlong = Math.cos(headingOf(rotation) - road.heading) >= 0;
    this.placeAt({ ...road, heading: facingAlong ? road.heading : road.heading + Math.PI });
    this.after = this.car.state();
    this.log.respawns++;
  }

  private overWater(x: number, z: number): boolean {
    const { grid, waterNodes } = this.tile;
    const column = Math.round((x - grid.west) / grid.stepM);
    const row = Math.round((grid.north + z) / grid.stepM);
    if (column < 0 || row < 0 || column >= grid.nodes || row >= grid.nodes || waterNodes[row * grid.nodes + column] === 0) return false;
    return this.net.nearest(x, z).distance > 6;
  }

  step(input: DriveInput): void {
    this.before = this.after;
    const { position } = this.before;
    this.ground.around(position[0], position[2]);
    this.car.step(input);
    if (this.overWater(position[0], position[2])) {
      this.car.addDrag(WORLD.waterDrag);
      this.wetSteps++;
    } else {
      this.wetSteps = 0;
    }
    this.flippedSteps = this.car.uprightness() < 0.2 ? this.flippedSteps + 1 : 0;
    this.world.step();
    this.after = this.car.state();
    this.record();
    if (this.wetSteps > WORLD.waterStepsToRespawn || this.flippedSteps > WORLD.flippedStepsToRespawn) this.respawn();
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
      log.worstJoltG = Math.max(log.worstJoltG, change / WORLD.gravity);
      speeds.shift();
    }
    log.furthestOffRoadM = Math.max(log.furthestOffRoadM, this.net.nearest(position[0], position[2]).distance);
  }

  /** The car a share of the way from the last step to this one. */
  stateAt(share: number): CarState {
    return blendCarStates(this.before, this.after, share);
  }

  dispose(): void {
    this.world.free();
  }
}
