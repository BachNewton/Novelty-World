import { BufferGeometry, Group, Mesh, type Node, type Object3D, type Scene } from "three/webgpu";
import type { CarState } from "../../sim/car-state";
import { axleY, buildCarParts, groundY, type CarDetail, type CarSpec } from "./build";
import { carMaterial, geometryOf, glassMaterial, type CarLights } from "./material";
import { type Sun } from "../sun";

/*
 * A car to draw, from a `CarState` and nothing else, in the same frame as the
 * simulation: the car's origin, nose to -z, wheels hanging from their mounts by
 * `suspension`. The tree is root (the state's position and rotation), then the
 * body pivot at the centre of mass, which leans on top of whatever the
 * simulation is doing, and the wheels beside it, steering then rolling.
 */

/** The parts' geometries, which any number of cars of one spec can share. */
export interface CarArt {
  spec: CarSpec;
  body: BufferGeometry;
  wheel: BufferGeometry;
  /** A hero's see-through glass. */
  glass: BufferGeometry | null;
  triangles: { body: number; glass: number; wheel: number; total: number };
  dispose: () => void;
}

export function buildCarArt(spec: CarSpec, detail: CarDetail = "hero"): CarArt {
  const parts = buildCarParts(spec, detail);
  const body = geometryOf(parts.body, detail === "hero");
  const wheel = geometryOf(parts.wheel);
  const glass = parts.glass && geometryOf(parts.glass);
  const glassTriangles = parts.glass?.triangles ?? 0;
  return {
    spec,
    body,
    wheel,
    glass,
    triangles: { body: parts.body.triangles, glass: glassTriangles, wheel: parts.wheel.triangles, total: parts.body.triangles + glassTriangles + parts.wheel.triangles * 4 },
    dispose() {
      body.dispose();
      wheel.dispose();
      glass?.dispose();
    },
  };
}

export interface CarViewOptions {
  /** Another car's paint: a token without the `--color-aland-drive-` prefix. */
  paint?: string;
  hazed?: (color: Node<"vec3">) => Node<"vec3">;
}

export function createCarModel(art: CarArt, sun: Sun, options: CarViewOptions = {}) {
  const { spec } = art;
  const road = groundY(spec);
  const { ride } = spec;
  const { material, setLights, setPaint } = carMaterial({ sun, paint: options.paint ?? spec.paint, groundY: road, hazed: options.hazed, hero: art.glass !== null });
  const glassLook = art.glass && glassMaterial({ sun, hazed: options.hazed });

  const root = new Group();
  const pivot = new Group();
  pivot.position.y = ride.massUpM;
  const shell = new Mesh(art.body, material);
  shell.position.y = -ride.massUpM;
  pivot.add(shell);
  if (art.glass && glassLook) {
    const glass = new Mesh(art.glass, glassLook);
    glass.position.y = -ride.massUpM;
    glass.renderOrder = 1;
    pivot.add(glass);
  }
  root.add(pivot);

  const [frontZ, rearZ] = spec.body.axleZ;
  const wheels = (
    [
      [-1, frontZ, true],
      [1, frontZ, true],
      [-1, rearZ, false],
      [1, rearZ, false],
    ] as const
  ).map(([side, z, isFront]) => {
    const steering = new Group();
    steering.position.set((side * spec.body.trackM) / 2, axleY(spec), z);
    const rolling = new Group();
    const mesh = new Mesh(art.wheel, material);
    mesh.rotation.y = side < 0 ? Math.PI : 0;
    rolling.add(mesh);
    steering.add(rolling);
    root.add(steering);
    return { steering, rolling, isFront };
  });

  setLights({ brake: false, reversing: false, headlights: false });

  return {
    /** Everything: add this to the scene. */
    root,
    /** A hinge at the centre of mass. Its rotation.x pitches and rotation.z rolls the shell alone, above the simulation's own lean. */
    pivot,
    wheels,
    setLights,
    setPaint,
    draw(state: CarState) {
      root.position.set(...state.position);
      root.quaternion.set(...state.rotation);
      wheels.forEach(({ steering, rolling, isFront }, index) => {
        steering.position.y = -ride.droopM + state.suspension[index];
        steering.rotation.y = isFront ? -state.steer : 0;
        rolling.rotation.x = -state.roll[index];
      });
    },
    dispose() {
      material.dispose();
      glassLook?.dispose();
    },
  };
}

export type CarModel = ReturnType<typeof createCarModel>;

/** A car in the scene, with `setLights` for what a `CarState` doesn't carry. */
export function createCarView(scene: Scene, sun: Sun, spec: CarSpec, detail: CarDetail = "hero", options: CarViewOptions = {}) {
  const art = buildCarArt(spec, detail);
  const view = carOnRoad(scene, sun, art, options);
  return {
    ...view,
    art,
    dispose() {
      view.dispose();
      art.dispose();
    },
  };
}

/** A car in the scene from art other cars share, which outlives it. */
export function carOnRoad(scene: Scene, sun: Sun, art: CarArt, options: CarViewOptions = {}) {
  const model = createCarModel(art, sun, options);
  scene.add(model.root);
  return {
    draw: model.draw,
    setLights: model.setLights,
    objects: [model.root] as Object3D[],
    dispose() {
      scene.remove(model.root);
      model.dispose();
    },
  };
}

export type { CarLights };
