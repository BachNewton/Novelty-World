import { Color, Group, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, TimestampQuery, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { cameraPosition, exp, float, mix, positionWorld, sin, uniform, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { CarId } from "../../sim/cars";
import type { CarDetail } from "../cars/build";
import { buildCarArt, createCarModel, type CarArt } from "../cars/model";
import { BRANDS, BRAND_IDS, buildExterior, carSpecOf, dealerMaterial, EXTERIOR_IDS, geometryOf, loadInterior, restingCar, SELLER_IDS, SELLER_MAKERS, type ExteriorId, type InteriorId } from "./index";
import { INTERIOR_IDS } from "./interiors";
import { deliveryHallInterior } from "./delivery-hall-interior";
import type { RoomLight } from "./material";
import { CAR_ENTRIES, CAR_IDS } from "../../sim/cars";
import { Shell } from "./shell";

/*
 * The gallery's scenes: the exteriors on a lawn and a road beside each other, by day and by night, near and as their
 * far versions from off, each interior as the scene of its own that it would be in the game, and the makers' badges on
 * a wall. `gallery.mjs` bundles this, opens it and takes the shots.
 */

const SUN = { azimuthDeg: 215, elevationDeg: 34 };
const CAR_SUN = { azimuthDeg: 215, elevationDeg: 60 };
const [WIDTH, HEIGHT] = [2408, 1007];
const HAZE_M = 16000;
const GAP_M = 160;
const FAR_SIDE_M = 4000;
const EYE_M = 1.3;
/** The road's middle, clear of every street edge. */
const ROAD_Z = 18;
/** How dark a night is against the day, for the gallery's stand-in for the game's hour. */
const NIGHT_LIGHT = 0.14;

const token = (name: string) => themeColor(`--color-aland-drive-${name}`);
const colorOf = (name: string): Node<"vec3"> => {
  const { r, g, b } = token(name);
  return vec3(r, g, b);
};
const night = uniform(0);
const dimmed = (color: Node<"vec3">) => color.mul(mix(float(1), float(NIGHT_LIGHT), night));
const hazed = (color: Node<"vec3">) => mix(dimmed(color), dimmed(colorOf("sky")), float(1).sub(exp(positionWorld.sub(cameraPosition).length().div(HAZE_M).pow(2).negate())));
const inLand = (color: Node<"vec3">) => color.div(mix(float(1), float(NIGHT_LIGHT), night));

export interface Shot {
  name: string;
  label: string;
  scene: string;
  camera: readonly [number, number, number];
  target: readonly [number, number, number];
  fieldOfView: number;
  /** The turntable's angle in this shot. */
  turn?: number;
  atNight?: boolean;
}

const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true, trackTimestamp: true });
await renderer.init();
if (!("isWebGPUBackend" in renderer.backend)) throw new Error("no WebGPU");
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT);
document.body.appendChild(renderer.domElement);

const camera = new PerspectiveCamera(60, WIDTH / HEIGHT, 0.25, 40000);
const shots: Shot[] = [];
const scenes = new Map<string, Scene>();
const counts: Record<string, number> = {};

const arts = new Map<string, CarArt>();
const artOf = (car: CarId, detail: CarDetail): CarArt => {
  const key = `${car} ${detail}`;
  const art = arts.get(key) ?? buildCarArt(carSpecOf(car), detail);
  arts.set(key, art);
  return art;
};
const placeCar = (parent: Group | Scene, car: CarId, at: readonly [number, number, number], yaw: number, paint: string | undefined, detail: CarDetail) => {
  const art = artOf(car, detail);
  const model = createCarModel(art, CAR_SUN, { hazed, ...(paint === undefined ? {} : { paint: { colour: paint, finish: "solid" } }) });
  model.draw(restingCar(art.spec, at, yaw));
  parent.add(model.root);
  return model;
};

// The world: a lawn and a road running west to east, every exterior along it, facing it; and the same again far off
// to the north, each as its far version, for a long lens to see as the game shows it past its swap.
const world = new Scene();
scenes.set("world", world);
const plane = new PlaneGeometry(1, 1);
plane.rotateX(-Math.PI / 2);
const lawnMaterial = new MeshBasicNodeMaterial();
const patch = sin(positionWorld.x.mul(0.31).add(sin(positionWorld.z.mul(0.23)).mul(2))).mul(sin(positionWorld.z.mul(0.47))).mul(0.5).add(0.5);
lawnMaterial.colorNode = hazed(colorOf("ground").mul(mix(float(0.82), float(1.02), patch)));
const lawn = new Mesh(plane, lawnMaterial);
lawn.scale.set(20000, 1, 20000);
lawn.position.y = -0.02;
lawn.frustumCulled = false;
world.add(lawn);
const roadMaterial = new MeshBasicNodeMaterial();
roadMaterial.colorNode = hazed(colorOf("road-main"));
const seaMaterial = new MeshBasicNodeMaterial();
seaMaterial.colorNode = hazed(colorOf("water"));
const outdoors = dealerMaterial({ kind: "sun", sun: SUN, lampsOn: night, inLand }, hazed);

const street = (z: number) => {
  const road = new Mesh(plane, roadMaterial);
  road.scale.set(9000, 1, 7);
  road.position.set(GAP_M * 2, 0, z);
  road.frustumCulled = false;
  world.add(road);
};

EXTERIOR_IDS.forEach((id: ExteriorId, index) => {
  const x = index * GAP_M;
  for (const version of ["near", "far"] as const) {
    const exterior = buildExterior(id, version);
    counts[`exterior ${id} ${version}`] = exterior.soup.triangles;
    const group = new Group();
    const z = version === "near" ? 0 : -FAR_SIDE_M;
    group.position.set(x, 0, z);
    group.add(new Mesh(geometryOf(exterior.soup), outdoors));
    for (const { car, at, yaw, paint } of exterior.slots) placeCar(group, car, at, yaw, paint, version === "near" ? "hero" : "far");
    if (id === "premium-showroom") {
      const sea = new Mesh(plane, seaMaterial);
      sea.scale.set(140, 1, 120);
      // Its deck's foot, where the shore gives way to the water.
      sea.position.set(0, -0.01, 8.2 - 60);
      group.add(sea);
    }
    world.add(group);
    if (version === "far") continue;
    const [x0, , x1, z1] = exterior.plot;
    const wide = (x1 - x0) / 2;
    const hero = wide * 1.05;
    for (const atNight of [false, true]) {
      const when = atNight ? "night" : "day";
      shots.push({ name: `ext-${id}-hero-${when}`, label: `${id}, three-quarter, ${when}`, scene: "world", camera: [x + hero, 5.5, z1 + hero * 0.9], target: [x, 2, 0], fieldOfView: 38, atNight });
    }
    shots.push({ name: `ext-${id}-road`, label: `${id}, from the road`, scene: "world", camera: [x - wide * 0.8, EYE_M, z1 + 10], target: [x + 2, 2.8, -2], fieldOfView: 56 });
    // Near and far from 300 m with a long lens, side by side in the sheet: the change a swap would show, magnified.
    for (const [version, from] of [["near", 0], ["far", -FAR_SIDE_M]] as const) {
      shots.push({ name: `ext-${id}-at-300m-${version}`, label: `${id}, ${version} version from 300 m, long lens`, scene: "world", camera: [x + 190, 60, from + z1 + 225], target: [x, 3, from], fieldOfView: 7 });
    }
  }
});
for (const z of [0, -FAR_SIDE_M]) street(z + ROAD_Z);
// The premium showroom from the water, where its deck stands on piles.
{
  const x = 2 * GAP_M;
  shots.push({ name: "ext-premium-sea", label: "premium-showroom, from the water", scene: "world", camera: [x - 30, 2.4, -40], target: [x, 2, -4], fieldOfView: 56 });
  shots.push({ name: "ext-premium-sea-night", label: "premium-showroom, from the water, night", scene: "world", camera: [x - 30, 2.4, -40], target: [x, 2, -4], fieldOfView: 56, atNight: true });
}

// The makers' badges on a wall, under each the place that sells them.
const brandScene = new Scene();
scenes.set("brands", brandScene);
{
  const s = new Shell();
  s.box([-24, -10, -0.2], [24, 10, 0], "dealer-panel", {}, []);
  BRAND_IDS.forEach((id, index) => {
    const brand = BRANDS[id];
    const seller = SELLER_IDS.find((candidate) => SELLER_MAKERS[candidate].includes(brand.maker));
    s.within({ x: (index - 2.5) * 7.6, y: 1.5 }, () => {
      s.within({ z: 0.02 }, () => s.logo(brand, 2.3));
      s.within({ y: -3.6, z: 0.02 }, () => s.text(brand.name, 0.8, "dealer-klippa-ink"));
      s.within({ y: -4.6, z: 0.02 }, () => s.text((seller ?? "").toUpperCase().replace("-", " "), 0.32, "wall-grey"));
    });
  });
  counts.brands = s.build().triangles;
  brandScene.add(new Mesh(geometryOf(s.build()), dealerMaterial({ kind: "sun", sun: { azimuthDeg: 0, elevationDeg: 10 } })));
  shots.push({ name: "brands", label: "the six makers' badges", scene: "brands", camera: [0, 0, 19], target: [0, 0, 0], fieldOfView: 50 });
}

const tables: { scene: string; spin: Group }[] = [];

for (const id of INTERIOR_IDS as readonly InteriorId[]) {
  const interior = await loadInterior(id);
  const scene = new Scene();
  scene.background = new Color(token(interior.background));
  scenes.set(id, scene);
  const material = dealerMaterial(interior.lighting);
  scene.add(new Mesh(geometryOf(interior.soup), material));
  const spin = new Group();
  spin.position.set(...interior.turntable.centre);
  spin.add(new Mesh(geometryOf(interior.turntable.soup), material));
  placeCar(spin, interior.onTurntable.car, [0, interior.turntable.deckY, 0], 0, interior.onTurntable.paint, "hero");
  scene.add(spin);
  tables.push({ scene: id, spin });
  for (const { car, at, yaw, paint } of interior.displays) placeCar(scene, car, at, yaw, paint, "hero");
  counts[`interior ${id}`] = interior.soup.triangles + interior.turntable.soup.triangles;
  for (const { name, position, target, fovDeg } of interior.cameras) shots.push({ name: `int-${id}-${name}`, label: `${id} inside, ${name} camera`, scene: id, camera: position, target, fieldOfView: fovDeg, turn: 3.75 });
}

// The delivery hall's room. This page's material has point lights only, so each spot is a point at its lamp and each
// strip three along it sharing its power: near the room's light, not the walk-in system's own. Its windows show the sky here, where the
// game shows the island.
{
  const hall = deliveryHallInterior();
  const scene = new Scene();
  scene.background = new Color(token("sky"));
  scenes.set("delivery-hall", scene);
  const lights: RoomLight[] = hall.light.lamps.flatMap((lamp): RoomLight[] => {
    const { paint, power, reachM } = lamp;
    if (lamp.kind !== "strip") return [{ at: lamp.at, paint, power, reachM }];
    return [0.1, 0.5, 0.9].map((share) => ({ at: [0, 1, 2].map((axis) => lamp.from[axis] + (lamp.to[axis] - lamp.from[axis]) * share) as [number, number, number], paint, power: power / 3, reachM }));
  });
  const material = dealerMaterial({ kind: "room", lights, mirrors: hall.light.mirrors });
  scene.add(new Mesh(geometryOf(hall.room), material));
  const { stock } = hall;
  const cars = CAR_IDS.filter((id) => {
    const entry = CAR_ENTRIES[id];
    return (stock.from?.includes(entry.from) ?? true) && (stock.tiers?.includes(entry.tier) ?? true) && (stock.makers?.includes(entry.maker) ?? true);
  }).map((id) => CAR_ENTRIES[id].tuning.name);
  const spin = new Group();
  const [table] = hall.turntables;
  spin.position.set(...table.centre);
  spin.add(new Mesh(geometryOf(table.soup), material));
  scene.add(spin);
  tables.push({ scene: "delivery-hall", spin });
  cars.forEach((name, index) => {
    const spot = hall.spots[index];
    if (spot.turntable === undefined) placeCar(scene, name, spot.at, spot.yaw, undefined, "hero");
    else placeCar(spin, name, [0, spot.at[1], 0], spot.yaw, undefined, "hero");
  });
  counts["interior delivery-hall"] = hall.room.triangles + table.soup.triangles;
  const door = hall.door.at;
  shots.push({ name: "int-delivery-hall-door", label: "delivery hall, from the door", scene: "delivery-hall", camera: [door[0], 1.65, door[1]], target: [0, 1, -10], fieldOfView: 62, turn: 0 });
  shots.push({ name: "int-delivery-hall-corner", label: "delivery hall, from the south back corner", scene: "delivery-hall", camera: [18, 2.4, -18.8], target: [-2, 1.2, -4], fieldOfView: 62, turn: 0.6 });
  shots.push({ name: "int-delivery-hall-lounge", label: "delivery hall, from the lounge", scene: "delivery-hall", camera: [-14.5, 1.5, -13.2], target: [8, 1.4, -7], fieldOfView: 62, turn: 1.2 });
  shots.push({ name: "int-delivery-hall-routes", label: "delivery hall, the north end", scene: "delivery-hall", camera: [-6, 1.7, -4], target: [-19.7, 3.4, -11], fieldOfView: 56, turn: 0 });
}

async function frame(name: string) {
  const shot = shots.find((candidate) => candidate.name === name);
  if (shot === undefined) throw new Error(`no shot ${name}`);
  const scene = scenes.get(shot.scene);
  if (scene === undefined) throw new Error(`no scene ${shot.scene}`);
  for (const table of tables) if (table.scene === shot.scene && shot.turn !== undefined) table.spin.rotation.y = shot.turn;
  night.value = shot.atNight === true ? 1 : 0;
  renderer.setClearColor(new Color(token("sky")).multiplyScalar(shot.atNight === true ? NIGHT_LIGHT : 1));
  camera.fov = shot.fieldOfView;
  camera.updateProjectionMatrix();
  camera.position.set(...shot.camera);
  camera.lookAt(new Vector3(...shot.target));
  renderer.render(scene, camera);
  await renderer.resolveTimestampsAsync(TimestampQuery.RENDER);
  renderer.render(scene, camera);
  const result = { drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles };
  return { ...result, gpuMs: await renderer.resolveTimestampsAsync(TimestampQuery.RENDER) };
}

declare global {
  interface Window {
    __dealerGallery: { shots: Shot[]; frame: (name: string) => Promise<unknown>; counts: Record<string, number>; ready: boolean };
  }
}

window.__dealerGallery = { shots, frame, counts, ready: true };
