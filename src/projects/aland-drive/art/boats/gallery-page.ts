import { Color, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { cameraPosition, exp, float, mix, positionWorld, sin, uniform, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { placeModel } from "../roadside";
import { CATALOGUE } from "./catalogue";
import { boatMaterials } from "./material";
import { triangles } from "./mesh";

/*
 * The boats on the game's renderer, camera, haze and sun, on a plain sea. A berth
 * each, shot at eye height from a jetty's distance, then the fleet from past its
 * swap and at its reach.
 */

const SUN = { azimuthDeg: 215, elevationDeg: 34 };
const FIELD_OF_VIEW = 60;
const [WIDTH, HEIGHT] = [2408, 1007];
const BERTH_M = 70;
const HAZE_M = 16000;

const token = (name: string) => themeColor(`--color-aland-drive-${name}`);
const colorOf = (name: string): Node<"vec3"> => {
  const { r, g, b } = token(name);
  return vec3(r, g, b);
};
const linear = (name: string) => {
  const { r, g, b } = token(name);
  return new Vector3(r, g, b);
};
const hazed = (color: Node<"vec3">) => mix(color, colorOf("sky"), float(1).sub(exp(positionWorld.sub(cameraPosition).length().div(HAZE_M).pow(2).negate())));
const clock = uniform(3.1);
const inputs = { linear, colour: colorOf, hazed, sun: SUN, time: clock };

export interface Shot {
  name: string;
  label: string;
  camera: [number, number, number];
  target: [number, number, number];
  fieldOfView?: number;
}

const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true });
await renderer.init();
if (!("isWebGPUBackend" in renderer.backend)) throw new Error("no WebGPU");
renderer.setClearColor(new Color(token("sky")));
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT);
document.body.appendChild(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(FIELD_OF_VIEW, WIDTH / HEIGHT, 0.25, 40000);
const materials = boatMaterials(inputs);

const seaGeometry = new PlaneGeometry(1, 1);
seaGeometry.rotateX(-Math.PI / 2);
const seaMaterial = new MeshBasicNodeMaterial();
const ripple = sin(positionWorld.x.mul(0.7).add(sin(positionWorld.z.mul(0.4)).mul(2))).mul(sin(positionWorld.z.mul(1.1))).mul(0.5).add(0.5);
seaMaterial.colorNode = hazed(colorOf("water").mul(mix(float(0.93), float(1.04), ripple)));
const sea = new Mesh(seaGeometry, seaMaterial);
sea.scale.set(80000, 1, 80000);
scene.add(sea);

const shots: Shot[] = [];
const counts: Record<string, { near: number; far: number; limit: number }> = {};
CATALOGUE.forEach(({ name, label, lengthM, tallM, sailing, limit, model }, index) => {
  const built = model();
  const x = index * BERTH_M;
  scene.add(...placeModel(built, [{ x, y: 0, z: 0 }], materials));
  counts[name] = { near: triangles(built.near), far: triangles(built.far), limit };
  const away = Math.max(lengthM * 1.25, tallM * 0.85);
  const middle = sailing ? Math.min(tallM * 0.42, 9) : Math.min(tallM * 0.3, 6);
  shots.push({ name, label, camera: [x - away * 0.9, 1.8, sailing ? -away * 0.7 : away * 0.75], target: [x, middle, 0] });
  if (!sailing) shots.push({ name: `${name}-aft`, label: `${label}, from aft`, camera: [x + away * 0.5, 2.4, -away * 0.85], target: [x, Math.min(middle, 3), 0], fieldOfView: 46 });
});

const lastX = (CATALOGUE.length - 1) * BERTH_M;
const fleet = (name: string, label: string, away: number, fieldOfView: number) => shots.push({ name, label, camera: [lastX / 2, 2, away], target: [lastX / 2, 5, 0], fieldOfView });
fleet("fleet-swap", "the fleet just past its swap, 230 m", 230, 42);
fleet("fleet-far", "the fleet at 600 m", 600, 18);
fleet("fleet-reach", "the fleet at 1.2 km", 1200, 9);

const frame = async (name: string) => {
  const shot = shots.find((candidate) => candidate.name === name);
  if (shot === undefined) throw new Error(`no shot ${name}`);
  camera.position.set(...shot.camera);
  camera.fov = shot.fieldOfView ?? FIELD_OF_VIEW;
  camera.updateProjectionMatrix();
  camera.lookAt(...shot.target);
  renderer.render(scene, camera);
  await renderer.backend.device.queue.onSubmittedWorkDone();
  return { triangles: renderer.info.render.triangles, calls: renderer.info.render.drawCalls };
};

Object.assign(window, { __boatGallery: { ready: true, shots, counts, frame } });
