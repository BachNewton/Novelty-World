import { BufferAttribute, BufferGeometry, LinearMipmapLinearFilter, Mesh, MeshBasicNodeMaterial, NoColorSpace, PerspectiveCamera, PlaneGeometry, Scene, Texture, WebGPURenderer } from "three/webgpu";
import { attribute, float, positionWorld, select, texture, vec2, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { startFreeCamera, type View } from "./free-camera";
import { buildRibbons, ROAD_TIERS, type RoadTier } from "./roads";
import { loadTile, patchIndices, surfaceHeight, type HeightGrid } from "./tile";

/*
 * Åland Drive drawn on WebGPU, with no framework between the game and
 * three.js: one renderer, one scene, one loop. The world is one real tile of
 * the island: its terrain lit by shading baked ahead of time, with its roads
 * laid on top, seen from a free camera.
 */

/** A camera place in ETRS-TM35FIN metres, with its height above the ground. */
export interface Place {
  east: number;
  north: number;
  height: number;
  yaw: number;
  pitch: number;
}

/** A control surface for tests and tools: everything here waits on events, never time. */
export interface GameProbe {
  /** Frames drawn so far. */
  frames: () => number;
  look: (at: Place) => void;
  /** What the last frame cost, counted. */
  counts: () => { webGpu: boolean; drawCalls: number; triangles: number };
}

export interface Game {
  probe: GameProbe;
  attribution: string[];
  dispose: () => void;
}

// Tiles are served from the app itself until streaming needs a base address of its own.
const TILE_URL = "/aland-drive/tiles/L2343C";
const CAMERA_FIELD_OF_VIEW = 60;
const CAMERA_NEAR = 0.5;
const CAMERA_FAR = 40000;
const START_VIEW = { east: 100000, north: 6692800, height: 140, yaw: -0.45, pitch: -0.3 };
const CHUNK_CELLS = 150;
const ANISOTROPY = 8;
const SEA_BELOW_TILE_M = -1;

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

export async function startGame(container: HTMLElement): Promise<Game> {
  const { manifest, grid, roads, shade, water } = await loadTile(TILE_URL);

  const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true });
  await renderer.init();
  renderer.setClearColor(token("sky"));
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

  const ribbons = buildRibbons(roads, grid);
  const roadGeometry = new BufferGeometry();
  roadGeometry.setAttribute("position", new BufferAttribute(ribbons.positions, 3));
  roadGeometry.setAttribute("tier", new BufferAttribute(ribbons.tiers, 1));
  roadGeometry.setIndex(new BufferAttribute(ribbons.indices, 1));
  const tierColor = (tier: RoadTier) => colorOf(`road-${tier}`);
  const tier = attribute<"float">("tier");
  const roadMaterial = new MeshBasicNodeMaterial();
  roadMaterial.colorNode = select(tier.lessThan(0.5), tierColor(ROAD_TIERS[0]), select(tier.lessThan(1.5), tierColor(ROAD_TIERS[1]), tierColor(ROAD_TIERS[2]))).mul(light);
  const roadMesh = new Mesh(roadGeometry, roadMaterial);
  roadMesh.frustumCulled = false;
  scene.add(roadMesh);

  const { worldOrigin } = manifest;
  const toView = (at: Place): View => {
    const east = at.east - worldOrigin.east;
    const north = at.north - worldOrigin.north;
    return { x: east, y: surfaceHeight(grid, east, north) + at.height, z: -north, yaw: at.yaw, pitch: at.pitch };
  };
  const freeCamera = startFreeCamera(camera, renderer.domElement, toView(START_VIEW));

  const resize = () => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / Math.max(1, clientHeight);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  let frames = 0;
  const frame = (now: number) => {
    // A page with no room for the canvas (a hidden tab or pane) has nothing to draw into.
    if (container.clientWidth === 0 || container.clientHeight === 0) return;
    freeCamera.update(now);
    renderer.render(scene, camera);
    frames++;
  };
  await renderer.setAnimationLoop(frame);

  return {
    probe: {
      frames: () => frames,
      look: (at) => {
        freeCamera.set(toView(at));
      },
      counts: () => ({ webGpu: "isWebGPUBackend" in renderer.backend, drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles }),
    },
    attribution: manifest.attribution,
    dispose() {
      void renderer.setAnimationLoop(null);
      observer.disconnect();
      freeCamera.dispose();
      chunks.forEach((geometry) => {
        geometry.dispose();
      });
      roadGeometry.dispose();
      seaGeometry.dispose();
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
