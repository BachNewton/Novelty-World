import { BufferAttribute, BufferGeometry, Color, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, TimestampQuery, Vector3, WebGPURenderer, type Node } from "three/webgpu";
import { attribute, cameraPosition, dot, exp, float, max, mix, normalize, positionWorld, uniform, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { createSky, skyLooks, type SkyLook } from "./sky";

/*
 * The page `gallery.mjs` opens: the sky over a plain stage with the game's haze and colours, a road through low spruce and
 * pine on flat land, and the sea beyond, flat to the horizon so a line there can't hide. It needs no tiles.
 */

const HAZE_M = 16000;
const FIELD_OF_VIEW = 60;
const CAMERA_FAR = 130000;
const SKY_REACH = CAMERA_FAR * 0.9;
const TREE_SIDES = 5;
const TREES = 5200;
const SHORE_M = 2600;
const ROAD_HALF_M = 3.5;
const EYE_M = 1.9;

const token = (name: string) => themeColor(`--color-aland-drive-${name}`);
const colour = (name: string) => {
  const { r, g, b } = token(name);
  return vec3(r, g, b);
};

export interface GalleryView {
  look: "summer" | "goldenHour";
  cover?: number;
  sunElevationDeg?: number;
  /** Which way it looks, clockwise from north, and how far up, in degrees. */
  yawDeg: number;
  pitchDeg: number;
  /** The clouds' time, in seconds. */
  seconds: number;
  fieldOfView?: number;
  /** Lifted off the road, out over the sea. */
  atSea?: boolean;
  /** Draw nothing but the sky. */
  bare?: boolean;
}

/** Layered cones, flat-shaded, in the forest's colours: stands either side of the road. */
function forestGeometry() {
  const positions: number[] = [];
  const normals: number[] = [];
  const colours: number[] = [];
  const spruce = token("tree-spruce");
  const pine = token("tree-pine");
  const birch = token("tree-birch");
  let state = 17;
  const roll = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const triangle = (a: Vector3, b: Vector3, c: Vector3, shade: Color) => {
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    for (const point of [a, b, c]) {
      positions.push(point.x, point.y, point.z);
      normals.push(normal.x, normal.y, normal.z);
      colours.push(shade.r, shade.g, shade.b);
    }
  };
  const cone = (x: number, z: number, base: number, top: number, radius: number, shade: Color, turn: number) => {
    const tip = new Vector3(x, top, z);
    for (let side = 0; side < TREE_SIDES; side++) {
      const [from, to] = [turn + (side * Math.PI * 2) / TREE_SIDES, turn + ((side + 1) * Math.PI * 2) / TREE_SIDES];
      triangle(new Vector3(x + Math.cos(from) * radius, base, z + Math.sin(from) * radius), tip, new Vector3(x + Math.cos(to) * radius, base, z + Math.sin(to) * radius), shade);
    }
  };
  for (let tree = 0; tree < TREES; tree++) {
    const side = roll() < 0.5 ? -1 : 1;
    // Mostly close, thinning out over the fields.
    const off = 34 + roll() ** 1.6 * 900;
    const x = side * off;
    const z = 200 - roll() * 2600;
    const height = 10 + roll() * 11;
    const kind = roll();
    const shade = kind < 0.5 ? spruce : kind < 0.85 ? pine : birch;
    const turn = roll() * 6;
    const wide = height * 0.21;
    cone(x, z, height * 0.1, height * 0.62, wide, shade, turn);
    cone(x, z, height * 0.38, height * 0.84, wide * 0.72, shade, turn + 1);
    cone(x, z, height * 0.62, height * 1.02, wide * 0.46, shade, turn + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(Float32Array.from(normals), 3));
  geometry.setAttribute("tint", new BufferAttribute(Float32Array.from(colours), 3));
  return geometry;
}

async function start() {
  const canvas = document.querySelector("canvas");
  if (!canvas) throw new Error("gallery: no canvas");
  const renderer = new WebGPURenderer({ canvas, antialias: true, reversedDepthBuffer: true, trackTimestamp: true });
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  await renderer.init();
  if (!("isWebGPUBackend" in renderer.backend)) throw new Error("gallery: not WebGPU");

  const started = performance.now();
  const looks = skyLooks();
  const sky = createSky({ reach: SKY_REACH, look: looks.summer });
  const noiseMs = performance.now() - started;

  const scene = new Scene();
  scene.add(sky.mesh);
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, window.innerWidth / window.innerHeight, 0.25, CAMERA_FAR);

  const land = uniform(new Vector3(1, 1, 1));
  const toSun = uniform(new Vector3(0, 1, 0));
  const toCamera = positionWorld.sub(cameraPosition);
  const hazed = (color: Node<"vec3">) => mix(color.mul(land), sky.hazeAlong(toCamera), float(1).sub(exp(toCamera.length().div(HAZE_M).pow(2).negate())));

  const surface = (name: string, width: number, depth: number, x: number, y: number, z: number) => {
    const material = new MeshBasicNodeMaterial();
    material.colorNode = hazed(colour(name));
    const geometry = new PlaneGeometry(width, depth);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };
  const sea = surface("water", 2 * CAMERA_FAR, 2 * CAMERA_FAR, 0, -0.5, 0);
  (sea.material as MeshBasicNodeMaterial).colorNode = sky.seaToSky(hazed(colour("water")), toCamera);
  const shore = surface("ground", 2 * SHORE_M, 2 * SHORE_M, 0, 0, -SHORE_M + 300);
  const road = surface("road-main", ROAD_HALF_M * 2, 5000, 0, 0.05, -1500);
  const treeMaterial = new MeshBasicNodeMaterial();
  const facing = max(dot(normalize(attribute<"vec3">("normal", "vec3")), toSun), 0);
  treeMaterial.colorNode = hazed(attribute<"vec3">("tint", "vec3").mul(facing.mul(0.75).add(0.55)));
  const trees = new Mesh(forestGeometry(), treeMaterial);
  trees.frustumCulled = false;
  scene.add(trees);

  let frames = 0;
  let gpuMs = 0;
  let onFrame: (() => void) | null = null;
  void renderer.setAnimationLoop(async () => {
    renderer.render(scene, camera);
    frames++;
    const ms = await renderer.resolveTimestampsAsync(TimestampQuery.RENDER);
    if (ms !== undefined && ms > 0) gpuMs = ms;
    onFrame?.();
  });

  let clock = 0;
  const lookOf = (view: GalleryView): SkyLook => {
    const base = looks[view.look];
    return { ...base, cloudCover: view.cover ?? base.cloudCover, sun: { ...base.sun, elevationDeg: view.sunElevationDeg ?? base.sun.elevationDeg } };
  };

  return {
    frames: () => frames,
    noiseMs,
    /** Median GPU time over a run of frames, with the sky shown or not. */
    async timeFrames(count: number, withSky: boolean) {
      sky.mesh.visible = withSky;
      const times: number[] = [];
      await new Promise<void>((done) => {
        onFrame = () => {
          times.push(gpuMs);
          if (times.length < count) return;
          onFrame = null;
          done();
        };
      });
      sky.mesh.visible = true;
      return times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
    },
    show(view: GalleryView) {
      const look = lookOf(view);
      sky.setLook(look);
      const azimuth = (look.sun.azimuthDeg * Math.PI) / 180;
      const elevation = (look.sun.elevationDeg * Math.PI) / 180;
      toSun.value.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
      land.value.copy(sky.landLight);
      camera.fov = view.fieldOfView ?? FIELD_OF_VIEW;
      camera.updateProjectionMatrix();
      camera.position.set(view.atSea ? 400 : ROAD_HALF_M * 0.4, EYE_M, view.atSea ? 3000 : 0);
      const yaw = (view.yawDeg * Math.PI) / 180;
      const pitch = (view.pitchDeg * Math.PI) / 180;
      camera.lookAt(camera.position.clone().add(new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))));
      camera.updateMatrixWorld();
      sky.update(camera.position, view.seconds - clock);
      clock = view.seconds;
      const stage = view.bare !== true;
      sea.visible = stage;
      shore.visible = stage && view.atSea !== true;
      road.visible = stage && view.atSea !== true;
      trees.visible = stage && view.atSea !== true;
    },
  };
}

declare global {
  interface Window {
    __skyGallery?: Awaited<ReturnType<typeof start>>;
    __skyGalleryError?: string;
  }
}

start().then(
  (gallery) => {
    window.__skyGallery = gallery;
  },
  (error: unknown) => {
    window.__skyGalleryError = String(error);
  },
);
