import { Color, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, TimestampQuery, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { cameraPosition, exp, float, mix, positionWorld, sin, smoothstep, step, uniform, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { createForest } from "../../render/forest";
import { buildBridge, buildBusShelter, buildFarmFence, buildFarmFencePost, buildGangway, buildMailbox, buildPier, buildPine, buildPontoon, buildPowerPole, buildSignPlate, buildSignPost, buildStreetLamp, buildTownFence, buildTownFencePost, buildWireSpan, FARM_FENCE_M, placeModel, placeSigns, placeWires, roadsideMaterials, SIGN_PLATE_Y_M, SIGN_PLATE_Z_M, signMaterial, signSheetUv, TOWN_FENCE_M, wireMaterial, type Placement, type RoadsideModel, type SignShape } from "./index";

/*
 * The gallery's scene: one stretch of straight road on the game's own renderer,
 * camera, haze, sun, tokens and forest, with each object at its own station along
 * it. `gallery.mjs` bundles this, opens it and takes the shots.
 */

const SUN = { azimuthDeg: 215, elevationDeg: 30 };
const FIELD_OF_VIEW = 60;
const [WIDTH, HEIGHT] = [2408, 1007];
const STATION_M = 60;
/** South of the road's centre is where the camera drives; objects stand north of it, lit by a southern sun. */
const VERGE_Z = -6;
const SEA_Y = -3;
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
const inputs = { linear, colour: colorOf, hazed, sun: SUN };

export interface Shot {
  name: string;
  camera: [number, number, number];
  target: [number, number, number];
  /** What the shot looks at, for a label on the sheet. */
  label: string;
  /** A long lens, for looking closely at something small or far. */
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
const materials = roadsideMaterials(inputs);
const kit: Mesh[] = [];
const addMeshes = (...meshes: Mesh[]) => {
  kit.push(...meshes);
  scene.add(...meshes);
};
const add = (model: RoadsideModel, places: Placement[]) => {
  addMeshes(...placeModel(model, places, materials));
};

// The land: grass with a noise of field, a road with its edge lines, and sea past the harbour station.
const LAND_END_X = 20 * STATION_M;
const ground = new PlaneGeometry(1, 1);
ground.rotateX(-Math.PI / 2);
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
groundMaterial.colorNode = hazed(mix(mix(grass, colorOf("road-shoulder"), shoulder), road, onRoad));
const land = new Mesh(ground, groundMaterial);
land.scale.set(LAND_END_X + 4000, 1, 8000);
land.position.set((LAND_END_X - 4000) / 2, 0, 0);
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

// The game's own forest behind the road, for colour and scale.
const forest = createForest(scene, {
  canopyAt: (at) => smoothstep(float(30), float(34), at.y.negate()).mul(float(19)).add(float(3).mul(sin(at.x.mul(0.05)).mul(sin(at.y.mul(0.07))))),
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

// 0: lamp
add(buildStreetLamp(), [{ x: station(0), y: 0, z: VERGE_Z + 1.5, yaw: 0 }]);
look("street-lamp", "street lamp", station(0), [-13, 1.3, 1.5], [0, 5, VERGE_Z]);

// 1: pole, with wires on to neighbours.
const poleModel = buildPowerPole();
const poleZ = VERGE_Z - 2;
const poles = [-1, 0, 1, 2].map((offset) => ({ x: station(1) + offset * 55, y: 0, z: poleZ + offset * 2, yaw: 0 }));
add(poleModel, poles);
const wires = wireMaterial({ colour: colorOf, hazed }, uniform(HEIGHT), FIELD_OF_VIEW);
const wireSpans = poles.slice(1).map((pole, index) => ({ from: poles[index], to: pole }));
const wireModel = buildWireSpan();
addMeshes(placeWires(wireModel, wireSpans, wires));
look("power-pole", "power pole and wires", station(1), [-20, 1.3, 1.5], [10, 6.5, VERGE_Z]);
look("pole-top", "pole top", station(1), [-7, 1.3, 1.5], [0, 9.6, poleZ], 14);

// 2: signs. A placeholder sheet of checks, so the plate's uv shows.
const sheet = mix(colorOf("wall-trim"), colorOf("car-body"), step(float(0.5), sin(signSheetUv().x.mul(40)).mul(sin(signSheetUv().y.mul(40))).add(0.5)));
const signs = signMaterial(inputs, sheet);
const shapes: [SignShape, number][] = [["round", 0.64], ["triangle", 0.9], ["diamond", 0.64], ["wide", 1.4]];
shapes.forEach(([shape, size], index) => {
  const x = station(2) + index * 3;
  add(buildSignPost(), [{ x, y: 0, z: VERGE_Z + 1 }]);
  addMeshes(placeSigns(buildSignPlate(shape, size), [{ x, y: SIGN_PLATE_Y_M, z: VERGE_Z + 1 + SIGN_PLATE_Z_M, cell: [0, 0, 1, 1] }], signs));
});
look("sign-posts", "sign posts, placeholder faces", station(2), [-3, 1.3, 1.5], [4.5, 1.8, VERGE_Z]);
look("sign-backs", "sign backs", station(2), [4, 1.3, VERGE_Z - 7], [4.5, 1.8, VERGE_Z + 1]);

// 3: farm fence, along a slope at the far end.
const farmModel = buildFarmFence();
const farm: Placement[] = Array.from({ length: 30 }, (_, index) => ({ x: station(3) - 30 + index * FARM_FENCE_M, y: 0, z: VERGE_Z - 1 }));
add(farmModel, farm);
add(buildFarmFencePost(), [{ x: station(3) - 30 + 30 * FARM_FENCE_M, y: 0, z: VERGE_Z - 1 }]);
look("farm-fence", "farm fence (gärdsgård)", station(3), [-8, 1.3, 1.5], [0, 0.9, VERGE_Z - 1], 30);

// 4: town fence.
const town: Placement[] = Array.from({ length: 30 }, (_, index) => ({ x: station(4) - 26 + index * TOWN_FENCE_M, y: 0, z: VERGE_Z }));
add(buildTownFence(), town);
add(buildTownFencePost(), [{ x: station(4) - 26 + 30 * TOWN_FENCE_M, y: 0, z: VERGE_Z }]);
look("town-fence", "town fence", station(4), [-6, 1.3, 1.5], [0, 0.6, VERGE_Z]);

// 5: mailboxes, two side by side as they stand at a lane's end.
add(buildMailbox(), [{ x: station(5), y: 0, z: VERGE_Z + 2 }, { x: station(5) + 0.7, y: 0, z: VERGE_Z + 2 }]);
look("mailbox", "mailbox", station(5), [-1.4, 1.3, 1.5], [0.3, 1.1, VERGE_Z + 2], 24);

// 6: bus shelter.
add(buildBusShelter(), [{ x: station(6), y: 0, z: VERGE_Z }]);
look("bus-shelter", "bus shelter", station(6), [-5.5, 1.3, 1.5], [0, 1.4, VERGE_Z], 38);

// 7: pines, a stand on open ground and lone ones by the road.
const pineModel = buildPine();
const pines: Placement[] = [];
for (let index = 0; index < 28; index++) {
  const roll = (Math.sin(index * 12.9898) * 43758.5453) % 1;
  const other = (Math.sin(index * 78.233) * 12543.123) % 1;
  pines.push({ x: station(7) - 45 + index * 3.6 + roll * 2, y: -0.3, z: VERGE_Z - 9 - Math.abs(other) * 18 - (index % 3) * 3, yaw: index * 2.4, scale: 17 + Math.abs(roll) * 7 });
}
add(pineModel, pines);
look("pine", "pine stand", station(7), [-70, 11, 40], [0, 11, VERGE_Z - 14], 34);
look("pine-road", "pine from the road", station(7), [-20, 1.3, 1.5], [0, 8, VERGE_Z - 12]);
look("pine-far", "pine far version, 190 m", station(7), [-4, 11, 180], [0, 11, VERGE_Z - 14], 9);

// 8: forest's own pines for comparison are the ones in every shot behind the road.

// A bridge off the land's end over the sea, with a stand-in for the road's own ribbon on its deck.
const bridgeSpan = 48;
const bridgeX = LAND_END_X + 2;
const bridgeZ = 90;
add(buildBridge({ spanM: bridgeSpan, widthM: 7, dropM: 5 }), [{ x: bridgeX, y: 2, z: bridgeZ }]);
const ribbonMaterial = new MeshBasicNodeMaterial();
ribbonMaterial.colorNode = hazed(colorOf("road-main"));
const ribbon = new Mesh(ground, ribbonMaterial);
ribbon.scale.set(bridgeSpan + 8, 1, 7);
ribbon.position.set(bridgeX + bridgeSpan / 2 - 4, 2, bridgeZ);
ribbon.frustumCulled = false;
scene.add(ribbon);
look("bridge", "bridge", bridgeX, [38, SEA_Y + 1.5, bridgeZ + 36], [bridgeSpan / 2, -0.5, bridgeZ]);
look("bridge-deck", "bridge from its road", bridgeX, [-9, 3.3, bridgeZ + 1.5], [bridgeSpan / 2, 2.2, bridgeZ]);

// 12: harbour, on the water past the land's end.
const harbourX = LAND_END_X + 30;
add(buildPier({ lengthM: 32, widthM: 3 }), [{ x: harbourX - 34, y: SEA_Y, z: -18 }]);
add(buildPontoon({ lengthM: 24, widthM: 2.6 }), [{ x: harbourX - 8, y: SEA_Y, z: -24.4, yaw: Math.PI / 2 }]);
add(buildGangway(5), [{ x: harbourX - 8, y: SEA_Y + 0.95, z: -19.4, yaw: Math.PI / 2, shear: -0.106 }]);
look("harbour", "pier, gangway, pontoon", harbourX, [-14, SEA_Y + 1.6, 2], [-2, SEA_Y + 0.8, -26], 42);
look("harbour-deck", "on the pier", harbourX, [-16, SEA_Y + 2.6, -18], [2, SEA_Y + 0.6, -24]);

// 11: a stretch of road with hundreds of everything, for the cost and the far versions.
const streetX = -3200;
const street: Record<string, Placement[]> = { lamps: [], poles: [], pines: [], fences: [], mail: [], signs: [], shelters: [] };
const STREET_M = 2400;
for (let along = 0; along < STREET_M; along += 45) street.lamps.push({ x: streetX + along, y: 0, z: 5, yaw: Math.PI });
for (let along = 0; along < STREET_M; along += 55) street.poles.push({ x: streetX + along, y: 0, z: -9, yaw: 0 });
for (let along = 0; along < STREET_M; along += FARM_FENCE_M) street.fences.push({ x: streetX + along, y: 0, z: -7 });
for (let along = 0; along < STREET_M; along += 130) {
  street.mail.push({ x: streetX + along, y: 0, z: -4.5 });
  street.signs.push({ x: streetX + along + 40, y: 0, z: 4.5, yaw: Math.PI });
}
for (let along = 0; along < STREET_M; along += 500) street.shelters.push({ x: streetX + along + 90, y: 0, z: -7 });
for (let along = 0; along < STREET_M; along += 14) street.pines.push({ x: streetX + along, y: 0, z: 13 + (along % 9), yaw: along, scale: 18 + (along % 6) });
add(buildStreetLamp(), street.lamps);
add(poleModel, street.poles);
addMeshes(placeWires(wireModel, street.poles.slice(1).map((pole, index) => ({ from: { yaw: 0, ...street.poles[index] }, to: { yaw: 0, ...pole } })), wires));
add(farmModel, street.fences);
add(buildMailbox(), street.mail);
add(buildSignPost(), street.signs);
add(buildBusShelter(), street.shelters);
add(pineModel, street.pines);
const streetModels: [RoadsideModel, Placement[]][] = [[buildStreetLamp(), street.lamps], [poleModel, street.poles], [farmModel, street.fences], [buildMailbox(), street.mail], [buildSignPost(), street.signs], [buildBusShelter(), street.shelters], [pineModel, street.pines]];
const counted = Object.values(street).reduce((sum, places) => sum + places.length, 0);
const streetEye = { x: streetX + 1100, z: 1.5 };
look("street", `${counted} objects, mid-way along 2.4 km`, streetX, [1100, 1.3, 1.5], [1300, 3, 0]);
look("street-high", "the same, higher", streetX, [1040, 22, 30], [1360, 4, -6]);
look("street-far", "far versions from 170 m", streetX, [1100, 1.6, 1.5], [1280, 3, -5], 8);

function triangles(model: RoadsideModel) {
  const count = (geometry: RoadsideModel["near"] | null) => (geometry?.index?.count ?? 0) / 3;
  return { near: count(model.near), far: count(model.far), swapM: model.swapM, reachM: model.reachM };
}

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

/** What the street costs seen from its middle: triangles that really draw, then GPU time with and without it in alternated pairs. */
async function budget() {
  const count = (geometry: RoadsideModel["near"] | null) => (geometry?.index?.count ?? 0) / 3;
  let [drawn, issued] = [0, 0];
  for (const [model, places] of streetModels) {
    issued += places.length * (count(model.near) + count(model.far));
    for (const { x, z } of places) {
      const distance = Math.hypot(x - streetEye.x, z - streetEye.z);
      drawn += distance < model.swapM * 0.9 ? count(model.near) : distance < model.reachM ? count(model.far) : 0;
    }
  }
  const shot = shots.find(({ name }) => name === "street");
  if (shot === undefined) throw new Error("no street shot");
  pose(shot);
  const timed = async (shown: boolean) => {
    for (const mesh of kit) mesh.visible = shown;
    renderer.render(scene, camera);
    await renderer.resolveTimestampsAsync(TimestampQuery.RENDER);
    renderer.render(scene, camera);
    return (await renderer.resolveTimestampsAsync(TimestampQuery.RENDER)) ?? 0;
  };
  const pairs: [number, number][] = [];
  for (let pair = 0; pair < PAIRS; pair++) pairs.push([await timed(true), await timed(false)]);
  for (const mesh of kit) mesh.visible = true;
  const sorted = (values: number[]) => values.sort((a, b) => a - b);
  const middle = (values: number[]) => sorted(values)[values.length >> 1];
  const ratios = sorted(pairs.map(([on, off]) => on / off));
  return { objects: counted, drawn, issued, meshes: kit.length, msWith: middle(pairs.map(([on]) => on)), msWithout: middle(pairs.map(([, off]) => off)), ratio: ratios[PAIRS >> 1], ratioQuartiles: [ratios[PAIRS >> 2], ratios[(3 * PAIRS) >> 2]] };
}

declare global {
  interface Window {
    __roadsideGallery: { shots: Shot[]; frame: (name: string) => Promise<unknown>; budget: () => Promise<unknown>; counts: Record<string, ReturnType<typeof triangles>>; streetObjects: number; ready: boolean };
  }
}

window.__roadsideGallery = {
  shots,
  budget,
  frame: (name) => {
    const shot = shots.find((candidate) => candidate.name === name);
    if (shot === undefined) throw new Error(`no shot ${name}`);
    return frame(shot);
  },
  counts: {
    "street lamp": triangles(buildStreetLamp()),
    "power pole": triangles(poleModel),
    "wire span": triangles(wireModel),
    "sign post": triangles(buildSignPost()),
    "sign plate, round": triangles(buildSignPlate("round", 0.64)),
    "farm fence 2.4 m": triangles(farmModel),
    "farm fence post": triangles(buildFarmFencePost()),
    "town fence 2 m": triangles(buildTownFence()),
    "town fence post": triangles(buildTownFencePost()),
    mailbox: triangles(buildMailbox()),
    "bus shelter": triangles(buildBusShelter()),
    pine: triangles(pineModel),
    "bridge 48 × 7 m": triangles(buildBridge({ spanM: 48, widthM: 7, dropM: 5 })),
    "pier 32 × 3 m": triangles(buildPier({ lengthM: 32, widthM: 3 })),
    "pontoon 24 × 2.6 m": triangles(buildPontoon({ lengthM: 24, widthM: 2.6 })),
    "gangway 6 m": triangles(buildGangway(6)),
  },
  streetObjects: counted,
  ready: true,
};

