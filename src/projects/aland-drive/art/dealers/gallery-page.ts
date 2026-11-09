import { Color, Group, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, TimestampQuery, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { cameraPosition, exp, float, mix, positionWorld, sin, uniform, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { CarId } from "../../sim/cars";
import type { CarDetail } from "../cars/build";
import { buildCarArt, createCarModel, type CarArt } from "../cars/model";
import { BRANDS, BRAND_IDS, buildExterior, carSpecOf, dealerMaterial, EXTERIOR_IDS, geometryOf, loadInterior, restingCar, SELLER_IDS, SELLER_MAKERS, type ExteriorId, type InteriorId } from "./index";
import { matching } from "./stock";
import { INTERIOR_IDS } from "./interiors";
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
const placeCar = (parent: Group | Scene, car: CarId, at: readonly [number, number, number], yaw: number, paint: string | undefined, detail: CarDetail, carHazed = hazed) => {
  const art = artOf(car, detail);
  const model = createCarModel(art, CAR_SUN, { hazed: carHazed, ...(paint === undefined ? {} : { paint: { colour: paint, finish: "solid" } }) });
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

/** Where the gallery looks at each room from: in at its door, and from two of its corners. */
const ROOM_VIEWS: Readonly<Record<InteriorId, readonly { name: string; position: Shot["camera"]; target: Shot["target"]; fovDeg: number }[]>> = {
  "village-garage": [
    { name: "door", position: [3.4, 1.6, -1.0], target: [-6, 1.3, -5.5], fovDeg: 64 },
    { name: "bay", position: [-12.4, 1.7, -0.6], target: [-1, 1.4, -5.5], fovDeg: 62 },
    { name: "office", position: [8.4, 1.6, -8.4], target: [-4, 1.4, -2.5], fovDeg: 60 },
  ],
  "town-dealer": [
    { name: "door", position: [-3, 1.6, -3.2], target: [2, 1.2, -10], fovDeg: 64 },
    { name: "corner", position: [15.8, 1.7, -3.6], target: [-6, 1.2, -9], fovDeg: 60 },
    { name: "back", position: [-15.8, 1.8, -12.3], target: [4, 1.2, -4], fovDeg: 60 },
  ],
  "premium-showroom": [
    { name: "door", position: [0, 1.6, 7.0], target: [0, 1.0, -4], fovDeg: 64 },
    { name: "corner", position: [-13.2, 1.7, 6.8], target: [5, 1.0, -3], fovDeg: 60 },
    { name: "sea", position: [12.8, 1.7, -7.2], target: [-4, 1.0, 2], fovDeg: 60 },
  ],
};

const roomHazed = (colour: Node<"vec3">) => colour;
for (const id of INTERIOR_IDS as readonly InteriorId[]) {
  const interior = await loadInterior(id);
  const scene = new Scene();
  // What the windows look on to is the island the walk-in captures; here it is the sky's colour.
  scene.background = new Color(token("sky"));
  scenes.set(id, scene);
  const material = dealerMaterial({ kind: "room", light: interior.light });
  scene.add(new Mesh(geometryOf(interior.room), material));
  const spins = interior.turntables.map(({ soup, centre }) => {
    const spin = new Group();
    spin.position.set(...centre);
    spin.add(new Mesh(geometryOf(soup), material));
    scene.add(spin);
    tables.push({ scene: id, spin });
    return spin;
  });
  const stock = matching(interior.stock);
  interior.spots.forEach(({ at, yaw, turntable }, index) => {
    const car = stock.at(index);
    if (car === undefined) return;
    if (turntable === undefined) {
      placeCar(scene, car, at, yaw, undefined, "hero", roomHazed);
      return;
    }
    const centre = interior.turntables[turntable].centre;
    placeCar(spins[turntable], car, [at[0] - centre[0], at[1] - centre[1], at[2] - centre[2]], yaw, undefined, "hero", roomHazed);
  });
  counts[`interior ${id}`] = interior.room.triangles + interior.turntables.reduce((sum, { soup }) => sum + soup.triangles, 0);
  for (const { name, position, target, fovDeg } of ROOM_VIEWS[id]) shots.push({ name: `int-${id}-${name}`, label: `${id} inside, from the ${name}`, scene: id, camera: position, target, fieldOfView: fovDeg, turn: 0 });
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
