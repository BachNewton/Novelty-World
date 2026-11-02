import { BufferAttribute, BufferGeometry, ClampToEdgeWrapping, DataTexture, Group, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshBasicNodeMaterial, NoColorSpace, PerspectiveCamera, Plane, PlaneGeometry, Raycaster, RGBAFormat, Scene, TimestampQuery, Vector2, Vector3, WebGPURenderer, type Node, type Texture } from "three/webgpu";
import { all, attribute, cameraPosition, dFdx, dFdy, exp, float, fwidth, greaterThanEqual, int, ivec2, lessThan, mix, positionWorld, select, smoothstep, texture, textureLoad, uniform, vec2, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { startFreeCamera, type View } from "./free-camera";
import { FLAT_LIGHT, SHADE_SHARE, type WorldManifest } from "./tile";
import { startChaseCamera } from "./chase-camera";
import { buildingMaterial, buildingMeshes } from "./buildings";
import { createDocks } from "./docks";
import { createRuralBuildings } from "./rural-buildings";
import { createClipmap } from "./clipmap";
import { createForest, forestKnobs, type ForestDrawn, type ForestSettings } from "./forest";
import { canopyLift, tileReads } from "./tile-reads";
import { createReeds, type ReedsDrawn } from "./reeds";
import { createShrubs, type ShrubsDrawn } from "./shrubs";
import { createVerge, type VergeDrawn } from "./verge";
import { createWater, WATER_SHORE_MIP } from "./water";
import { DASH_LENGTH_M, RIBBON_CELL_M } from "./roads";
import { mapCameraAt, type ChasePose, type MapTarget } from "./map-camera";
import { SHOWCASE, type ShowcaseSpot } from "./showcase";
import { DETAIL_SEEN_M, distanceToTile, FAR_LOAD_M, TileFetcher, TileStream, type StreamStats } from "./stream";
import { tileBase } from "./tile-address";
import { TileLayers } from "./tile-layers";
import { createDriveAudio } from "../audio/graph";
import { stateFromCar } from "../audio/model";
import { useDriveSoundSettings } from "../audio/settings";
import { audioContext } from "@/shared/lib/sound";
import { createCarView } from "../art/cars/model";
import { CARS, PLAYER_CAR } from "../art/cars/specs";
import { createSky, skyLooks } from "../art/sky/sky";
import { band, createSignSheet, detailTexture, dressRoad, groundDetail, junctionMarks, pulses, type RoadAttributes } from "../art/surfaces";
import { ruralMaterials } from "../art/rural/index";
import { startControls, type GameAction, type MapAction } from "../input/controls";
import { landImage, mapInk, SharpLand, type MapView } from "../map/draw";
import { Navigator, type RouteCue } from "../map/navigator";
import { RoadGraph } from "../map/road-graph";
import { WorldMap } from "../map/world-map";
import { Autopilot } from "../sim/autopilot";
import { NO_INPUT, type DriveInput } from "../sim/car";
import { headingOf, speedOf, type CarState } from "../sim/car-state";
import { Drive, emptyLog, initPhysics, START_ALONG_M, type DriveLog } from "../sim/drive";
import { RoadLine, chainLine } from "../sim/road-net";
import { placeAround, surfaceUnder } from "../sim/surroundings";
import { GEARBOX, STEP_S } from "../sim/tuning";
import { World, type TileDetail } from "../sim/world";
import type { InputKind } from "@/shared/lib/input";

/*
 * Åland Drive drawn on WebGPU, with no framework between the game and
 * three.js: one renderer, one scene, one loop. The world is real tiles of the
 * island, streamed in round the car (`stream.ts`): one terrain mesh for all of
 * them (`clipmap.ts`), lit by shading baked ahead of time, and their road
 * surfaces, which are also what the car drives on (`sim/`). The simulation steps
 * at a fixed rate; each frame draws the car between its last two steps.
 */

/** A camera place in ETRS-TM35FIN metres, with its height above the ground. */
export interface Place {
  east: number;
  north: number;
  height: number;
  yaw: number;
  pitch: number;
}

export type CameraMode = "chase" | "free";

/** A control surface for tests and tools: everything here waits on events, never time. */
export interface GameProbe {
  /** Frames drawn so far. */
  frames: () => number;
  look: (at: Place) => void;
  /** What the last frame cost, counted, and how big it was drawn. */
  counts: () => { webGpu: boolean; drawCalls: number; triangles: number; gpuMs: number | null; width: number; height: number };
  forestDrawn: () => ForestDrawn;
  vergeDrawn: () => VergeDrawn;
  /** Shows the verge or leaves it out, to see what it does. */
  showVerge: (shown: boolean) => void;
  reedsDrawn: () => ReedsDrawn;
  /** Shows the reed beds or leaves them out, to see what they do. */
  showReeds: (shown: boolean) => void;
  shrubsDrawn: () => ShrubsDrawn;
  /** Shows the bushes, junipers and young birches or leaves them out, to see what they do. */
  showShrubs: (shown: boolean) => void;
  car: () => CarState;
  log: () => DriveLog;
  /** Stops the simulation following the clock, so `advance` is all that moves it. */
  hold: (held: boolean) => void;
  /** Steps the simulation with fixed inputs, or the scripted driver when given none. */
  advance: (steps: number, input?: DriveInput) => void;
  /** Starts the scripted driver along one of the start tile's chains, from a distance along it, resetting the log. */
  startRoute: (chain: number, cruiseMS: number, from: number) => void;
  routeFinished: () => boolean;
  /** Puts the car at a distance along one of the start tile's chains, facing along it. */
  placeOnRoad: (chain: number, along: number) => void;
  setCamera: (mode: CameraMode) => void;
  /** Moves the car to a showcase spot by its key, resolving once it's there, on loaded ground. */
  jumpTo: (key: string) => Promise<void>;
  /** Moves the car to a place near a road, in a car's view, resolving once it's there, on loaded ground. */
  driveFrom: (spot: Omit<ShowcaseSpot, "key">) => Promise<void>;
  /** Tiles at full detail, and what loading them has read. */
  stream: () => StreamStats;
  /** Loads the tiles round a place, wherever the car is, until `loadAround(null)`. */
  loadAround: (place: { x: number; z: number } | null) => void;
  /** The scripted driver along a line of (x, y, z) points in the scene, from its start, resetting the log. */
  startLine: (points: number[], cruiseMS: number) => void;
  /** True once the road network has arrived, so the maps and the GPS work. */
  mapReady: () => boolean;
  /** What picking a place on the world map does, and whether a road led there. */
  setDestination: (x: number, z: number) => boolean;
  /** The GPS route as the driver takes it: (x, y, z) points. */
  routePoints: () => number[] | null;
  /** The GPS's own route through places in order, each (x, z), for a drive that must pass them. */
  routeThrough: (places: [number, number][]) => number[];
  openMap: (open: boolean) => void;
  /** Holds the camera at a place along the flight to the map, or lets it go with null. */
  holdFlight: (flight: number | null) => void;
  /** How far along the flight to the map the camera is, 0 at the car to 1 at the map. */
  mapShown: () => number;
  /** Where the camera is, and which way it looks. */
  cameraPlace: () => number[];
  /** Puts the car on the nearest loaded road to a place. */
  placeNear: (x: number, z: number) => void;
  /** What's held: the JS heap, what the GPU holds for loaded tiles' meshes, and the fixed images. */
  memory: () => { jsMB: number; meshMB: number; texturesMB: number };
  /** The renderer's own counts of what it holds, to show nothing is left behind. */
  rendererMemory: () => Record<string, number>;
  /** Draws a different car, by name. The drive carries on: nothing in the simulation changes. */
  setCar: (name: string) => void;
  /** The name of the car being drawn. */
  carName: () => string;
}

export interface HudReading {
  speedKmh: number;
  /** The gear as a driver reads it: R, or 1 and up. */
  gear: string;
  /** 0 to 1 at the redline. */
  revs: number;
  /** The GPS's next direction. */
  cue: RouteCue | null;
}

/** How far the first load has got, counted in what has landed. */
export interface LoadingProgress {
  done: number;
  total: number;
}

export interface GameEvents {
  onHud: (reading: HudReading) => void;
  /** A tile couldn't be fetched. */
  onFailure: (error: Error) => void;
  onInputKind: (kind: InputKind) => void;
  onCamera: (mode: CameraMode) => void;
  onLoading?: (progress: LoadingProgress) => void;
  /** The road network has arrived: the mini map can show. */
  onMapReady?: () => void;
  onMapOpen?: (open: boolean) => void;
  onDevMenuOpen?: (open: boolean) => void;
  /** Another car is being drawn. */
  onCarChange?: (name: string) => void;
  /** The car has entered a named road. */
  onRoad?: (name: string) => void;
}

/** The canvases the page keeps for the maps. */
export interface MapCanvases {
  mini: HTMLCanvasElement;
  world: HTMLCanvasElement;
}

/** A car the dev menu can offer. */
export interface CarChoice {
  name: string;
  /** A paint token, without the `--color-aland-drive-` prefix. */
  paint: string;
}

export interface Game {
  probe: GameProbe;
  /** What a dev menu needs, so the page imports no car art. */
  cars: readonly CarChoice[];
  setCar: (name: string) => void;
  setDevMenuOpen: (open: boolean) => void;
  /** Where the car and the view are, as text to paste into a chat with Claude to find the spot again. */
  whereabouts: () => string;
  dispose: () => void;
}

/** Three drops to WebGL2 by itself when it can't make a WebGPU device; this game doesn't run there. */
export class NoWebGpuError extends Error {}

export const CAMERA_FIELD_OF_VIEW = 60;
export const CAMERA_NEAR = 0.25;
/** Far enough to see the whole island from straight above. */
const CAMERA_FAR = 200000;
const SKY_REACH_M = CAMERA_FAR * 0.9;
const SEA_BELOW_LAND_M = -1.2;
/** The 3D world is drawn at this share of the screen's real pixels each way, and stretched to fit if it's under 1. The page's UI stays sharp. */
export const RENDER_SCALE = 1;
/** What the forest draws on the floor laptop. It scales within `FOREST_MOST`. */
export const FOREST_DEFAULTS: ForestSettings = { fullReachM: 464, forestReachM: 1500, farDensity: 1 };
const LONGEST_FRAME_S = 0.1;
/** Too many steps owed in one go means the tab was away: drop them rather than catch up. */
const MOST_STEPS_A_FRAME = 12;
const EDGE_WALL_HEIGHT_M = 2.5;
const EDGE_WALL_STEP_M = 40;
const DASH_SHARE = 0.34;
const LINE_INSET = 0.93;
const LINE_WIDTH = 0.035;
const CENTRE_LINE_WIDTH = 0.018;
/** Ribbons stop here, within the reach of the detail images. Beyond it the terrain paints its own roads from the mask. */
const RIBBON_REACH_M = DETAIL_SEEN_M - 200;
/** Where the terrain's own roads fade in, under the ribbons, to show where a coarser ring rises through one. */
const PAINTED_ROADS_FROM_M = 250;
const PAINTED_ROADS_FULL_M = 400;
/** The 2 m shading gives way to the far shading over this run, out to where it stops being seen. */
const DETAIL_FADE_M = 400;
/** The far images give way to the overview over this run, inside the reach every tile is sure to hold them. */
const FAR_FADE_FROM_M = 4400;
const FAR_SEEN_M = 5800;
const HAZE_M = 16000;
/** Haze thins with the camera's height above this, so the island stays clear from above. */
const HAZE_CLEARS_FROM_M = 120;
/** Past this height the mask's mips blur a road into a band, so the paint fades out, and the overlay's roads fade in. */
const PAINTED_ROADS_GONE_M = 500;
const OVERLAY_FROM_M = 250;
const OVERLAY_FULL_M = 1100;
const MAP_FIELD_OF_VIEW = 45;
/** Below these heights the map looks at its own place: a sharper image only shows once a screen pixel is about as small as twice the image's. */
const MAP_FAR_FROM_M = 10000;
const MAP_DETAIL_FROM_M = 3500;
/** Room round the island on the map. */
const MAP_MARGIN = 1.05;
const MAP_SLOPE = Math.tan((MAP_FIELD_OF_VIEW * Math.PI) / 360);
const BUILDINGS_REACH_M = DETAIL_SEEN_M;

export const token = (name: string) => themeColor(`--color-aland-drive-${name}`);
export const colorOf = (name: string) => {
  const { r, g, b } = token(name);
  return vec3(r, g, b);
};

/** A square of tiling random values, mipped, so it turns to a flat grey with distance rather than sparkling. */
/** A low band round the end of the world, so it reads as a barrier and not a mistake. */
function edgeBand(world: World) {
  const { tileM } = world;
  const positions: number[] = [];
  const indices: number[] = [];
  const steps = tileM / EDGE_WALL_STEP_M;
  const side = (fromX: number, fromZ: number, toX: number, toZ: number) => {
    for (let step = 0; step <= steps; step++) {
      const share = step / steps;
      const x = fromX + share * (toX - fromX);
      const z = fromZ + share * (toZ - fromZ);
      // Read a metre inside, so the end of the land's height, not the sea's beyond it.
      const ground = world.height(x + Math.sign(toZ - fromZ) * 1, z - Math.sign(toX - fromX) * 1);
      const first = positions.length / 3;
      positions.push(x, ground, z, x, ground + EDGE_WALL_HEIGHT_M, z);
      if (step > 0) indices.push(first - 2, first, first - 1, first - 1, first, first + 1);
    }
  };
  for (const { column, row } of world.all()) {
    const [west, top] = [column * tileM, row * tileM];
    if (!world.has(column, row - 1)) side(west, top, west + tileM, top);
    if (!world.has(column + 1, row)) side(west + tileM, top, west + tileM, top + tileM);
    if (!world.has(column, row + 1)) side(west + tileM, top + tileM, west, top + tileM);
    if (!world.has(column - 1, row)) side(west, top + tileM, west, top);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setIndex(indices);
  return geometry;
}

/** A tile's bridges in the scene, one mesh, however many there are. */
function bridgeMesh({ positions, parts }: TileDetail["bridges"], material: MeshBasicNodeMaterial) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("part", new BufferAttribute(parts, 1));
  return new Mesh(geometry, material);
}

/** Each tile's ribbon in the scene, a mesh per cell sharing its buffers, shown only within reach. */
function ribbonMeshes(detail: TileDetail, dress: RoadAttributes, material: MeshBasicNodeMaterial) {
  const { ribbon } = detail;
  const position = new BufferAttribute(ribbon.positions, 3);
  const across = new BufferAttribute(ribbon.across, 1);
  const along = new BufferAttribute(ribbon.along, 1);
  const tier = new BufferAttribute(ribbon.tiers, 1);
  const roadInfo = new BufferAttribute(dress.surface, 4);
  const roadMark = new BufferAttribute(dress.mark, 2);
  const group = new Group();
  const cells = ribbon.cells.map(({ indices, x, z }) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", position);
    geometry.setAttribute("across", across);
    geometry.setAttribute("along", along);
    geometry.setAttribute("tier", tier);
    geometry.setAttribute("roadInfo", roadInfo);
    geometry.setAttribute("roadMark", roadMark);
    geometry.setIndex(new BufferAttribute(indices, 1));
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    group.add(mesh);
    return { mesh, x, z };
  });
  return { group, cells };
}

/** A page with no `canvases` gets the drive with no maps. */
export async function startGame(container: HTMLElement, events: GameEvents, canvases?: MapCanvases): Promise<Game> {
  const base = tileBase(window.location.search);
  const [manifest] = await Promise.all([
    fetch(`${base}/world.json`).then((response) => {
      if (!response.ok) throw new Error(`${base}/world.json: ${response.status}`);
      return response.json() as Promise<WorldManifest>;
    }),
    initPhysics(),
  ]);

  const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true, trackTimestamp: true });
  await renderer.init();
  if (!("isWebGPUBackend" in renderer.backend)) {
    renderer.dispose();
    throw new NoWebGpuError();
  }
  renderer.setPixelRatio(window.devicePixelRatio * RENDER_SCALE);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA_FIELD_OF_VIEW, 1, CAMERA_NEAR, CAMERA_FAR);

  const world = new World(manifest);
  const layers = new TileLayers(renderer, world);
  const fetcher = new TileFetcher(base, manifest);

  // The tiles a drive needs before it starts: the same few wherever the island ends.
  const startSpot = world.named(manifest.start.tile);
  const startTiles = [...world.all()].filter((tile) => distanceToTile((startSpot.column + 0.5) * manifest.tileM, (startSpot.row + 0.5) * manifest.tileM, tile.column, tile.row, manifest.tileM) < FAR_LOAD_M);
  const progress = { done: 0, total: 3 + startTiles.length };
  const landed = () => {
    progress.done++;
    events.onLoading?.({ ...progress });
  };
  events.onLoading?.({ ...progress });

  const overviewData = await fetcher.overview();
  const sharpLand = new SharpLand(manifest.tileM);
  landed();
  world.addOverview(overviewData.heights);
  const overviewTexture = new DataTexture(overviewData.image, manifest.overview.imageWidth, manifest.overview.imageHeight, RGBAFormat);
  overviewTexture.colorSpace = NoColorSpace;
  overviewTexture.generateMipmaps = true;
  overviewTexture.minFilter = LinearMipmapLinearFilter;
  overviewTexture.magFilter = LinearFilter;
  overviewTexture.wrapS = overviewTexture.wrapT = ClampToEdgeWrapping;
  overviewTexture.needsUpdate = true;

  const detail = detailTexture(manifest.sun);
  const signSheet = createSignSheet((name) => token(name).getStyle());
  const { tileM } = manifest;
  // A pixel's tile, and its place in that tile's images, which run from the north-west corner. The scene's -z is north,
  // so tile rows run with z. The image coordinates jump at a tile's edge, so the sampling's rate comes from the world's own.
  const worldUv = positionWorld.xz.div(tileM);
  const pixelTile = worldUv.floor();
  const imageUv = worldUv.sub(pixelTile);
  const gradientX = dFdx(worldUv);
  const gradientY = dFdy(worldUv);
  const mapPlace = pixelTile.sub(vec2(layers.mapColumn, layers.mapRow));
  const inMap = all(greaterThanEqual(mapPlace, vec2(0, 0))).and(all(lessThan(mapPlace, vec2(layers.mapColumns, layers.mapRows))));
  const mapClamped = ivec2(mapPlace.clamp(vec2(0, 0), vec2(layers.mapColumns - 1, layers.mapRows - 1)));
  const slots = textureLoad(layers.slots, mapClamped);
  const farLayer = int(slots.r.mul(255).round().sub(1).max(0));
  const nearSlot = slots.g.mul(255).round();
  const nearLayer = int(nearSlot.sub(1).max(0));
  const sampled = (map: Texture, layer: Node<"int">) => texture(map, imageUv).depth(layer).grad(gradientX, gradientY);

  // Detail is worked out from here, not from the camera, so a camera lifted to the world map changes nothing it stands on.
  const detailSpot = uniform(new Vector3());
  const hazeM = uniform(HAZE_M);
  const toCamera = positionWorld.sub(detailSpot).length();
  const nearShare = float(1).sub(smoothstep(float(DETAIL_SEEN_M - DETAIL_FADE_M), float(DETAIL_SEEN_M), toCamera)).mul(select(nearSlot.greaterThan(0.5), float(1), float(0)));
  const shade = mix(sampled(layers.shadeFar, farLayer).r, sampled(layers.shadeNear, nearLayer).r, nearShare);
  const lightOf = (baked: Node<"float">) => mix(float(1), baked.pow(float(manifest.shade.gamma)).div(FLAT_LIGHT), SHADE_SHARE);
  const light = lightOf(shade);
  const mask = sampled(layers.mask, farLayer);
  const photo = mix(sampled(layers.groundFar, farLayer), sampled(layers.groundNear, nearLayer), nearShare);
  const roadNearby = texture(layers.mask, imageUv).depth(farLayer).grad(gradientX.mul(8), gradientY.mul(8));
  const groundColor = groundDetail({ place: positionWorld.xz, toCamera, photo: photo.rgb.pow(vec3(2.2)), roadNearby: roadNearby.g.add(roadNearby.b), litterColour: colorOf("surface-litter"), detail });
  const sky = createSky({ reach: SKY_REACH_M, look: { ...skyLooks().summer, sun: manifest.sun } });
  scene.add(sky.mesh);
  const hazeColour = sky.hazeAlong(positionWorld.sub(cameraPosition));
  const hazed = (color: Node<"vec3">) => mix(color, hazeColour, float(1).sub(exp(toCamera.div(hazeM).pow(2).negate())));

  // From high up the mask's mips blur a road into a wide band, so the paint goes as the camera lifts: the map draws its own roads.
  const paintedShare = uniform(1);
  const paintedRoads = smoothstep(float(PAINTED_ROADS_FROM_M), float(PAINTED_ROADS_FULL_M), toCamera).mul(paintedShare);
  const roadEdge = (coverage: Node<"float">) => smoothstep(float(0.08), float(0.35), coverage).mul(paintedRoads);
  const land = mix(mix(groundColor, colorOf("road-main"), roadEdge(mask.g)), colorOf("road-minor"), roadEdge(mask.b)).mul(light);
  const hasFar = inMap.and(slots.r.greaterThan(0.001));
  const farSeen = select(hasFar, float(1).sub(smoothstep(float(FAR_FADE_FROM_M), float(FAR_SEEN_M), toCamera)), float(0));
  const overviewSize = vec2((manifest.overview.columns - 1) * manifest.overview.stepM, (manifest.overview.rows - 1) * manifest.overview.stepM);
  const overviewUv = positionWorld.xz.sub(vec2(manifest.overview.west, -manifest.overview.north)).div(overviewSize);
  const overviewPixel = texture(overviewTexture, overviewUv);
  const inOverview = all(greaterThanEqual(overviewUv, vec2(0, 0))).and(all(lessThan(overviewUv, vec2(1, 1))));
  const waterOf = createWater({ colour: colorOf, sun: manifest.sun, shoreAt: select(inOverview, texture(overviewTexture, overviewUv).level(float(WATER_SHORE_MIP)).a, float(0)), skyAlong: sky.clearAlong, meltAlong: sky.seaToSky });
  const pastTiles = select(inOverview, mix(waterOf.color, overviewPixel.rgb.pow(vec3(2.2)), overviewPixel.a), waterOf.color);
  const terrainColor = hazed(mix(pastTiles, mix(waterOf.color, land, photo.a), farSeen));

  const linear = (name: string) => {
    const { r, g, b } = token(name);
    return new Vector3(r, g, b);
  };
  const { canopyAt, standsAt, roadsAt, landAt, waterAt } = tileReads(layers, tileM, manifest.canopy.unitM);
  const cameraSpot = uniform(new Vector2());
  const knobs = forestKnobs(FOREST_DEFAULTS);
  const clipmap = createClipmap(scene, world, manifest.heights.stepM, terrainColor, canopyLift(canopyAt, cameraSpot, knobs.forestReach));
  const forest = createForest(scene, renderer, {
    knobs,
    canopyAt,
    standsAt,
    groundAt: clipmap.groundBlendedAt,
    roads: { at: roadsAt, tileM },
    colour: colorOf,
    hazed,
    sun: manifest.sun,
  });

  const verge = createVerge(scene, renderer, { landAt, roadsAt, groundAt: (place) => clipmap.groundBlendedAt(0, place), lightOf, linear, hazed, litterColour: colorOf("surface-litter"), tileM });
  const reeds = createReeds(scene, renderer, { waterAt, landAt, roadsAt, groundAt: (place) => clipmap.groundBlendedAt(0, place), lightOf, linear, hazed });
  const shrubs = createShrubs(scene, renderer, { canopyAt, waterAt, landAt, roadsAt, groundAt: (place) => clipmap.groundBlendedAt(0, place), lightOf, linear, hazed, sun: manifest.sun });

  // Open water out to the sky, under everything the terrain doesn't reach.
  const seaGeometry = new PlaneGeometry(2 * CAMERA_FAR, 2 * CAMERA_FAR);
  seaGeometry.rotateX(-Math.PI / 2);
  const seaMaterial = new MeshBasicNodeMaterial();
  seaMaterial.colorNode = hazed(waterOf.color);
  const sea = new Mesh(seaGeometry, seaMaterial);
  sea.position.y = SEA_BELOW_LAND_M;
  scene.add(sea);

  const tier = attribute<"float">("tier", "float");
  const across = attribute<"float">("across", "float").abs();
  const roadInfo = attribute<"vec4">("roadInfo", "vec4");
  const roadMark = attribute<"vec2">("roadMark", "vec2");
  const along = attribute<"float">("along", "float");
  const isMain = float(1).sub(smoothstep(float(0.4), float(0.6), tier));
  const signedAcross = attribute<"float">("across", "float");
  // Each line is its share of the pixel, so far off it thins to its share of the road instead of sparkling.
  const edgeLine = band(across, LINE_INSET - LINE_WIDTH, LINE_INSET + LINE_WIDTH, fwidth(across));
  // Centred on every whole dash, so the pattern reads the same from both tiles at a seam, whichever way their chains run.
  const dash = pulses(along, DASH_LENGTH_M, (DASH_SHARE / 2) * DASH_LENGTH_M, fwidth(along));
  const centreLine = band(signedAcross, -CENTRE_LINE_WIDTH, CENTRE_LINE_WIDTH, fwidth(signedAcross)).mul(dash);
  const dressed = dressRoad({ place: positionWorld.xz, toCamera, across, signedAcross, along, paved: roadInfo.x, town: roadInfo.y, halfWidth: roadInfo.z, shoulderM: roadMark.x, ground: groundColor, colour: colorOf, detail });
  const marks = junctionMarks({ across: signedAcross, halfWidth: roadInfo.z, toMark: roadInfo.w, mark: roadMark.y }).mul(roadInfo.x);
  const painted = mix(dressed.carriageway, colorOf("road-paint"), edgeLine.add(centreLine).min(1).mul(isMain).add(marks).min(1).mul(dressed.paintLeft));
  const roadMaterial = new MeshBasicNodeMaterial();
  roadMaterial.colorNode = hazed(mix(painted, dressed.shoulder, dressed.shoulderShare).mul(light));

  const bridgeMaterial = new MeshBasicNodeMaterial();
  const part = attribute<"float">("part", "float");
  const concrete = colorOf("wall-pale");
  bridgeMaterial.colorNode = hazed(mix(mix(concrete, colorOf("wall-plinth"), smoothstep(float(0.5), float(0.6), part)), concrete.mul(0.45), smoothstep(float(1.5), float(1.6), part)));
  bridgeMaterial.side = 2;
  // Bridges come with tiles, mid-drive, so one stands in to have its pipeline built with the rest.
  const bridgeStandIn = new BufferGeometry();
  bridgeStandIn.setAttribute("position", new BufferAttribute(new Float32Array(9), 3));
  bridgeStandIn.setAttribute("part", new BufferAttribute(new Float32Array(3), 1));
  const compiledBridge = new Mesh(bridgeStandIn, bridgeMaterial);
  compiledBridge.frustumCulled = false;
  scene.add(compiledBridge);

  const wallMaterial = buildingMaterial({ colour: colorOf, linear, hazed }, manifest.sun, { detail, sheet: signSheet });
  const outbuildingMaterials = ruralMaterials({ colour: colorOf, linear, hazed, sun: manifest.sun });
  // A placed model leaves where its own place passes the buildings' reach, as the cell round it does.
  const outbuildings = createRuralBuildings(scene, outbuildingMaterials, BUILDINGS_REACH_M + RIBBON_CELL_M / Math.SQRT2);
  const docks = createDocks(scene, outbuildingMaterials, { colour: colorOf, linear, hazed, sun: manifest.sun }, BUILDINGS_REACH_M + RIBBON_CELL_M / Math.SQRT2);
  const buildings = new Map<string, ReturnType<typeof buildingMeshes>>();
  const ribbons = new Map<string, ReturnType<typeof ribbonMeshes>>();
  const bridges = new Map<string, Mesh>();
  let meshBytes = 0;
  const meshBytesOf = (detail: TileDetail, dress: RoadAttributes, cells: { positions: Float32Array; facades: Float32Array; tints: Uint8Array; indices: Uint16Array }[]) =>
    detail.ribbon.positions.byteLength + detail.ribbon.across.byteLength + detail.ribbon.along.byteLength + detail.ribbon.tiers.byteLength + detail.ribbon.indices.byteLength + dress.surface.byteLength + dress.mark.byteLength + detail.bridges.positions.byteLength * (4 / 3) + cells.reduce((sum, cell) => sum + cell.positions.byteLength + cell.facades.byteLength + cell.tints.byteLength + cell.indices.byteLength, 0);
  const meshBytesByTile = new Map<string, number>();
  let failed = false;
  const fail = (error: Error) => {
    if (failed) return;
    failed = true;
    console.error(error);
    events.onFailure(error);
  };
  const stream = new TileStream(
    world,
    fetcher,
    {
      place({ detail, shade: mips, ground, buildings: cells, roadDress, models, docks: moored }, done) {
        const meshes = ribbonMeshes(detail, roadDress, roadMaterial);
        scene.add(meshes.group);
        ribbons.set(detail.name, meshes);
        const solids = buildingMeshes(cells, wallMaterial);
        scene.add(solids.group);
        buildings.set(detail.name, solids);
        outbuildings.add(detail.name, models);
        docks.add(detail.name, moored);
        if (detail.bridges.positions.length > 0) {
          const mesh = bridgeMesh(detail.bridges, bridgeMaterial);
          scene.add(mesh);
          bridges.set(detail.name, mesh);
        }
        const bytes = meshBytesOf(detail, roadDress, cells);
        meshBytesByTile.set(detail.name, bytes);
        meshBytes += bytes;
        layers.placeNear(world.named(detail.name), mips, ground, manifest, done);
      },
      placeFar(tile, done) {
        const place = world.named(tile.name);
        sharpLand.add(tile.name, place.column, place.row, tile.land);
        layers.placeFar(place, tile, manifest, done);
      },
      releaseFar(tile) {
        sharpLand.remove(tile.name);
        layers.releaseFar(tile);
      },
      release(detail) {
        const meshes = ribbons.get(detail.name);
        if (!meshes) throw new Error(`${detail.name} has no ribbon to release`);
        scene.remove(meshes.group);
        for (const { mesh } of meshes.cells) mesh.geometry.dispose();
        ribbons.delete(detail.name);
        const solids = buildings.get(detail.name);
        if (!solids) throw new Error(`${detail.name} has no buildings to release`);
        scene.remove(solids.group);
        for (const { mesh } of solids.cells) mesh.geometry.dispose();
        buildings.delete(detail.name);
        outbuildings.remove(detail.name);
        docks.remove(detail.name);
        const bridge = bridges.get(detail.name);
        if (bridge) {
          scene.remove(bridge);
          bridge.geometry.dispose();
          bridges.delete(detail.name);
        }
        meshBytes -= meshBytesByTile.get(detail.name) ?? 0;
        meshBytesByTile.delete(detail.name);
        layers.releaseNear(world.named(detail.name));
      },
    },
    fail,
  );

  // The far data round the start comes first, and detail under the car, then the drive begins. From here on the frame loop
  // does the uploads, but it hasn't started yet: this first lot goes up here.
  stream.addBytes(overviewData.bytes);
  const loaded = Promise.all([...startTiles.map((tile) => stream.loadFar(tile.name).then(landed)), stream.load(manifest.start.tile).then(landed)]);
  let uploading = true;
  void loaded.finally(() => {
    uploading = false;
  });
  const pumpUploads = async () => {
    while (uploading) {
      layers.uploadStep(Number.POSITIVE_INFINITY);
      await new Promise(requestAnimationFrame);
    }
  };
  await Promise.all([loaded, pumpUploads()]);

  const startTile = world.named(manifest.start.tile);
  if (!startTile.detail) throw new Error(`${manifest.start.tile} didn't load`);
  const startRoads = startTile.detail.roads;
  const startLine = (chain: number) => chainLine(startRoads, chain);
  const edgeGeometry = edgeBand(world);
  const edgeMaterial = new MeshBasicNodeMaterial();
  edgeMaterial.colorNode = hazed(colorOf("edge"));
  edgeMaterial.side = 2;
  const edgeMesh = new Mesh(edgeGeometry, edgeMaterial);
  scene.add(edgeMesh);

  const drive = new Drive(world, startLine(manifest.start.chain).at(START_ALONG_M));
  let carSpec = PLAYER_CAR;
  let carView = createCarView(scene, manifest.sun, carSpec);
  const cullCar = (culled: boolean) => {
    for (const object of carView.objects) {
      object.traverse((part) => {
        part.frustumCulled = culled;
      });
    }
  };

  // A pipeline first used mid-drive stalls that frame while it compiles, so every mesh is built once before the drive starts.
  for (const { cells } of [...ribbons.values(), ...buildings.values()]) {
    for (const { mesh } of cells) mesh.visible = true;
  }
  clipmap.showWide(true);
  outbuildings.showAll(true);
  docks.showAll(true);
  cullCar(false);
  await renderer.compileAsync(scene, camera);
  await forest.compile();
  await verge.compile();
  await reeds.compile();
  await shrubs.compile();
  cullCar(true);
  clipmap.showWide(false);
  outbuildings.showAll(false);
  docks.showAll(false);
  scene.remove(compiledBridge);
  bridgeStandIn.dispose();
  landed();

  const { worldOrigin } = manifest;
  const groundAt = (x: number, z: number) => world.height(x, z);
  const toView = (at: Place): View => {
    const east = at.east - worldOrigin.east;
    const north = at.north - worldOrigin.north;
    return { x: east, y: world.height(east, -north) + at.height, z: -north, yaw: at.yaw, pitch: at.pitch };
  };
  const freeCamera = startFreeCamera(camera, renderer.domElement);
  const chaseCamera = startChaseCamera(camera, groundAt);

  let cameraMode: CameraMode = "chase";
  const setCamera = (mode: CameraMode) => {
    if (mode === cameraMode) return;
    if (mode === "free") {
      freeCamera.enter();
      camera.fov = CAMERA_FIELD_OF_VIEW;
      camera.updateProjectionMatrix();
    } else {
      freeCamera.leave();
    }
    cameraMode = mode;
    events.onCamera(mode);
  };

  let navigator: Navigator | null = null;
  // The camera left the chase view here, and detail stays here until it's back or the map looks closely elsewhere. Null while driving.
  let mapFrom: ChasePose | null = null;
  let mapLook: { x: number; z: number; detail: boolean } | null = null;
  let heldFlight = false;
  let devMenuOpen = false;
  const raycaster = new Raycaster();
  const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  const groundHit = new Vector3();
  const projected = new Vector3();
  let roadGraph: RoadGraph | null = null;
  let worldMap: WorldMap | null = null;
  const headingClockwise = (car: CarState) => -headingOf(car.rotation);
  const pickDestination = (x: number, z: number) => {
    const car = drive.stateAt(1);
    if (!navigator) throw new Error("a destination before the road network arrived");
    const found = navigator.setDestination(car.position[0], car.position[2], headingClockwise(car), x, z);
    worldMap?.setRoute(navigator.route);
    return found;
  };
  // Arrives after the drive starts, so a long download never holds up the start.
  void (canvases ? fetcher.roads() : new Promise<never>(() => undefined)).then(
    (data) => {
      if (!canvases) return;
      const graph = new RoadGraph(data);
      roadGraph = graph;
      const land = landImage(overviewData.image, manifest.overview);
      const ink = mapInk();
      navigator = new Navigator(graph, land, manifest.overview, sharpLand, canvases.mini, ink, { onRoad: (name) => events.onRoad?.(name) });
      worldMap = new WorldMap(
        canvases.world,
        graph,
        ink,
        (x, z) => {
          pickDestination(x, z);
        },
        () => {
          mapFrom = null;
          controls.setMapOpen(false);
          events.onMapOpen?.(false);
          const { position } = drive.stateAt(1);
          if (stream.wanted(position[0], position[2]) === 0) return;
          // The map looked elsewhere, so the car waits for its ground, as it does for a jump.
          jumping = true;
          void stream.settled().then(() => {
            jumping = false;
          });
        },
      );
      stream.addBytes(data.bytes);
      events.onMapReady?.();
    },
    (error: unknown) => {
      fail(error instanceof Error ? error : new Error(String(error)));
    },
  );

  // Everything stops for a jump: the car stays where it is until the ground where it's going has landed.
  let jumping = false;
  const jump = async ({ x, z, headingDeg, name }: Omit<ShowcaseSpot, "key">) => {
    if (jumping || mapFrom) return;
    jumping = true;
    const wanted = { done: 0, total: Math.max(stream.wanted(x, z), 1) };
    events.onLoading?.({ ...wanted });
    stream.onLanded = () => {
      wanted.done = Math.min(wanted.done + 1, wanted.total - 1);
      events.onLoading?.({ ...wanted });
    };
    loadingAround = { x, z };
    stream.update(x, z);
    await stream.settled();
    const road = world.roads.nearest(x, z);
    if (!road) throw new Error(`no road at the showcase spot ${name}`);
    const heading = (-headingDeg * Math.PI) / 180;
    drive.placeAt({ ...road, heading: Math.cos(heading - road.heading) >= 0 ? road.heading : road.heading + Math.PI });
    chaseCamera.snap();
    loadingAround = null;
    stream.onLanded = () => undefined;
    jumping = false;
    events.onLoading?.({ done: wanted.total, total: wanted.total });
    events.onRoad?.(name);
  };
  const jumpByKey = (key: string) => {
    const spot = SHOWCASE.find((candidate) => candidate.key === key);
    return spot ? jump(spot) : Promise.resolve();
  };

  /** The view that fits a box, centred, whatever the screen's shape. */
  const mapFitting = ({ west, east, top, bottom }: { west: number; east: number; top: number; bottom: number }): MapTarget => {
    const across = (east - west) / 2 / Math.max(camera.aspect, 0.1);
    const along = (bottom - top) / 2;
    const heightM = (MAP_MARGIN * Math.max(across, along)) / MAP_SLOPE;
    return { x: (west + east) / 2, z: (top + bottom) / 2, heightM, fieldOfViewDeg: MAP_FIELD_OF_VIEW };
  };

  /** The main island to start with, out to all of Åland, as the map's zoom and pan have moved it. */
  const mapTarget = (map: WorldMap): MapTarget => {
    if (!roadGraph) throw new Error("no road network yet");
    const { west, north, columns, rows, stepM } = manifest.overview;
    const whole = mapFitting({ west, east: west + (columns - 1) * stepM, top: -north, bottom: -north + (rows - 1) * stepM });
    return map.target(whole, whole.heightM * MAP_SLOPE * camera.aspect, whole.heightM * MAP_SLOPE, mapFitting(roadGraph.mainIsland));
  };

  const setMapOpen = (open: boolean) => {
    if (!worldMap || !navigator || cameraMode === "free" || jumping) return;
    if (open === worldMap.wanted) return;
    if (open && !mapFrom) {
      const car = drive.stateAt(1);
      const { x, y, z } = camera.position;
      const forward = camera.getWorldDirection(new Vector3());
      mapFrom = { position: [x, y, z], forward: [forward.x, forward.y, forward.z], fieldOfViewDeg: camera.fov, car: [car.position[0], car.position[1], car.position[2]] };
      controls.setMapOpen(true);
      events.onMapOpen?.(true);
      // The canvas only has a size once it shows.
      const map = worldMap;
      const route = navigator.route;
      const along = navigator.alongRoute;
      requestAnimationFrame(() => {
        map.startAt(car.position[0], car.position[2], headingClockwise(car), route, along);
      });
    }
    worldMap.wanted = open;
    if (!open) mapLook = null;
  };

  const setDevMenuOpen = (open: boolean) => {
    if (open === devMenuOpen || (open && (mapFrom || jumping))) return;
    devMenuOpen = open;
    controls.setDevMenuOpen(open);
    events.onDevMenuOpen?.(open);
  };

  const whereabouts = () => {
    const car = drive.stateAt(1);
    const [x, y, z] = car.position;
    const headingDeg = (((headingClockwise(car) * 180) / Math.PI) % 360 + 360) % 360;
    const direction = camera.getWorldDirection(new Vector3());
    const look = [
      camera.position.x + worldOrigin.east,
      worldOrigin.north - camera.position.z,
      camera.position.y - world.height(camera.position.x, camera.position.z),
    ].map((value) => value.toFixed(1));
    const turn = [Math.atan2(-direction.x, -direction.z), Math.asin(direction.y)].map((value) => value.toFixed(3));
    return [
      `Åland Drive, car in tile ${world.tileAt(x, z)?.name ?? "none"}`,
      `scene x ${x.toFixed(1)}, y ${y.toFixed(1)}, z ${z.toFixed(1)}; ETRS-TM35FIN east ${(x + worldOrigin.east).toFixed(1)}, north ${(worldOrigin.north - z).toFixed(1)}`,
      `heading ${headingDeg.toFixed(0)}° clockwise from grid north, ${(speedOf(car) * 3.6).toFixed(0)} km/h, ${cameraMode} camera`,
      `the view on screen: tools/look.mjs <out.png> ${[...look, ...turn].join(" ")}`,
    ].join("\n");
  };

  const setCar = (name: string) => {
    const spec = CARS.find((car) => car.name === name);
    if (!spec) throw new Error(`no car called ${name}`);
    if (spec === carSpec) return;
    carView.dispose();
    carSpec = spec;
    carView = createCarView(scene, manifest.sun, spec);
    events.onCarChange?.(name);
  };

  const onAction = (action: GameAction) => {
    if (action === "respawn") drive.respawn();
    if (action === "freeCamera") setCamera(cameraMode === "free" ? "chase" : "free");
    if (action === "map") setMapOpen(true);
    if (action === "mute") useDriveSoundSettings.getState().toggleMuted();
  };
  const onMapAction = (action: MapAction) => {
    if (action === "close") setMapOpen(false);
    if (action === "pick") worldMap?.pick();
    if (action === "clear") {
      navigator?.clearRoute();
      worldMap?.setRoute(null);
    }
  };
  const controls = startControls({ onAction, onMapAction, onDigit: (digit) => void jumpByKey(digit).catch(fail), onDevMenu: setDevMenuOpen, onInputKind: events.onInputKind });

  const resize = () => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / Math.max(1, clientHeight);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  let held = false;
  let autopilot: Autopilot | null = null;
  let owedSeconds = 0;
  let lastFrame: number | null = null;
  let frames = 0;
  let gpuMs: number | null = null;
  let resolving = false;
  let loadingAround: { x: number; z: number } | null = null;

  const showRibbons = ({ x, z }: Vector3) => {
    const reach = RIBBON_REACH_M + RIBBON_CELL_M / Math.SQRT2;
    for (const { cells } of ribbons.values()) {
      for (const cell of cells) cell.mesh.visible = Math.hypot(cell.x - x, cell.z - z) < reach;
    }
    const buildingReach = BUILDINGS_REACH_M + RIBBON_CELL_M / Math.SQRT2;
    for (const { cells } of buildings.values()) {
      for (const cell of cells) cell.mesh.visible = Math.hypot(cell.x - x, cell.z - z) < buildingReach;
    }
  };

  const audio = createDriveAudio();
  let lastInput = NO_INPUT;
  let placements = drive.placements;
  // No frames run in a hidden tab, so the last one's engine note would hold.
  const hushWhenHidden = () => {
    void audioContext().then((context) => (document.hidden ? context.suspend() : context.resume()));
  };
  document.addEventListener("visibilitychange", hushWhenHidden);

  const nextInput = (): DriveInput => {
    if (autopilot) lastInput = autopilot.input(drive.stateAt(1));
    else lastInput = cameraMode === "free" ? NO_INPUT : controls.read();
    return lastInput;
  };

  const detailSpotAt = new Vector3();
  /** This frame's camera as a view of the ground, for what's drawn over the render. */
  const mapViewOf = (height: number, turn: number): MapView => {
    const { clientWidth: width, clientHeight: tall } = container;
    const scale = tall / 2 / Math.tan((camera.fov * Math.PI) / 360) / Math.max(height, 1);
    return {
      scale,
      turn,
      width,
      height: tall,
      toScreen: (x, z) => {
        projected.set(x, 0, z).project(camera);
        return [((projected.x + 1) / 2) * width, ((1 - projected.y) / 2) * tall];
      },
      toWorld: (screenX, screenY) => {
        raycaster.setFromCamera(new Vector2((screenX / width) * 2 - 1, 1 - (screenY / tall) * 2), camera);
        const hit = raycaster.ray.intersectPlane(groundPlane, groundHit);
        return hit ? [hit.x, hit.z] : [camera.position.x, camera.position.z];
      },
    };
  };

  const frame = (now: number) => {
    // A page with no room for the canvas (a hidden tab or pane) has nothing to draw into.
    if (container.clientWidth === 0 || container.clientHeight === 0) return;
    const seconds = Math.min(lastFrame === null ? 0 : (now - lastFrame) / 1000, LONGEST_FRAME_S);
    lastFrame = now;
    let share = 1;
    if (mapFrom && !heldFlight) worldMap?.step(controls.mapSteer(), seconds);
    if (!held && !mapFrom && !jumping && !devMenuOpen) {
      owedSeconds += seconds;
      const steps = Math.min(Math.floor(owedSeconds / STEP_S), MOST_STEPS_A_FRAME);
      for (let step = 0; step < steps; step++) drive.step(nextInput());
      owedSeconds = Math.min(owedSeconds - steps * STEP_S, STEP_S);
      share = owedSeconds / STEP_S;
    }
    const car = drive.stateAt(share);
    carView.draw(car);
    if (mapFrom && worldMap) {
      const carNow = mapFrom.car;
      const pose = mapCameraAt(worldMap.flight, mapFrom, mapTarget(worldMap), groundAt);
      camera.position.set(...pose.position);
      camera.rotation.set(pose.pitch, -pose.turn, 0, "YXZ");
      if (camera.fov !== pose.fieldOfViewDeg) {
        camera.fov = pose.fieldOfViewDeg;
        camera.updateProjectionMatrix();
      }
      camera.updateMatrixWorld();
      const height = camera.position.y - carNow[1];
      if (worldMap.wanted && worldMap.flight === 1 && height < MAP_FAR_FROM_M) mapLook = { x: camera.position.x, z: camera.position.z, detail: height < MAP_DETAIL_FROM_M };
      hazeM.value = HAZE_M * (1 + (Math.max(height, 0) / HAZE_CLEARS_FROM_M) ** 2);
      paintedShare.value = Math.max(1 - height / PAINTED_ROADS_GONE_M, 0);
      const shown = Math.max(0, Math.min(1, (height - OVERLAY_FROM_M) / (OVERLAY_FULL_M - OVERLAY_FROM_M)));
      worldMap.draw(mapViewOf(height, pose.turn), shown);
    } else if (cameraMode === "free") {
      if (!devMenuOpen) freeCamera.update(now);
    } else {
      chaseCamera.update(car, held ? STEP_S * 4 : seconds, controls.look());
      hazeM.value = HAZE_M;
      paintedShare.value = 1;
    }
    const lifted = mapFrom !== null;
    const [spotX, spotY, spotZ] = mapLook ? [mapLook.x, groundAt(mapLook.x, mapLook.z), mapLook.z] : mapFrom ? mapFrom.position : camera.position.toArray();
    detailSpotAt.set(spotX, spotY, spotZ);
    const spot = detailSpotAt;
    detailSpot.value.copy(spot);
    edgeMesh.visible = !lifted;
    clipmap.showWide(lifted);
    const speed = speedOf(car);
    const cue = navigator?.update(car.position[0], car.position[2], headingClockwise(car), speed) ?? null;
    const engine = drive.engine();
    events.onHud({ speedKmh: speed * 3.6, gear: engine.reversing ? "R" : String(engine.gear + 1), revs: Math.min(engine.rpm / GEARBOX.redlineRpm, 1), cue });
    if (drive.placements !== placements) {
      placements = drive.placements;
      audio.reset();
    }
    const [carX, , carZ] = car.position;
    audio.update(stateFromCar(car, lastInput, { vehicle: "skerry-gt", engine, surface: surfaceUnder(world, carX, carZ), place: placeAround(world, carX, carZ), paused: mapFrom !== null || jumping || devMenuOpen }), seconds);
    const focus = loadingAround ?? mapLook ?? (cameraMode === "free" ? { x: camera.position.x, z: camera.position.z } : { x: car.position[0], z: car.position[2] });
    stream.update(focus.x, focus.z, mapLook?.detail);
    layers.uploadStep();
    clipmap.update(spot);
    cameraSpot.value.set(spot.x, spot.z);
    forest.update(spot, camera);
    verge.update(spot, camera, seconds);
    reeds.update(spot, camera);
    shrubs.update(spot, camera);
    docks.update(lifted || held || jumping || devMenuOpen ? 0 : seconds);
    showRibbons(spot);
    sky.update(camera.position, seconds);
    renderer.render(scene, camera);
    frames++;
    if (!resolving) {
      resolving = true;
      void Promise.all([renderer.resolveTimestampsAsync(TimestampQuery.RENDER), renderer.resolveTimestampsAsync(TimestampQuery.COMPUTE)]).then(([ms, computeMs]) => {
        if (ms !== undefined && ms > 0) gpuMs = ms + (computeMs ?? 0);
        resolving = false;
      });
    }
  };
  await renderer.setAnimationLoop(frame);

  return {
    probe: {
      frames: () => frames,
      look: (at) => {
        setCamera("free");
        freeCamera.set(toView(at));
      },
      counts: () => ({
        webGpu: "isWebGPUBackend" in renderer.backend,
        drawCalls: renderer.info.render.drawCalls,
        // three counts an indirect draw as one tree, so the forest's come from the GPU's own count, a few frames old.
        triangles: renderer.info.render.triangles + forest.drawn().triangles + verge.drawn().triangles + reeds.drawn().triangles + shrubs.drawn().triangles,
        gpuMs,
        width: renderer.domElement.width,
        height: renderer.domElement.height,
      }),
      forestDrawn: forest.drawn,
      vergeDrawn: verge.drawn,
      showVerge: verge.show,
      reedsDrawn: reeds.drawn,
      showReeds: reeds.show,
      shrubsDrawn: shrubs.drawn,
      showShrubs: shrubs.show,
      car: () => drive.stateAt(1),
      log: () => drive.log,
      hold: (next) => {
        held = next;
      },
      advance: (steps, input) => {
        for (let step = 0; step < steps; step++) drive.step(input ?? nextInput());
      },
      startRoute: (chain, cruiseMS, from) => {
        const line = startLine(chain);
        drive.placeAt(line.at(from));
        drive.log = emptyLog();
        autopilot = new Autopilot(line, cruiseMS, from);
      },
      routeFinished: () => autopilot?.finished() ?? false,
      placeOnRoad: (chain, at) => {
        drive.placeAt(startLine(chain).at(at));
      },
      setCamera,
      stream: () => stream.stats(),
      loadAround: (place) => {
        loadingAround = place;
      },
      startLine: (points, cruiseMS) => {
        const line = new RoadLine(Float32Array.from(points));
        const fold = line.foldsAt();
        if (fold) throw new Error(`the scripted driver can't follow a route that turns back on itself, as this does at ${fold.x.toFixed(0)}, ${fold.z.toFixed(0)}`);
        const start = line.at(0);
        drive.placeAt({ ...start, y: world.roads.nearest(start.x, start.z)?.y ?? start.y });
        drive.log = emptyLog();
        autopilot = new Autopilot(line, cruiseMS, 0);
      },
      mapReady: () => navigator !== null,
      setDestination: pickDestination,
      routePoints: () => (navigator?.route ? [...navigator.route.line.points] : null),
      routeThrough: (places) => {
        if (!roadGraph) throw new Error("no road network yet");
        const points: number[] = [];
        // Facing the first place to go, so the route doesn't start the far way along the road only to turn back.
        let heading = Math.atan2(places[1][0] - places[0][0], places[0][1] - places[1][1]);
        for (let leg = 1; leg < places.length; leg++) {
          const route = roadGraph.route(places[leg - 1][0], places[leg - 1][1], heading, places[leg][0], places[leg][1]);
          if (!route) throw new Error(`no way from ${places[leg - 1].join(", ")} to ${places[leg].join(", ")}`);
          points.push(...(leg === 1 ? route.line.points : route.line.points.subarray(3)));
          const last = route.line.at(route.line.length);
          heading = -last.heading;
        }
        return points;
      },
      jumpTo: jumpByKey,
      driveFrom: async (spot) => {
        await jump(spot);
        setCamera("chase");
      },
      openMap: setMapOpen,
      holdFlight: (flight) => {
        heldFlight = flight !== null;
        if (flight !== null) worldMap?.holdAt(flight);
      },
      mapShown: () => worldMap?.flight ?? 0,
      cameraPlace: () => [...camera.position.toArray(), ...camera.getWorldDirection(new Vector3()).toArray()],
      placeNear: (x, z) => {
        const road = world.roads.nearest(x, z);
        if (!road) throw new Error(`no loaded road near ${x}, ${z}`);
        drive.placeAt(road);
      },
      memory: () => {
        const { usedJSHeapSize } = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory;
        return { jsMB: usedJSHeapSize / 1e6, meshMB: meshBytes / 1e6, texturesMB: layers.textureBytes / 1e6 };
      },
      rendererMemory: () => ({ ...renderer.info.memory }),
      setCar,
      carName: () => carSpec.name,
    },
    cars: CARS.map(({ name, paint }) => ({ name, paint })),
    setCar,
    setDevMenuOpen,
    whereabouts,
    dispose() {
      void renderer.setAnimationLoop(null);
      document.removeEventListener("visibilitychange", hushWhenHidden);
      audio.dispose();
      observer.disconnect();
      freeCamera.dispose();
      controls.dispose();
      worldMap?.dispose();
      carView.dispose();
      drive.dispose();
      stream.dispose();
      fetcher.dispose();
      forest.dispose();
      verge.dispose();
      reeds.dispose();
      shrubs.dispose();
      clipmap.dispose();
      for (const { cells } of buildings.values()) {
        for (const { mesh } of cells) mesh.geometry.dispose();
      }
      wallMaterial.dispose();
      outbuildings.dispose();
      docks.dispose();
      outbuildingMaterials.near.dispose();
      outbuildingMaterials.far.dispose();
      detail.dispose();
      for (const { cells } of ribbons.values()) {
        for (const { mesh } of cells) mesh.geometry.dispose();
      }
      for (const mesh of bridges.values()) mesh.geometry.dispose();
      bridgeMaterial.dispose();
      overviewTexture.dispose();
      seaGeometry.dispose();
      edgeGeometry.dispose();
      edgeMaterial.dispose();
      seaMaterial.dispose();
      sky.dispose();
      waterOf.dispose();
      roadMaterial.dispose();
      layers.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
