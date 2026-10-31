import { Box3, Color, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { cameraPosition, exp, float, mix, positionWorld, sin, smoothstep, uniform, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { buildDryingNets, buildFishingHut, buildKummel, buildLighthouse, buildNetHeap, buildWoodenDaymark, identityMaterials } from "../identity";
import { buildGangway, buildPontoon, placeModel, roadsideMaterials, type Placement, type RoadsideModel } from "../roadside";
import { catalogue } from "./catalogue";
import { buildBoatInCradle, buildBoatTrolley, buildBoatWinterCover, buildCairn, buildDinghyRack, buildFingerPontoon, buildFishBoxes, buildFlagMast, buildFloatHeap, buildFuelBerth, buildGuestHarbourSign, buildHarbourHut, buildHistoricShedRow, buildHullOnStocks, buildLeadingMark, buildMastRack, buildNetMarker, buildPilotStation, buildPillarBuoy, buildRopewalkShed, buildPyramidBeacon, buildServicePedestal, buildSlipway, buildSkerryLight, buildSmithy, buildSmokehouse, buildSpar, buildSteamBox, buildTarPot, buildTimberStack, buildTravelLift, buildWalkwayGate, marinaMaterials, PLACE_COUNTS, SEA_MARKS, SHED_ROW_M } from "./index";

/*
 * The gallery's scene, on the game's renderer, with the game's haze and sun: land for
 * z below 0, water past it. One bay of every model, a framed shot of each, then three
 * composed scenes and the swap and the reach of the marks.
 */

const SUN = { azimuthDeg: 215, elevationDeg: 30 };
const [WIDTH, HEIGHT] = [2408, 1007];
const HAZE_M = 16000;
const CELL_M = 60;
const COLUMNS = 12;
/** Past this the ground is water. The harbour scenes stand on its edge. */
const WATER_FROM_Z = 820;

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
const clock = uniform(1.3);
const inputs = { linear, colour: colorOf, hazed, sun: SUN, time: clock };

interface Shot {
  name: string;
  label: string;
  camera: readonly [number, number, number];
  target: readonly [number, number, number];
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
const materials = marinaMaterials(inputs);
const roadside = roadsideMaterials(inputs);
const identity = identityMaterials(inputs);
const addWith = (model: RoadsideModel, places: Placement[], using: Parameters<typeof placeModel>[2]) => {
  scene.add(...placeModel(model, places, using));
};
const add = (model: RoadsideModel, places: Placement[]) => {
  addWith(model, places, materials);
};

const groundGeometry = new PlaneGeometry(1, 1);
groundGeometry.rotateX(-Math.PI / 2);
const groundMaterial = new MeshBasicNodeMaterial();
const place = positionWorld.xz;
const patch = sin(place.x.mul(0.31).add(sin(place.y.mul(0.23)).mul(2))).mul(sin(place.y.mul(0.47).add(place.x.mul(0.11)))).mul(0.5).add(0.5);
const grass = colorOf("ground").mul(mix(float(0.78), float(1.02), patch));
const yard = mix(colorOf("road-minor"), colorOf("wall-grey"), patch.mul(0.4));
const inYard = smoothstep(float(-280), float(-270), place.y).mul(float(1).sub(smoothstep(float(290), float(300), place.y)));
const isWater = smoothstep(float(WATER_FROM_Z - 0.2), float(WATER_FROM_Z + 0.2), place.y);
groundMaterial.colorNode = hazed(mix(mix(grass, yard, inYard), colorOf("water"), isWater));
const ground = new Mesh(groundGeometry, groundMaterial);
ground.scale.set(60000, 1, 60000);
ground.frustumCulled = false;
scene.add(ground);

const shots: Shot[] = [];
const WATER_Z = 1100;
const zoneZ = (index: number, water: boolean) => (water ? WATER_Z : 0) + Math.floor(index / COLUMNS) * CELL_M;

const entries = catalogue();
const onWater = (name: string) => /pontoon|fuel|spar|pillar|fixed|marker|shed row|skerry|slipway/.test(name);
entries.forEach(({ name, model }, index) => {
  const water = onWater(name);
  const at = { x: (index % COLUMNS) * CELL_M, y: 0, z: zoneZ(index, water) };
  add(model, [at]);
  model.near.computeBoundingBox();
  const box = model.near.boundingBox ?? new Box3();
  const centre = box.getCenter(new Vector3());
  const radius = box.getSize(new Vector3()).length() / 2;
  const distance = Math.max(3, radius * 2.15);
  const toward = name.includes("hull on") || name.includes("harbour hut") || name.includes("pilot") ? [0.74, 0.3, 0.62] : [0.62, 0.3, 0.72];
  shots.push({
    name: name.replaceAll(" ", "-"),
    label: name,
    camera: [at.x + centre.x + toward[0] * distance, Math.max(1.5, centre.y + toward[1] * distance), at.z + centre.z + toward[2] * distance],
    target: [at.x + centre.x, centre.y, at.z + centre.z],
    fieldOfView: 40,
  });
});

// The family: all nine marks in a line on the water, then the same at their swap and from far off.
const LINE_Z = 2200;
SEA_MARKS.forEach((mark, index) => {
  add(buildSpar(mark), [{ x: index * 2.2, y: 0, z: LINE_Z }]);
  add(buildPillarBuoy(mark), [{ x: index * 5, y: 0, z: LINE_Z + 40 }]);
});
const family = (name: string, label: string, x: number, z: number, y: number, at: number, fieldOfView: number, targetY: number) => shots.push({ name, label, camera: [at, y, z], target: [x, targetY, LINE_Z], fieldOfView });
family("spars", "spars N S E W, port, starboard, danger, safe, special", 8.8, LINE_Z + 14, 1.7, 8.8, 40, 2.2);
family("spars-swap", "spars near their swap, 110 m", 8.8, LINE_Z + 112, 2, 8.8, 7, 1.8);
family("spars-far", "spars at 900 m", 8.8, LINE_Z + 900, 3, 8.8, 1.6, 1.8);
shots.push({ name: "pillars", label: "pillar buoys, same order", camera: [20, 3, LINE_Z + 40 + 24], target: [20, 2.8, LINE_Z + 40], fieldOfView: 44 });

// A marina: a main pontoon off the shore with fingers, boats ashore behind it.
const SCENE_X = 3000;
function composed() {
  const atHarbour = (x: number, z: number, yaw?: number): Placement => ({ x: SCENE_X + x, y: 0, z: 800 + z, yaw });
  addWith(buildPontoon({ lengthM: 56, widthM: 2.4 }), [{ ...atHarbour(0, 26) }], roadside);
  addWith(buildGangway(9), [{ ...atHarbour(-9, 26), shear: -0.05, y: 0.9 }], roadside);
  add(buildWalkwayGate(), [atHarbour(-9.4, 26)]);
  const fingers = Array.from({ length: 7 }, (_, index): Placement => ({ ...atHarbour(5 + index * 7.2, 27.2), yaw: -Math.PI / 2 }));
  add(buildFingerPontoon(), fingers);
  add(buildServicePedestal("power"), Array.from({ length: 4 }, (_, index) => ({ ...atHarbour(8.5 + index * 14.4, 25.2), y: 0.42 })));
  add(buildServicePedestal("water"), Array.from({ length: 3 }, (_, index) => ({ ...atHarbour(15.5 + index * 14.4, 25.2), y: 0.42 })));
  add(buildHarbourHut(), [atHarbour(-16, 12)]);
  add(buildGuestHarbourSign(), [atHarbour(-24, 16)]);
  add(buildFlagMast(), [atHarbour(-9, 15)]);
  add(buildFuelBerth(), [{ ...atHarbour(60, 24) }]);
  add(buildSlipway(), [atHarbour(-60, 4, -Math.PI / 2)]);
  add(buildBoatTrolley("rail"), [{ ...atHarbour(-60, 8, -Math.PI / 2), y: 0.4 }]);
  add(buildDinghyRack(), [atHarbour(-30, 6), atHarbour(-30, -2)]);
  add(buildTravelLift(), [atHarbour(-42, -8)]);
  add(buildBoatWinterCover("tarp-blue"), [atHarbour(-10, -14), atHarbour(30, -26)]);
  add(buildBoatWinterCover("tarp-green"), [atHarbour(0, -14)]);
  add(buildBoatWinterCover("shrink"), [atHarbour(10, -14), atHarbour(20, -26)]);
  add(buildBoatInCradle(), [atHarbour(20, -14), atHarbour(30, -14), atHarbour(0, -26), atHarbour(10, -26)]);
  add(buildMastRack(), [atHarbour(-14, -30)]);
  add(buildBoatTrolley("launching"), [atHarbour(-24, 2)]);
  shots.push({ name: "scene-marina", label: "a guest harbour, composed", camera: [SCENE_X + 34, 9, 800 + 54], target: [SCENE_X - 8, 1.5, 800 + 2], fieldOfView: 50 });

  const yardAt = (x: number, z: number, yaw?: number): Placement => ({ x: SCENE_X + 300 + x, y: 0, z: 800 + z, yaw });
  add(buildHullOnStocks(), [yardAt(0, 0)]);
  add(buildTimberStack("sawn"), [yardAt(-16, -7), yardAt(-16, -11)]);
  add(buildTimberStack("logs"), [yardAt(-16, 8)]);
  add(buildSteamBox(), [yardAt(12, 9)]);
  add(buildTarPot(), [yardAt(4, -7)]);
  add(buildSmithy(), [yardAt(22, -9)]);
  add(buildRopewalkShed(), [yardAt(-4, -22)]);
  add(buildHistoricShedRow(), [{ ...yardAt(-SHED_ROW_M / 2, 38) }]);
  shots.push({ name: "scene-yard", label: "a boatyard, Sjökvarteret style", camera: [SCENE_X + 300 + 26, 7, 800 + 27], target: [SCENE_X + 300 - 2, 2, 800 - 4], fieldOfView: 50 });

  const shoreAt = (x: number, z: number, yaw?: number): Placement => ({ x: SCENE_X + 600 + x, y: 0, z: 800 + z, yaw });
  addWith(buildFishingHut("red"), [shoreAt(-6, -4), shoreAt(10, -8, 0.4)], identity);
  addWith(buildFishingHut("tarred"), [shoreAt(2, -11, -0.3)], identity);
  add(buildSmokehouse(), [shoreAt(-14, -8)]);
  addWith(buildDryingNets(), [shoreAt(2, 6)], identity);
  addWith(buildNetHeap(), [shoreAt(-8, 5)], identity);
  add(buildFishBoxes(), [shoreAt(-3, 2), shoreAt(10, 2)]);
  add(buildFloatHeap(), [shoreAt(7, 3)]);
  shots.push({ name: "scene-shore", label: "a fishing shore", camera: [SCENE_X + 600 + 22, 6.5, 800 + 22], target: [SCENE_X + 600, 1.2, 800 - 2], fieldOfView: 50 });

  const seaAt = (x: number, z: number): Placement => ({ x: SCENE_X + 900 + x, y: 0, z: WATER_Z + z });
  add(buildPilotStation(), [seaAt(-20, -40)]);
  add(buildSkerryLight(), [seaAt(40, -60)]);
  addWith(buildLighthouse(), [seaAt(150, -120)], identity);
  add(buildCairn(3), [seaAt(14, -50)]);
  add(buildPyramidBeacon(), [seaAt(-70, -70)]);
  addWith(buildWoodenDaymark(), [seaAt(-46, -60)], identity);
  addWith(buildKummel(), [seaAt(-58, -30)], identity);
  add(buildLeadingMark("front"), [seaAt(-120, -40)]);
  add(buildLeadingMark("rear"), [seaAt(-126, -140)]);
  add(buildSpar("port"), [seaAt(-10, 40), seaAt(40, 90)]);
  add(buildSpar("starboard"), [seaAt(30, 30), seaAt(66, 70)]);
  add(buildSpar("west"), [seaAt(90, 10)]);
  add(buildNetMarker(), [seaAt(-34, 46), seaAt(-40, 52)]);
  shots.push({ name: "scene-sea", label: "a pilot station, its marks and a fairway", camera: [SCENE_X + 900 + 62, 8, WATER_Z + 130], target: [SCENE_X + 900 - 8, 4, WATER_Z - 30], fieldOfView: 46 });
}
composed();

async function frame(name: string) {
  const shot = shots.find((candidate) => candidate.name === name);
  if (shot === undefined) throw new Error(`no shot ${name}`);
  camera.fov = shot.fieldOfView;
  camera.updateProjectionMatrix();
  camera.position.set(...shot.camera);
  camera.lookAt(...shot.target);
  await renderer.renderAsync(scene, camera);
  await renderer.renderAsync(scene, camera);
  return { drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles };
}

const triangles = (geometry: RoadsideModel["near"] | null) => (geometry?.index?.count ?? 0) / 3;

declare global {
  interface Window {
    __marinaGallery: { shots: Shot[]; frame: (name: string) => Promise<unknown>; counts: Record<string, readonly [number, number]>; places: Record<string, number>; ready: boolean };
  }
}

window.__marinaGallery = {
  shots,
  frame,
  counts: Object.fromEntries(entries.map(({ name, model }) => [name, [triangles(model.near), triangles(model.far)] as const])),
  places: PLACE_COUNTS,
  ready: true,
};
