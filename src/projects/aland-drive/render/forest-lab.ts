import { Color, PerspectiveCamera, Scene, TimestampQuery, Vector2, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { abs, float, fwidth, greaterThanEqual, int, ivec2, lessThan, mix, positionWorld, select, smoothstep, texture, textureLoad, uniform, vec2, vec3 } from "three/tsl";
import { createClipmap } from "./clipmap";
import { createForest, FOREST_BANDS, type Forest, type ForestModel } from "./forest";
import { startFreeCamera } from "./free-camera";
import { CAMERA_FIELD_OF_VIEW, CAMERA_NEAR, colorOf, NoWebGpuError, RENDER_SCALE, token } from "./game";
import { TileFetcher, TileStream } from "./stream";
import type { WorldManifest } from "./tile";
import { tileBase } from "./tile-address";
import { TileLayers } from "./tile-layers";
import { canopyLift, forestGround, tileReads } from "./tile-reads";
import { NEAR_STEP_M, readImage, ROAD_COVERAGE, ROAD_MASK_MIP, roadLevel, SHORTEST_M, treeHeight, treePlace } from "./tree-place";
import { World } from "../sim/world";

/*
 * The forest on its own, to watch how its detail works (`?forest-lab`): the game's
 * own forest and terrain on real tiles, with nothing else in the scene. What the
 * forest's detail is measured from, the LOD spot, can be pinned away from the
 * camera, so the camera can stay close to one tree while the tree goes through
 * everything a drive does to it, and a change in the picture is the forest's and
 * never the view's. The same split lets the camera rise and look down on the bands.
 */

export type ForestLabView = "game" | "models" | "thinned" | "slide";

const VIEWS: ForestLabView[] = ["game", "models", "thinned", "slide"];
const CAMERA_FAR = 40000;
const START_HEIGHT_M = 2;
const SLIDE_FULL_M = 2;
const BAND_LINE_M = 1.5;
const APPROACH_FROM_M = 620;
const APPROACH_M_S = 25;
const LONGEST_FRAME_S = 0.1;
/** How far round the camera the search for the worst trees looks, and how close to one it stands. */
const SEARCH_M = 450;
const SEARCH_KEEP = 40;
const STAND_OFF_M = 26;

export interface FocusedTree {
  x: number;
  z: number;
  height: number;
  /** Where a tree's base is read at middle distance and at far distance, against the ground under it, in metres. */
  slide: number;
  rank: number;
  of: number;
}

export interface ForestLabState {
  frames: number;
  triangles: number;
  drawCalls: number;
  gpuMs: number | null;
  loading: number;
  /** How far the tree in focus, or the camera, is from the LOD spot. */
  distance: number;
  focus: FocusedTree | null;
}

export interface ForestLab {
  setView: (view: ForestLabView) => void;
  showModel: (model: ForestModel, shown: boolean) => void;
  showBands: (shown: boolean) => void;
  /** Pins the LOD spot this far behind the focus, or lets it go back to the camera with null. */
  pin: (metres: number | null) => void;
  /** Runs a pinned distance down to nothing and round again, at a car's speed. */
  approach: (running: boolean) => void;
  /** Reads the ground at the nearest node, as the game used to, or blended as it does, and rebuilds the forest to match. */
  useOldGround: (old: boolean) => void;
  nextWorstTree: () => void;
  state: () => ForestLabState;
  dispose: () => void;
}

export async function startForestLab(container: HTMLElement, onFailure: (error: Error) => void): Promise<ForestLab> {
  const base = tileBase(window.location.search);
  const response = await fetch(`${base}/world.json`);
  if (!response.ok) throw new Error(`${base}/world.json: ${response.status}`);
  const manifest = (await response.json()) as WorldManifest;

  const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true, trackTimestamp: true });
  await renderer.init();
  if (!("isWebGPUBackend" in renderer.backend)) {
    renderer.dispose();
    throw new NoWebGpuError();
  }
  renderer.setClearColor(new Color(token("sky")));
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
  const overview = await fetcher.overview();
  world.addOverview(overview.heights);

  const { tileM } = manifest;
  const viewShown = uniform(0);
  const bandsShown = uniform(1);
  const lodSpot = uniform(new Vector2());

  // The land only has to show where a tree stands: the far photo, with the bands marked on it.
  const worldUv = positionWorld.xz.div(tileM);
  const pixelTile = worldUv.floor();
  const mapPlace = pixelTile.sub(vec2(layers.mapColumn, layers.mapRow));
  const slots = textureLoad(layers.slots, ivec2(mapPlace.clamp(vec2(0, 0), vec2(layers.mapColumns - 1, layers.mapRows - 1))));
  const photo = texture(layers.groundFar, worldUv.sub(pixelTile)).depth(int(slots.r.mul(255).round().sub(1).max(0)));
  const land = select(slots.r.greaterThan(0.001), photo.rgb.pow(vec3(2.2)), colorOf("ground"));
  const fromSpot = positionWorld.xz.sub(lodSpot).length();
  const line = (distance: number) => float(1).sub(smoothstep(float(BAND_LINE_M), float(BAND_LINE_M).add(fwidth(fromSpot)), abs(fromSpot.sub(distance))));
  const inBand = (from: number, to: number) => greaterThanEqual(fromSpot, float(from)).and(lessThan(fromSpot, float(to)));
  const bandColours = ["lab-turned", "lab-hot", "lab-outline", "lab-cone"];
  const marked = FOREST_BANDS.reduce<Node<"vec3">>((colour, [from, to], band) => {
    const ink = colorOf(bandColours[band]);
    const washed = mix(colour, ink, select(inBand(from, to), float(0.22), float(0)).mul(bandsShown));
    return mix(washed, ink, line(from).add(line(to)).clamp(0, 1).mul(bandsShown));
  }, land);

  const reads = tileReads(layers, tileM, manifest.canopy.unitM);
  const clipmap = createClipmap(scene, world, manifest.heights.stepM, marked, canopyLift(reads.canopyAt, lodSpot));

  const isView = (view: ForestLabView) => abs(viewShown.sub(VIEWS.indexOf(view))).lessThan(0.5);
  const modelColours: Record<ForestModel, string> = { turned: "lab-turned", outline: "lab-outline", cone: "lab-cone" };
  const hidden = new Set<ForestModel>();
  let oldGround = false;
  const buildForest = (): Forest => {
    const built = createForest(scene, {
      canopyAt: (place) => reads.canopyAt(place, 0),
      ...forestGround(clipmap, oldGround ? clipmap.groundAt : clipmap.groundBlendedAt),
      roads: { at: reads.roadsAt, tileM },
      colour: colorOf,
      hazed: (color) => color,
      sun: manifest.sun,
      paint: ({ model, natural, onFarGrid, groundGap }) => {
        const slid = mix(colorOf("lab-still"), colorOf("lab-hot"), groundGap.div(SLIDE_FULL_M).clamp(0, 1));
        const thinned = select(onFarGrid, colorOf("lab-still"), colorOf("lab-hot"));
        return select(isView("models"), colorOf(modelColours[model]), select(isView("thinned"), thinned, select(isView("slide"), slid, natural)));
      },
    });
    for (const model of hidden) built.show(model, false);
    return built;
  };
  let forest = buildForest();

  // The search below reads what the forest's shader reads, off the images as they arrive.
  const canopyOf = new Map<string, Uint8Array>();
  const roadsOf = new Map<string, Float32Array>();
  const stream = new TileStream(
    world,
    fetcher,
    {
      place({ detail, shade, ground }, done) {
        layers.placeNear(world.named(detail.name), shade, ground, manifest, done);
      },
      release(detail) {
        layers.releaseNear(world.named(detail.name));
      },
      placeFar(tile, done) {
        canopyOf.set(tile.name, tile.canopy[0].slice());
        roadsOf.set(tile.name, roadLevel(tile.mask[0], manifest.mask.pixels, 4));
        layers.placeFar(world.named(tile.name), tile, manifest, done);
      },
      releaseFar(tile) {
        canopyOf.delete(tile.name);
        roadsOf.delete(tile.name);
        layers.releaseFar(tile);
      },
    },
    onFailure,
  );

  const start = world.named(manifest.start.tile);
  const startX = (start.column + 0.5) * tileM;
  const startZ = (start.row + 0.5) * tileM;
  camera.position.set(startX, world.height(startX, startZ) + START_HEIGHT_M, startZ);
  const freeCamera = startFreeCamera(camera, renderer.domElement);
  freeCamera.enter();

  const resize = () => {
    const { clientWidth, clientHeight } = container;
    if (clientWidth === 0 || clientHeight === 0) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const nodeNear = (x: number, z: number, step: number) => world.node(Math.round(x / step) * (step / manifest.heights.stepM), Math.round(z / step) * (step / manifest.heights.stepM));

  /** The trees round the camera whose ground moves most between the middle distance and the far, as the forest's shader places them. */
  const worstTrees = (): FocusedTree[] => {
    const canopyTexelM = tileM / manifest.canopy.pixels;
    const roadTexelM = canopyTexelM * 2 ** ROAD_MASK_MIP;
    const found: FocusedTree[] = [];
    const { x: cx, z: cz } = camera.position;
    const reach = Math.ceil(SEARCH_M / NEAR_STEP_M);
    const [middleColumn, middleRow] = [Math.round(cx / NEAR_STEP_M), Math.round(cz / NEAR_STEP_M)];
    for (let row = middleRow - reach; row <= middleRow + reach; row++) {
      for (let column = middleColumn - reach; column <= middleColumn + reach; column++) {
        const [x, z] = treePlace(column, row);
        const [tileColumn, tileRow] = [Math.floor(x / tileM), Math.floor(z / tileM)];
        const tile = [...world.all()].find((entry) => entry.column === tileColumn && entry.row === tileRow);
        const canopy = tile && canopyOf.get(tile.name);
        const roads = tile && roadsOf.get(tile.name);
        if (!canopy || !roads) continue;
        const [localX, localZ] = [x - tileColumn * tileM, z - tileRow * tileM];
        const height = treeHeight(column, row, readImage(canopy, manifest.canopy.pixels, 1, 0, canopyTexelM, localX, localZ) * manifest.canopy.unitM);
        if (height < SHORTEST_M) continue;
        if (readImage(roads, manifest.mask.pixels >> ROAD_MASK_MIP, 1, 0, roadTexelM, localX, localZ) > ROAD_COVERAGE) continue;
        const slide = Math.abs(nodeNear(x, z, 8) - nodeNear(x, z, 16));
        found.push({ x, z, height, slide, rank: 0, of: 0 });
      }
    }
    const kept = found.sort((a, b) => b.slide - a.slide).slice(0, SEARCH_KEEP);
    return kept.map((tree, rank) => ({ ...tree, rank: rank + 1, of: kept.length }));
  };

  let worst: FocusedTree[] = [];
  let focus: FocusedTree | null = null;
  let pinned: number | null = null;
  let approaching = false;
  let frames = 0;
  let gpuMs: number | null = null;
  let resolving = false;
  let last: number | null = null;
  const spot = new Vector3();
  const ahead = new Vector3();

  const look = (tree: FocusedTree) => {
    focus = tree;
    const ground = world.height(tree.x, tree.z);
    const sideways = (tree.rank * 1.7) % (2 * Math.PI);
    const x = tree.x + Math.sin(sideways) * STAND_OFF_M;
    const z = tree.z + Math.cos(sideways) * STAND_OFF_M;
    const y = Math.max(world.height(x, z) + START_HEIGHT_M, ground + tree.height * 0.4);
    freeCamera.set({ x, y, z, yaw: sideways, pitch: Math.atan2(ground + tree.height * 0.4 - y, STAND_OFF_M) });
  };

  const frame = (now: number) => {
    if (container.clientWidth === 0 || container.clientHeight === 0) return;
    const seconds = Math.min(last === null ? 0 : (now - last) / 1000, LONGEST_FRAME_S);
    last = now;
    freeCamera.update(now);
    if (approaching && pinned !== null) {
      pinned -= APPROACH_M_S * seconds;
      if (pinned <= 0) pinned = APPROACH_FROM_M;
    }
    const pivotX = focus?.x ?? camera.position.x;
    const pivotZ = focus?.z ?? camera.position.z;
    if (pinned === null) spot.copy(camera.position);
    else {
      camera.getWorldDirection(ahead);
      ahead.setY(0).normalize();
      spot.set(pivotX - ahead.x * pinned, camera.position.y, pivotZ - ahead.z * pinned);
    }
    stream.update(camera.position.x, camera.position.z);
    layers.uploadStep();
    clipmap.update(spot);
    lodSpot.value.set(spot.x, spot.z);
    forest.update(spot);
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
    setView(view) {
      viewShown.value = VIEWS.indexOf(view);
    },
    showModel(model, shown) {
      if (shown) hidden.delete(model);
      else hidden.add(model);
      forest.show(model, shown);
    },
    showBands(shown) {
      bandsShown.value = shown ? 1 : 0;
    },
    pin(metres) {
      pinned = metres;
      if (metres === null) approaching = false;
    },
    approach(running) {
      approaching = running;
      if (running && pinned === null) pinned = APPROACH_FROM_M;
    },
    useOldGround(next) {
      if (next === oldGround) return;
      oldGround = next;
      forest.dispose();
      forest = buildForest();
    },
    nextWorstTree() {
      if (!focus || worst.length === 0 || focus.rank === worst.length) worst = worstTrees();
      const next = worst.at(focus && focus.rank < worst.length ? focus.rank : 0);
      if (next) look(next);
    },
    state() {
      const { render } = renderer.info;
      return {
        frames,
        triangles: render.triangles,
        drawCalls: render.drawCalls,
        gpuMs,
        loading: stream.stats().loading + stream.wanted(camera.position.x, camera.position.z),
        distance: Math.hypot((focus?.x ?? camera.position.x) - spot.x, (focus?.z ?? camera.position.z) - spot.z),
        focus,
      };
    },
    dispose() {
      void renderer.setAnimationLoop(null);
      observer.disconnect();
      freeCamera.dispose();
      stream.dispose();
      fetcher.dispose();
      forest.dispose();
      clipmap.dispose();
      layers.dispose();
      (renderer.domElement.parentElement ?? container).removeChild(renderer.domElement);
      renderer.dispose();
    },
  };
}
