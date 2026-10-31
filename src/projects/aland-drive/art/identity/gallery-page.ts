import { Color, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { cameraPosition, exp, float, mix, positionWorld, sin, uniform, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { buildRowingBoat, buildBoulder, ruralMaterials } from "../rural/index";
import { placeModel, type Placement, type RoadsideModel } from "../roadside/index";
import { runSections } from "../street/index";
import { catalogue } from "./catalogue";
import { buildAppleCrates, buildAppleTree, buildBicycle, buildBonfireStack, buildCableFerry, buildCottage, buildCyclist, buildDeckChair, buildDryingNets, buildFarmStall, buildFerryCable, buildFishingHut, buildHarvestFlag, buildKummel, buildLighthouse, buildNetHeap, buildOpenFarmSign, buildOrchardLadder, buildPicnicTable, buildSauna, buildTouringRack, buildUpturnedBoat, buildViewingTower, buildViewpointPlatform, buildWoodenDaymark, FERRY_CABLE_M, identityMaterials, orchardPlan } from "./index";

/* Renders on import, as the street gallery does: the game's sky, haze and sun, one stretch of shore. */

const SUN = { azimuthDeg: 215, elevationDeg: 30 };
const FIELD_OF_VIEW = 60;
const [WIDTH, HEIGHT] = [1600, 900];
const HAZE_M = 16000;
const SEA_Y = -1.5;
const SHORE_Z = -80;
const STATION_M = 60;

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
const clock = uniform(2.4);
const inputs = { linear, colour: colorOf, hazed, sun: SUN, time: clock };

export interface Shot {
  name: string;
  camera: [number, number, number];
  target: [number, number, number];
  label: string;
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
const materials = identityMaterials(inputs);
const rural = ruralMaterials(inputs);
const add = (model: RoadsideModel, places: Placement[]) => scene.add(...placeModel(model, places, materials));

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
const patch = sin(positionWorld.x.mul(0.31).add(sin(positionWorld.z.mul(0.23)).mul(2))).mul(sin(positionWorld.z.mul(0.47))).mul(0.5).add(0.5);
plane(colorOf("ground").mul(mix(float(0.8), float(1.02), patch)), 0, 0, 3000 + SHORE_Z, 40000, 6000);
plane(colorOf("water"), 0, SEA_Y, 0, 80000, 80000);

const shots: Shot[] = [];
const look = (name: string, label: string, camera: [number, number, number], target: [number, number, number], fieldOfView = 44) => shots.push({ name, label, camera, target, fieldOfView });
/** A stand-alone view of something, at human height, from the south-east of it. */
const stand = (name: string, label: string, x: number, z: number, away: [number, number, number], heightM: number, fieldOfView = 40) => look(name, label, [x + away[0], away[1], z + away[2]], [x, heightM, z], fieldOfView);

let slot = 0;
const next = () => slot++ * STATION_M - 700;

// Summer life, along the land, each with its front to the camera.
const LAND_Z = 0;
let x = next();
add(buildSauna(), [{ x, y: 0, z: LAND_Z }]);
stand("sauna", "lakeside sauna", x, LAND_Z, [-5, 1.6, 9], 1.7);
add(buildUpturnedBoat("tar"), [{ x: x + 7, y: 0, z: 1, yaw: 0.3 }]);
add(buildUpturnedBoat("white"), [{ x: x + 12, y: 0, z: 2, yaw: 1 }]);
stand("upturned-boat", "rowing boats upturned on logs", x + 9, 2, [-2, 1.5, 6.4], 0.5, 48);
x = next();
add(buildDryingNets(), [{ x, y: 0, z: LAND_Z }, { x: x + 7, y: 0, z: LAND_Z + 2 }]);
add(buildNetHeap(), [{ x: x + 4, y: 0, z: LAND_Z + 2.5 }]);
stand("nets", "drying nets, a net heap", x + 4, LAND_Z, [-3, 1.6, 7.5], 1.1, 56);
x = next();
add(buildCottage(), [{ x, y: 0, z: LAND_Z }]);
add(buildDeckChair(), [{ x: x + 7, y: 0, z: LAND_Z + 4, yaw: 0.2 }]);
stand("cottage", "summer cottage, deck chairs", x, LAND_Z, [-9, 1.7, 14], 2, 48);
x = next();
add(buildBonfireStack(), [{ x, y: 0, z: LAND_Z }]);
stand("bonfire", "bonfire stack", x, LAND_Z, [-4, 1.5, 7], 1.8);
x = next();
add(buildFarmStall(), [{ x, y: 0, z: LAND_Z }]);
add(buildHarvestFlag(), [{ x: x - 3.4, y: 0, z: LAND_Z + 1 }, { x: x + 3.4, y: 0, z: LAND_Z + 1 }]);
add(buildOpenFarmSign(), [{ x: x + 5.5, y: 0, z: LAND_Z + 3 }]);
stand("stall", "farm stall, harvest flags, open-farm sign", x + 1, LAND_Z, [-2, 1.6, 9.5], 2, 52);
stand("stall-close", "the counter and its board", x, LAND_Z + 0.5, [-1.5, 1.7, 3.2], 1.3, 46);
stand("sign", "apple sign", x + 5.5, LAND_Z + 3, [-0.6, 1.5, 2.4], 1.8, 40);
x = next();
const plan = orchardPlan({ x: x - 10, y: 0, z: LAND_Z - 22 }, 0, 5, 7, 4);
const trees = [buildAppleTree(1), buildAppleTree(2, "light"), buildAppleTree(3)];
trees.forEach((tree, index) => add(tree, plan.trees.filter((_, at) => at % trees.length === index)));
add(buildOrchardLadder(), [{ x: x + 3, y: 0, z: LAND_Z + 2.5, yaw: 0.2 }, ...plan.ladders]);
add(buildAppleCrates(), [{ x: x + 5, y: 0, z: LAND_Z + 4 }, ...plan.crates]);
stand("orchard", `orchard rows, ${plan.trees.length} trees`, x + 2, LAND_Z - 4, [-13, 2, 15], 2, 52);
stand("ladder", "picker's ladder and crates", x + 4, LAND_Z + 3, [-3, 1.5, 4.4], 1.2);
x = next();
add(buildCyclist("with-bike"), [{ x, y: 0, z: LAND_Z }]);
add(buildCyclist("standing", "shirt-red"), [{ x: x + 3, y: 0, z: LAND_Z + 0.5, yaw: -0.4 }]);
add(buildBicycle(), [{ x: x + 5, y: 0, z: LAND_Z + 1, yaw: 0.25 }]);
add(buildTouringRack(), [{ x: x + 9, y: 0, z: LAND_Z }]);
add(buildPicnicTable(), [{ x: x + 14, y: 0, z: LAND_Z + 1 }]);
stand("cyclists", "cyclists, a bike, touring rack", x + 4.5, LAND_Z, [-1, 1.5, 7], 0.9, 56);
stand("picnic", "picnic table", x + 14, LAND_Z + 1, [-2, 1.4, 3.8], 0.6);

// The shore: lights, marks, huts. On water or a rock at the land's edge.
const BEACH_Z = SHORE_Z + 18;
x = next();
add(buildBoulder(1), [{ x: x + 3, y: 0, z: BEACH_Z + 8 }]);
add(buildFishingHut("tarred"), [{ x, y: 0, z: BEACH_Z + 16 }]);
add(buildFishingHut("red"), [{ x: x + 7, y: 0, z: BEACH_Z + 16, yaw: 0.1 }]);
stand("hut", "fishing huts", x + 3, BEACH_Z + 16, [-2.5, 1.5, 11], 1.6, 46);
x = next() + 40;
add(buildKummel(), [{ x, y: 0, z: BEACH_Z }]);
add(buildWoodenDaymark(), [{ x: x + 14, y: 0, z: BEACH_Z, yaw: 0.2 }]);
stand("marks", "kummel and wooden daymark", x + 7, BEACH_Z, [-4, 1.6, 22], 3.5, 46);
x = next() + 80;
add(buildLighthouse(), [{ x, y: 0, z: BEACH_Z }]);
stand("lighthouse", "lighthouse", x, BEACH_Z, [-20, 1.8, 30], 9.5, 42);
stand("lighthouse-top", "its lantern", x, BEACH_Z, [-14, 12, 15], 17, 34);
stand("lighthouse-far", "from 3 km, past its swap", x, BEACH_Z, [-1800, 2, 2400], 10, 3);
x = next() + 140;
const waterZ = SHORE_Z - 35;
add(buildCableFerry(), [{ x, y: SEA_Y, z: waterZ }]);
add(buildFerryCable(), runSections([{ x: x - 200, y: SEA_Y + 0.1, z: waterZ - 2.8 }, { x: x + 200, y: SEA_Y + 0.1, z: waterZ - 2.8 }], FERRY_CABLE_M));
scene.add(...placeModel(buildRowingBoat("white"), [{ x: x + 26, y: SEA_Y, z: waterZ + 12 }], rural));
stand("ferry", "cable ferry", x, waterZ, [-26, 2, 30], 2, 44);
stand("ferry-deck", "from its ramp", x - 13, waterZ, [-5, 2.2, 1.5], 1.6, 60);
x = next() + 200;
add(buildViewingTower(), [{ x, y: 0, z: LAND_Z }]);
stand("tower", "viewing tower", x, LAND_Z, [-13, 1.6, 22], 7, 46);
x = next() + 240;
add(buildViewpointPlatform(), [{ x, y: 0, z: LAND_Z }]);
stand("platform", "viewpoint platform", x, LAND_Z, [-6, 1.6, 9.5], 1.7, 50);

function pose(shot: Shot) {
  camera.fov = shot.fieldOfView ?? FIELD_OF_VIEW;
  camera.updateProjectionMatrix();
  camera.position.set(...shot.camera);
  camera.lookAt(...shot.target);
}

async function frame(shot: Shot) {
  pose(shot);
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  return { drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles };
}

const count = (geometry: RoadsideModel["near"] | null) => (geometry?.index?.count ?? 0) / 3;

declare global {
  interface Window {
    __identityGallery: { shots: Shot[]; frame: (name: string) => Promise<unknown>; counts: { name: string; near: number; far: number; swapM: number; reachM: number }[]; ready: boolean };
  }
}

window.__identityGallery = {
  shots,
  frame: (name) => {
    const shot = shots.find((candidate) => candidate.name === name);
    if (shot === undefined) throw new Error(`no shot ${name}`);
    return frame(shot);
  },
  counts: catalogue().map(({ name, model }) => ({ name, near: count(model.near), far: count(model.far), swapM: model.swapM, reachM: model.reachM })),
  ready: true,
};
