import { Color, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, TimestampQuery, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { cameraPosition, exp, float, mix, positionWorld, sin, smoothstep, uniform, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { createForest } from "../../render/forest";
import { buildPier, buildStreetLamp, placeModel, roadsideMaterials, type Placement, type RoadsideModel } from "../roadside";
import { BIKE_RACK_M, buildBench, buildBikeRack, buildBin, buildBollard, buildCafeChair, buildCafeSet, buildCafeTable, buildFlagpole, buildGrassTuft, buildGuardRail, buildGuardRailEnd, buildGuardRailReturn, buildHarbourCrane, buildLinden, buildMidsummerPole, buildParasol, buildPlanter, buildPlanterRound, buildReflectorPost, buildSailboat, buildSeedGrass, buildSpeedCamera, buildWildflowers, GUARD_RAIL_M, parkedCarMaterial, parkingBays, placeParkedCars, rowAlong, runSections, scatterVerge, shareOut, streetMaterials, treeRow, type LinePoint, type Wildflower } from "./index";

/*
 * The gallery's scene, built as the roadside gallery's is (its page has no exports:
 * it renders on import), on the game's renderer, camera, haze, sun and forest. One
 * stretch of road, each object at its own station, a harbour past the land's end,
 * and a town street of hundreds for the cost.
 */

const SUN = { azimuthDeg: 215, elevationDeg: 30 };
const FIELD_OF_VIEW = 60;
const [WIDTH, HEIGHT] = [2408, 1007];
const STATION_M = 110;
const VERGE_Z = -6;
const SEA_Y = -2;
const HAZE_M = 16000;
const PAIRS = 40;

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

export interface Shot {
  name: string;
  camera: [number, number, number];
  target: [number, number, number];
  label: string;
  fieldOfView?: number;
  /** The wind's clock for this shot, so two shots show a flag move. */
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
const materials = streetMaterials(inputs);
const roadside = roadsideMaterials(inputs);
const parkedMaterial = parkedCarMaterial(inputs);
const add = (model: RoadsideModel, places: Placement[]) => {
  const meshes = placeModel(model, places, materials);
  scene.add(...meshes);
  return meshes;
};

// The land: the road along x, with a pale footway past z = 8 in the town and grass elsewhere.
const LAND_END_X = 13 * STATION_M;
const groundGeometry = new PlaneGeometry(1, 1);
groundGeometry.rotateX(-Math.PI / 2);
const groundMaterial = new MeshBasicNodeMaterial();
const place = positionWorld.xz;
const patch = sin(place.x.mul(0.31).add(sin(place.y.mul(0.23)).mul(2))).mul(sin(place.y.mul(0.47).add(place.x.mul(0.11)))).mul(0.5).add(0.5);
const fine = sin(place.x.mul(5.3).add(place.y.mul(3.1))).mul(sin(place.y.mul(6.7).sub(place.x.mul(2.3)))).mul(0.5).add(0.5);
const grass = colorOf("ground").mul(mix(float(0.78), float(1.02), patch)).mul(mix(float(0.92), float(1.06), fine));
const across = place.y.abs();
const edgeLine = smoothstep(float(2.92), float(2.96), across).mul(float(1).sub(smoothstep(float(3.04), float(3.08), across)));
const road = mix(colorOf("road-main"), colorOf("road-paint"), edgeLine);
const onRoad = float(1).sub(smoothstep(float(3.5), float(3.6), across));
const shoulder = float(1).sub(smoothstep(float(3.6), float(4.6), across));
// The town's stretch has a paved footway both sides instead of grass.
const inTown = float(1).sub(smoothstep(float(-2000), float(-1990), place.x));
const footway = mix(colorOf("wall-grey"), colorOf("wall-pale"), 0.3).mul(mix(float(0.92), float(1.02), fine));
const verge = mix(mix(grass, colorOf("road-shoulder"), shoulder), footway, inTown);
groundMaterial.colorNode = hazed(mix(verge, road, onRoad));
const land = new Mesh(groundGeometry, groundMaterial);
land.scale.set(LAND_END_X + 8000, 1, 8000);
land.position.set((LAND_END_X - 8000) / 2, 0, 0);
land.frustumCulled = false;
scene.add(land);
const seaGeometry = new PlaneGeometry(1, 1);
seaGeometry.rotateX(-Math.PI / 2);
const seaMaterial = new MeshBasicNodeMaterial();
seaMaterial.colorNode = hazed(colorOf("water"));
const sea = new Mesh(seaGeometry, seaMaterial);
sea.scale.set(80000, 1, 80000);
sea.position.y = SEA_Y;
scene.add(sea);

const forest = createForest(scene, {
  canopyAt: (at) => smoothstep(float(46), float(50), at.y.negate()).mul(float(19)).add(float(3).mul(sin(at.x.mul(0.05)).mul(sin(at.y.mul(0.07))))),
  groundNear: () => float(0),
  groundFar: () => float(0),
  colour: colorOf,
  hazed,
  sun: SUN,
});

const shots: Shot[] = [];
const station = (index: number) => index * STATION_M;
const look = (name: string, label: string, x: number, from: [number, number, number], at: [number, number, number], fieldOfView?: number, time?: number) => {
  shots.push({ name, label, camera: [x + from[0], from[1], from[2]], target: [x + at[0], at[1], at[2]], fieldOfView, time });
};
const line = (fromX: number, toX: number, z: number): LinePoint[] => [{ x: fromX, y: 0, z }, { x: toX, y: 0, z }];

// 0: guard rail, a run on the near verge with both kinds of end. Its road side faces +z, towards the camera's lane.
const railModel = buildGuardRail();
const railLine = line(station(0) - 20, station(0) + 24, VERGE_Z + 1.5);
const railRun = runSections(railLine, GUARD_RAIL_M);
add(railModel, railRun);
const railEnd = buildGuardRailEnd();
add(railEnd, [{ x: station(0) + 24, y: 0, z: VERGE_Z + 1.5 }]);
const railReturn = buildGuardRailReturn();
add(railReturn, [{ x: station(0) - 20, y: 0, z: VERGE_Z + 1.5, stretch: -1 }]);
look("guard-rail", "guard rail run", station(0), [-9, 1.3, 1.5], [6, 0.6, VERGE_Z + 1.5]);
look("guard-rail-close", "W-beam and post, close", station(0), [-3, 1.1, -2], [-0.5, 0.55, VERGE_Z + 1.5], 40);
look("guard-rail-end", "ramped end", station(0), [17, 1.3, 1.5], [26, 0.3, VERGE_Z + 1.5], 40);
look("guard-rail-return", "rounded return", station(0), [-23, 1.1, 0], [-20, 0.5, VERGE_Z + 1.5], 34);

// 1: reflector posts, down both sides of the road.
const reflector = buildReflectorPost();
const reflectorLine = line(station(1) - 50, station(1) + 50, 0);
add(reflector, [...rowAlong(reflectorLine, 25, 4.4, undefined, Math.PI / 2), ...rowAlong(reflectorLine, 25, -4.4, undefined, Math.PI / 2)]);
look("reflector-post", "reflector post, facing oncoming traffic", station(1) - 37.5, [3.5, 1.1, -3], [0, 0.7, -4.4], 16);
look("reflector-road", "reflector posts down the road", station(1), [-58, 1.3, 1.5], [60, 0.6, 0], 30);

// 2: speed camera.
const speedCamera = buildSpeedCamera();
add(speedCamera, [{ x: station(2), y: 0, z: VERGE_Z, yaw: -Math.PI / 2 }]);
look("speed-camera", "speed camera", station(2), [-11, 1.3, 1.5], [0, 2.5, VERGE_Z], 34);

// 3: the verge.
const tufts = [buildGrassTuft(3), buildGrassTuft(9, 0.95), buildSeedGrass(11)];
const flowers: Wildflower[] = ["daisy", "buttercup", "lupine", "fireweed", "cow-parsley"];
const flowerModels = flowers.map((kind) => buildWildflowers(kind));
const vergeLine = line(station(3) - 45, station(3) + 45, 0);
const scatter = scatterVerge(vergeLine, { perMetre: 5, fromM: 4.3, wideM: 8, seed: 21 });
const groups = shareOut(scatter, tufts.length, 4);
tufts.forEach((model, index) => add(model, groups[index]));
const flowerScatter = shareOut(scatterVerge(vergeLine, { perMetre: 1, fromM: 4.6, wideM: 7, seed: 33 }), flowerModels.length, 8);
flowerModels.forEach((model, index) => add(model, flowerScatter[index]));
look("verge", `verge, ${scatter.length} tufts`, station(3), [-16, 1.3, 1.5], [8, 0.8, VERGE_Z], 44);
look("verge-close", "wildflowers close", station(3), [-6, 0.9, -3.4], [-1.5, 0.5, -7], 40);

// A single specimen of each flower side by side, for reading their shapes.
flowerModels.forEach((model, index) => add(model, [{ x: station(2) + 25 + index * 1.3, y: 0, z: VERGE_Z + 1.5, scale: 1.2 }]));
look("flowers", "daisy, buttercup, lupine, fireweed, cow parsley", station(2) + 25, [2.6, 0.9, 0.5], [2.6, 0.5, VERGE_Z + 1.5], 34);

// 4: a planted double row of lindens, on an esplanade.
const lindens = [buildLinden(3), buildLinden(8), buildLinden(14)];
const esplanadeLine = line(station(4) - 50, station(4) + 50, 0);
const rows = shareOut([...treeRow(esplanadeLine, 10, 7, { heightM: 14, heightSpreadM: 1.5, seed: 5 }), ...treeRow(esplanadeLine, 10, 15, { heightM: 15, heightSpreadM: 1.5, seed: 6 }), ...treeRow(esplanadeLine, 10, -7, { heightM: 14, heightSpreadM: 1.5, seed: 7 })], lindens.length, 2);
lindens.forEach((model, index) => add(model, rows[index]));
look("linden-row", "linden esplanade", station(4), [-48, 1.3, 1.5], [30, 6, 0], 56);
look("linden-side", "one linden near version", station(4), [3, 1.3, 1.5], [3, 7, 9], 76);
look("linden-swap", "lindens at the swap, 130 m", station(4), [-180, 1.5, 3], [-30, 6, 5], 16);
look("linden-reach", "lindens from 1.1 km, at their reach", station(4), [-1080, 1.5, 3], [0, 6, 5], 6);

// 5: town furniture.
const bench = buildBench();
const bin = buildBin();
const rack = buildBikeRack();
add(bench, [{ x: station(5) - 1, y: 0, z: VERGE_Z + 1 }]);
add(bin, [{ x: station(5) + 1.5, y: 0, z: VERGE_Z + 1 }]);
add(rack, [{ x: station(5) + 3, y: 0, z: VERGE_Z + 0.5 }]);
look("furniture", "bench, bin, bike rack", station(5), [-1, 1.3, 1.5], [1.2, 0.5, VERGE_Z + 1], 44);
look("bench-close", "bench", station(5), [-3.6, 1.2, -1.8], [-1, 0.5, VERGE_Z + 1], 34);

// 6: café terrace.
const cafe = buildCafeSet();
const parasol = buildParasol();
const planter = buildPlanter();
const round = buildPlanterRound();
const cafeTable = buildCafeTable();
const cafeChair = buildCafeChair();
const terrace = [0, 1, 2, 3].flatMap((row) => [0, 1].map((column): Placement => ({ x: station(6) + row * 2.4, y: 0, z: VERGE_Z - column * 3 + 0.5, yaw: (row + column) * 0.3 })));
add(cafe, terrace);
add(parasol, terrace.filter((_, index) => index % 3 === 0));
add(cafeTable, [{ x: station(6) - 3, y: 0, z: VERGE_Z + 1 }]);
add(cafeChair, [{ x: station(6) - 3, y: 0, z: VERGE_Z + 1.65, yaw: Math.PI }]);
look("cafe", "café terrace", station(6), [-5, 1.3, 1.5], [3, 1, VERGE_Z - 1], 50);
look("cafe-close", "table, chairs", station(6), [-4, 1.25, -1.8], [-1, 0.5, VERGE_Z + 1], 44);

// 7: planters.
add(planter, [{ x: station(7), y: 0, z: VERGE_Z + 1 }, { x: station(7) + 1.5, y: 0, z: VERGE_Z + 1 }]);
add(round, [{ x: station(7) + 3.6, y: 0, z: VERGE_Z + 1 }]);
look("planters", "planters", station(7), [1, 1.2, 1], [2, 0.5, VERGE_Z + 1], 30);

// 8: flags, flying east along a northern breeze.
add(buildFlagpole("finland"), [{ x: station(8), y: 0, z: VERGE_Z - 3, yaw: 0 }]);
add(buildFlagpole("aland"), [{ x: station(8) + 5, y: 0, z: VERGE_Z - 3, yaw: 0 }]);
add(buildFlagpole("finland"), [{ x: station(8) + 500, y: 0, z: VERGE_Z - 3, yaw: 0 }]);
look("flags", "flags from the road", station(8), [-3, 1.3, 1.5], [3.5, 7, VERGE_Z - 3], 62, 0);
look("flag-finland", "Finland, flat on: 11:18, 5-3-10", station(8), [1.4, 8.4, 8], [1.4, 9.1, VERGE_Z - 3], 18, 0.8);
look("flag-aland", "Åland, flat on: 17:26", station(8) + 5, [1.3, 8.4, 8], [1.3, 9.1, VERGE_Z - 3], 18, 0.8);
look("flags-moved", "the same a moment on", station(8), [-3, 1.3, 1.5], [3.5, 7, VERGE_Z - 3], 62, 1.3);

// 9: midsummer pole.
add(buildMidsummerPole(), [{ x: station(9), y: 0, z: VERGE_Z - 6, yaw: 0.25 }]);
look("midsummer", "midsummer pole", station(9), [-14, 1.5, 1.5], [0, 8.4, VERGE_Z - 6], 70);
look("midsummer-top", "its crossbar and rings", station(9), [-10, 1.5, 6], [0, 11, VERGE_Z - 6], 32);
look("midsummer-far", "far version, 170 m", station(9), [-165, 1.5, 2], [0, 7, VERGE_Z - 6], 9);

// 10: parked cars, a car park and a kerb.
const parkingCars = [
  ...parkingBays({ x: station(10) - 30, y: 0, z: -12 }, { x: station(10) + 30, y: 0, z: -12 }, { bayM: 2.7, fill: 0.72, seed: 3, nose: "in" }),
  ...parkingBays({ x: station(10) - 30, y: 0, z: 4.6 }, { x: station(10) + 30, y: 0, z: 4.6 }, { bayM: 6.2, fill: 0.7, seed: 8, nose: "kerbside" }),
];
scene.add(...placeParkedCars(parkingCars, parkedMaterial));
look("parked", "parked cars, seeded", station(10), [-34, 1.4, 1.2], [8, 0.9, -7], 44);

// 12: harbour, on a pier and the water past the land's end.
const harbourX = LAND_END_X + 24;
const quayZ = -10;
const pier = buildPier({ lengthM: 60, widthM: 8 });
scene.add(...placeModel(pier, [{ x: harbourX - 30, y: SEA_Y, z: quayZ }], roadside));
const deckY = SEA_Y + 0.95;
const bollard = buildBollard();
add(bollard, [-22, -12, -2, 8, 18].map((along) => ({ x: harbourX + along, y: deckY, z: quayZ + 3.3 })));
const crane = buildHarbourCrane();
add(crane, [{ x: harbourX + 14, y: deckY, z: quayZ - 0.8, yaw: -Math.PI / 2 - 0.3 }]);
const boat = buildSailboat();
add(boat, [{ x: harbourX - 12, y: SEA_Y, z: quayZ + 7, yaw: 0.04 }, { x: harbourX + 2, y: SEA_Y, z: quayZ + 7.6, yaw: Math.PI - 0.03 }]);
add(boat, [{ x: harbourX + 90, y: SEA_Y, z: quayZ + 90, yaw: 1.2 }]);
look("harbour", "harbour", harbourX, [36, SEA_Y + 2.2, 34], [-4, 3, quayZ], 30);
look("bollard", "bollard", harbourX - 2, [-1.8, deckY + 1.15, quayZ + 1.2], [0, deckY + 0.3, quayZ + 3.3], 34);
look("crane", "harbour crane", harbourX + 14, [-16, deckY + 1.6, quayZ + 2], [3, 6.5, quayZ - 2], 66);
look("sailboat", "moored sailboat", harbourX - 12, [-11, SEA_Y + 2.4, quayZ + 14], [0, 3.8, quayZ + 7], 52);

// The town street: a 400 m esplanade with hundreds of things, for the cost and the far versions.
const streetX = -3200;
const STREET_M = 400;
const kerb = 3.8;
const streetLine = line(streetX, streetX + STREET_M, 0);
const town: Record<string, [RoadsideModel, Placement[]]> = {};
const lindenRow = shareOut([...treeRow(streetLine, 9, 9.5, { heightM: 14, heightSpreadM: 1.5, seed: 15 }), ...treeRow(streetLine, 9, -9.5, { heightM: 14, heightSpreadM: 1.5, seed: 16 })], lindens.length, 7);
lindens.forEach((model, index) => (town[`linden-${index}`] = [model, lindenRow[index]]));
town.bench = [bench, rowAlong(streetLine, 26, 7.4)];
town.bin = [bin, rowAlong(streetLine, 34, -7)];
town.rack = [rack, rowAlong(line(streetX, streetX + STREET_M - BIKE_RACK_M, 0), 80, -8)];
town.planter = [planter, rowAlong(streetLine, 18, 6.2)];
town.planterRound = [round, rowAlong(streetLine, 45, -6.2)];
town.cafe = [cafe, Array.from({ length: 40 }, (_, index) => ({ x: streetX + 140 + index * 2.6, y: 0, z: 6.6 + (index % 3) * 2.4, yaw: index }))];
town.parasol = [parasol, Array.from({ length: 12 }, (_, index) => ({ x: streetX + 140 + index * 8.6, y: 0, z: 9 }))];
town.bollard = [bollard, rowAlong(streetLine, 6, -5.7)];
town.flag = [buildFlagpole("aland"), rowAlong(streetLine, 90, 12).map((spot) => ({ ...spot, yaw: 0 }))];
const streetLamps = rowAlong(streetLine, 32, kerb + 1.6);
const townMeshes: Mesh[] = [];
for (const [model, places] of Object.values(town)) townMeshes.push(...add(model, places));
const streetCars = [
  ...parkingBays({ x: streetX, y: 0, z: 4.5 }, { x: streetX + STREET_M, y: 0, z: 4.5 }, { bayM: 6.2, fill: 0.8, seed: 18, nose: "kerbside" }),
  ...parkingBays({ x: streetX + STREET_M, y: 0, z: -4.5 }, { x: streetX, y: 0, z: -4.5 }, { bayM: 6.2, fill: 0.8, seed: 19, nose: "kerbside" }),
];
const carMeshes = placeParkedCars(streetCars, parkedMaterial);
scene.add(...carMeshes);
townMeshes.push(...carMeshes);
const lampMeshes = placeModel(buildStreetLamp(), streetLamps, roadside);
scene.add(...lampMeshes);
const counted = Object.values(town).reduce((sum, [, places]) => sum + places.length, 0) + streetCars.length;
const streetEye = { x: streetX + 200, z: 0.6 };
look("street", `town street, ${counted} objects`, streetX, [200, 1.3, 0.6], [320, 3.4, 0.2], 60);
look("street-high", "the same, from a chase height", streetX, [150, 2.15, 1.2], [230, 2.8, 2], 62);
look("street-from-outside", "the street from past its end", streetX, [-60, 1.5, 1.2], [80, 3, 0], 40);

function triangles(model: RoadsideModel) {
  const count = (geometry: RoadsideModel["near"] | null) => (geometry?.index?.count ?? 0) / 3;
  return { near: count(model.near), far: count(model.far), swapM: model.swapM, reachM: model.reachM };
}

function pose(shot: Shot) {
  camera.fov = shot.fieldOfView ?? FIELD_OF_VIEW;
  camera.updateProjectionMatrix();
  camera.position.set(...shot.camera);
  camera.lookAt(...shot.target);
  clock.value = shot.time ?? 2.4;
  forest.update(camera.position);
}

async function frame(shot: Shot) {
  pose(shot);
  renderer.render(scene, camera);
  await renderer.resolveTimestampsAsync(TimestampQuery.RENDER);
  renderer.render(scene, camera);
  const counts = { drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles };
  return { ...counts, gpuMs: await renderer.resolveTimestampsAsync(TimestampQuery.RENDER) };
}

/** What the street costs from its middle: triangles that really draw, then GPU time with and without it, in alternated pairs. */
async function budget() {
  const count = (geometry: RoadsideModel["near"] | null) => (geometry?.index?.count ?? 0) / 3;
  let [drawn, issued] = [0, 0];
  for (const [model, places] of Object.values(town)) {
    issued += places.length * (count(model.near) + count(model.far));
    for (const { x, z } of places) {
      const distance = Math.hypot(x - streetEye.x, z - streetEye.z);
      drawn += distance < model.swapM ? count(model.near) : distance < model.reachM ? count(model.far) : 0;
    }
  }
  const shot = shots.find(({ name }) => name === "street");
  if (shot === undefined) throw new Error("no street shot");
  pose(shot);
  const timed = async (shown: boolean) => {
    for (const mesh of townMeshes) mesh.visible = shown;
    renderer.render(scene, camera);
    await renderer.resolveTimestampsAsync(TimestampQuery.RENDER);
    renderer.render(scene, camera);
    const counts = { calls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles };
    return { ms: (await renderer.resolveTimestampsAsync(TimestampQuery.RENDER)) ?? 0, ...counts };
  };
  const pairs: [Awaited<ReturnType<typeof timed>>, Awaited<ReturnType<typeof timed>>][] = [];
  for (let pair = 0; pair < PAIRS; pair++) pairs.push([await timed(true), await timed(false)]);
  for (const mesh of townMeshes) mesh.visible = true;
  const sorted = (values: number[]) => values.sort((a, b) => a - b);
  const middle = (values: number[]) => sorted(values)[values.length >> 1];
  const ratios = sorted(pairs.map(([on, off]) => on.ms / off.ms));
  return {
    objects: counted,
    drawnExcludingCars: drawn,
    issuedVerticesPass: issued,
    meshes: townMeshes.length,
    callsWith: pairs[0][0].calls,
    callsWithout: pairs[0][1].calls,
    trianglesWith: pairs[0][0].triangles,
    trianglesWithout: pairs[0][1].triangles,
    msWith: middle(pairs.map(([on]) => on.ms)),
    msWithout: middle(pairs.map(([, off]) => off.ms)),
    ratio: ratios[PAIRS >> 1],
    ratioQuartiles: [ratios[PAIRS >> 2], ratios[(3 * PAIRS) >> 2]],
  };
}

declare global {
  interface Window {
    __streetGallery: { shots: Shot[]; frame: (name: string) => Promise<unknown>; budget: () => Promise<unknown>; counts: Record<string, ReturnType<typeof triangles>>; street: Record<string, number>; ready: boolean };
  }
}

const parkedTriangles = (carMeshes as Mesh[]).map((mesh) => mesh.geometry.getAttribute("position").count / 3);
window.__streetGallery = {
  shots,
  budget,
  frame: (name) => {
    const shot = shots.find((candidate) => candidate.name === name);
    if (shot === undefined) throw new Error(`no shot ${name}`);
    return frame(shot);
  },
  counts: {
    "guard rail 4 m": triangles(railModel),
    "guard rail ramped end": triangles(railEnd),
    "guard rail return": triangles(railReturn),
    "reflector post": triangles(reflector),
    "speed camera": triangles(speedCamera),
    "grass tuft": triangles(tufts[0]),
    "seed grass": triangles(tufts[2]),
    ...Object.fromEntries(flowers.map((kind, index) => [kind, triangles(flowerModels[index])])),
    linden: triangles(lindens[0]),
    bench: triangles(bench),
    bin: triangles(bin),
    "bike rack": triangles(rack),
    "café set": triangles(cafe),
    "café table": triangles(cafeTable),
    "café chair": triangles(cafeChair),
    parasol: triangles(parasol),
    planter: triangles(planter),
    "planter, round": triangles(round),
    "flagpole, Finland": triangles(buildFlagpole("finland")),
    "flagpole, Åland": triangles(buildFlagpole("aland")),
    "midsummer pole": triangles(buildMidsummerPole()),
    bollard: triangles(bollard),
    "harbour crane": triangles(crane),
    sailboat: triangles(boat),
  },
  street: { objects: counted, ...Object.fromEntries(Object.entries(town).map(([name, [, places]]) => [name, places.length])), cars: streetCars.length, lamps: streetLamps.length, ...Object.fromEntries(parkedTriangles.map((value, index) => [`car model ${index} triangles`, value])) },
  ready: true,
};
