import { Color, Mesh, TimestampQuery, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGPURenderer } from "three/webgpu";
import { positionWorld, smoothstep, abs, float, mix, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { CarState } from "../../sim/car-state";
import { AXLE_Y, groundY, SAG_M, type CarDetail } from "./build";
import { buildCarArt, createCarModel, type CarLights } from "./model";
import { createCarFleet, triangleCounts, type FleetCar } from "./fleet";
import { CARS, WORLD_CARS } from "./specs";

/*
 * The page `gallery.mjs` drives: one car at a time on a stretch of road, on the
 * game's renderer settings, with the game's chase camera numbers.
 */

const SUN = { azimuthDeg: 215, elevationDeg: 30 };
const CHASE = { behindM: 6.2, aboveM: 2.15, lookAheadM: 7, lookAboveM: 0.9, fieldOfViewDeg: 62 };
const HOOD = { forwardM: 2.35, aboveM: 0.28, lookAheadM: 30, fieldOfViewDeg: 72 };

const token = (name: string) => themeColor(`--color-aland-drive-${name}`);

const restState = (steer: number, roll: number): CarState => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  velocity: [0, 0, 0],
  spin: [0, 0, 0],
  steer,
  suspension: [SAG_M, SAG_M, SAG_M, SAG_M],
  roll,
});

export interface Shot {
  car: number;
  detail: CarDetail;
  camera: "chase" | "hood" | [x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number, fov: number];
  lights?: Partial<CarLights>;
  steer?: number;
  roll?: number;
  lean?: [pitch: number, roll: number];
}

async function start(width: number, height: number) {
  const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true, trackTimestamp: true });
  await renderer.init();
  if (!("isWebGPUBackend" in renderer.backend)) throw new Error("not WebGPU");
  renderer.setSize(width, height);
  renderer.setClearColor(new Color(token("sky")));
  document.body.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(CHASE.fieldOfViewDeg, width / height, 0.1, 2000);

  const asphalt = new MeshBasicNodeMaterial();
  const road = vec3(...token("road-main").toArray());
  const grass = vec3(...token("ground").toArray());
  const paintLine = vec3(...token("road-paint").toArray());
  const onRoad = smoothstep(float(4.2), float(3.9), abs(positionWorld.x));
  const edge = smoothstep(float(0.09), float(0.07), abs(abs(positionWorld.x).sub(3.6)));
  asphalt.colorNode = mix(mix(grass, road, onRoad), paintLine, edge);
  const ground = new Mesh(new PlaneGeometry(2000, 2000), asphalt);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundY(0.33);
  scene.add(ground);

  const arts = new Map<string, ReturnType<typeof buildCarArt>>();
  const artOf = (car: number, detail: CarDetail) => {
    const key = `${car}:${detail}`;
    const known = arts.get(key);
    if (known) return known;
    const art = buildCarArt(CARS[car], detail);
    arts.set(key, art);
    return art;
  };

  return {
    cars: () => CARS.map((car, index) => ({ index, name: car.name, near: artOf(index, "hero").triangles, far: artOf(index, "far").triangles })),
    async shoot(shot: Shot) {
      const art = artOf(shot.car, shot.detail);
      const model = createCarModel(art, SUN);
      scene.add(model.root);
      ground.position.y = groundY(art.spec.wheel.radiusM);
      model.setLights({ brake: false, reversing: false, headlights: false, ...shot.lights });
      model.draw(restState(shot.steer ?? 0, shot.roll ?? 0));
      if (shot.lean) {
        model.pivot.rotation.x = shot.lean[0];
        model.pivot.rotation.z = shot.lean[1];
      }
      if (shot.camera === "chase") {
        camera.fov = CHASE.fieldOfViewDeg;
        camera.position.set(0, CHASE.aboveM, CHASE.behindM);
        camera.lookAt(0, CHASE.lookAboveM, -CHASE.lookAheadM);
      } else if (shot.camera === "hood") {
        camera.fov = HOOD.fieldOfViewDeg;
        camera.position.set(0, HOOD.aboveM, -HOOD.forwardM);
        camera.lookAt(0, HOOD.aboveM, -HOOD.lookAheadM);
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
      await new Promise(requestAnimationFrame);
      const size = { triangles: art.triangles, drawCalls: renderer.info.render.drawCalls };
      return size;
    },
    /** Every world car in ranks, or one model in a line going away, to see the dissolve. */
    async fleet(view: "ranks" | "line") {
      const specs = [...CARS, ...WORLD_CARS];
      const cars: FleetCar[] =
        view === "ranks"
          ? specs.flatMap((spec, index) => {
              const column = index % 8;
              const rank = Math.floor(index / 8);
              return [{ spec, x: -14 + column * 3.9, y: 0, z: 6 - rank * 7.5, yaw: 0, seed: index + 3 }];
            })
          : Array.from({ length: 34 }, (_, index) => ({ spec: specs[index % specs.length], x: 2, y: 0, z: 40 - index * 8, yaw: Math.PI, seed: index }));
      const made = createCarFleet(cars, SUN);
      ground.position.y = 0;
      scene.add(...made.meshes);
      if (view === "ranks") camera.position.set(-1, 13, 21);
      else camera.position.set(-1.5, 2, 60);
      camera.fov = view === "ranks" ? 32 : 3.5;
      camera.lookAt(view === "ranks" ? -0.3 : 2, view === "ranks" ? 0 : 0.7, view === "ranks" ? -6 : -60);
      camera.updateProjectionMatrix();
      await renderer.compileAsync(scene, camera);
      renderer.render(scene, camera);
      await new Promise(requestAnimationFrame);
      renderer.render(scene, camera);
      await new Promise(requestAnimationFrame);
    },
    worldCounts: () => [...CARS, ...WORLD_CARS].map((spec) => ({ name: spec.name, ...triangleCounts(spec) })),
    /** The GPU's time for the road alone against the road with the hero, in alternating pairs: only the ratio and difference mean anything. */
    async heroCost(car: number, pairs: number) {
      const art = artOf(car, "hero");
      const model = createCarModel(art, SUN);
      model.draw(restState(0, 0));
      camera.fov = CHASE.fieldOfViewDeg;
      camera.position.set(0, CHASE.aboveM, CHASE.behindM);
      camera.lookAt(0, CHASE.lookAboveM, -CHASE.lookAheadM);
      camera.updateProjectionMatrix();
      const timed = async () => {
        renderer.render(scene, camera);
        await new Promise(requestAnimationFrame);
        return renderer.resolveTimestampsAsync(TimestampQuery.RENDER);
      };
      scene.add(model.root);
      await renderer.compileAsync(scene, camera);
      const withCar: number[] = [];
      const without: number[] = [];
      for (let pair = 0; pair < pairs; pair++) {
        scene.add(model.root);
        const a = await timed();
        scene.remove(model.root);
        const b = await timed();
        if (a !== undefined && b !== undefined && a > 0 && b > 0) {
          withCar.push(a);
          without.push(b);
        }
      }
      const middle = (values: number[]) => [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)];
      return { pairs: withCar.length, withCarMs: middle(withCar), roadMs: middle(without) };
    },
    clear() {
      for (const child of [...scene.children]) if (child !== ground) scene.remove(child);
    },
  };
}

declare global {
  interface Window {
    __carGallery?: Awaited<ReturnType<typeof start>>;
    __startCarGallery: (width: number, height: number) => Promise<void>;
    __axleY: number;
  }
}

window.__axleY = AXLE_Y;
window.__startCarGallery = async (width, height) => {
  window.__carGallery = await start(width, height);
};
