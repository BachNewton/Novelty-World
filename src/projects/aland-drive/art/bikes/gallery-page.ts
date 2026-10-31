import { Color, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGPURenderer } from "three/webgpu";
import { abs, float, mix, positionWorld, smoothstep, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { Point } from "../cars/mesh";
import { BIKE_CHASE, BIKE_FIRST_PERSON } from "./cameras";
import { buildBikeArt, createBikeModel, type BikeArt } from "./model";
import { stillInput, type RideInput, type RideMotion } from "./rig";
import { BIKES } from "./specs";
import type { BikeDetail } from "./build";

/*
 * The page `gallery.mjs` drives: one cyclist at a time, or a line of them, on a
 * stretch of cycleway, on the game's renderer settings.
 */

const SUN = { azimuthDeg: 215, elevationDeg: 30 };
const PATH_HALF_M = 1.5;

const token = (name: string) => themeColor(`--color-aland-drive-${name}`);

export interface Rider {
  bike: number;
  x?: number;
  z?: number;
  seed?: number;
  helmet?: boolean;
  rider?: boolean;
  firstPerson?: boolean;
  motion?: Partial<RideMotion>;
  ride?: Partial<RideInput>;
}

export interface Shot {
  detail: BikeDetail;
  riders: Rider[];
  camera: "chase" | "first" | [x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number, fov: number];
}

async function start(width: number, height: number) {
  const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true });
  await renderer.init();
  if (!("isWebGPUBackend" in renderer.backend)) throw new Error("not WebGPU");
  renderer.setSize(width, height);
  renderer.setClearColor(new Color(token("sky")));
  document.body.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(60, width / height, 0.05, 2000);

  const paved = new MeshBasicNodeMaterial();
  const path = vec3(...token("road-main").toArray());
  const grass = vec3(...token("ground").toArray());
  paved.colorNode = mix(grass, path, smoothstep(float(PATH_HALF_M + 0.1), float(PATH_HALF_M), abs(positionWorld.x)));
  const ground = new Mesh(new PlaneGeometry(2000, 2000), paved);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const arts = new Map<string, BikeArt>();
  const artOf = (bike: number, detail: BikeDetail) => {
    const key = `${bike}:${detail}`;
    const known = arts.get(key);
    if (known) return known;
    const art = buildBikeArt(BIKES[bike], detail);
    arts.set(key, art);
    return art;
  };

  return {
    bikes: () => BIKES.map((bike, index) => ({ index, name: bike.name, near: artOf(index, "near").triangles, nearBike: artOf(index, "near").bikeTriangles, far: artOf(index, "far").triangles })),
    async shoot(shot: Shot) {
      for (const child of [...scene.children]) if (child !== ground) scene.remove(child);
      let eye: Point = [0, 1.6, 0];
      for (const { bike, x, z, seed, helmet, rider, firstPerson, motion, ride } of shot.riders) {
        const model = createBikeModel(artOf(bike, shot.detail), SUN, { seed, helmet, rider, firstPerson });
        Object.assign(model.motion, motion);
        model.root.position.set(x ?? 0, 0, z ?? 0);
        ({ eye } = model.pose({ ...stillInput(), ...ride }));
        scene.add(model.root);
      }
      if (shot.camera === "chase") {
        camera.fov = BIKE_CHASE.fieldOfViewDeg;
        camera.position.set(0, BIKE_CHASE.aboveM, BIKE_CHASE.behindM);
        camera.lookAt(0, BIKE_CHASE.lookAboveM, -BIKE_CHASE.lookAheadM);
      } else if (shot.camera === "first") {
        camera.fov = BIKE_FIRST_PERSON.fieldOfViewDeg;
        camera.position.set(...eye);
        camera.lookAt(eye[0], eye[1] - BIKE_FIRST_PERSON.lookDownM, eye[2] - BIKE_FIRST_PERSON.lookAheadM);
      } else {
        const [x, y, z, lookX, lookY, lookZ, fov] = shot.camera;
        camera.fov = fov;
        camera.position.set(x, y, z);
        camera.lookAt(lookX, lookY, lookZ);
      }
      camera.updateProjectionMatrix();
      await renderer.compileAsync(scene, camera);
      renderer.render(scene, camera);
      await new Promise(requestAnimationFrame);
      renderer.render(scene, camera);
      const drawn = { drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles };
      await new Promise(requestAnimationFrame);
      return drawn;
    },
  };
}

declare global {
  interface Window {
    __bikeGallery?: Awaited<ReturnType<typeof start>>;
    __startBikeGallery: (width: number, height: number) => Promise<void>;
  }
}

window.__startBikeGallery = async (width, height) => {
  window.__bikeGallery = await start(width, height);
};
