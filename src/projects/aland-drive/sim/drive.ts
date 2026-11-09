import RAPIER from "@dimforge/rapier3d-compat";
import { Car, NO_INPUT, type Assists, type DriveInput, type Tread } from "./car";
import { DEFAULT_CAR, type CarId } from "./cars";
import { blendCarStates, headingOf, speedOf, type CarState, type Vector3 } from "./car-state";
import type { EngineRead, Shifting } from "./gearbox";
import { GroundBlocks } from "./ground";
import { WORLD_GROUPS } from "./groups";
import { PhysicsCentre } from "./physics-centre";
import { RemoteCars } from "./remote-cars";
import type { RoadPoint } from "./road-net";
import type { Condition, Surface, Tyre } from "./surfaces";
import { STEP_S, WORLD as PHYSICS } from "./tuning";
import type { World } from "./world";

/*
 * The cars in the world, stepped at a fixed rate and shaped for drawing between
 * steps: the player's, and any others the game drives itself (racers, a traffic
 * car once it's hit), each a full car from its own input in the same Rapier
 * world, so they all touch each other and the ground is loaded round every one.
 * It holds no clock: given the same inputs it plays out the same, which is what
 * the scripted drive and the tests rely on. Rendering reads `stateAt`.
 *
 * Rapier's origin is the physics centre (`physics-centre.ts`), which follows the
 * player's car: everything here takes and gives places in the world.
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

/** One simulated car: its body, the input it's driven by, its last two steps and what it has done. */
export class SimulatedCar {
  /** What the car is driven by on the coming steps, held until it's changed, as a pad's sticks are. */
  input: DriveInput = NO_INPUT;
  log = emptyLog();
  /** Its paint, by its index in its car's list: the driver's choice, which the simulation only carries in its state. */
  paint = 0;
  /** Out of the world for one step after it's put down: a collider made since the last step isn't found by a ray until the world steps, so its ground isn't there to it yet. */
  private landing = false;
  private before!: CarState;
  private after!: CarState;
  private readonly recentVerticalSpeeds: number[] = [];
  private readonly touching = [true, true, true, true];

  constructor(
    private car: Car,
    private readonly world: World,
  ) {}

  get id(): CarId {
    return this.car.id;
  }

  /** Where the car was at the end of the last step. */
  get position(): Vector3 {
    return this.after.position;
  }

  place(road: RoadPoint): void {
    this.car.place([road.x, road.y, road.z], road.heading);
    this.settled();
  }

  resume(state: CarState): void {
    this.car.resume(state);
    this.settled();
  }

  /** Starts the car's motion over from where its body is now. */
  settled(): void {
    this.before = this.after = this.car.state();
    this.recentVerticalSpeeds.length = 0;
  }

  /** Sits out the coming step, touching nothing. */
  land(): void {
    this.landing = true;
    this.car.body.setEnabled(false);
  }

  /** The tyres the car has on. */
  get tyres(): Tyre {
    return this.car.tyres;
  }

  set tyres(tyres: Tyre) {
    this.car.tyres = tyres;
  }

  /** The driver's aids the car is driven with, which a swapped car keeps. */
  get assists(): Assists {
    return this.car.assists;
  }

  set assists(assists: Assists) {
    this.car.assists = assists;
  }

  /** Whether the box shifts by itself or only when the driver shifts it, which a swapped car keeps. */
  get shifting(): Shifting {
    return this.car.shifting;
  }

  set shifting(shifting: Shifting) {
    this.car.shifting = shifting;
  }

  /** The driver shifts a gear up or down, in manual. */
  shift(way: 1 | -1): void {
    this.car.shift(way);
  }

  swap(rapier: RAPIER.World, centre: PhysicsCentre, ground: GroundBlocks, id: CarId, tyres: Tyre): void {
    this.car.tyres = tyres;
    if (id === this.car.id) return;
    const next = new Car(rapier, centre, id, ground, tyres);
    next.takeOver(this.car);
    this.car.remove();
    this.car = next;
    this.after = this.car.state();
    this.before = { ...this.before, car: id };
  }

  remove(): void {
    this.car.remove();
  }

  engine(): EngineRead & { reversing: boolean } {
    return { ...this.car.engine, reversing: this.car.reversing };
  }

  /** What each wheel was on the last time it touched: front left, front right, rear left, rear right. */
  surfaces(): readonly Surface[] {
    return this.car.surfaces;
  }

  /** The condition of what each wheel was on, in the same order: the weather's, or ice on the frozen sea. */
  conditions(): readonly Condition[] {
    return this.car.conditions;
  }

  /** How each wheel's tyre met the ground on the last step, in the same order. */
  treads(): readonly Readonly<Tread>[] {
    return this.car.treads;
  }

  /** The nearest road, facing the way along it nearest the way the car faces. */
  nearestRoad(): RoadPoint {
    const { position, rotation } = this.car.state();
    const road = this.world.roads.nearest(position[0], position[2]);
    if (!road) throw new Error(`no road loaded anywhere near ${position[0]}, ${position[2]}`);
    const facingAlong = Math.cos(headingOf(rotation) - road.heading) >= 0;
    return { ...road, heading: facingAlong ? road.heading : road.heading + Math.PI };
  }

  private overWater(x: number, z: number): boolean {
    if (!this.world.isWater(x, z) || this.world.bearsCar(x, z)) return false;
    const road = this.world.roads.nearest(x, z);
    return !road || road.distance > 6;
  }

  /** Before the world steps. */
  push(): void {
    this.before = this.after;
    if (this.landing) return;
    const { position } = this.before;
    this.car.step(this.input);
    if (this.overWater(position[0], position[2])) this.car.addDrag(PHYSICS.waterDrag);
  }

  /** After the world steps. */
  record(): void {
    if (this.landing) {
      this.landing = false;
      this.car.body.setEnabled(true);
      return;
    }
    this.after = this.car.state();
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

  /** The car a share of the way from the last step to this one, in its paint as it is now, paused or not. */
  stateAt(share: number): CarState {
    return { ...blendCarStates(this.before, this.after, share), paint: this.paint };
  }
}

const placeOf = ([x, , z]: Vector3) => ({ x, z });

export class Drive {
  private readonly rapier: RAPIER.World;
  /** Where Rapier's origin is in the world: near the player's car. */
  private readonly centre = new PhysicsCentre();
  readonly ground: GroundBlocks;
  /** The player's car. */
  readonly player: SimulatedCar;
  /** Every other simulated car, in the order they were added, which is the order they step in. */
  private readonly others: SimulatedCar[] = [];
  /** Other players' cars, which the simulated cars can hit. */
  readonly remotes: RemoteCars;
  /** Traffic near a simulated car, which the simulated cars can hit too. */
  readonly traffic: RemoteCars;
  /** Times the player's car has been put somewhere rather than driven there. */
  placements = 0;

  constructor(
    private readonly world: World,
    start: RoadPoint,
    car: CarId = DEFAULT_CAR,
  ) {
    this.rapier = new RAPIER.World({ x: 0, y: -PHYSICS.gravity, z: 0 });
    this.rapier.timestep = STEP_S;
    this.centre.moveTo(this.rapier, start.x, start.z);
    this.ground = new GroundBlocks(this.rapier, world, this.centre);
    this.addWalls();
    this.player = new SimulatedCar(new Car(this.rapier, this.centre, car, this.ground), world);
    this.remotes = new RemoteCars(this.rapier, this.centre);
    this.traffic = new RemoteCars(this.rapier, this.centre);
    this.placeAt(start);
  }

  /** A wall on every side of a tile that has no tile beyond it: the world's deliberate end. */
  private addWalls(): void {
    const { tileM } = this.world;
    const { wallHeightM: tall, wallThicknessM: thick } = PHYSICS;
    const half = tileM / 2;
    const wall = (x: number, z: number, halfX: number, halfZ: number) => {
      const at = this.centre.toPhysics([x, 0, z]);
      this.rapier.createCollider(RAPIER.ColliderDesc.cuboid(halfX, tall, halfZ).setTranslation(at.x, at.y, at.z).setFriction(0.05).setCollisionGroups(WORLD_GROUPS));
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

  /** The ground round the player's car and every other, with somewhere a car is about to be put. */
  private loadGround(player: { x: number; z: number }, extra?: { x: number; z: number }): void {
    const places = [player, ...this.others.map(({ position }) => placeOf(position))];
    if (extra) places.push(extra);
    this.ground.around(places);
  }

  placeAt(road: RoadPoint): void {
    // A car put somewhere takes the centre with it; the step below puts what moved where the next step's rays find it.
    this.centre.moveTo(this.rapier, road.x, road.z);
    this.loadGround(road);
    this.player.place(road);
    this.remotes.placed(this.player.position);
    this.traffic.placed(this.player.position);
    this.rapier.step();
    this.player.settled();
    this.placements++;
  }

  /**
   * Another simulated car, put still on the road. It drives from its own `input`
   * and touches the player's car, every other simulated car and other players'
   * stand-ins. It sits out its first step while its ground reaches Rapier's
   * queries, so adding a car moves nothing else.
   */
  addCar(road: RoadPoint, id: CarId = DEFAULT_CAR, tyres: Tyre = "summer"): SimulatedCar {
    this.loadGround(placeOf(this.player.position), road);
    const car = new SimulatedCar(new Car(this.rapier, this.centre, id, this.ground, tyres), this.world);
    car.place(road);
    car.land();
    this.others.push(car);
    return car;
  }

  /** Another simulated car, where a state has it and moving as it moves: a traffic car once it's hit. */
  addMovingCar(state: CarState): SimulatedCar {
    this.loadGround(placeOf(this.player.position), placeOf(state.position));
    const car = new SimulatedCar(new Car(this.rapier, this.centre, state.car, this.ground), this.world);
    car.resume(state);
    car.land();
    this.others.push(car);
    return car;
  }

  removeCar(car: SimulatedCar): void {
    const at = this.others.indexOf(car);
    if (at < 0) throw new Error(`a ${car.id} that isn't in this drive`);
    car.remove();
    this.others.splice(at, 1);
  }

  /** The other simulated cars, in the order they step. */
  cars(): readonly SimulatedCar[] {
    return this.others;
  }

  /** What the player's car has done. */
  get log(): DriveLog {
    return this.player.log;
  }

  set log(log: DriveLog) {
    this.player.log = log;
  }

  /** The car being driven. */
  get carId(): CarId {
    return this.player.id;
  }

  /** Swaps the car for another, on its own tyres, mid-drive: the new one carries on from where the old one was, as it was moving. */
  setCar(id: CarId, tyres: Tyre = "summer"): void {
    this.player.swap(this.rapier, this.centre, this.ground, id, tyres);
  }

  /** The paint of the car being driven, by its index in the car's list. */
  get paint(): number {
    return this.player.paint;
  }

  set paint(paint: number) {
    this.player.paint = paint;
  }

  /** The tyres on the car being driven. */
  get tyres(): Tyre {
    return this.player.tyres;
  }

  set tyres(tyres: Tyre) {
    this.player.tyres = tyres;
  }

  /** The driver's aids on the car being driven. */
  get assists(): Assists {
    return this.player.assists;
  }

  set assists(assists: Assists) {
    this.player.assists = assists;
  }

  /** Whether the car being driven shifts by itself or only when the player shifts it. */
  get shifting(): Shifting {
    return this.player.shifting;
  }

  set shifting(shifting: Shifting) {
    this.player.shifting = shifting;
  }

  /** The player shifts a gear up or down, in manual. */
  shift(way: 1 | -1): void {
    this.player.shift(way);
  }

  /** What the weather has made of every surface, for every car: dry until something says otherwise. */
  get condition(): Condition {
    return this.ground.condition;
  }

  set condition(condition: Condition) {
    this.ground.condition = condition;
  }

  /** The engine as it stands after the last step, and whether the car is in reverse. */
  engine(): EngineRead & { reversing: boolean } {
    return this.player.engine();
  }

  /** Back to the nearest road, facing the way along it nearest the way the car faced. */
  respawn(): void {
    this.placeAt(this.player.nearestRoad());
    this.log.respawns++;
  }

  /** One step of every car: the player's from this input, the others from their own. */
  step(input: DriveInput): void {
    this.player.input = input;
    this.loadGround(placeOf(this.player.position));
    const cars = [this.player, ...this.others];
    for (const car of cars) car.push();
    const at = cars.map(({ position }) => position);
    this.remotes.steer(at);
    this.traffic.steer(at);
    // After every ray of this step and before the world steps, which is what puts moved colliders where rays find them.
    if (this.centre.isFar(this.player.position)) this.centre.moveTo(this.rapier, this.player.position[0], this.player.position[2]);
    this.rapier.step();
    this.remotes.settle();
    this.traffic.settle();
    for (const car of cars) car.record();
  }

  /**
   * What a ray straight down from a height over a place hits first, as a wheel's would: the ground round the place is
   * loaded and the world stepped, which is what lets a ray find a collider just made. For tests and tools that check
   * the ground; it steps the cars too.
   */
  castDown(x: number, z: number, fromY: number): RAPIER.RayColliderIntersection | null {
    this.ground.around([{ x, z }]);
    this.rapier.step();
    return this.rapier.castRayAndGetNormal(new RAPIER.Ray(this.centre.toPhysics([x, fromY, z]), { x: 0, y: -1, z: 0 }), 2 * fromY, true);
  }

  /** Where Rapier's origin is in the world, whole metres east and south. */
  get physicsCentre(): { x: number; z: number } {
    return { x: this.centre.x, z: this.centre.z };
  }

  /** The player's car a share of the way from the last step to this one. */
  stateAt(share: number): CarState {
    return this.player.stateAt(share);
  }

  dispose(): void {
    this.rapier.free();
  }
}
