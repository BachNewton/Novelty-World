import { BufferAttribute, BufferGeometry, Color, DataTexture, Group, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, RedFormat, RepeatWrapping, Scene, TimestampQuery, Vector2, Vector3, WebGPURenderer, type Node, type Texture } from "three/webgpu";
import { all, attribute, dFdx, dFdy, exp, float, fract, fwidth, greaterThanEqual, int, ivec2, lessThan, mix, positionWorld, select, smoothstep, texture, textureLoad, uniform, vec2, vec3, cameraPosition } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { startFreeCamera, type View } from "./free-camera";
import { ROAD_TIERS, type RoadTier, type WorldManifest } from "./tile";
import { startChaseCamera, type CarView } from "./chase-camera";
import { buildingMaterial, buildingMeshes } from "./buildings";
import { createCarView } from "./car";
import { createClipmap } from "./clipmap";
import { createForest, FOREST_REACH_M } from "./forest";
import { DASH_LENGTH_M, RIBBON_CELL_M } from "./roads";
import { DETAIL_SEEN_M, TileFetcher, TileStream, type StreamStats } from "./stream";
import { tileBase } from "./tile-address";
import { TileLayers } from "./tile-layers";
import { startControls, type GameAction } from "../input/controls";
import { Autopilot } from "../sim/autopilot";
import { NO_INPUT, type DriveInput } from "../sim/car";
import { speedOf, type CarState } from "../sim/car-state";
import { Drive, emptyLog, initPhysics, START_ALONG_M, type DriveLog } from "../sim/drive";
import { RoadLine, chainLine } from "../sim/road-net";
import { STEP_S } from "../sim/tuning";
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

export type CameraMode = CarView | "free";

/** A control surface for tests and tools: everything here waits on events, never time. */
export interface GameProbe {
  /** Frames drawn so far. */
  frames: () => number;
  look: (at: Place) => void;
  /** What the last frame cost, counted, and how big it was drawn. */
  counts: () => { webGpu: boolean; drawCalls: number; triangles: number; gpuMs: number | null; width: number; height: number };
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
  /** Tiles at full detail, and what loading them has read. */
  stream: () => StreamStats;
  /** Loads the tiles round a place, wherever the car is, until `loadAround(null)`. */
  loadAround: (place: { x: number; z: number } | null) => void;
  /** The scripted driver along a line of (x, y, z) points in the scene, from its start, resetting the log. */
  startLine: (points: number[], cruiseMS: number) => void;
}

export interface HudReading {
  speedKmh: number;
  /** 0 at rest to 1 at top speed. */
  speedShare: number;
}

export interface GameEvents {
  onHud: (reading: HudReading) => void;
  /** A tile couldn't be fetched. */
  onFailure: (error: Error) => void;
  onInputKind: (kind: InputKind) => void;
  onCamera: (mode: CameraMode) => void;
}

export interface Game {
  probe: GameProbe;
  attribution: string[];
  dispose: () => void;
}

/** Three drops to WebGL2 by itself when it can't make a WebGPU device; this game doesn't run there. */
export class NoWebGpuError extends Error {}

const CAMERA_FIELD_OF_VIEW = 60;
const CAMERA_NEAR = 0.25;
const CAMERA_FAR = 40000;
const SEA_BELOW_LAND_M = -1.2;
/** The 3D world is drawn at this share of the screen's pixels each way, and stretched to fit. The page's UI stays sharp. */
const RENDER_SCALE = 0.7;
const LONGEST_FRAME_S = 0.1;
/** Too many steps owed in one go means the tab was away: drop them rather than catch up. */
const MOST_STEPS_A_FRAME = 12;
const TOP_SPEED_SHARE_MS = 55.6;
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
const HAZE_M = 16000;
/** Light on flat open ground in the baked shading: at this the photo shows as it was taken. */
const FLAT_LIGHT = 0.8;
/** The photo already holds most of its own relief, so the baked shading only adds to it. */
const SHADE_SHARE = 0.65;
/** Past the trees, the terrain itself rises by the forest. */
const CANOPY_RISE_FROM_M = FOREST_REACH_M - 300;
const CANOPY_RISE_FULL_M = FOREST_REACH_M - 40;
const BUILDINGS_REACH_M = DETAIL_SEEN_M;
const GRAIN_M = 7;
const GRAIN_SECOND_SCALE = 0.31;
const GRAIN_FADE_M = 160;
const GRAIN_PIXELS = 256;
const FOREST_NEAR_RING = 0;
const FOREST_FAR_RING = 2;

const token = (name: string) => themeColor(`--color-aland-drive-${name}`);
const colorOf = (name: string) => {
  const { r, g, b } = token(name);
  return vec3(r, g, b);
};

/** A square of tiling random values, mipped, so it turns to a flat grey with distance rather than sparkling. */
function grainNoise() {
  const noise = new DataTexture(new Uint8Array(GRAIN_PIXELS * GRAIN_PIXELS), GRAIN_PIXELS, GRAIN_PIXELS, RedFormat);
  const values = noise.image.data as Uint8Array;
  // A fixed sequence, so every run's ground is the same.
  let state = 12345;
  for (let at = 0; at < values.length; at++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    values[at] = 90 + ((state >> 16) % 76);
  }
  noise.wrapS = noise.wrapT = RepeatWrapping;
  noise.magFilter = LinearFilter;
  noise.minFilter = LinearMipmapLinearFilter;
  noise.generateMipmaps = true;
  noise.needsUpdate = true;
  return noise;
}

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

/** Each tile's ribbon in the scene, a mesh per cell sharing its buffers, shown only within reach. */
function ribbonMeshes(detail: TileDetail, material: MeshBasicNodeMaterial) {
  const { ribbon } = detail;
  const position = new BufferAttribute(ribbon.positions, 3);
  const across = new BufferAttribute(ribbon.across, 1);
  const along = new BufferAttribute(ribbon.along, 1);
  const tier = new BufferAttribute(ribbon.tiers, 1);
  const group = new Group();
  const cells = ribbon.cells.map(({ indices, x, z }) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", position);
    geometry.setAttribute("across", across);
    geometry.setAttribute("along", along);
    geometry.setAttribute("tier", tier);
    geometry.setIndex(new BufferAttribute(indices, 1));
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    group.add(mesh);
    return { mesh, x, z };
  });
  return { group, cells };
}

export async function startGame(container: HTMLElement, events: GameEvents): Promise<Game> {
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
  renderer.setClearColor(new Color(token("sky")));
  renderer.setPixelRatio(RENDER_SCALE);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA_FIELD_OF_VIEW, 1, CAMERA_NEAR, CAMERA_FAR);

  const world = new World(manifest);
  const layers = new TileLayers(renderer, world);
  const fetcher = new TileFetcher(base, manifest);

  const grainTexture = grainNoise();
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

  const toCamera = positionWorld.sub(cameraPosition).length();
  const nearShare = float(1).sub(smoothstep(float(DETAIL_SEEN_M - DETAIL_FADE_M), float(DETAIL_SEEN_M), toCamera)).mul(select(nearSlot.greaterThan(0.5), float(1), float(0)));
  const shade = mix(sampled(layers.shadeFar, farLayer).r, sampled(layers.shadeNear, nearLayer).r, nearShare);
  const light = mix(float(1), shade.pow(float(manifest.shade.gamma)).div(FLAT_LIGHT), SHADE_SHARE);
  const mask = sampled(layers.mask, farLayer);
  const photo = mix(sampled(layers.groundFar, farLayer), sampled(layers.groundNear, nearLayer), nearShare);
  // The photo's 2 m pixels are a smear from a car's height, so close up a tiling noise breaks them into something like grass and grit.
  const grain = texture(grainTexture, positionWorld.xz.div(GRAIN_M)).r.mul(texture(grainTexture, positionWorld.xz.div(GRAIN_M * GRAIN_SECOND_SCALE)).r).mul(2.6).add(0.45);
  const grainShare = float(1).sub(smoothstep(float(GRAIN_FADE_M * 0.3), float(GRAIN_FADE_M), toCamera));
  const groundColor = photo.rgb.pow(vec3(2.2)).mul(mix(float(1), grain, grainShare));
  const hazed = (color: Node<"vec3">) => mix(color, colorOf("sky"), float(1).sub(exp(toCamera.div(HAZE_M).pow(2).negate())));

  const paintedRoads = smoothstep(float(PAINTED_ROADS_FROM_M), float(PAINTED_ROADS_FULL_M), toCamera);
  const roadEdge = (coverage: Node<"float">) => smoothstep(float(0.08), float(0.35), coverage).mul(paintedRoads);
  const land = mix(mix(groundColor, colorOf("road-main"), roadEdge(mask.g)), colorOf("road-minor"), roadEdge(mask.b)).mul(light);
  const terrainColor = hazed(select(inMap, mix(colorOf("water"), land, photo.a), colorOf("water")));

  /** A tree's height at a place anywhere, off the image of whichever tile holds it, at a level of its mips. */
  const canopyAt = (place: Node<"vec2">, mip: number) => {
    const inTiles = place.div(tileM);
    const tile = inTiles.floor();
    const spot = tile.sub(vec2(layers.mapColumn, layers.mapRow));
    const within = all(greaterThanEqual(spot, vec2(0, 0))).and(all(lessThan(spot, vec2(layers.mapColumns, layers.mapRows))));
    const row = textureLoad(layers.slots, ivec2(spot.clamp(vec2(0, 0), vec2(layers.mapColumns - 1, layers.mapRows - 1))));
    const layer = int(row.r.mul(255).round().sub(1).max(0));
    const units = texture(layers.canopy, inTiles.sub(tile)).depth(layer).level(float(mip)).r.mul(255);
    return select(within, units.mul(manifest.canopy.unitM), float(0));
  };
  const cameraSpot = uniform(new Vector2());
  const clipmap = createClipmap(scene, world, manifest.heights.stepM, terrainColor, (place, level) => {
    if (level < 1) return float(0);
    return canopyAt(place, level).mul(smoothstep(float(CANOPY_RISE_FROM_M), float(CANOPY_RISE_FULL_M), place.sub(cameraSpot).length()));
  });
  const forest = createForest(scene, {
    canopyAt: (place) => canopyAt(place, 0),
    groundNear: (place) => clipmap.groundAt(FOREST_NEAR_RING, place),
    groundFar: (place) => clipmap.groundAt(FOREST_FAR_RING, place),
    colour: colorOf,
    hazed,
    sun: manifest.sun,
  });

  // Open water out to the sky, under everything the terrain doesn't reach.
  const seaGeometry = new PlaneGeometry(2 * CAMERA_FAR, 2 * CAMERA_FAR);
  seaGeometry.rotateX(-Math.PI / 2);
  const seaMaterial = new MeshBasicNodeMaterial();
  seaMaterial.colorNode = hazed(colorOf("water"));
  const sea = new Mesh(seaGeometry, seaMaterial);
  sea.position.y = SEA_BELOW_LAND_M;
  scene.add(sea);

  const tierColor = (name: RoadTier) => colorOf(`road-${name}`);
  const tier = attribute<"float">("tier", "float");
  const across = attribute<"float">("across", "float").abs();
  const along = attribute<"float">("along", "float");
  const isMain = float(1).sub(smoothstep(float(0.4), float(0.6), tier));
  const carriageway = mix(tierColor(ROAD_TIERS[1]), tierColor(ROAD_TIERS[2]), smoothstep(float(1.4), float(1.6), tier));
  const surfaceColor = mix(carriageway, tierColor(ROAD_TIERS[0]), isMain);
  // A painted line fades instead of sparkling once it's narrower than a pixel.
  const lineMask = (distance: Node<"float">, width: number) => {
    const blur = fwidth(distance).max(0.0001);
    const edge = float(1).sub(smoothstep(float(width).sub(blur), float(width).add(blur), distance));
    return edge.mul(float(width).div(blur).min(1));
  };
  const edgeLine = lineMask(across.sub(LINE_INSET).abs(), LINE_WIDTH);
  // Centred on every whole dash, so the pattern reads the same from both tiles at a seam, whichever way their chains run.
  const fromDash = fract(along.div(DASH_LENGTH_M).add(0.5)).sub(0.5).abs();
  const dash = float(1).sub(smoothstep(float(DASH_SHARE / 2 - 0.005), float(DASH_SHARE / 2 + 0.005), fromDash));
  const centreLine = lineMask(across, CENTRE_LINE_WIDTH).mul(dash);
  const painted = mix(surfaceColor, colorOf("road-paint"), edgeLine.add(centreLine).min(1).mul(isMain));
  const onShoulder = smoothstep(float(1), float(1.08), across);
  const shoulderColor = mix(colorOf("road-shoulder"), groundColor, smoothstep(float(1.05), float(1.6), across));
  const roadMaterial = new MeshBasicNodeMaterial();
  roadMaterial.colorNode = hazed(mix(painted, shoulderColor, onShoulder).mul(light));

  const linear = (name: string) => {
    const { r, g, b } = token(name);
    return new Vector3(r, g, b);
  };
  const wallMaterial = buildingMaterial({ colour: colorOf, linear, hazed }, manifest.sun);
  const buildings = new Map<string, ReturnType<typeof buildingMeshes>>();
  const ribbons = new Map<string, ReturnType<typeof ribbonMeshes>>();
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
      place({ detail, shade: mips, ground, buildings: cells }, done) {
        const meshes = ribbonMeshes(detail, roadMaterial);
        scene.add(meshes.group);
        ribbons.set(detail.name, meshes);
        const solids = buildingMeshes(cells, wallMaterial);
        scene.add(solids.group);
        buildings.set(detail.name, solids);
        layers.placeNear(world.named(detail.name), mips, ground, manifest, done);
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
        layers.releaseNear(world.named(detail.name));
      },
    },
    fail,
  );

  // The far data for every tile comes first, and detail under the car, then the drive begins. From here on the frame loop
  // does the uploads, but it hasn't started yet: this first lot goes up here.
  const loaded = Promise.all([
    ...manifest.tiles.map(async ({ name }) => {
      const far = await fetcher.far(name);
      stream.addBytes(far.bytes);
      world.addFar(name, far.grid);
      await new Promise<void>((resolve) => {
        layers.placeFar(world.named(name), far, manifest, resolve);
      });
    }),
    stream.load(manifest.start.tile),
  ]);
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
  scene.add(new Mesh(edgeGeometry, edgeMaterial));

  const drive = new Drive(world, startLine(manifest.start.chain).at(START_ALONG_M));

  const carView = createCarView(scene, manifest.sun);

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
  let lastCarView: CarView = "chase";
  const setCamera = (mode: CameraMode) => {
    if (mode === cameraMode) return;
    if (mode === "free") {
      freeCamera.enter();
      camera.fov = CAMERA_FIELD_OF_VIEW;
      camera.updateProjectionMatrix();
    } else {
      freeCamera.leave();
      lastCarView = mode;
    }
    cameraMode = mode;
    events.onCamera(mode);
  };

  const onAction = (action: GameAction) => {
    if (action === "respawn") drive.respawn();
    if (action === "view" && cameraMode !== "free") setCamera(cameraMode === "chase" ? "hood" : "chase");
    if (action === "freeCamera") setCamera(cameraMode === "free" ? lastCarView : "free");
  };
  const controls = startControls({ onAction, onInputKind: events.onInputKind });

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

  const showRibbons = () => {
    const { x, z } = camera.position;
    const reach = RIBBON_REACH_M + RIBBON_CELL_M / Math.SQRT2;
    for (const { cells } of ribbons.values()) {
      for (const cell of cells) cell.mesh.visible = Math.hypot(cell.x - x, cell.z - z) < reach;
    }
    const buildingReach = BUILDINGS_REACH_M + RIBBON_CELL_M / Math.SQRT2;
    for (const { cells } of buildings.values()) {
      for (const cell of cells) cell.mesh.visible = Math.hypot(cell.x - x, cell.z - z) < buildingReach;
    }
  };

  const nextInput = (): DriveInput => {
    if (autopilot) return autopilot.input(drive.stateAt(1));
    return cameraMode === "free" ? NO_INPUT : controls.read();
  };

  const frame = (now: number) => {
    // A page with no room for the canvas (a hidden tab or pane) has nothing to draw into.
    if (container.clientWidth === 0 || container.clientHeight === 0) return;
    const seconds = Math.min(lastFrame === null ? 0 : (now - lastFrame) / 1000, LONGEST_FRAME_S);
    lastFrame = now;
    let share = 1;
    if (!held) {
      owedSeconds += seconds;
      const steps = Math.min(Math.floor(owedSeconds / STEP_S), MOST_STEPS_A_FRAME);
      for (let step = 0; step < steps; step++) drive.step(nextInput());
      owedSeconds = Math.min(owedSeconds - steps * STEP_S, STEP_S);
      share = owedSeconds / STEP_S;
    }
    const car = drive.stateAt(share);
    carView.draw(car);
    if (cameraMode === "free") freeCamera.update(now);
    else chaseCamera.update(car, cameraMode, held ? STEP_S * 4 : seconds);
    const speed = speedOf(car);
    events.onHud({ speedKmh: speed * 3.6, speedShare: Math.min(speed / TOP_SPEED_SHARE_MS, 1) });
    const focus = loadingAround ?? (cameraMode === "free" ? { x: camera.position.x, z: camera.position.z } : { x: car.position[0], z: car.position[2] });
    stream.update(focus.x, focus.z);
    layers.uploadStep();
    clipmap.update(camera.position);
    cameraSpot.value.set(camera.position.x, camera.position.z);
    forest.update(camera.position);
    showRibbons();
    renderer.render(scene, camera);
    frames++;
    if (!resolving) {
      resolving = true;
      void renderer.resolveTimestampsAsync(TimestampQuery.RENDER).then((ms) => {
        if (ms !== undefined && ms > 0) gpuMs = ms;
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
        triangles: renderer.info.render.triangles,
        gpuMs,
        width: renderer.domElement.width,
        height: renderer.domElement.height,
      }),
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
        drive.placeAt(line.at(0));
        drive.log = emptyLog();
        autopilot = new Autopilot(line, cruiseMS, 0);
      },
    },
    attribution: manifest.attribution,
    dispose() {
      void renderer.setAnimationLoop(null);
      observer.disconnect();
      freeCamera.dispose();
      controls.dispose();
      carView.dispose();
      drive.dispose();
      stream.dispose();
      fetcher.dispose();
      forest.dispose();
      clipmap.dispose();
      for (const { cells } of buildings.values()) {
        for (const { mesh } of cells) mesh.geometry.dispose();
      }
      wallMaterial.dispose();
      grainTexture.dispose();
      for (const { cells } of ribbons.values()) {
        for (const { mesh } of cells) mesh.geometry.dispose();
      }
      seaGeometry.dispose();
      edgeGeometry.dispose();
      edgeMaterial.dispose();
      seaMaterial.dispose();
      roadMaterial.dispose();
      layers.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
