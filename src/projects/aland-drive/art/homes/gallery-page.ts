import { Color, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGPURenderer, type Node, type Object3D } from "three/webgpu";
import { float, mix, positionWorld, sin, smoothstep, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { buildCarArt, createCarModel } from "../cars/model";
import { CARS } from "../cars/specs";
import { placeModel } from "../roadside/index";
import { ruralMaterials } from "../rural/index";
import { HOMES, interiorMaterial, parkedState, trianglesOf, type Room } from "./index";

/*
 * The gallery's scene on the game's renderer: a home on a plot of land with the sea
 * past its shore, and each room alone from its own cameras. Nothing here is the game's
 * placement, which waits for Phase 6: a plot's ground is a plane.
 */

const SUN = { azimuthDeg: 215, elevationDeg: 30 };
const [WIDTH, HEIGHT] = [2408, 1007];
const SEA_Y = -0.6;

const token = (name: string) => themeColor(`--color-aland-drive-${name}`);
const colour = (name: string): Node<"vec3"> => {
  const { r, g, b } = token(name);
  return vec3(r, g, b);
};
const linear = (name: string) => {
  const { r, g, b } = token(name);
  return new Vector3(r, g, b);
};
const inputs = { linear, colour, hazed: (color: Node<"vec3">) => color, sun: SUN };

const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true });
await renderer.init();
if (!("isWebGPUBackend" in renderer.backend)) throw new Error("no WebGPU");
renderer.setClearColor(new Color(token("sky")));
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT);
document.body.appendChild(renderer.domElement);

const camera = new PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 6000);
const rural = ruralMaterials(inputs);
const interior = interiorMaterial(inputs);

function plotScene(shoreZ: number | null) {
  const scene = new Scene();
  const plane = new PlaneGeometry(1, 1);
  plane.rotateX(-Math.PI / 2);
  const groundMaterial = new MeshBasicNodeMaterial();
  const at = positionWorld.xz;
  const patch = sin(at.x.mul(0.31).add(sin(at.y.mul(0.23)).mul(2))).mul(sin(at.y.mul(0.47))).mul(0.5).add(0.5);
  const grass = colour("ground").mul(mix(float(0.8), float(1.02), patch));
  const rock = mix(colour("wall-grey"), colour("wall-red"), 0.14).mul(mix(float(0.75), float(1), patch));
  groundMaterial.colorNode = shoreZ === null ? grass : mix(rock, grass, smoothstep(float(shoreZ + 1), float(shoreZ + 7), at.y));
  const land = new Mesh(plane, groundMaterial);
  land.scale.set(1200, 1, 800);
  land.position.set(0, 0, 400 + (shoreZ ?? -1000));
  scene.add(land);
  const seaMaterial = new MeshBasicNodeMaterial();
  seaMaterial.colorNode = colour("water");
  const sea = new Mesh(plane, seaMaterial);
  sea.scale.set(6000, 1, 6000);
  sea.position.y = SEA_Y;
  scene.add(sea);
  return scene;
}

type Shot = { name: string; label: string; triangles: number; home: string; show: () => { scene: Scene; position: readonly number[]; target: readonly number[]; fieldOfViewDeg: number } };

const shots: Shot[] = [];
const counts: unknown[] = [];

function carsIn(room: Room, scene: Scene) {
  const parked: Object3D[] = [];
  room.fit?.slots.forEach((slot, index) => {
    const spec = CARS[(index * 3 + 4) % CARS.length];
    const model = createCarModel(buildCarArt(spec), SUN);
    model.draw(parkedState(spec, slot));
    parked.push(model.root);
  });
  if (parked.length > 0) scene.add(...parked);
}

for (const home of HOMES) {
  const model = home.exterior();
  const outdoors = plotScene(home.site.shoreZ);
  outdoors.add(...placeModel(model, [{ x: 0, y: 0, z: 0 }], rural));
  const triangles = trianglesOf(model);
  const { views: exteriorViews } = home.site;
  for (const { name, position, target, fieldOfViewDeg } of exteriorViews) {
    shots.push({ name: `${home.id}-${name}`, label: `${home.name}: ${name}`, triangles, home: home.id, show: () => ({ scene: outdoors, position, target, fieldOfViewDeg }) });
  }
  const rooms = home.interior();
  counts.push({ id: home.id, exterior: triangles, far: (model.far?.index?.count ?? 0) / 3, interior: rooms.reduce((sum, room) => sum + room.triangles, 0), rooms: rooms.map(({ id, triangles: t, fit }) => `${id} ${t}${fit ? ` (${fit.cars} cars)` : ""}`) });
  for (const room of rooms) {
    const scene = new Scene();
    const mesh = new Mesh(room.geometry, interior.material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    carsIn(room, scene);
    room.cameras.forEach((view, index) => {
      shots.push({ name: `${home.id}-${room.id}-${index + 1}`, label: `${home.name}: ${room.label}, ${view.name}`, triangles: room.triangles, home: home.id, show: () => ({ scene, position: view.position, target: view.target, fieldOfViewDeg: view.fieldOfViewDeg }) });
    });
  }
}

declare global {
  interface Window {
    __homesGallery?: {
      ready: boolean;
      counts: unknown[];
      shots: { name: string; label: string; triangles: number; home: string }[];
      frame: (name: string) => Promise<void>;
    };
  }
}

window.__homesGallery = {
  ready: true,
  counts,
  shots: shots.map(({ name, label, triangles, home }) => ({ name, label, triangles, home })),
  async frame(name) {
    const shot = shots.find((candidate) => candidate.name === name);
    if (!shot) throw new Error(`no shot ${name}`);
    const { scene, position, target, fieldOfViewDeg } = shot.show();
    camera.position.set(position[0], position[1], position[2]);
    camera.lookAt(target[0], target[1], target[2]);
    camera.fov = fieldOfViewDeg;
    camera.updateProjectionMatrix();
    await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera);
    await new Promise(requestAnimationFrame);
    renderer.render(scene, camera);
    await new Promise(requestAnimationFrame);
  },
};
