import { Color, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, TimestampQuery, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { cameraPosition, exp, float, max, mix, positionWorld, sin, smoothstep, step, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { createForest } from "../../render/forest";
import { buildFarmFence, buildPine, FARM_FENCE_M, placeModel, roadsideMaterials, type Placement, type RoadsideModel } from "../roadside/index";
import { catalogue } from "./catalogue";
import { buildBirch, buildBoathouse, buildBoulder, buildBush, buildHayBale, buildJettyHead, buildJettySection, buildJuniper, buildOutcrop, buildReedBed, buildRowingBoat, buildSailboat, buildSheep, buildShed, buildShoreSlab, buildStoneWall, buildTractor, buildWindmill, buildWrappedBale, JETTY_SECTION_M, REED_BED_M, ROCK_SEEDS, ruralMaterials, STONE_WALL_M } from "./index";

/*
 * The gallery's scene: a straight road on the game's own renderer, camera, haze, sun,
 * tokens and forest, with each group at its own station along it, a shore past its
 * end, and a stretch of country with hundreds of everything for the cost.
 * `gallery.mjs` bundles this, opens it and takes the shots.
 */

const SUN = { azimuthDeg: 215, elevationDeg: 30 };
const FIELD_OF_VIEW = 60;
const [WIDTH, HEIGHT] = [2408, 1007];
const STATION_M = 70;
const VERGE_Z = -7;
const EYE_M = 1.3;
const SEA_Y = -1.2;
const HAZE_M = 16000;
const PAIRS = 40;
const LAND_END_X = 16 * STATION_M;
const SHORE_DROP_M = 24;
/** Where the falling land meets the water. */
const SHORE_X = LAND_END_X + (SHORE_DROP_M * -SEA_Y) / 2;
/** A model's +z towards the open sea, east. */
const TO_SEA = Math.PI / 2;

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
const inputs = { linear, colour: colorOf, hazed, sun: SUN };

export interface Shot {
  name: string;
  camera: [number, number, number];
  target: [number, number, number];
  label: string;
  fieldOfView?: number;
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
const materials = ruralMaterials(inputs);
const roadside = roadsideMaterials(inputs);
const add = (model: RoadsideModel, places: Placement[]) => {
  const meshes = placeModel(model, places, materials);
  scene.add(...meshes);
  return meshes;
};

// The land: field grass, a road with its edge lines, falling to the sea past the last station.
const plane = new PlaneGeometry(1, 1);
plane.rotateX(-Math.PI / 2);
const landMaterial = new MeshBasicNodeMaterial();
const place = positionWorld.xz;
const patch = sin(place.x.mul(0.31).add(sin(place.y.mul(0.23)).mul(2))).mul(sin(place.y.mul(0.47).add(place.x.mul(0.11)))).mul(0.5).add(0.5);
const fine = sin(place.x.mul(5.3).add(place.y.mul(3.1))).mul(sin(place.y.mul(6.7).sub(place.x.mul(2.3)))).mul(0.5).add(0.5);
const grass = colorOf("ground").mul(mix(float(0.78), float(1.02), patch)).mul(mix(float(0.92), float(1.06), fine));
const across = place.y.abs();
const roadEnds = step(place.x, float(LAND_END_X - 8));
const edgeLine = smoothstep(float(2.92), float(2.96), across).mul(float(1).sub(smoothstep(float(3.04), float(3.08), across)));
const road = mix(colorOf("road-main"), colorOf("road-paint"), edgeLine);
const onRoad = float(1).sub(smoothstep(float(3.5), float(3.6), across)).mul(roadEnds);
const shoulder = float(1).sub(smoothstep(float(3.6), float(4.6), across)).mul(roadEnds);
landMaterial.colorNode = hazed(mix(mix(grass, colorOf("road-shoulder"), shoulder), road, onRoad));
const land = new Mesh(plane, landMaterial);
land.scale.set(LAND_END_X + 4000, 1, 8000);
land.position.set((LAND_END_X - 4000) / 2, 0, 0);
land.frustumCulled = false;
scene.add(land);
const bank = new Mesh(plane, landMaterial);
bank.scale.set(Math.hypot(SHORE_DROP_M, 2), 1, 8000);
bank.position.set(LAND_END_X + SHORE_DROP_M / 2, -1, 0);
bank.rotation.z = -Math.atan2(2, SHORE_DROP_M);
bank.frustumCulled = false;
scene.add(bank);
const seaMaterial = new MeshBasicNodeMaterial();
seaMaterial.colorNode = hazed(colorOf("water"));
const sea = new Mesh(plane, seaMaterial);
sea.scale.set(80000, 1, 80000);
sea.position.y = SEA_Y;
scene.add(sea);

const forest = createForest(scene, {
  canopyAt: (at) => max(float(0), smoothstep(float(60), float(66), at.y.negate()).mul(float(19)).add(float(3).mul(sin(at.x.mul(0.05)).mul(sin(at.y.mul(0.07)))))).mul(step(at.x, float(LAND_END_X - 60))).mul(step(float(170), at.y.add(1800).abs())),
  groundNear: () => float(0),
  groundFar: () => float(0),
  colour: colorOf,
  hazed,
  sun: SUN,
});

const shots: Shot[] = [];
const station = (index: number) => index * STATION_M;
const look = (name: string, label: string, x: number, from: [number, number, number], at: [number, number, number], fieldOfView?: number) => {
  shots.push({ name, label, camera: [x + from[0], from[1], from[2]], target: [x + at[0], at[1], at[2]], fieldOfView });
};

// 0: the windmill, on a rise of grass beside the road.
const mill = buildWindmill();
add(mill, [{ x: station(0), y: 0, z: VERGE_Z - 16, yaw: -0.55 }]);
look("windmill", "windmill from the road", station(0), [-30, EYE_M, 1.5], [0, 6.5, VERGE_Z - 16], 40);
look("windmill-close", "windmill, close", station(0), [-11, EYE_M, -8], [0, 6, VERGE_Z - 16], 60);
look("windmill-back", "windmill, tail pole", station(0), [14, EYE_M, -42], [0, 5, VERGE_Z - 18], 44);

// 1: boulders, one of each seed, large and small.
ROCK_SEEDS.forEach((seed, index) => {
  add(buildBoulder(seed), [
    { x: station(1) - 10 + index * 7, y: 0, z: VERGE_Z - 1, yaw: index * 1.3, scale: 1 + index * 0.25 },
    { x: station(1) - 7 + index * 7, y: 0, z: VERGE_Z - 3, yaw: index * 2.1 + 1, scale: 0.55 },
  ]);
});
look("boulders", "boulders, four seeds", station(1), [-8, EYE_M, 1.5], [2, 0.6, VERGE_Z - 1], 46);
look("boulder-close", "boulder surface at 4 m", station(1), [-1, EYE_M, -3.2], [0.6, 0.5, VERGE_Z - 1], 40);

// 2: outcrops.
ROCK_SEEDS.forEach((seed, index) => {
  add(buildOutcrop(seed), [{ x: station(2) - 26 + index * 18, y: 0, z: VERGE_Z - 9, yaw: index * 0.9 + 0.3, scale: 0.85 + index * 0.15 }]);
});
look("outcrops", "outcrops, four seeds", station(2), [-24, EYE_M, 1.5], [0, 1.2, VERGE_Z - 9], 44);
look("outcrop-close", "outcrop at 7 m", station(2), [-4, EYE_M, VERGE_Z + 1], [-8, 0.8, VERGE_Z - 7], 50);

// 3: bushes.
add(buildBush(1, "hazel"), [{ x: station(3) - 7, y: 0, z: VERGE_Z }, { x: station(3) + 2, y: 0, z: VERGE_Z - 2, scale: 1.4, yaw: 1 }]);
add(buildBush(2, "sallow"), [{ x: station(3) - 3, y: 0, z: VERGE_Z - 1, scale: 1.1 }]);
add(buildBush(3, "hazel"), [{ x: station(3) + 7, y: 0, z: VERGE_Z, yaw: 2 }]);
add(buildBush(4, "sallow"), [{ x: station(3) + 12, y: 0, z: VERGE_Z - 1, scale: 1.3 }]);
look("bushes", "hazel and sallow", station(3), [-9, EYE_M, 1.5], [3, 1, VERGE_Z], 50);

// 4: junipers on a little rock.
add(buildJuniper(1, "column"), [{ x: station(4) - 5, y: 0, z: VERGE_Z }, { x: station(4) - 1, y: 0, z: VERGE_Z - 2, scale: 1.2 }]);
add(buildJuniper(3, "column"), [{ x: station(4) + 3, y: 0, z: VERGE_Z - 1, scale: 0.8 }, { x: station(4) + 7, y: 0, z: VERGE_Z - 3 }]);
add(buildJuniper(2, "spreading"), [{ x: station(4) + 1, y: 0, z: VERGE_Z + 1 }, { x: station(4) + 10, y: 0, z: VERGE_Z }]);
add(buildBoulder(11), [{ x: station(4) + 5, y: 0, z: VERGE_Z, yaw: 1 }]);
look("junipers", "junipers, column and spreading", station(4), [-7, EYE_M, 1.5], [3, 1, VERGE_Z], 50);

// 5: birches.
add(buildBirch(1, "silver"), [{ x: station(5) - 12, y: 0, z: VERGE_Z - 3, scale: 15 }, { x: station(5) + 8, y: 0, z: VERGE_Z - 6, scale: 18, yaw: 2 }]);
add(buildBirch(2, "young"), [{ x: station(5) - 3, y: 0, z: VERGE_Z - 2, scale: 8 }, { x: station(5) + 1, y: 0, z: VERGE_Z - 4, scale: 11, yaw: 1 }]);
add(buildBirch(3, "clump"), [{ x: station(5) + 15, y: 0, z: VERGE_Z - 3, scale: 12 }]);
look("birches", "silver, young and a clump", station(5), [-14, EYE_M, 1.5], [2, 7, VERGE_Z - 4], 66);
look("birch-bark", "birch bark at 4 m", station(5), [-14, EYE_M, -4], [-12, 2.2, VERGE_Z - 3], 36);

// 6: stone wall, with the kit's own farm fence beyond it for comparison.
const walls: Placement[][] = [[], [], []];
for (let index = 0; index < 18; index++) walls[index % 3].push({ x: station(6) - 22 + index * STONE_WALL_M, y: 0, z: VERGE_Z, shear: index > 11 ? 0.03 : 0 });
[1, 2, 3].forEach((seed, index) => add(buildStoneWall(seed), walls[index]));
scene.add(...placeModel(buildFarmFence(), Array.from({ length: 12 }, (_, index) => ({ x: station(6) + 22 + index * FARM_FENCE_M, y: 0, z: VERGE_Z })), roadside));
look("stone-wall", "stone wall into the farm fence", station(6), [-16, EYE_M, 1.5], [6, 0.5, VERGE_Z], 30);
look("stone-close", "stone wall at 5 m", station(6), [-4, EYE_M, -1], [-3, 0.4, VERGE_Z], 40);

// 7: sheds.
add(buildShed("red"), [{ x: station(7) - 10, y: 0, z: VERGE_Z - 2 }]);
add(buildShed("grey"), [{ x: station(7) - 1, y: 0, z: VERGE_Z - 3, yaw: 0.4 }]);
add(buildShed("woodshed"), [{ x: station(7) + 8, y: 0, z: VERGE_Z - 2 }]);
look("sheds", "red, grey and a woodshed", station(7), [-3, EYE_M, 1.5], [-1, 1.3, VERGE_Z - 2], 56);

// 8: bales, loose and in a row at a field's edge.
add(buildWrappedBale(), [0, 1, 2, 3, 4].map((index) => ({ x: station(8) - 6 + index * 1.6, y: 0, z: VERGE_Z - 3 + (index % 2) * 0.1 })).concat([{ x: station(8) + 5, y: 0, z: VERGE_Z - 9 }, { x: station(8) + 14, y: 0, z: VERGE_Z - 19 }].map((at) => ({ ...at, yaw: 0.8 }))));
add(buildHayBale(), [{ x: station(8) + 4, y: 0, z: VERGE_Z - 2, yaw: 0.5 }, { x: station(8) + 8, y: 0, z: VERGE_Z - 5, yaw: 2.1 }, { x: station(8) + 13, y: 0, z: VERGE_Z - 11, yaw: 1.2 }]);
look("bales", "wrapped and hay bales", station(8), [-8, EYE_M, 1.5], [3, 0.6, VERGE_Z - 3], 44);

// 9: tractor.
const tractorPlace = { x: station(9), y: 0, z: VERGE_Z - 1, yaw: 0.6 };
add(buildTractor(), [tractorPlace]);
look("tractor", "tractor from the road", station(9), [-7, EYE_M, 1.5], [0, 1.1, VERGE_Z - 1], 38);
look("tractor-rear", "tractor, the other side", station(9), [6, EYE_M, -2], [0, 1.1, VERGE_Z - 1], 40);

// 10: sheep at grass.
const flock: Placement[] = [[0, 0, 0.4], [2.4, 1.3, 2.1], [-1.6, 2.2, 4.3], [4.6, -0.4, 5.5], [1.4, 4, 1.2], [-3.4, 0.6, 2.8]].map(([x, back, yaw]) => ({ x: station(10) + x, y: 0, z: VERGE_Z - 2 - back, yaw }));
add(buildSheep("grazing"), flock.slice(0, 3));
add(buildSheep("standing"), flock.slice(3, 5));
add(buildSheep("grazing", "grey"), flock.slice(5));
look("sheep", "sheep", station(10), [-3, EYE_M, 1.5], [0.5, 0.5, VERGE_Z - 3], 30);

// 11: a corner of farm with everything in it, to see the kit together with the roadside's.
const farmX = station(11.5);
add(buildWindmill(), [{ x: farmX + 42, y: 0, z: -68, yaw: -0.3 }]);
add(buildShed("red"), [{ x: farmX + 12, y: 0, z: -24, yaw: 0.2 }, { x: farmX + 19, y: 0, z: -22, yaw: 0.2 }]);
add(buildBirch(1, "silver"), [{ x: farmX + 3, y: 0, z: -22, scale: 16 }, { x: farmX + 28, y: 0, z: -30, scale: 15, yaw: 1 }]);
add(buildBoulder(24), [{ x: farmX - 2, y: 0, z: -13, scale: 1.4 }]);
add(buildWrappedBale(), [{ x: farmX + 10, y: 0, z: -17 }, { x: farmX + 12, y: 0, z: -19.5, yaw: 0.6 }]);
add(buildSheep("grazing"), [{ x: farmX + 21, y: 0, z: -13, yaw: 1 }, { x: farmX + 24, y: 0, z: -15, yaw: 4 }]);
add(buildStoneWall(1), Array.from({ length: 30 }, (_, index) => ({ x: farmX - 26 + index * STONE_WALL_M, y: 0, z: -10 })));
scene.add(...placeModel(buildPine(), [{ x: farmX - 12, y: 0, z: -26, scale: 19 }, { x: farmX + 34, y: 0, z: -24, scale: 20, yaw: 2 }], roadside));
look("farm-corner", "a corner of farm", farmX, [-22, EYE_M, 1.5], [16, 3, -14], 60);

// The shore, along x = SHORE_X, seen from the bank.
const shore = (along: number, out = 0, y = SEA_Y, yaw = TO_SEA, scale = 1): Placement => ({ x: SHORE_X + out, y, z: along, yaw, scale });
const REEDS = -50;
add(buildReedBed(1), [0, 2, 4].map((index) => ({ x: SHORE_X + 2, y: SEA_Y, z: REEDS + index * REED_BED_M, yaw: TO_SEA })));
add(buildReedBed(2), [1, 3, 5].map((index) => ({ x: SHORE_X + 2, y: SEA_Y, z: REEDS + index * REED_BED_M, yaw: TO_SEA })));
add(buildBoathouse("red"), [shore(0)]);
add(buildBoathouse("tarred"), [shore(9, -0.5)]);
add(buildShoreSlab(3), [shore(28, 1)]);
add(buildShoreSlab(11), [shore(40, 3)]);
add(buildOutcrop(24), [shore(46, 32, SEA_Y, 0.4, 1.4)]);
add(buildJuniper(2, "spreading"), [shore(29, -5, -0.4)]);
const JETTY_Z = -12;
add(buildJettySection(), [0, 1, 2].map((index) => ({ x: SHORE_X - 1 + index * JETTY_SECTION_M, y: SEA_Y, z: JETTY_Z })));
add(buildJettyHead(), [{ x: SHORE_X - 1 + 3 * JETTY_SECTION_M, y: SEA_Y, z: JETTY_Z }]);
add(buildRowingBoat("white"), [{ x: SHORE_X + 7, y: SEA_Y, z: JETTY_Z + 2.4, yaw: 1.7 }]);
add(buildRowingBoat("blue"), [{ x: SHORE_X + 4, y: SEA_Y, z: 21, yaw: 2.5 }]);
add(buildRowingBoat("wood"), [{ x: SHORE_X + 1, y: SEA_Y + 0.15, z: -5, yaw: 0.9 }]);
add(buildSailboat("moored"), [{ x: SHORE_X + 26, y: SEA_Y, z: JETTY_Z - 8, yaw: 1.2 }]);
add(buildSailboat("sailing"), [{ x: SHORE_X + 160, y: SEA_Y, z: 40, yaw: 0.5 }]);
const BANK_EYE = 1.4;
look("shore", "shore from the bank", SHORE_X, [-26, BANK_EYE, 20], [14, -1, -8], 56);
look("reeds", "reed bed", SHORE_X, [-8, BANK_EYE, -38], [4, -0.2, -38], 56);
look("boathouses", "boathouses from the water", SHORE_X, [16, -0.6, 6], [0, 0.6, 3], 56);
look("boathouse-side", "boathouse from the bank", SHORE_X, [-10, BANK_EYE, -6], [0, 0.4, 0], 56);
look("jetty", "jetty and boats", SHORE_X, [-7, BANK_EYE, -5], [10, -1, JETTY_Z - 1], 56);
look("rowing-boat", "rowing boat", SHORE_X, [3, 0.4, JETTY_Z + 6.5], [7, -1, JETTY_Z + 2.4], 40);
look("sailboat", "sailboat moored", SHORE_X, [36, -0.2, JETTY_Z - 20], [26, 2.4, JETTY_Z - 8], 56);
look("slabs", "shore slabs", SHORE_X, [-11, BANK_EYE, 30], [8, -0.8, 34], 60);

// Dissolve and growth, on a long lens with the camera moved: the same mill and boulders through their bands.
const BAND_Z = 900;
add(mill, [{ x: 0, y: 0, z: BAND_Z, yaw: 0.5 }]);
const bandBoulder = buildBoulder(3);
add(bandBoulder, [{ x: 16, y: 0, z: BAND_Z, scale: 2 }]);
const bandSheep = buildSheep("standing");
add(bandSheep, [{ x: 24, y: 0, z: BAND_Z, yaw: 1.5, scale: 3 }]);
for (const away of [230, 268, 290, 320]) look(`band-mill-${away}`, `mill dissolve at ${away} m`, 0, [0, EYE_M + 2, BAND_Z + away], [0, 6, BAND_Z], 3.2);
for (const away of [40, 50, 60]) look(`band-sheep-${away}`, `sheep at ${away} m`, 24, [0, EYE_M, BAND_Z + away], [0, 2, BAND_Z], 12);
for (const away of [380, 440, 490, 515]) look(`band-boulder-${away}`, `boulder grows at ${away} m`, 16, [0, EYE_M + 1, BAND_Z + away], [0, 1, BAND_Z], 1.6);

// The stretch of country, for the cost.
const COUNTRY_X = -3400;
const COUNTRY_M = 2400;
const COUNTRY_Z = -1800;
const roll = (index: number, salt: number) => {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
};
const country = new Map<RoadsideModel, Placement[]>();
const scatter = (model: RoadsideModel, count: number, nearZ: number, farZ: number, scale: () => number) => {
  const places = Array.from({ length: count }, (_, index) => {
    const side = roll(index, 3) < 0.5 ? -1 : 1;
    return { x: COUNTRY_X + roll(index, 1) * COUNTRY_M, y: 0, z: COUNTRY_Z + side * (nearZ + roll(index, 2) * (farZ - nearZ)), yaw: roll(index, 4) * 6.28, scale: scale() };
  });
  country.set(model, [...(country.get(model) ?? []), ...places]);
};
const birchModels = [buildBirch(1, "silver"), buildBirch(2, "young"), buildBirch(3, "clump")];
birchModels.forEach((model, index) => {
  scatter(model, 60, 10, 90, () => 10 + index * 2 + roll(index, 8) * 6);
});
ROCK_SEEDS.forEach((seed) => {
  scatter(buildBoulder(seed), 60, 6, 70, () => 0.7 + roll(seed, 5));
  scatter(buildOutcrop(seed), 15, 18, 140, () => 1);
});
for (const seed of [1, 2]) scatter(buildBush(seed, seed === 1 ? "hazel" : "sallow"), 110, 6, 60, () => 1.1);
scatter(buildJuniper(1, "column"), 60, 8, 60, () => 1);
scatter(buildJuniper(2, "spreading"), 60, 8, 60, () => 1);
scatter(buildWrappedBale(), 90, 16, 80, () => 1);
scatter(buildHayBale(), 40, 16, 80, () => 1);
scatter(buildSheep("grazing"), 70, 20, 70, () => 1);
scatter(buildShed("red"), 24, 14, 70, () => 1);
scatter(buildTractor(), 4, 14, 60, () => 1);
scatter(mill, 3, 40, 80, () => 1);
const wallModel = buildStoneWall(1);
const wallPlaces: Placement[] = [];
for (let along = 0; along < COUNTRY_M; along += STONE_WALL_M) wallPlaces.push({ x: COUNTRY_X + along, y: 0, z: COUNTRY_Z - 6 });
country.set(wallModel, wallPlaces);
const countryMeshes = [...country].flatMap(([model, places]) => add(model, places));
const countryObjects = [...country.values()].reduce((sum, places) => sum + places.length, 0);
const countryEye = { x: COUNTRY_X + 1200, z: COUNTRY_Z + 1.5 };
look("country", `${countryObjects} objects along 2.4 km`, COUNTRY_X, [1200, EYE_M, COUNTRY_Z + 1.5], [1320, 3, COUNTRY_Z], 60);
look("country-high", "the same, higher", COUNTRY_X, [1140, 24, COUNTRY_Z + 40], [1440, 3, COUNTRY_Z - 10], 60);

const count = (geometry: RoadsideModel["near"] | null) => (geometry?.index?.count ?? 0) / 3;

function pose(shot: Shot) {
  camera.fov = shot.fieldOfView ?? FIELD_OF_VIEW;
  camera.updateProjectionMatrix();
  camera.position.set(...shot.camera);
  camera.lookAt(...shot.target);
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

/** What the country costs seen from its middle: triangles that really draw, then GPU time with and without it, in alternated pairs. */
async function budget() {
  let drawn = 0;
  let issued = 0;
  for (const [model, places] of country) {
    issued += places.length * (count(model.near) + count(model.far));
    for (const { x, z } of places) {
      const distance = Math.hypot(x - countryEye.x, z - countryEye.z);
      drawn += distance < model.swapM * 0.9 ? count(model.near) : distance < model.reachM ? count(model.far) : 0;
    }
  }
  const shot = shots.find(({ name }) => name === "country");
  if (shot === undefined) throw new Error("no country shot");
  pose(shot);
  const timed = async (shown: boolean) => {
    for (const mesh of countryMeshes) mesh.visible = shown;
    renderer.render(scene, camera);
    await renderer.resolveTimestampsAsync(TimestampQuery.RENDER);
    renderer.render(scene, camera);
    return (await renderer.resolveTimestampsAsync(TimestampQuery.RENDER)) ?? 0;
  };
  const pairs: [number, number][] = [];
  for (let pair = 0; pair < PAIRS; pair++) pairs.push([await timed(true), await timed(false)]);
  for (const mesh of countryMeshes) mesh.visible = true;
  const sorted = (values: number[]) => values.sort((a, b) => a - b);
  const middle = (values: number[]) => sorted(values)[values.length >> 1];
  const ratios = sorted(pairs.map(([on, off]) => on / off));
  return { objects: countryObjects, meshes: countryMeshes.length, drawn, issued, msWith: middle(pairs.map(([on]) => on)), msWithout: middle(pairs.map(([, off]) => off)), ratio: ratios[PAIRS >> 1], ratioQuartiles: [ratios[PAIRS >> 2], ratios[(3 * PAIRS) >> 2]] };
}

declare global {
  interface Window {
    __ruralGallery: { shots: Shot[]; frame: (name: string) => Promise<unknown>; budget: () => Promise<unknown>; counts: Record<string, { near: number; far: number; swapM: number; reachM: number }>; ready: boolean };
  }
}

window.__ruralGallery = {
  shots,
  budget,
  frame: (name) => {
    const shot = shots.find((candidate) => candidate.name === name);
    if (shot === undefined) throw new Error(`no shot ${name}`);
    return frame(shot);
  },
  counts: Object.fromEntries(catalogue().map(({ name, model }) => [name, { near: count(model.near), far: count(model.far), swapM: model.swapM, reachM: model.reachM }])),
  ready: true,
};
