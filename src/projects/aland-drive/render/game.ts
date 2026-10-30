import { BufferAttribute, BufferGeometry, Color, LinearMipmapLinearFilter, Mesh, MeshBasicNodeMaterial, NoColorSpace, PerspectiveCamera, PlaneGeometry, Scene, Texture, TimestampQuery, WebGPURenderer, type Node } from "three/webgpu";
import { attribute, float, fract, fwidth, mix, positionWorld, select, smoothstep, texture, vec2, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { startFreeCamera, type View } from "./free-camera";
import { ROAD_TIERS, loadTile, patchIndices, surfaceHeight, type HeightGrid, type RoadTier } from "./tile";
import { startChaseCamera, type CarView } from "./chase-camera";
import { createCarView } from "./car";
import { startControls, type GameAction } from "../input/controls";
import { Autopilot } from "../sim/autopilot";
import { NO_INPUT, type DriveInput } from "../sim/car";
import { speedOf, type CarState } from "../sim/car-state";
import { Drive, initPhysics, type DriveLog } from "../sim/drive";
import { STEP_S } from "../sim/tuning";
import type { InputKind } from "@/shared/lib/input";

/*
 * Åland Drive drawn on WebGPU, with no framework between the game and
 * three.js: one renderer, one scene, one loop. The world is one real tile of
 * the island: its terrain lit by shading baked ahead of time, and its road
 * surface, which is also what the car drives on (`sim/`). The simulation steps
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
  /** Starts the scripted driver along a chain, from a distance along it, resetting the log. */
  startRoute: (chain: number, cruiseMS: number, from: number) => void;
  routeFinished: () => boolean;
  /** Puts the car at a distance along a chain, facing along it. */
  placeOnRoad: (chain: number, along: number) => void;
  setCamera: (mode: CameraMode) => void;
}

export interface HudReading {
  speedKmh: number;
  /** 0 at rest to 1 at top speed. */
  speedShare: number;
}

export interface GameEvents {
  onHud: (reading: HudReading) => void;
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

// Tiles are served from the app itself until streaming needs a base address of its own.
const TILE_URL = "/aland-drive/tiles/L2343C";
const CAMERA_FIELD_OF_VIEW = 60;
const CAMERA_NEAR = 0.25;
const CAMERA_FAR = 40000;
const CHUNK_CELLS = 150;
const ANISOTROPY = 8;
const SEA_BELOW_TILE_M = -1;
/** The 3D world is drawn at this share of the screen's pixels each way, and stretched to fit. The page's UI stays sharp. */
const RENDER_SCALE = 0.7;
const LONGEST_FRAME_S = 0.1;
/** Too many steps owed in one go means the tab was away: drop them rather than catch up. */
const MOST_STEPS_A_FRAME = 12;
const TOP_SPEED_SHARE_MS = 55.6;
const EDGE_WALL_HEIGHT_M = 2.5;
const DASH_LENGTH_M = 12;
const DASH_SHARE = 0.34;
const LINE_INSET = 0.93;
const LINE_WIDTH = 0.035;
const CENTRE_LINE_WIDTH = 0.018;

const token = (name: string) => themeColor(`--color-aland-drive-${name}`);
const colorOf = (name: string) => {
  const { r, g, b } = token(name);
  return vec3(r, g, b);
};

function terrainChunks(grid: HeightGrid) {
  const index = new BufferAttribute(patchIndices(CHUNK_CELLS), 1);
  const across = CHUNK_CELLS + 1;
  const chunks: BufferGeometry[] = [];
  for (let top = 0; top < grid.nodes - 1; top += CHUNK_CELLS) {
    for (let left = 0; left < grid.nodes - 1; left += CHUNK_CELLS) {
      const positions = new Float32Array(across * across * 3);
      for (let row = 0; row < across; row++) {
        for (let column = 0; column < across; column++) {
          const at = (row * across + column) * 3;
          positions[at] = grid.west + (left + column) * grid.stepM;
          positions[at + 1] = grid.heights[(top + row) * grid.nodes + left + column];
          positions[at + 2] = -(grid.north - (top + row) * grid.stepM);
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      geometry.setIndex(index);
      chunks.push(geometry);
    }
  }
  return chunks;
}

/** A low band round the tile's edge, so the end of the world reads as a barrier and not a mistake. */
function edgeBand(bounds: { west: number; south: number; east: number; north: number }, grid: HeightGrid) {
  const corners = [
    [bounds.west, bounds.north],
    [bounds.east, bounds.north],
    [bounds.east, bounds.south],
    [bounds.west, bounds.south],
    [bounds.west, bounds.north],
  ];
  const stepsPerSide = (grid.nodes - 1) / CHUNK_CELLS;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let side = 0; side < 4; side++) {
    for (let step = 0; step <= stepsPerSide * 3; step++) {
      const share = step / (stepsPerSide * 3);
      const east = corners[side][0] + share * (corners[side + 1][0] - corners[side][0]);
      const north = corners[side][1] + share * (corners[side + 1][1] - corners[side][1]);
      const ground = surfaceHeight(grid, east, north);
      const first = positions.length / 3;
      positions.push(east, ground, -north, east, ground + EDGE_WALL_HEIGHT_M, -north);
      if (step > 0) indices.push(first - 2, first, first - 1, first - 1, first, first + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setIndex(indices);
  return geometry;
}

function bitmapTexture(image: ImageBitmap, anisotropy: number): Texture {
  const result = new Texture(image);
  result.colorSpace = NoColorSpace;
  result.flipY = false;
  result.generateMipmaps = true;
  result.minFilter = LinearMipmapLinearFilter;
  result.anisotropy = anisotropy;
  result.needsUpdate = true;
  return result;
}

export async function startGame(container: HTMLElement, events: GameEvents): Promise<Game> {
  const [tile] = await Promise.all([loadTile(TILE_URL), initPhysics()]);
  const { manifest, grid, shade, water } = tile;

  const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true, trackTimestamp: true });
  await renderer.init();
  if (!("isWebGPUBackend" in renderer.backend)) {
    renderer.dispose();
    shade.close();
    water.close();
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

  const { bounds } = manifest;
  const shadeTexture = bitmapTexture(shade, ANISOTROPY);
  const waterTexture = bitmapTexture(water, 1);
  const size = float(bounds.east - bounds.west);
  // The images run from the tile's north-west corner, and the scene's -z is north.
  const imageUv = vec2(positionWorld.x.sub(bounds.west), positionWorld.z.add(bounds.north)).div(size);
  const light = texture(shadeTexture, imageUv).r.pow(float(manifest.shade.gamma));

  const terrainMaterial = new MeshBasicNodeMaterial();
  const isWater = texture(waterTexture, imageUv).r.greaterThan(0.5);
  terrainMaterial.colorNode = select(isWater, colorOf("water"), colorOf("ground").mul(light));

  const chunks = terrainChunks(grid);
  scene.add(...chunks.map((geometry) => new Mesh(geometry, terrainMaterial)));

  // Open water beyond the one tile there is, so its edge doesn't hang in the sky.
  const seaGeometry = new PlaneGeometry(2 * CAMERA_FAR, 2 * CAMERA_FAR);
  seaGeometry.rotateX(-Math.PI / 2);
  const seaMaterial = new MeshBasicNodeMaterial({ color: token("water") });
  const sea = new Mesh(seaGeometry, seaMaterial);
  sea.position.y = SEA_BELOW_TILE_M;
  scene.add(sea);

  const edgeGeometry = edgeBand(bounds, grid);
  const edgeMaterial = new MeshBasicNodeMaterial({ color: token("edge"), side: 2 });
  scene.add(new Mesh(edgeGeometry, edgeMaterial));

  const drive = new Drive(tile);
  const { ribbon } = drive;
  const roadGeometry = new BufferGeometry();
  roadGeometry.setAttribute("position", new BufferAttribute(ribbon.positions, 3));
  roadGeometry.setAttribute("across", new BufferAttribute(ribbon.across, 1));
  roadGeometry.setAttribute("along", new BufferAttribute(ribbon.along, 1));
  roadGeometry.setAttribute("tier", new BufferAttribute(ribbon.tiers, 1));
  roadGeometry.setIndex(new BufferAttribute(ribbon.indices, 1));
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
  const dash = float(1).sub(smoothstep(float(DASH_SHARE - 0.01), float(DASH_SHARE + 0.01), fract(along.div(DASH_LENGTH_M))));
  const centreLine = lineMask(across, CENTRE_LINE_WIDTH).mul(dash);
  const painted = mix(surfaceColor, colorOf("road-paint"), edgeLine.add(centreLine).min(1).mul(isMain));
  const onShoulder = smoothstep(float(1), float(1.08), across);
  const shoulderColor = mix(colorOf("road-shoulder"), colorOf("ground"), smoothstep(float(1.05), float(1.95), across));
  const roadMaterial = new MeshBasicNodeMaterial();
  roadMaterial.colorNode = mix(painted, shoulderColor, onShoulder).mul(light);
  const roadMesh = new Mesh(roadGeometry, roadMaterial);
  roadMesh.frustumCulled = false;
  scene.add(roadMesh);

  const carView = createCarView(scene, manifest.sun);

  const { worldOrigin } = manifest;
  const groundAt = (x: number, z: number) => surfaceHeight(grid, x, -z);
  const toView = (at: Place): View => {
    const east = at.east - worldOrigin.east;
    const north = at.north - worldOrigin.north;
    return { x: east, y: surfaceHeight(grid, east, north) + at.height, z: -north, yaw: at.yaw, pitch: at.pitch };
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
        drive.placeAt(drive.net.at(chain, from));
        drive.log = { ...drive.log, steps: 0, metres: 0, topSpeedMS: 0, contactLosses: 0, airborneSteps: 0, worstJoltG: 0, furthestOffRoadM: 0, respawns: 0 };
        autopilot = new Autopilot(drive.net, chain, cruiseMS, from);
      },
      routeFinished: () => autopilot?.finished() ?? false,
      placeOnRoad: (chain, at) => {
        drive.placeAt(drive.net.at(chain, at));
      },
      setCamera,
    },
    attribution: manifest.attribution,
    dispose() {
      void renderer.setAnimationLoop(null);
      observer.disconnect();
      freeCamera.dispose();
      controls.dispose();
      carView.dispose();
      drive.dispose();
      chunks.forEach((geometry) => {
        geometry.dispose();
      });
      roadGeometry.dispose();
      seaGeometry.dispose();
      edgeGeometry.dispose();
      edgeMaterial.dispose();
      seaMaterial.dispose();
      terrainMaterial.dispose();
      roadMaterial.dispose();
      shadeTexture.dispose();
      waterTexture.dispose();
      shade.close();
      water.close();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}


