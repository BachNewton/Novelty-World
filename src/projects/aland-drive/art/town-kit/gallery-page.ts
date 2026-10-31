import { Color, DoubleSide, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, Shape, ShapeGeometry, TimestampQuery, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { cameraPosition, exp, float, mix, positionWorld, uniform, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { buildBusShelter, buildStreetLamp, placeModel, roadsideMaterials, type Placement, type RoadsideModel } from "../roadside";
import { buildBench, buildBikeRack, buildPlanter, parkedCarMaterial, parkingBays, placeParkedCars, rowAlong, streetMaterials, type LinePoint } from "../street";
import { alongWall, bikeRow, bladesOnPost, buildBalticFerry, buildBicycle, buildBusStopPole, buildCrossingPole, buildHangingLamp, buildMarinaDeck, buildMooredLaunch, buildMooredYacht, buildStreetNamePlate, buildStreetNamePost, buildTerminal, buildTownLamp, buildTrafficLight, buildVillagePlate, buildVillageSign, buildWindowBox, createNameSheet, deliveryVan, ferryPlace, marinaRow, namePlateMaterial, placeNamePlates, placeTrafficLights, sceneOf, signalsAtJunction, STREET_PLATE, TERMINAL_ORIGIN, townMaterials, trafficLightMaterials, VILLAGE_PLATE, VILLAGE_PLATE_Y_M } from "./index";

/*
 * The gallery's scene on the game's renderer, camera, haze and sun, with the harbour at its real place: the same
 * scene coordinates as the world, a quay traced from the 2025 photo, and the real pier lines of ÅSS Marina. A town
 * street stands inland of it for the small things and their cost. The grey block is the terminal building, a stand-in
 * for the NLS solid that stays in the world.
 */

const SUN = { azimuthDeg: 215, elevationDeg: 30 };
const FIELD_OF_VIEW = 60;
const [WIDTH, HEIGHT] = [2408, 1007];
const HAZE_M = 16000;
const SEA_Y = 0.1;
const QUAY_Y = 2.2;
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
const ink = (name: string) => `#${token(name).getHexString()}`;

export interface Shot {
  name: string;
  camera: [number, number, number];
  target: [number, number, number];
  label: string;
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
const town = townMaterials(inputs);
const signals = trafficLightMaterials(inputs);
const street = streetMaterials(inputs);
const roadside = roadsideMaterials(inputs);
const parked = parkedCarMaterial(inputs);

const streetKit: Mesh[] = [];
const harbourKit: Mesh[] = [];
const add = (model: RoadsideModel, places: readonly Placement[], into: Mesh[] = streetKit) => {
  const meshes = placeModel(model, places, town);
  scene.add(...meshes);
  into.push(...meshes);
  return meshes;
};
const shots: Shot[] = [];

// The sea, and land: everything east of the quay's edge, traced from the photo.
const flatMesh = (colour: Node<"vec3">) => {
  const material = new MeshBasicNodeMaterial();
  material.colorNode = hazed(colour);
  material.side = DoubleSide;
  return material;
};
const seaPlane = new PlaneGeometry(1, 1);
seaPlane.rotateX(-Math.PI / 2);
const sea = new Mesh(seaPlane, flatMesh(colorOf("water")));
sea.scale.set(80000, 1, 80000);
sea.position.y = SEA_Y;
scene.add(sea);

const QUAY: readonly (readonly [number, number])[] = [[107055, 6684200], [107060, 6683380], [107080, 6683240], [107098, 6683120], [107112, 6683010], [107116, 6682985], [107086, 6682975], [107082, 6682955], [107115, 6682945], [107113, 6682760], [107152, 6682752], [107138, 6682622], [107160, 6682620], [107168, 6682612], [107153, 6682530], [107198, 6682508], [107222, 6682500], [107220, 6682380], [107240, 6682200], [108400, 6682200], [108400, 6684200]];
const quayShape = new Shape();
QUAY.forEach(([east, north], at) => {
  const { x, z } = sceneOf(east, north);
  if (at === 0) quayShape.moveTo(x, -z);
  else quayShape.lineTo(x, -z);
});
const quayGeometry = new ShapeGeometry(quayShape);
quayGeometry.rotateX(-Math.PI / 2);
const quay = new Mesh(quayGeometry, flatMesh(mix(colorOf("wall-grey"), colorOf("wall-pale"), 0.4)));
quay.position.y = QUAY_Y;
scene.add(quay);

const stripGeometry = new PlaneGeometry(1, 1);
stripGeometry.rotateX(-Math.PI / 2);
const roadMaterial = flatMesh(colorOf("road-main"));
function roadStrip(fromEast: number, fromNorth: number, toEast: number, toNorth: number, wide: number) {
  const [a, b] = [sceneOf(fromEast, fromNorth), sceneOf(toEast, toNorth)];
  const mesh = new Mesh(stripGeometry, roadMaterial);
  mesh.position.set((a.x + b.x) / 2, QUAY_Y + 0.03, (a.z + b.z) / 2);
  mesh.scale.set(Math.hypot(b.x - a.x, b.z - a.z), 1, wide);
  mesh.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
  scene.add(mesh);
}
// The drivable lines under the walkways, from the baked road surface, so a shot shows what stays open.
for (const [a, b, c, d] of [[107140, 6682958, 107155, 6682772], [107155, 6682772, 107173, 6682750], [107173, 6682750, 107177, 6682713], [107177, 6682713, 107174, 6682686], [107174, 6682686, 107186, 6682642], [107122, 6682939, 107126, 6682831], [107126, 6682831, 107134, 6682793], [107134, 6682793, 107155, 6682772]]) roadStrip(a, b, c, d, 6);

const look = (name: string, label: string, camera: [number, number, number], target: [number, number, number], fieldOfView?: number, time?: number) => shots.push({ name, label, camera, target, fieldOfView, time });
const atEN = (east: number, north: number, y: number): [number, number, number] => {
  const { x, z } = sceneOf(east, north);
  return [x, y, z];
};

// The terminal, ferry and stand-in terminal building.
const terminalModel = buildTerminal();
const ferryModel = buildBalticFerry();
const terminalPlace = { ...sceneOf(TERMINAL_ORIGIN.east, TERMINAL_ORIGIN.north), y: 0 };
add(terminalModel, [terminalPlace], harbourKit);
add(ferryModel, [ferryPlace()], harbourKit);
const buildingMaterial = flatMesh(colorOf("wall-pale"));
const buildingGeometry = new PlaneGeometry(1, 1);
const block = sceneOf(107207, 6682713);
for (const [dx, dz, turn, y, scaleY] of [[0, -26, 0, QUAY_Y + 5, 10], [0, 26, 0, QUAY_Y + 5, 10], [-19, 0, Math.PI / 2, QUAY_Y + 5, 10], [19, 0, Math.PI / 2, QUAY_Y + 5, 10]] as const) {
  const wall = new Mesh(buildingGeometry, buildingMaterial);
  wall.position.set(block.x + dx, y, block.z + dz);
  wall.rotation.y = turn;
  wall.scale.set(turn === 0 ? 38 : 52, scaleY, 1);
  scene.add(wall);
}

look("terminal-air", "terminal from over the water", atEN(106950, 6682560, 70), atEN(107170, 6682680, 6), 44);
look("terminal-sea", "terminal from the harbour, sea level", atEN(107020, 6682640, 4), atEN(107180, 6682660, 9), 44);
look("terminal-road", "under the walkways, on the service road", atEN(107150, 6682790, 3.6), atEN(107178, 6682690, 9), 66);
look("terminal-road-south", "the south walkway from Havsgatan", atEN(107275, 6682590, 3.8), atEN(107225, 6682540, 10), 62);
look("terminal-quay", "north gallery from the car lanes", atEN(107175, 6682880, 3.6), atEN(107140, 6682800, 10), 58);
look("deck-north", "north car deck up to the ship", atEN(107128, 6682838, 3.6), atEN(107122, 6682920, 7), 54);
look("deck-south", "south car deck and link span", atEN(107200, 6682660, 3.6), atEN(107150, 6682680, 7), 58);
look("terminal-far", "terminal far version, 1 km", atEN(106250, 6682750, 3), atEN(107180, 6682680, 8), 12);

look("ferry-beam", "ferry on the beam, from the west", atEN(106830, 6682850, 4), atEN(107096, 6682850, 20), 40);
look("ferry-bow", "ferry's bow, from the south-west", atEN(106985, 6682640, 5), atEN(107096, 6682770, 20), 46);
look("ferry-stern", "ferry's stern door, from the north-west", atEN(107010, 6683040, 5), atEN(107096, 6682930, 18), 46);
look("ferry-quay", "ferry from the quay at car height", atEN(107155, 6682900, 3.6), atEN(107096, 6682860, 20), 72);
look("ferry-far", "ferry far version, 1.3 km", atEN(105800, 6682720, 4), atEN(107096, 6682850, 18), 10);
look("ferry-swap", "ferry mid-dissolve, 900 m", atEN(106200, 6682760, 4), atEN(107096, 6682850, 18), 11);

// ÅSS Marina's real piers.
const PIERS: readonly (readonly [number, number])[][] = [
  [[106924, 6683581], [106995, 6683588]],
  [[106929, 6683643], [106979, 6683644], [106989, 6683645]],
  [[106922, 6683510], [107005, 6683522]],
  [[106932, 6683443], [107028, 6683456]],
  [[106956, 6683371], [107046, 6683397]],
];
const asLine = (pier: readonly (readonly [number, number])[]): LinePoint[] => pier.map(([east, north]) => ({ ...sceneOf(east, north), y: 0 }));
const rows = PIERS.map((pier, index) => marinaRow(asLine(pier), { berthM: 3.2, fill: 0.56, seaY: SEA_Y, deck: true, seed: 11 + index }));
const collect = (key: "deck" | "yachts" | "navyYachts" | "launches") => rows.flatMap((row) => row[key]);
const [deckModel, yachtModel, navyModel, launchModel] = [buildMarinaDeck(), buildMooredYacht(), buildMooredYacht("boat-navy"), buildMooredLaunch()];
add(deckModel, collect("deck"), harbourKit);
add(yachtModel, collect("yachts"), harbourKit);
add(navyModel, collect("navyYachts"), harbourKit);
add(launchModel, collect("launches"), harbourKit);
const boats = collect("yachts").length + collect("navyYachts").length + collect("launches").length;
look("marina-air", `ÅSS Marina, ${boats} boats on real piers`, atEN(106790, 6683410, 34), atEN(106975, 6683520, 2), 46);
look("marina-shore", "masts from the shore road", atEN(107085, 6683530, 3.4), atEN(106960, 6683530, 6), 56);
look("marina-close", "pontoon among the boats", atEN(106990, 6683530, 2.4), atEN(106950, 6683505, 3), 60);
look("marina-far", "masts from across the bay, 900 m", atEN(106080, 6683330, 4), atEN(106970, 6683520, 5), 14);

// A town street, 1.5 km inland, 300 m long with a junction in the middle.
const STREET_X = 500;
const STREET_Z = 5000;
const ground = (x: number, z: number): LinePoint => ({ x: STREET_X + x, y: 0.15, z: STREET_Z + z });
const land = new Mesh(seaPlane, flatMesh(colorOf("ground")));
land.scale.set(1400, 1, 1400);
land.position.set(STREET_X, 0.12, STREET_Z);
scene.add(land);
const roadSheet = new Mesh(seaPlane, flatMesh(mix(colorOf("wall-grey"), colorOf("wall-pale"), 0.3)));
roadSheet.scale.set(600, 1, 18);
roadSheet.position.set(STREET_X, 0.14, STREET_Z);
const crossPaving = new Mesh(seaPlane, roadSheet.material);
crossPaving.scale.set(18, 1, 600);
crossPaving.position.set(STREET_X, 0.14, STREET_Z);
const carriage = new Mesh(seaPlane, roadMaterial);
carriage.scale.set(600, 1, 7);
carriage.position.set(STREET_X, 0.16, STREET_Z);
const crossCarriage = new Mesh(seaPlane, roadMaterial);
crossCarriage.scale.set(7, 1, 600);
crossCarriage.position.set(STREET_X, 0.16, STREET_Z);
scene.add(roadSheet, crossPaving, carriage, crossCarriage);

// Plain walls to hang things on, as buildings would be.
const wallMaterial = flatMesh(colorOf("wall-cream"));
const wallRed = flatMesh(colorOf("wall-red"));
for (const [cx, cz, material] of [[-62, -11, wallMaterial], [-16, 11, wallRed], [40, -11, wallRed], [84, 11, wallMaterial]] as const) {
  const wall = new Mesh(new PlaneGeometry(36, 7), material);
  wall.position.set(STREET_X + cx, 3.5, STREET_Z + cz);
  scene.add(wall);
}

const centre = ground(0, 0);
const line = (from: number, to: number): LinePoint[] => [ground(from, 0), ground(to, 0)];
const townLamps = rowAlong(line(-150, 150), 22, 7.4);
const lampModel = buildTownLamp();
add(lampModel, townLamps);

const lightModel = buildTrafficLight();
const heads = signalsAtJunction(centre, [{ dx: 0, dz: -1 }, { dx: 1, dz: 0 }, { dx: 0, dz: 1 }, { dx: -1, dz: 0 }], { backM: 7.5, kerbM: 4.6 });
const lightMeshes = placeTrafficLights(lightModel, heads, signals);
scene.add(...lightMeshes);
streetKit.push(...lightMeshes);

const nameSheet = createNameSheet(["Torggatan", "Norra Esplanadgatan", "Storagatan", "Skarpansvägen", "Hamngatan", "Ålandsvägen"], STREET_PLATE.wideM / STREET_PLATE.tallM, ink);
const postModel = buildStreetNamePost();
const corners = [ground(-6.2, -6.2), ground(6.2, 6.2)];
add(postModel, corners.map(({ x, y, z }) => ({ x, y, z })));
const plateModel = buildStreetNamePlate();
const plates = [
  ...bladesOnPost(corners[0], [{ name: "Torggatan", yaw: 0 }, { name: "Norra Esplanadgatan", yaw: Math.PI / 2 }]),
  ...bladesOnPost(corners[1], [{ name: "Torggatan", yaw: Math.PI }, { name: "Norra Esplanadgatan", yaw: -Math.PI / 2 }]),
  // A plate on a wall.
  { x: STREET_X - 30, y: 3.1, z: STREET_Z - 10.98, yaw: 0, name: "Storagatan" },
];
const plateMaterial = namePlateMaterial(inputs, nameSheet.texture);
const plateMesh = placeNamePlates(plateModel, nameSheet, plates, plateMaterial);
scene.add(plateMesh);
streetKit.push(plateMesh);

const crossingModel = buildCrossingPole();
add(crossingModel, [ground(-22, 4.3), ground(-22, -4.3), ground(22, 4.3), ground(22, -4.3)].map(({ x, y, z }) => ({ x, y, z, yaw: Math.PI / 2 })));

const busModel = buildBusStopPole();
add(busModel, [{ ...ground(60, 4.6), yaw: 0 }]);
const shelter = placeModel(buildBusShelter(), [{ ...ground(68, -5.4) }], roadside);
scene.add(...shelter);

const bikeModels = [buildBicycle("bike-red"), buildBicycle("bike-blue"), buildBicycle("bike-black")];
const rackSpot = ground(-18, 8.6);
const rack = buildBikeRack();
const rackMeshes = placeModel(rack, [{ ...rackSpot }], street);
scene.add(...rackMeshes);
const bikes = bikeRow(ground(-18, 8.6), { yaw: 0, count: 6, spacingM: 0.8 });
bikeModels.forEach((model, index) => add(model, bikes.filter((_, at) => at % bikeModels.length === index)));

const hangingModel = buildHangingLamp();
const boxModels = [buildWindowBox("bloom-red"), buildWindowBox("bloom-white", 9)];
add(hangingModel, alongWall(ground(-80, -10.98), ground(-44, -10.98), { spacingM: 6, heightM: 3.4, outward: 1 }));
add(boxModels[0], alongWall(ground(-80, -10.98), ground(-44, -10.98), { spacingM: 3, heightM: 1.25, outward: 1 }));
add(boxModels[1], alongWall(ground(-34, 10.98), ground(2, 10.98), { spacingM: 3, heightM: 1.25, outward: -1 }));

const vans = [deliveryVan(ground(-40, 2.8), Math.PI / 2 + Math.PI), ...parkingBays(ground(-140, 4.6), ground(-60, 4.6), { bayM: 6.2, fill: 0.7, seed: 4, nose: "kerbside" })];
const vanMeshes = placeParkedCars(vans, parked);
scene.add(...vanMeshes);
streetKit.push(...vanMeshes);

add(buildBench(), [{ ...ground(-30, 8.6), yaw: Math.PI }]);
add(buildPlanter(), [{ ...ground(-38, 8.6) }]);

const eye = (x: number, y: number, z: number): [number, number, number] => [STREET_X + x, y, STREET_Z + z];
look("street-town", "town street, chase height", eye(-120, 2.2, 1.6), eye(-20, 3, 0), 60);
look("street-lamp-compare", "town lamp beside the rural lamp", eye(-6, 1.6, 2), eye(-11, 3.4, 7.4), 62);
look("lamp-close", "town lamp, close", eye(8.4, 1.4, 3), eye(11, 3.2, 7.4), 56);
look("junction", "junction: this road red, the crossing road green", eye(-34, 2, 1.6), eye(0, 2.6, 0), 42, 3);
look("junction-turn", "half a cycle on: this road green", eye(-34, 2, 1.6), eye(0, 2.6, 0), 42, 21);
look("signal-green", "head on green", eye(-11.5, 2.3, 3.4), eye(-7.5, 2.65, 4.6), 16, 20);
look("signal-amber", "head on amber", eye(-11.5, 2.3, 3.4), eye(-7.5, 2.65, 4.6), 16, 33.5);
look("signal-red", "head on red", eye(-11.5, 2.3, 3.4), eye(-7.5, 2.65, 4.6), 16, 3);
look("signal-far", "signals from 300 m, far version", eye(-310, 2, 1.6), eye(0, 2.6, 0), 8, 3);
look("street-sign", "street names on a post", eye(-11, 1.9, -3.2), eye(-6.2, 2.75, -6.2), 34);
look("crossing", "crossing pole", eye(-29, 1.6, 2), eye(-22, 2, 4.3), 42);
look("bicycles", "bicycles at a rack", eye(-13.5, 1.4, 5.4), eye(-16.4, 0.6, 8.6), 44);
look("wall-addons", "hanging lamps and window boxes", eye(-62, 1.7, -3), eye(-62, 2.5, -11), 68);
look("window-box", "window box close", eye(-59, 1.7, -8.4), eye(-60.5, 1.35, -10.8), 34);
look("van", "cars kit van as delivery stand-in", eye(-48, 1.5, 1), eye(-40, 1.2, 2.8), 48);
look("bus-stop", "bus stop pole", eye(54, 1.6, 2), eye(60, 2, 4.6), 44);
look("street-far", "street from outside, grow-in at the far end", eye(-430, 2, 1.2), eye(0, 3, 0), 16);

// A village's sign on a country road, near the street.
const villageX = STREET_X;
const villageZ = STREET_Z + 500;
const villageSheet = createNameSheet(["Jomalby", "Önningeby", "Kattby", "Sundsvidja"], VILLAGE_PLATE.wideM / VILLAGE_PLATE.tallM, ink, 2);
const villageFrame = buildVillageSign();
const villagePlate = buildVillagePlate();
add(villageFrame, [{ x: villageX, y: 0.12, z: villageZ }]);
const villageMesh = placeNamePlates(villagePlate, villageSheet, [{ x: villageX, y: 0.12 + VILLAGE_PLATE_Y_M, z: villageZ, name: "Önningeby" }], namePlateMaterial(inputs, villageSheet.texture));
scene.add(villageMesh);
look("village", "village sign", [villageX - 2, 1.5, villageZ + 8], [villageX, 1.6, villageZ], 40);



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
}

async function drawn() {
  renderer.render(scene, camera);
  await renderer.resolveTimestampsAsync(TimestampQuery.RENDER);
  renderer.render(scene, camera);
  const counts = { drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles };
  return { ...counts, gpuMs: await renderer.resolveTimestampsAsync(TimestampQuery.RENDER) };
}

/** A view's GPU time with and without some meshes, in alternated pairs. */
async function timed(shotName: string, meshes: readonly Mesh[]) {
  const shot = shots.find(({ name }) => name === shotName);
  if (shot === undefined) throw new Error(`no shot ${shotName}`);
  pose(shot);
  const once = async (shown: boolean) => {
    for (const mesh of meshes) mesh.visible = shown;
    return drawn();
  };
  const pairs: [Awaited<ReturnType<typeof drawn>>, Awaited<ReturnType<typeof drawn>>][] = [];
  for (let pair = 0; pair < PAIRS; pair++) pairs.push([await once(true), await once(false)]);
  for (const mesh of meshes) mesh.visible = true;
  const sorted = (values: number[]) => values.sort((a, b) => a - b);
  const ratios = sorted(pairs.map(([on, off]) => (on.gpuMs ?? 0) / (off.gpuMs ?? 1)));
  const middle = (values: number[]) => sorted(values)[values.length >> 1];
  return {
    shot: shotName,
    meshes: meshes.length,
    callsWith: pairs[0][0].drawCalls,
    callsWithout: pairs[0][1].drawCalls,
    trianglesWith: pairs[0][0].triangles,
    trianglesWithout: pairs[0][1].triangles,
    msWith: middle(pairs.map(([on]) => on.gpuMs ?? 0)),
    msWithout: middle(pairs.map(([, off]) => off.gpuMs ?? 0)),
    ratio: ratios[PAIRS >> 1],
    ratioQuartiles: [ratios[PAIRS >> 2], ratios[(3 * PAIRS) >> 2]],
  };
}

declare global {
  interface Window {
    __townKitGallery: { shots: Shot[]; frame: (name: string) => Promise<unknown>; budget: () => Promise<unknown>; counts: Record<string, ReturnType<typeof triangles>>; ready: boolean };
  }
}

// The street's rural lamp, for the comparison, and at the far end to show the two styles at a road's scale.
scene.add(...placeModel(buildStreetLamp(), [{ ...ground(-11, 7.4), yaw: Math.PI }], roadside));

window.__townKitGallery = {
  shots,
  budget: async () => ({ street: await timed("street-town", streetKit), harbour: await timed("terminal-sea", harbourKit), marina: await timed("marina-shore", harbourKit) }),
  frame: (name) => {
    const shot = shots.find((candidate) => candidate.name === name);
    if (shot === undefined) throw new Error(`no shot ${name}`);
    pose(shot);
    return drawn();
  },
  counts: {
    "town lamp": triangles(lampModel),
    "traffic light": triangles(lightModel),
    "street-name post": triangles(postModel),
    "street-name plate": triangles(plateModel),
    "crossing pole": triangles(crossingModel),
    "bus stop pole": triangles(busModel),
    bicycle: triangles(bikeModels[0]),
    "hanging lamp": triangles(hangingModel),
    "window box": triangles(boxModels[0]),
    "village sign": triangles(villageFrame),
    "village plate": triangles(villagePlate),
    "marina deck section": triangles(deckModel),
    yacht: triangles(yachtModel),
    launch: triangles(launchModel),
    terminal: triangles(terminalModel),
    ferry: triangles(ferryModel),
  },
  ready: true,
};
