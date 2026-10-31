import { Color, Group, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, TimestampQuery, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { cameraPosition, exp, float, mix, positionWorld, sin, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { CarDetail } from "../cars/build";
import { buildCarArt, createCarModel, type CarArt } from "../cars/model";
import { BRANDS, BRAND_IDS, buildExterior, carNamed, dealerMaterial, EXTERIOR_IDS, geometryOf, loadInterior, restingCar, type ExteriorId, type InteriorId } from "./index";
import { INTERIOR_IDS } from "./interiors";
import { Shell } from "./shell";

/*
 * The gallery's scenes: the exteriors on a lawn and a road beside each other, each interior as the scene of its own that
 * it would be in the game, and the brands on a wall. `gallery.mjs` bundles this, opens it and takes the shots.
 */

const SUN = { azimuthDeg: 215, elevationDeg: 34 };
const CAR_SUN = { azimuthDeg: 215, elevationDeg: 60 };
const [WIDTH, HEIGHT] = [2408, 1007];
const HAZE_M = 16000;
const GAP_M = 130;
const EYE_M = 1.3;

const token = (name: string) => themeColor(`--color-aland-drive-${name}`);
const colorOf = (name: string): Node<"vec3"> => {
  const { r, g, b } = token(name);
  return vec3(r, g, b);
};
const hazed = (color: Node<"vec3">) => mix(color, colorOf("sky"), float(1).sub(exp(positionWorld.sub(cameraPosition).length().div(HAZE_M).pow(2).negate())));

export interface Shot {
  name: string;
  label: string;
  scene: string;
  camera: readonly [number, number, number];
  target: readonly [number, number, number];
  fieldOfView: number;
  /** The turntable's angle in this shot. */
  turn?: number;
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
const artOf = (name: string, detail: CarDetail): CarArt => {
  const key = `${name} ${detail}`;
  const art = arts.get(key) ?? buildCarArt(carNamed(name), detail);
  arts.set(key, art);
  return art;
};
const placeCar = (parent: Group | Scene, name: string, at: readonly [number, number, number], yaw: number, paint: string | undefined, detail: CarDetail) => {
  const art = artOf(name, detail);
  const model = createCarModel(art, CAR_SUN, { paint });
  model.draw(restingCar(art.spec, at, yaw));
  parent.add(model.root);
  return model;
};

// The world: a lawn and a road running west to east, every exterior along it, facing it.
const world = new Scene();
scenes.set("world", world);
const plane = new PlaneGeometry(1, 1);
plane.rotateX(-Math.PI / 2);
const lawnMaterial = new MeshBasicNodeMaterial();
const patch = sin(positionWorld.x.mul(0.31).add(sin(positionWorld.z.mul(0.23)).mul(2))).mul(sin(positionWorld.z.mul(0.47))).mul(0.5).add(0.5);
lawnMaterial.colorNode = hazed(colorOf("ground").mul(mix(float(0.82), float(1.02), patch)));
const lawn = new Mesh(plane, lawnMaterial);
lawn.scale.set(9000, 1, 9000);
lawn.position.y = -0.02;
lawn.frustumCulled = false;
world.add(lawn);
const roadMaterial = new MeshBasicNodeMaterial();
roadMaterial.colorNode = hazed(colorOf("road-main"));
const road = new Mesh(plane, roadMaterial);
road.scale.set(9000, 1, 7);
road.position.set(0, 0.0, 26);
road.frustumCulled = false;
world.add(road);
const seaMaterial = new MeshBasicNodeMaterial();
seaMaterial.colorNode = hazed(colorOf("water"));
const outdoors = dealerMaterial({ kind: "sun", sun: SUN }, hazed);

EXTERIOR_IDS.forEach((id: ExteriorId, index) => {
  const exterior = buildExterior(id);
  counts[`exterior ${id}`] = exterior.soup.triangles;
  const x = index * GAP_M;
  const group = new Group();
  group.position.x = x;
  group.add(new Mesh(geometryOf(exterior.soup), outdoors));
  for (const { car, at, yaw, paint } of exterior.slots) placeCar(group, car, at, yaw, paint, "hero");
  world.add(group);
  const [wide, deep] = exterior.plotHalf;
  const front = Math.min(deep, 14);
  const hero = wide * 1.05;
  shots.push({ name: `ext-${id}-hero`, label: `${id}, three-quarter`, scene: "world", camera: [x + hero, 5.5, front + hero * 0.9], target: [x, 2, 0], fieldOfView: 38 });
  shots.push({ name: `ext-${id}-road`, label: `${id}, from the road`, scene: "world", camera: [x - wide * 0.8, EYE_M, deep * 0.5 + 20], target: [x + 2, 2.8, -2], fieldOfView: 56 });
});
// The waterfront over its pier, on water, with the sea plane under it for this shot alone.
{
  const x = 2 * GAP_M;
  const sea = new Mesh(plane, seaMaterial);
  sea.scale.set(120, 1, 90);
  sea.position.set(x, -0.9, -56);
  world.add(sea);
  shots.push({ name: "ext-waterfront-sea", label: "waterfront-showroom, from the water", scene: "world", camera: [x - 34, 2.4, -46], target: [x, 3, -8], fieldOfView: 56 });
}

// The brands on a wall.
const brandScene = new Scene();
scenes.set("brands", brandScene);
{
  const s = new Shell();
  s.box([-20, -10, -0.2], [20, 10, 0], "dealer-panel", {}, []);
  BRAND_IDS.forEach((id, index) => {
    const brand = BRANDS[id];
    s.within({ x: (index - 1) * 7, y: 1 }, () => {
      s.within({ z: 0.02 }, () => s.logo(brand, 2.3));
      s.within({ y: -3.6, z: 0.02 }, () => s.text(brand.name, 0.86, "dealer-klippa-ink"));
      s.within({ y: -4.5, z: 0.02 }, () => s.text(brand.cars.join("  ").toUpperCase(), 0.3, "wall-grey"));
    });
  });
  counts.brands = s.build().triangles;
  brandScene.add(new Mesh(geometryOf(s.build()), dealerMaterial({ kind: "sun", sun: { azimuthDeg: 0, elevationDeg: 10 } })));
  shots.push({ name: "brands", label: "the three brands", scene: "brands", camera: [0, 0, 15], target: [0, 0, 0], fieldOfView: 46 });
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

async function frame(name: string) {
  const shot = shots.find((candidate) => candidate.name === name);
  if (shot === undefined) throw new Error(`no shot ${name}`);
  const scene = scenes.get(shot.scene);
  if (scene === undefined) throw new Error(`no scene ${shot.scene}`);
  for (const table of tables) if (table.scene === shot.scene && shot.turn !== undefined) table.spin.rotation.y = shot.turn;
  renderer.setClearColor(new Color(token("sky")));
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
