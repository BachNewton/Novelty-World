import { Color, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, TimestampQuery, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { cameraPosition, exp, float, mix, positionWorld, sin, smoothstep, uniform, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { buildPier, placeModel, roadsideMaterials, type Placement, type RoadsideModel } from "../roadside";
import { buildRowingBoat, buildShoreSlab, ruralMaterials } from "../rural";
import { buildBench, buildCafeSet, buildParasol, parkedCarMaterial, placeParkedCars, streetMaterials } from "../street";
import { bakeCrowd, CAFE_TABLE_Z_M, crowdMeshes, cyclist, peopleMaterials, sailor, worker, type PlacedFigure } from "./index";
import { buildFar, buildNear } from "./body";
import { rollFigure } from "./figure";
import { POSES } from "./poses";

/*
 * The gallery's scene, on the game's renderer, sun and haze: a paved lot beside a
 * road, a jetty over the water, a line-up, every pose at its own station and a small
 * scene beside a car for scale.
 */

const SUN = { azimuthDeg: 215, elevationDeg: 34 };
const FIELD_OF_VIEW = 40;
const [WIDTH, HEIGHT] = [2408, 1007];
const HAZE_M = 16000;
const SEA_Y = -1.2;
const PAIRS = 40;
const BUDGET_FIGURES = 50;

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
const clock = uniform(0);
const inputs = { linear, colour: colorOf, hazed, sun: SUN, time: clock };

interface Shot {
  name: string;
  label: string;
  camera: [number, number, number];
  target: [number, number, number];
  fieldOfView?: number;
  time?: number;
}

const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true, trackTimestamp: true });
await renderer.init();
if (!("isWebGPUBackend" in renderer.backend)) throw new Error("no WebGPU");
renderer.setClearColor(new Color(token("sky")));
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT);
document.body.appendChild(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(FIELD_OF_VIEW, WIDTH / HEIGHT, 0.25, 40000);
const street = streetMaterials(inputs);
const roadside = roadsideMaterials(inputs);
const rural = ruralMaterials(inputs);
const add = (model: RoadsideModel, places: Placement[], materials: Parameters<typeof placeModel>[2] = street) => scene.add(...placeModel(model, places, materials));

// The land: grass with a paved lot and a strip of road, and water past x = 300.
const LAND_END_X = 300;
const groundGeometry = new PlaneGeometry(1, 1);
groundGeometry.rotateX(-Math.PI / 2);
const groundMaterial = new MeshBasicNodeMaterial();
const place = positionWorld.xz;
const patch = sin(place.x.mul(0.31).add(sin(place.y.mul(0.23)).mul(2))).mul(sin(place.y.mul(0.47).add(place.x.mul(0.11)))).mul(0.5).add(0.5);
const grass = colorOf("ground").mul(mix(float(0.86), float(1.04), patch));
const paved = mix(colorOf("wall-grey"), colorOf("wall-pale"), 0.35);
const isPaved = float(1).sub(smoothstep(float(13), float(13.1), place.y.add(57).abs()));
const inRoad = float(1).sub(smoothstep(float(3.4), float(3.5), place.y.sub(-60).abs()));
groundMaterial.colorNode = hazed(mix(mix(grass, paved, isPaved), colorOf("road-main"), inRoad));
const land = new Mesh(groundGeometry, groundMaterial);
land.scale.set(4000 + LAND_END_X, 1, 4000);
land.position.set((LAND_END_X - 4000) / 2, 0, 0);
land.frustumCulled = false;
scene.add(land);
const seaGeometry = new PlaneGeometry(1, 1);
seaGeometry.rotateX(-Math.PI / 2);
const seaMaterial = new MeshBasicNodeMaterial();
seaMaterial.colorNode = hazed(colorOf("water"));
const sea = new Mesh(seaGeometry, seaMaterial);
sea.scale.set(30000, 1, 30000);
sea.position.y = SEA_Y;
scene.add(sea);

const shots: Shot[] = [];
const look = (name: string, label: string, from: [number, number, number], at: [number, number, number], fieldOfView?: number, time?: number) => shots.push({ name, label, camera: from, target: at, fieldOfView, time });
const figures: PlacedFigure[] = [];

// The line-up: a dozen seeds as they roll, facing the camera, then older people and children beside adults.
const LINE_Z = 0;
const LINE_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
LINE_SEEDS.forEach((seed, index) => figures.push({ seed, pose: "stand", x: (index - 5.5) * 0.92, y: 0, z: LINE_Z, phase: 0 }));
look("lineup", "line-up: a dozen seeds", [0, 1.2, 15], [0, 0.95, 0], 22);
look("lineup-left", "line-up, closer: left half", [-2.8, 1.25, 7], [-2.8, 0.95, 0], 22);
look("lineup-right", "line-up, closer: right half", [2.8, 1.25, 7], [2.8, 0.95, 0], 22);
look("lineup-back", "line-up from behind", [1.5, 1.4, -10], [0, 0.9, 0], 26);

// A second row of work clothes, ages and a child or two.
const ROW_X = 40;
const ROW_Z = 0;
const row: Omit<PlacedFigure, "x" | "y" | "z">[] = [
  { seed: 21, pose: "stand", spec: sailor(1) },
  { seed: 22, pose: "stand", spec: sailor(2) },
  { seed: 23, pose: "stand", spec: worker(3) },
  { seed: 24, pose: "stand", spec: worker(4) },
  { seed: 25, pose: "stand", spec: cyclist(0) },
  { seed: 26, pose: "stand", spec: cyclist(1) },
  { seed: 27, pose: "stand", spec: { age: "older" } },
  { seed: 28, pose: "stand", spec: { age: "older" } },
  { seed: 29, pose: "stand", spec: { hat: "sun-hat", outfit: "summer-dress", frame: 0.85, heightM: 1.68, hair: "bob" } },
  { seed: 30, pose: "stand", spec: { age: "child", heightM: 1.28 } },
  { seed: 31, pose: "stand", spec: { hat: "cap", outfit: "tee-shorts", build: 0.85 } },
  { seed: 32, pose: "wave", spec: { age: "child", heightM: 1.12, outfit: "summer-dress" } },
];
row.forEach((figure, index) => figures.push({ ...figure, x: ROW_X + (index - 5.5) * 0.92, y: 0, z: ROW_Z, phase: 0 }));
look("kit", "sailing, work, cycling, older, a sun hat, children", [ROW_X, 1.2, ROW_Z + 13], [ROW_X, 0.9, ROW_Z], 24);

// Close views.
const CLOSE_X = -70;
const closes: Omit<PlacedFigure, "x" | "y" | "z">[] = [
  { seed: 41, pose: "stand", spec: { outfit: "summer-dress", hat: "none", hair: "long", frame: 0.85, heightM: 1.68, hairColour: "hair-blond", skin: "skin-2", build: 0.3 } },
  { seed: 42, pose: "stand", spec: { ...sailor(1), hat: "cap", frame: 0.12, heightM: 1.84, hair: "short", hairColour: "hair-brown", skin: "skin-3", build: 0.45 } },
  { seed: 43, pose: "stand", spec: { age: "older", outfit: "jacket-trousers", hat: "none", hair: "receding", frame: 0.15, heightM: 1.74, build: 0.7, skin: "skin-1", hairColour: "hair-white" } },
];
closes.forEach((figure, index) => figures.push({ ...figure, x: CLOSE_X + index * 1.1, y: 0, z: 0, phase: 0, yaw: 0.25 }));
look("close-body", "three close: figures", [CLOSE_X + 1.1, 1.15, 5], [CLOSE_X + 1.1, 0.92, 0], 28);
look("close-head", "head and shoulders", [CLOSE_X + 0.2, 1.62, 1.8], [CLOSE_X + 0.15, 1.45, 0], 22);
look("close-side", "profile", [CLOSE_X + 4.5, 1.15, 1], [CLOSE_X + 1.1, 0.92, 0], 22);

// Each pose at its own station.
const POSE_X = 60;
const POSE_GAP = 14;
const station = (index: number) => POSE_X + index * POSE_GAP;

// Walking: a cycle laid out in eight phases, one figure a phase.
const WALK_Z = -24;
for (let at = 0; at < 8; at++) figures.push({ seed: 51, pose: "walk", x: (at - 3.5) * 0.9, y: 0, z: WALK_Z, yaw: Math.PI / 2, phase: (at / 8) * 2 * Math.PI, spec: { outfit: "shirt-trousers", frame: 0.2, heightM: 1.78, build: 0.4, hat: "none", mirrored: false } });
look("walk-cycle", "walk: one cycle in eight phases", [0, 1.1, WALK_Z + 9], [0, 0.9, WALK_Z], 30, 0);
for (let at = 0; at < 6; at++) figures.push({ seed: 60 + at, pose: "walk", x: 30 + at * 1.5 - 3.5, y: 0, z: WALK_Z, yaw: Math.PI / 2 + (at % 2) * Math.PI, phase: at * 1.3 });
look("walk-mix", "walkers of every kind", [30, 1.15, WALK_Z + 10], [30.2, 0.9, WALK_Z], 26, 1.1);

// Stand and chat in a pair.
figures.push({ seed: 72, pose: "chat", x: station(0) - 0.55, y: 0, z: 0, yaw: 1.3 }, { seed: 73, pose: "chat", x: station(0) + 0.55, y: 0, z: 0, yaw: -1.5 });
look("chat", "chat in a pair", [station(0) + 0.4, 1.3, 4.5], [station(0), 0.95, 0], 28, 1.1);

// A bench, sat on.
const benchX = station(1);
add(buildBench(), [{ x: benchX, y: 0, z: 0 }]);
figures.push({ seed: 74, pose: "sit-bench", x: benchX - 0.45, y: 0, z: 0 }, { seed: 77, pose: "sit-bench", x: benchX + 0.45, y: 0, z: 0, spec: { age: "older", outfit: "jacket-trousers" } });
look("bench", "sitting on a bench", [benchX + 2.2, 1.2, 4.4], [benchX, 0.7, 0], 28);

// A café set.
const cafeX = station(2);
add(buildCafeSet(), [{ x: cafeX, y: 0, z: 0 }]);
add(buildParasol(), [{ x: cafeX, y: 0, z: 0 }]);
figures.push({ seed: 78, pose: "sit-cafe", x: cafeX, y: 0, z: -CAFE_TABLE_Z_M, yaw: 0 }, { seed: 79, pose: "sit-cafe", x: cafeX, y: 0, z: CAFE_TABLE_Z_M, yaw: Math.PI, spec: { outfit: "summer-dress", frame: 0.85, heightM: 1.66, hat: "sun-hat", hair: "bob" } });
look("cafe", "a café table with cups", [cafeX + 3.4, 1.35, 1.5], [cafeX, 0.8, 0], 28);

// A jetty over the water, past the land.
const PIER_X = LAND_END_X - 8;
const DECK_Y = SEA_Y + 0.95;
scene.add(...placeModel(buildPier({ lengthM: 34, widthM: 4 }), [{ x: PIER_X, y: SEA_Y, z: 0 }], roadside));
const edgeZ = 2;
figures.push(
  { seed: 81, pose: "fish", x: PIER_X + 12, y: DECK_Y, z: edgeZ, spec: sailor(2) },
  { seed: 82, pose: "sit-edge", x: PIER_X + 17, y: DECK_Y, z: edgeZ },
  { seed: 83, pose: "sit-edge", x: PIER_X + 18, y: DECK_Y, z: edgeZ, spec: { outfit: "summer-dress", frame: 0.85 } },
  { seed: 84, pose: "tend-boat", x: PIER_X + 25, y: DECK_Y, z: edgeZ - 1.1, spec: sailor(3) },
);
add(buildRowingBoat(), [{ x: PIER_X + 25, y: SEA_Y, z: edgeZ + 0.8, yaw: Math.PI / 2 }], rural);
look("fish", "fishing from a jetty", [PIER_X + 8.8, DECK_Y + 1.2, 8], [PIER_X + 13.5, DECK_Y + 0.8, edgeZ], 30);
look("sit-edge", "feet over the edge", [PIER_X + 16, SEA_Y + 0.9, 7.5], [PIER_X + 17.5, DECK_Y - 0.1, edgeZ], 24);
look("sit-edge-side", "feet over the edge, from the side", [PIER_X + 12, DECK_Y + 0.6, 3.2], [PIER_X + 17.5, DECK_Y + 0.1, edgeZ], 22);
look("tend-boat", "tending a boat", [PIER_X + 28.5, DECK_Y + 1.1, 3.5], [PIER_X + 25, DECK_Y + 0.3, edgeZ - 0.4], 28);

// A rock in the sun.
const rockX = station(3);
const SLAB_TOP_M = 1.2;
add(buildShoreSlab(), [{ x: rockX + 3.2, y: 0, z: 0, yaw: 0.6 }], rural);
figures.push({ seed: 85, pose: "sunbathe", x: rockX + 3.2, y: SLAB_TOP_M, z: 0, yaw: 0.6, spec: { outfit: "tee-shorts", hat: "sun-hat" } });
look("sunbathe", "sunbathing", [rockX + 6.4, 2.3, 3.2], [rockX + 3.3, 1.45, 0.3], 26);
look("sunbathe-side", "sunbathing, from the side", [rockX + 0.4, 2.2, 3.6], [rockX + 3.4, 1.4, 0.4], 22);

// Working a field.
const fieldX = station(4);
figures.push({ seed: 86, pose: "field", x: fieldX, y: 0, z: 0, yaw: 0.2, spec: { ...worker(5), hat: "cap" } }, { seed: 87, pose: "field", x: fieldX + 2.2, y: 0, z: -0.8, yaw: -0.3, spec: { hat: "sun-hat", outfit: "shirt-trousers" } });
look("field", "working a field", [fieldX + 5.2, 1.3, 3.8], [fieldX + 1, 0.8, 0], 26, 1.3);

// A wave.
const waveX = station(5);
figures.push({ seed: 88, pose: "wave", x: waveX, y: 0, z: 0 }, { seed: 89, pose: "wave", x: waveX + 1.1, y: 0, z: 0.2, spec: { age: "child", heightM: 1.2 } });
look("wave", "a wave, an adult and a child", [waveX + 0.5, 1.3, 5], [waveX + 0.5, 1.05, 0], 26, 0.7);

// A small scene by a car.
const CAR_X = -160;
const carMaterial = parkedCarMaterial(inputs);
scene.add(...placeParkedCars([{ car: 2, x: CAR_X, y: 0, z: -56, yaw: Math.PI / 2, paint: "car-paint-navy" }, { car: 1, x: CAR_X + 7, y: 0, z: -56, yaw: Math.PI / 2, paint: "car-paint-silver" }], carMaterial));
add(buildBench(), [{ x: CAR_X + 3.5, y: 0, z: -51, yaw: Math.PI }]);
figures.push(
  { seed: 90, pose: "stand", x: CAR_X - 0.8, y: 0, z: -54.4, yaw: 2.6 },
  { seed: 91, pose: "chat", x: CAR_X + 1.5, y: 0, z: -54.2, yaw: -1.6 },
  { seed: 92, pose: "chat", x: CAR_X + 2.6, y: 0, z: -54.2, yaw: 1.7 },
  { seed: 93, pose: "sit-bench", x: CAR_X + 3.5, y: 0, z: -51, yaw: Math.PI },
  { seed: 94, pose: "walk", x: CAR_X + 6, y: 0, z: -53.4, yaw: -Math.PI / 2, spec: cyclist(2) },
  { seed: 95, pose: "walk", x: CAR_X + 9, y: 0, z: -52.2, yaw: Math.PI / 2 },
  { seed: 96, pose: "stand", x: CAR_X + 8.3, y: 0, z: -52.8, yaw: Math.PI / 2, spec: { age: "child", heightM: 1.3 } },
);
look("car-scale", "a scene beside a car, chase height", [CAR_X + 3, 2.1, -43], [CAR_X + 3, 0.9, -54], 40);

// The swap and the far outline, at their distances.
const LOD_X = -300;
const LOD_Z = 0;
for (let at = 0; at < 9; at++) figures.push({ seed: 100 + at, pose: POSES[at], x: LOD_X + at * 1.6, y: 0, z: LOD_Z, spec: at === 5 ? sailor(1) : undefined });
look("far-30", "the same nine at 32 m: near, as the swap begins", [LOD_X + 6.4, 1.6, 32], [LOD_X + 6.4, 0.8, 0], 11);
look("far-50", "at 50 m: the outlines", [LOD_X + 6.4, 1.6, 50], [LOD_X + 6.4, 0.8, 0], 7);
look("far-120", "at 120 m", [LOD_X + 6.4, 1.6, 120], [LOD_X + 6.4, 0.8, 0], 3);
look("far-190", "at 190 m, growing out of nothing", [LOD_X + 6.4, 1.6, 190], [LOD_X + 6.4, 0.8, 0], 2);
look("far-game", "the same at 40 m through the game's own lens, 60 degrees", [LOD_X + 6.4, 1.6, 40], [LOD_X + 6.4, 2, 0], 60);

// Fifty on a street, all near, for the cost: all drawn in full, the worst this budget meets.
const BUSY_X = -500;
const busy: PlacedFigure[] = [];
for (let at = 0; at < BUDGET_FIGURES; at++) {
  const pose = at % 3 === 0 ? "stand" : at % 7 === 1 ? "sit-cafe" : "walk";
  busy.push({ seed: 200 + at, pose, x: BUSY_X + (at % 10) * 2.6 - 12, y: 0, z: -Math.floor(at / 10) * 3 - 2, yaw: at * 1.4 });
}
figures.push(...busy);
const busyMeshes = crowdMeshes(bakeCrowd(busy.splice(0)), peopleMaterials(inputs));
figures.length -= BUDGET_FIGURES;
scene.add(...busyMeshes);
look("busy", "fifty figures within 35 m, 3 draws", [BUSY_X, 2.1, 6], [BUSY_X, 0.9, -8], 60, 1.6);

const crowd = bakeCrowd(figures);
const meshes = crowdMeshes(crowd, peopleMaterials(inputs));
scene.add(...meshes);

function pose(shot: Shot) {
  camera.fov = shot.fieldOfView ?? FIELD_OF_VIEW;
  camera.updateProjectionMatrix();
  camera.position.set(...shot.camera);
  camera.lookAt(...shot.target);
  clock.value = shot.time ?? 2.4;
}

async function frame(shot: Shot) {
  pose(shot);
  renderer.render(scene, camera);
  await renderer.resolveTimestampsAsync(TimestampQuery.RENDER);
  renderer.render(scene, camera);
  const counts = { drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles };
  return { ...counts, gpuMs: await renderer.resolveTimestampsAsync(TimestampQuery.RENDER) };
}

/** Fifty figures near, GPU time with and without them, in alternated pairs: context, not a verdict. */
async function budget() {
  const shot = shots.find(({ name }) => name === "busy");
  if (shot === undefined) throw new Error("no busy shot");
  pose(shot);
  const timed = async (shown: boolean) => {
    for (const mesh of busyMeshes) mesh.visible = shown;
    renderer.render(scene, camera);
    await renderer.resolveTimestampsAsync(TimestampQuery.RENDER);
    renderer.render(scene, camera);
    return { ms: (await renderer.resolveTimestampsAsync(TimestampQuery.RENDER)) ?? 0, triangles: renderer.info.render.triangles, calls: renderer.info.render.drawCalls };
  };
  const pairs: [Awaited<ReturnType<typeof timed>>, Awaited<ReturnType<typeof timed>>][] = [];
  for (let pair = 0; pair < PAIRS; pair++) {
    const first = await timed(pair % 2 === 0);
    const second = await timed(pair % 2 !== 0);
    pairs.push(pair % 2 === 0 ? [first, second] : [second, first]);
  }
  for (const mesh of busyMeshes) mesh.visible = true;
  const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
  const differences = sorted(pairs.map(([on, off]) => on.ms - off.ms));
  return {
    pairs: PAIRS,
    msWith: sorted(pairs.map(([on]) => on.ms))[PAIRS >> 1],
    msWithout: sorted(pairs.map(([, off]) => off.ms))[PAIRS >> 1],
    addedMsMedian: differences[PAIRS >> 1],
    addedMsQuartiles: [differences[PAIRS >> 2], differences[(3 * PAIRS) >> 2]],
    trianglesWith: pairs[0][0].triangles,
    trianglesWithout: pairs[0][1].triangles,
    callsWith: pairs[0][0].calls,
    callsWithout: pairs[0][1].calls,
  };
}

function triangleCounts() {
  const near = [...POSES].flatMap((name) => [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => buildNear(rollFigure(seed), name).triangleCount));
  const far = [...POSES].flatMap((name) => [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => buildFar(rollFigure(seed), name).triangleCount));
  return { nearMax: Math.max(...near), nearMin: Math.min(...near), farMax: Math.max(...far), farMin: Math.min(...far), figures: figures.length, crowdNear: (crowd.near.index?.count ?? 0) / 3, crowdFar: (crowd.far.index?.count ?? 0) / 3, nearVertices: crowd.near.getAttribute("position").count };
}

declare global {
  interface Window {
    __peopleGallery: { shots: Shot[]; frame: (name: string) => Promise<unknown>; budget: () => Promise<unknown>; counts: ReturnType<typeof triangleCounts>; ready: boolean };
  }
}

window.__peopleGallery = {
  shots,
  budget,
  frame: (name) => {
    const shot = shots.find((candidate) => candidate.name === name);
    if (shot === undefined) throw new Error(`no shot ${name}`);
    return frame(shot);
  },
  counts: triangleCounts(),
  ready: true,
};
