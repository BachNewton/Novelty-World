import { Color, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { cameraPosition, exp, float, mix, positionWorld, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { buildingMaterial, buildingMeshes } from "../../render/buildings";
import { LANDMARKS } from "./index";
import { placed, triangles } from "./landmark";

/*
 * The page `gallery.mjs` opens: the game's renderer, camera, haze and building material on a plain stage of ground and
 * water, so a landmark is judged by what will really draw it. It needs no tiles.
 */

const SUN = { azimuthDeg: 215, elevationDeg: 30 };
const HAZE_M = 16000;
const FIELD_OF_VIEW = 60;
const ORIGIN = { east: 110000, north: 6690000 };

const token = (name: string) => themeColor(`--color-aland-drive-${name}`);
const colour = (name: string) => {
  const { r, g, b } = token(name);
  return vec3(r, g, b);
};

export interface GalleryView {
  id: string;
  version: "near" | "far";
  /** Where the camera stands, in metres from the model's origin: east, north, height above sea level. */
  from: readonly [number, number, number];
  /** Where it looks, likewise. */
  at: readonly [number, number, number];
  /** Height of the plain ground, above sea level; the sea stays at its own. */
  groundM?: number;
  /** Width, in metres east and north of the origin, of a ground slab; without it the ground is everywhere. */
  slab?: readonly [number, number, number, number];
}

const SEA_M = 0.1;

async function start() {
  const canvas = document.querySelector("canvas");
  if (!canvas) throw new Error("gallery: no canvas");
  const renderer = new WebGPURenderer({ canvas, antialias: true, reversedDepthBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  await renderer.init();
  if (!("isWebGPUBackend" in renderer.backend)) throw new Error("gallery: not WebGPU");

  const scene = new Scene();
  scene.background = new Color(token("sky"));
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, window.innerWidth / window.innerHeight, 0.25, 40000);

  const toCamera = positionWorld.sub(cameraPosition).length();
  const hazed = (color: Node<"vec3">) => mix(color, colour("sky"), float(1).sub(exp(toCamera.div(HAZE_M).pow(2).negate())));
  const linear = (name: string) => {
    const { r, g, b } = token(name);
    return new Vector3(r, g, b);
  };
  const material = buildingMaterial({ colour, linear, hazed }, SUN);

  const plane = (name: string) => {
    const surface = new MeshBasicNodeMaterial();
    surface.colorNode = hazed(colour(name));
    const geometry = new PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new Mesh(geometry, surface);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };
  const water = plane("water");
  const ground = plane("ground");

  const shown = new Map<string, Mesh>();
  const meshOf = (id: string, version: "near" | "far") => {
    const key = `${id}:${version}`;
    const kept = shown.get(key);
    if (kept) return kept;
    const landmark = LANDMARKS().find((candidate) => candidate.id === id);
    if (!landmark) throw new Error(`gallery: no landmark ${id}`);
    const cell = placed(landmark, landmark[version], ORIGIN);
    const { group, cells } = buildingMeshes([cell], material);
    scene.add(group);
    shown.set(key, cells[0].mesh);
    return cells[0].mesh;
  };

  let frames = 0;
  void renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
    frames++;
  });

  return {
    frames: () => frames,
    counts: () =>
      LANDMARKS().map((landmark) => ({
        id: landmark.id,
        near: triangles(landmark.near),
        far: triangles(landmark.far),
        east: landmark.east,
        north: landmark.north,
        baseM: landmark.baseM,
      })),
    show(view: GalleryView) {
      for (const mesh of shown.values()) mesh.visible = false;
      const mesh = meshOf(view.id, view.version);
      mesh.visible = true;
      const landmark = LANDMARKS().find((candidate) => candidate.id === view.id);
      if (!landmark) throw new Error(`gallery: no landmark ${view.id}`);
      const scene3 = (east: number, height: number, north: number) => new Vector3(landmark.east - ORIGIN.east + east, height, ORIGIN.north - landmark.north - north);
      camera.position.copy(scene3(view.from[0], view.from[2], view.from[1]));
      camera.lookAt(scene3(view.at[0], view.at[2], view.at[1]));
      camera.updateMatrixWorld();
      water.position.copy(scene3(0, SEA_M, 0));
      water.scale.set(60000, 1, 60000);
      const [west, south, east, north] = view.slab ?? [-30000, -30000, 30000, 30000];
      ground.visible = view.groundM !== undefined;
      ground.position.copy(scene3((west + east) / 2, view.groundM ?? 0, (south + north) / 2));
      ground.scale.set(east - west, 1, north - south);
    },
  };
}

declare global {
  interface Window {
    __landmarkGallery?: Awaited<ReturnType<typeof start>>;
    __landmarkGalleryError?: string;
  }
}

start().then(
  (gallery) => {
    window.__landmarkGallery = gallery;
  },
  (error: unknown) => {
    window.__landmarkGalleryError = String(error);
  },
);
