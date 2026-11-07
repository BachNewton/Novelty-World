import { Color, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { cameraPosition, exp, float, mix, positionWorld, uniform, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { placeModel, type RoadsideModel } from "../roadside/index";
import { identityMaterials } from "../identity/index";
import { LIGHTHOUSES } from "./index";

/* Renders on import, as the identity gallery does: each lighthouse on a rock of its own by the sea, from all round, close to its lantern, and far off past its swap. */

const SUN = { azimuthDeg: 215, elevationDeg: 30 };
const [WIDTH, HEIGHT] = [1600, 900];
const HAZE_M = 16000;
const SEA_Y = -1.2;
const SPACING_M = 600;
const ROCK_M = 90;

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
const inputs = { linear, colour: colorOf, hazed, sun: SUN, time: uniform(2.4) };

export interface Shot {
  name: string;
  camera: [number, number, number];
  target: [number, number, number];
  label: string;
  fieldOfView: number;
}

const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true });
await renderer.init();
if (!("isWebGPUBackend" in renderer.backend)) throw new Error("no WebGPU");
renderer.setClearColor(new Color(token("sky")));
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT);
document.body.appendChild(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(50, WIDTH / HEIGHT, 0.25, 40000);
const materials = identityMaterials(inputs);

const plane = (colour: Node<"vec3">, x: number, y: number, z: number, wide: number, deep: number) => {
  const geometry = new PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshBasicNodeMaterial();
  material.colorNode = hazed(colour);
  const mesh = new Mesh(geometry, material);
  mesh.scale.set(wide, 1, deep);
  mesh.position.set(x, y, z);
  mesh.frustumCulled = false;
  scene.add(mesh);
};
plane(colorOf("water"), 0, SEA_Y, 0, 80000, 80000);

const heightOf = (model: RoadsideModel) => {
  model.near.computeBoundingBox();
  return model.near.boundingBox?.max.y ?? 10;
};

const shots: Shot[] = [];
const counts: { name: string; near: number; far: number; swapM: number; reachM: number }[] = [];
const count = (geometry: RoadsideModel["near"] | null) => (geometry?.index?.count ?? 0) / 3;
const look = (name: string, label: string, from: [number, number, number], at: [number, number, number], fieldOfView: number) => shots.push({ name, label, camera: from, target: at, fieldOfView });

Object.entries(LIGHTHOUSES).forEach(([id, art], slot) => {
  const model = art.build();
  const x = slot * SPACING_M;
  plane(colorOf("ground"), x, 0, 0, ROCK_M, ROCK_M);
  scene.add(...placeModel(model, [{ x, y: 0, z: 0 }], materials));
  counts.push({ name: id, near: count(model.near), far: count(model.far), swapM: model.swapM, reachM: model.reachM });
  const tall = heightOf(model);
  const back = Math.max(24, tall * 2.2);
  look(id, `${art.name} · ${tall.toFixed(1)} m`, [x + back * 0.55, 1.7, back * 0.85], [x, tall * 0.5, 0], 50);
  look(`${id}-back`, `${art.name}, the far side`, [x - back * 0.6, 1.7, -back * 0.8], [x, tall * 0.5, 0], 50);
  const lamp = art.lampM ?? tall * 0.9;
  look(`${id}-lantern`, `${art.name}, its top`, [x + 8 + tall * 0.25, lamp + 2, 10 + tall * 0.3], [x, lamp, 0], 34);
  look(`${id}-far`, `${art.name} from 3 km, past its swap at ${model.swapM} m`, [x + 1800, 3, 2400], [x, tall * 0.5, 0], 2.2);
  look(`${id}-skyline`, `${art.name} from 10 km`, [x + 6000, 3, 8000], [x, tall * 0.5, 0], 0.9);
});

async function frame(shot: Shot) {
  camera.fov = shot.fieldOfView;
  camera.updateProjectionMatrix();
  camera.position.set(...shot.camera);
  camera.lookAt(...shot.target);
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  return { drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles };
}

declare global {
  interface Window {
    __lighthouseGallery: { shots: Shot[]; frame: (name: string) => Promise<unknown>; counts: typeof counts; ready: boolean };
  }
}

window.__lighthouseGallery = {
  shots,
  frame: (name) => {
    const shot = shots.find((candidate) => candidate.name === name);
    if (shot === undefined) throw new Error(`no shot ${name}`);
    return frame(shot);
  },
  counts,
  ready: true,
};
