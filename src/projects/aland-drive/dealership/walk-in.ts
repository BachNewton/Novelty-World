import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, PerspectiveCamera, Scene, SphereGeometry, Vector3, type Node, type WebGPURenderer } from "three/webgpu";
import { float, positionWorld } from "three/tsl";
import { buildExterior, DEALER_SITES, dealerMaterial, geometryOf, restingCar, type DealerSite } from "../art/dealers";
import { Shell } from "../art/dealers/shell";
import { createCarView } from "../art/cars/model";
import { createCockpit } from "../art/cars/cockpit/view";
import { paintsOf } from "../art/cars/paints";
import type { LiveSun } from "../art/sun";
import type { DriveAudio } from "../audio/graph";
import type { WalkInput } from "../input/controls";
import { START_RING_M } from "../challenge/board";
import type { StartMark } from "../render/challenge-marks";
import { CARS as TUNINGS, type CarId } from "../sim/cars";
import { speedOf, type CarState } from "../sim/car-state";
import type { Units } from "../units";
import type { DealerInterior, Solid, Spot } from "./interior";
import { carBox, carReach, carSpec, carsOnSpots } from "./rules";
import { boxDistance, settle, type PlanBox } from "./plan";
import { DEALERSHIPS, type Dealership } from "./registry";
import { createRoomLighting } from "./room-light";
import { createIslandView } from "./view";

/*
 * Walking round a dealership. At a dealership's door on the island its ring stands as a challenge's does, and E or X
 * there stops the drive, captures the island from the dealership's place (`view.ts`) and opens its room, a scene of its
 * own: only the room, its cars and the captured view are drawn. The player is an eye on foot, with no body, kept off
 * the walls, the furniture and the cars (`plan.ts`). At a car its figures show, and it can be revved, sat in and taken,
 * which makes it the player's car outside. Leaving puts the player back in their car where they left it.
 *
 * The game holds this, and hands it a few of its own pieces (`WalkInHost`); every rule about a dealership is here.
 */

const EYE_M = 1.62;
const BODY_RADIUS_M = 0.3;
const WALK_MS = 1.7;
const TURN_PER_S = 2.2;
const TILT_PER_S = 1.4;
const DRAG_PER_PX = 0.0035;
const MOST_TILT = 1.2;
const FIELD_OF_VIEW = 68;
/** Close enough to a car to rev, sit in or take it: its footprint's edge this near. */
const AT_CAR_M = 1.2;
/** The car must be slower than this to go in. */
const DOOR_SPEED_MS = 4;
const SKY_RADIUS_M = 900;
/** From the seat the head turns this far either way, and tilts this far. */
const SEAT_TURN = (140 * Math.PI) / 180;
const SEAT_TILT = 0.5;
/** How fast the revs climb towards what the throttle asks and fall back off it, a share a second. */
const REV_RISE_PER_S = 5;
const REV_FALL_PER_S = 2.5;
/** An electric car has no idle: its motor's whine is revved from this. */
const ELECTRIC_IDLE_RPM = 400;
const SEA_LEVEL_M = 0;

/** What the page shows for the dealerships: a door's offer, the cover while entering, and inside, what's at hand. */
export type DealershipReading =
  | { kind: "door"; name: string; place: string }
  | { kind: "entering"; name: string }
  | {
      kind: "inside";
      name: string;
      /** At the door: E or X leaves. */
      door: boolean;
      /** The car at hand, if any: whether it's the player's already, and whether they're in its seat. */
      car: { id: CarId; yours: boolean; seated: boolean; revving: boolean } | null;
    };

export interface WalkInHost {
  renderer: WebGPURenderer;
  /** The world's scene and camera, which the capture draws through. */
  scene: Scene;
  camera: PerspectiveCamera;
  groundAt: (x: number, z: number) => number;
  /** The player's car now, and which car it is. */
  car: () => CarState;
  carId: () => CarId;
  /** Makes a car the player's, as the Cars page does: drives it outside and keeps it. */
  takeCar: (id: CarId) => void;
  audio: () => DriveAudio;
  walk: () => WalkInput;
  units: () => Units;
  hour: () => number;
  /** Whether the drive is free to go in: no challenge, map, menu or free camera. */
  canEnter: () => boolean;
  /** Whether a menu holds the game: the room is still drawn, and nothing moves. */
  held: () => boolean;
  /** The drive goes on: the game puts its cameras back where the car is. */
  resumed: () => void;
  onReading: (reading: DealershipReading | null) => void;
}

interface Door {
  dealership: Dealership;
  site: DealerSite;
  x: number;
  z: number;
}

interface StandingCar {
  id: CarId;
  spot: Spot;
  view: ReturnType<typeof createCarView>;
  /** Its footprint for walking and reaching, or for a car on a turntable, the circle it turns in. */
  solid: PlanBox | Solid;
}

interface Room {
  door: Door;
  interior: DealerInterior;
  scene: Scene;
  cars: StandingCar[];
  turntables: Mesh[];
  roomMesh: Mesh;
  windowMesh: Mesh | null;
}

const turnPoint = (site: DealerSite, x: number, z: number): [number, number] => {
  const [c, s] = [Math.cos(site.yaw), Math.sin(site.yaw)];
  return [site.x + x * c + z * s, site.z - x * s + z * c];
};

/** All of a room's panes as one mesh. */
function windowsOf(interior: DealerInterior, material: Mesh["material"]): Mesh | null {
  if (interior.windows.length === 0) return null;
  const positions = interior.windows.flatMap(({ corners: [a, b, c, d] }) => [...a, ...b, ...c, ...a, ...c, ...d]);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from(positions), 3));
  const mesh = new Mesh(geometry, material);
  mesh.updateMatrix();
  return mesh;
}

export function createWalkIn(host: WalkInHost) {
  const { renderer } = host;
  const view = createIslandView(renderer);
  const lighting = createRoomLighting();
  const roomMaterial = dealerMaterial({ kind: "lamps", light: lighting });
  view.glass.side = DoubleSide;
  const sun: LiveSun = { toSun: lighting.overhead };
  const ambientLift = float(1.15);
  /** A car's colour, lit by its sun overhead, then by the room's lamps reaching where it is. */
  const carHazed = (colour: Node<"vec3">) => colour.mul(lighting.ambient.mul(ambientLift).add(lighting.at(positionWorld, null, null).sum));
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.03, SKY_RADIUS_M * 2);
  camera.matrixAutoUpdate = true;
  const sky = new Mesh(new SphereGeometry(SKY_RADIUS_M, 48, 24), view.sky);
  sky.matrixAutoUpdate = true;
  sky.frustumCulled = false;

  const doors: Door[] = DEALERSHIPS.map((dealership) => {
    const site = DEALER_SITES.find(({ id }) => id === dealership.site);
    if (!site) throw new Error(`no site for ${dealership.site}`);
    const { entrance } = buildExterior(site.id);
    const [x, z] = turnPoint(site, entrance.at[0], entrance.at[2]);
    return { dealership, site, x, z };
  });
  // Every room's definition, built once after the drive starts: going in then waits only for the capture.
  const interiors = new Map<Dealership, DealerInterior>();
  const ready = Promise.all(DEALERSHIPS.map(async (dealership) => interiors.set(dealership, await dealership.load())));

  let phase: "outside" | "entering" | "inside" = "outside";
  let room: Room | null = null;
  const at = { x: 0, z: 0, yaw: 0, pitch: 0 };
  let seat: { car: StandingCar; cockpit: ReturnType<typeof createCockpit>; chaseShell: BufferGeometry; look: { yaw: number; pitch: number } } | null = null;
  let revs = { car: null as CarId | null, rpm: 0, throttle: 0 };
  let turnedS = 0;
  const drag = { x: 0, y: 0, down: false };
  let shown = "";
  /** The island alone, the room hidden, at the world camera's lens: for comparing the view with the world itself. */
  let peeking = false;
  let captureEye = { x: 0, y: 0, z: 0, yaw: 0 };
  let aspect = 1;

  const onPointerDown = (event: PointerEvent) => {
    if (phase !== "inside" || event.button !== 0) return;
    drag.down = true;
    renderer.domElement.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag.down) return;
    drag.x += event.movementX;
    drag.y += event.movementY;
  };
  const onPointerUp = () => {
    drag.down = false;
  };
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);

  const doorInReach = (): Door | null => {
    if (!host.canEnter()) return null;
    const car = host.car();
    if (speedOf(car) > DOOR_SPEED_MS) return null;
    for (const door of doors) {
      const [dx, dz] = [car.position[0] - door.x, car.position[2] - door.z];
      if (dx * dx + dz * dz < START_RING_M * START_RING_M) return door;
    }
    return null;
  };

  const solids = (): (Solid | PlanBox)[] => (room ? [...room.interior.solids, ...room.cars.map(({ solid }) => solid)] : []);

  const carAtHand = (): StandingCar | null => {
    if (!room) return null;
    if (seat) return seat.car;
    let nearest: StandingCar | null = null;
    let best = AT_CAR_M;
    for (const car of room.cars) {
      const distance = "kind" in car.solid ? Math.hypot(at.x - car.spot.at[0], at.z - car.spot.at[2]) - carReach(carSpec(car.id)) : boxDistance(car.solid, at.x, at.z);
      if (distance < best) [nearest, best] = [car, distance];
    }
    return nearest;
  };
  const atDoor = () => !seat && room !== null && Math.hypot(at.x - room.interior.door.at[0], at.z - room.interior.door.at[1]) < room.interior.door.reachM;

  const buildRoom = (door: Door, interior: DealerInterior): Room => {
    const scene = new Scene();
    const roomMesh = new Mesh(geometryOf(interior.room), roomMaterial);
    roomMesh.updateMatrix();
    scene.add(roomMesh);
    const turntables = interior.turntables.map(({ soup, centre }) => {
      const mesh = new Mesh(geometryOf(soup), roomMaterial);
      mesh.position.set(...centre);
      mesh.matrixAutoUpdate = true;
      scene.add(mesh);
      return mesh;
    });
    const cars = carsOnSpots(interior).map(({ id, spot }, index): StandingCar => {
      const spec = carSpec(id);
      const paints = paintsOf(spec);
      const view = createCarView(scene, sun, spec, "hero", { hazed: carHazed, paint: paints[(index * 3) % paints.length] });
      view.draw(restingCar(spec, spot.at, spot.yaw));
      const solid: PlanBox | Solid = spot.turntable === undefined ? carBox(spec, spot) : { kind: "round", centre: [spot.at[0], spot.at[2]], radiusM: carReach(spec) };
      return { id, spot, view, solid };
    });
    const windowMesh = windowsOf(interior, view.glass);
    if (windowMesh) scene.add(windowMesh);
    scene.add(sky);
    return { door, interior, scene, cars, turntables, roomMesh, windowMesh };
  };

  const disposeRoom = (gone: Room) => {
    for (const { view: car } of gone.cars) car.dispose();
    gone.roomMesh.geometry.dispose();
    for (const mesh of gone.turntables) mesh.geometry.dispose();
    gone.windowMesh?.geometry.dispose();
    gone.scene.remove(sky);
  };

  const standUp = () => {
    if (!seat) return;
    const { car, cockpit, chaseShell } = seat;
    car.view.pivot.remove(cockpit.interior);
    car.view.shell.geometry = chaseShell;
    cockpit.dispose();
    seat = null;
    // Stood up beside the driver's door, clear of the car.
    const spec = carSpec(car.id);
    const yaw = car.spot.yaw + (car.spot.turntable === undefined ? 0 : turnAngle(car.spot));
    const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
    const side = -(spec.shadowHalf[0] + BODY_RADIUS_M + 0.25);
    [at.x, at.z] = settle(room?.interior.floor ?? [], solids(), car.spot.at[0] + side * c, car.spot.at[2] - side * s, BODY_RADIUS_M);
    at.yaw = yaw - Math.PI / 2;
  };

  const sitIn = (car: StandingCar) => {
    const spec = carSpec(car.id);
    const cockpit = createCockpit(spec, { sun, hazed: carHazed, glowing: float(0.6), units: host.units(), glass: car.view.art.glass });
    car.view.pivot.add(cockpit.interior);
    car.view.pivot.children.unshift(car.view.pivot.children.pop() ?? cockpit.interior);
    const chaseShell = car.view.shell.geometry;
    car.view.shell.geometry = cockpit.shell;
    cockpit.fit();
    seat = { car, cockpit, chaseShell, look: { yaw: 0, pitch: -0.12 } };
  };

  const turnAngle = (spot: Spot) => {
    if (spot.turntable === undefined || !room) return 0;
    return (turnedS / room.interior.turntables[spot.turntable].turnSeconds) * Math.PI * 2;
  };

  const enter = (door: Door) => {
    const interior = interiors.get(door.dealership);
    if (!interior || phase !== "outside") return;
    phase = "entering";
    aspect = host.camera.aspect;
    room = buildRoom(door, interior);
    lighting.set(interior.light);
    const { site } = door;
    const origin = interior.origin ?? [0, 0, 0];
    const [eyeX, eyeZ] = turnPoint(site, origin[0] + interior.viewFrom[0], origin[2] + interior.viewFrom[2]);
    const [footX, footZ] = turnPoint(site, origin[0], origin[2]);
    // A building's floor stands on its ground, and never below the sea: a site by the shore may read the seabed.
    const ground = site.afloat ? SEA_LEVEL_M : Math.max(host.groundAt(footX, footZ), SEA_LEVEL_M);
    const eyeY = ground + origin[1] + interior.viewFrom[1];
    [at.x, at.z] = interior.door.at;
    at.yaw = interior.door.yaw;
    at.pitch = 0;
    turnedS = 0;
    const building = room;
    captureEye = { x: eyeX, y: eyeY, z: eyeZ, yaw: site.yaw };
    // The cars' pipelines are each car's own, built before the island is captured, so the room opens whole: the capture
    // draws through the render context the screen shares (`view.ts`), which a compile in flight then reads.
    void renderer.compileAsync(building.scene, camera).then(() => {
      if (room !== building) return;
      view.capture({ at: new Vector3(eyeX, eyeY, eyeZ), yaw: site.yaw, inRoom: new Vector3(...interior.viewFrom), groundY: -origin[1] }, () => {
        if (room === building) phase = "inside";
      });
    });
  };

  const leave = () => {
    standUp();
    if (room) disposeRoom(room);
    room = null;
    phase = "outside";
    view.release();
    revs = { car: null, rpm: 0, throttle: 0 };
    host.audio().reset();
    host.resumed();
  };

  const take = (car: StandingCar) => {
    if (car.id !== host.carId()) host.takeCar(car.id);
  };

  /** The revs a car's engine is at, climbing towards what the throttle asks and falling back to idle. */
  const stepRevs = (id: CarId, throttle: number, seconds: number) => {
    const { idleRpm, redlineRpm } = TUNINGS[id].gearbox;
    const idle = idleRpm > 0 ? idleRpm : ELECTRIC_IDLE_RPM;
    if (revs.car !== id) revs = { car: id, rpm: idle, throttle: 0 };
    const wanted = idle + throttle * (redlineRpm * 0.97 - idle);
    const rate = wanted > revs.rpm ? REV_RISE_PER_S : REV_FALL_PER_S;
    revs.rpm += (wanted - revs.rpm) * (1 - Math.exp(-rate * seconds));
    revs.throttle = throttle;
  };

  const read = (): DealershipReading | null => {
    if (phase === "outside") {
      const door = doorInReach();
      const interior = door && interiors.get(door.dealership);
      return door && interior ? { kind: "door", name: interior.name, place: door.site.place } : null;
    }
    if (!room) return null;
    if (phase === "entering") return { kind: "entering", name: room.interior.name };
    const car = carAtHand();
    return { kind: "inside", name: room.interior.name, door: atDoor(), car: car && { id: car.id, yours: car.id === host.carId(), seated: seat?.car === car, revving: revs.car === car.id && revs.throttle > 0.05 } };
  };

  const tell = () => {
    const reading = read();
    const key = JSON.stringify(reading);
    if (key === shown) return;
    shown = key;
    host.onReading(reading);
  };

  return {
    /** Starts building every room's definition: after the drive has started, out of the first load's way. */
    ready,
    /** Each door as a ring on the island, painted as a dealership's. */
    marks: (): StartMark[] => doors.map(({ x, z }) => ({ x, z, tone: "dealer" })),
    /** Whether the drive is held for a dealership: from the moment the player goes in to the moment they leave. */
    holds: () => phase !== "outside",
    inside: () => phase === "inside",
    /** The pipelines a room needs, built before the drive: its material's, its view's and its panes'. The capture needs none of its own. */
    async compile() {
      const scene = new Scene();
      const shell = new Shell();
      shell.box([-1, 0, -1], [1, 1, 1], "dealer-concrete");
      const mesh = new Mesh(geometryOf(shell.build()), roomMaterial);
      scene.add(mesh);
      const panes = new Mesh(new BufferGeometry().setAttribute("position", new BufferAttribute(new Float32Array(9), 3)), view.glass);
      scene.add(panes);
      scene.add(sky);
      await renderer.compileAsync(scene, camera);
      scene.remove(sky);
      mesh.geometry.dispose();
      panes.geometry.dispose();
    },
    /** E or X, or another game action: what it does here, if anything. True when it was this system's. */
    onAction(action: "respawn" | "freeCamera" | "cockpit" | "map" | "mute" | "challenge"): boolean {
      if (phase === "outside") {
        if (action !== "challenge") return false;
        const door = doorInReach();
        if (!door) return false;
        enter(door);
        return true;
      }
      if (phase !== "inside" || host.held()) return action !== "mute";
      const car = carAtHand();
      if (action === "challenge") {
        if (atDoor()) leave();
        else if (car) take(car);
      }
      if (action === "cockpit") {
        if (seat) standUp();
        else if (car) sitIn(car);
      }
      return action !== "mute";
    },
    /** Points the game's camera for the capture, when one is under way: before anything culls by it. */
    aim: (worldCamera: PerspectiveCamera) => view.aim(worldCamera),
    /** Draws the game's frame into the capture, when one is under way. */
    renderCapture: (scene: Scene, worldCamera: PerspectiveCamera) => view.render(scene, worldCamera),
    /** Outside: whether a door is in reach, for the page. */
    tellOutside() {
      if (phase === "outside") tell();
    },
    /** A frame inside: walks, turns the tables, revs and draws the room. */
    frame(seconds: number) {
      tell();
      if (phase !== "inside" || !room) return;
      const held = host.held();
      const input = held ? { forward: 0, right: 0, turn: 0, tilt: 0, rev: 0 } : host.walk();
      const dragX = held ? 0 : drag.x;
      const dragY = held ? 0 : drag.y;
      drag.x = 0;
      drag.y = 0;
      if (!held) turnedS += seconds;

      if (seat) {
        seat.look.yaw = Math.max(-SEAT_TURN, Math.min(SEAT_TURN, seat.look.yaw + input.turn * TURN_PER_S * seconds - dragX * DRAG_PER_PX));
        seat.look.pitch = Math.max(-SEAT_TILT, Math.min(SEAT_TILT, seat.look.pitch + input.tilt * TILT_PER_S * seconds - dragY * DRAG_PER_PX));
      } else {
        at.yaw += input.turn * TURN_PER_S * seconds - dragX * DRAG_PER_PX;
        at.pitch = Math.max(-MOST_TILT, Math.min(MOST_TILT, at.pitch + input.tilt * TILT_PER_S * seconds - dragY * DRAG_PER_PX));
        const [c, s] = [Math.cos(at.yaw), Math.sin(at.yaw)];
        const step = WALK_MS * seconds;
        const ahead = Math.max(-1, Math.min(1, input.forward));
        const across = Math.max(-1, Math.min(1, input.right));
        const x = at.x + (-s * ahead + c * across) * step;
        const z = at.z + (-c * ahead - s * across) * step;
        [at.x, at.z] = settle(room.interior.floor, solids(), x, z, BODY_RADIUS_M);
      }

      for (const car of room.cars) {
        if (car.spot.turntable === undefined) continue;
        const spec = carSpec(car.id);
        car.view.draw(restingCar(spec, car.spot.at, car.spot.yaw + turnAngle(car.spot)));
      }
      const { turntables } = room.interior;
      room.turntables.forEach((mesh, index) => {
        mesh.rotation.y = (turnedS / turntables[index].turnSeconds) * Math.PI * 2;
      });

      const hand = carAtHand();
      const throttle = hand ? Math.max(input.rev, seat ? Math.max(input.forward, 0) : 0) : 0;
      const sounding = hand && (seat || revs.car === hand.id || throttle > 0) ? hand : null;
      if (sounding) stepRevs(sounding.id, throttle, seconds);
      else revs = { car: null, rpm: 0, throttle: 0 };

      if (seat) {
        const state = restingCar(carSpec(seat.car.id), seat.car.spot.at, seat.car.spot.yaw + turnAngle(seat.car.spot));
        seat.cockpit.read(state, { engine: { gear: 0, rpm: revs.rpm, load: revs.throttle, shiftLeftS: 0, reversing: false }, hour: host.hour(), outsideC: 18 });
        seat.car.view.pivot.updateMatrixWorld(true);
        camera.position.copy(seat.cockpit.eye).applyMatrix4(seat.car.view.pivot.matrixWorld);
        const carYaw = seat.car.spot.yaw + turnAngle(seat.car.spot);
        camera.rotation.set(seat.look.pitch, carYaw + seat.look.yaw, 0, "YXZ");
        camera.near = 0.03;
      } else {
        camera.position.set(at.x, EYE_M, at.z);
        camera.rotation.set(at.pitch, at.yaw, 0, "YXZ");
        camera.near = 0.1;
      }
      camera.aspect = aspect;
      camera.fov = peeking ? host.camera.fov : FIELD_OF_VIEW;
      camera.updateProjectionMatrix();
      sky.position.copy(camera.position);

      host.audio().placeLoops([]);
      host.audio().update(
        {
          vehicle: revs.car ?? host.carId(),
          speedMS: 0,
          throttle: revs.throttle,
          brake: 0,
          handbrake: true,
          slip: 0,
          wheels: ["asphalt", "asphalt", "asphalt", "asphalt"],
          condition: "dry",
          tyres: "summer",
          suspension: [0, 0, 0, 0],
          place: { forest: 0, shore: 0, town: 0 },
          listener: { x: camera.position.x, z: camera.position.z, rightX: Math.cos(at.yaw), rightZ: -Math.sin(at.yaw) },
          paused: revs.car === null,
          engine: { gear: 0, rpm: revs.rpm, load: revs.throttle, shiftLeftS: 0 },
          perspective: seat ? "inside" : "outside",
        },
        seconds,
      );
      for (const child of room.scene.children) child.visible = !peeking || child === sky;
      renderer.render(room.scene, camera);
    },
    /** The page's size changed. */
    resize(nextAspect: number) {
      aspect = nextAspect;
    },
    /** For the tools: goes in at a dealership by its site, from wherever the car is. */
    enterAt(site: string) {
      const door = doors.find(({ dealership }) => dealership.site === site);
      if (!door) throw new Error(`no dealership at ${site}`);
      enter(door);
    },
    /** For the tools: where the eye stands and looks, in the room's metres. */
    standAt(x: number, z: number, yaw: number, pitch = 0) {
      Object.assign(at, { x, z, yaw, pitch });
    },
    /** For the tools: sits in the car on a spot, or stands up with null. */
    sitAt(spot: number | null) {
      if (spot === null) standUp();
      else if (room) {
        standUp();
        sitIn(room.cars[spot]);
      }
    },
    leave: () => {
      if (phase === "inside") leave();
    },
    /** For the tools: draws only the captured island, at the world camera's lens, to hold against the world itself. */
    peek(on: boolean) {
      peeking = on;
    },
    /** For the tools: every door on the island, in the scene's metres. */
    doors: () => doors.map(({ dealership, x, z }) => ({ site: dealership.site, x, z })),
    state: () => ({
      phase,
      site: room?.door.site.id ?? null,
      at: { ...at },
      cars: room?.cars.map(({ id }) => id) ?? [],
      reading: read(),
      /** Where the island was captured from, in the scene, and the room's yaw on it. */
      capture: captureEye,
      room: room && { viewFrom: room.interior.viewFrom, door: room.interior.door, spots: room.cars.map(({ spot }) => spot), windows: room.interior.windows.length },
    }),
    dispose() {
      if (room) disposeRoom(room);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      view.dispose();
      roomMaterial.dispose();
      sky.geometry.dispose();
    },
  };
}

export type WalkIn = ReturnType<typeof createWalkIn>;
