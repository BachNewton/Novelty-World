import { BufferGeometry, CircleGeometry, Group, Mesh, MeshBasicNodeMaterial, type Node, type Object3D, type Scene } from "three/webgpu";
import { float, positionGeometry, smoothstep, vec2, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { CAR, SUSPENSION } from "../../sim/tuning";
import type { CarState } from "../../sim/car-state";
import { AXLE_Y, buildCarParts, groundY, type CarDetail, type CarSpec } from "./build";
import { carMaterial, geometryOf, type CarLights } from "./material";
import "./tokens.css";

/*
 * A car to draw, from a `CarState` and nothing else, in the same frame as the
 * simulation: the car's origin, nose to -z, wheels hanging from their mounts by
 * `suspension`. The tree is root (the state's position and rotation), then the
 * body pivot at the centre of mass, which leans on top of whatever the
 * simulation is doing, and the wheels beside it, steering then rolling.
 */

const SHADOW_STRENGTH = 0.6;
const SHADOW_LIFT_M = 0.03;

/** The parts' geometries, which any number of cars of one spec can share. */
export interface CarArt {
  spec: CarSpec;
  body: BufferGeometry;
  wheel: BufferGeometry;
  triangles: { body: number; wheel: number; total: number };
  dispose: () => void;
}

export function buildCarArt(spec: CarSpec, detail: CarDetail = "near"): CarArt {
  const parts = buildCarParts(spec, detail);
  const body = geometryOf(parts.body);
  const wheel = geometryOf(parts.wheel);
  return {
    spec,
    body,
    wheel,
    triangles: { body: parts.body.triangles, wheel: parts.wheel.triangles, total: parts.body.triangles + parts.wheel.triangles * 4 },
    dispose() {
      body.dispose();
      wheel.dispose();
    },
  };
}

export interface CarViewOptions {
  /** Another car's paint: a token without the `--color-aland-drive-` prefix. */
  paint?: string;
  hazed?: (color: Node<"vec3">) => Node<"vec3">;
}

export function createCarModel(art: CarArt, sun: { azimuthDeg: number; elevationDeg: number }, options: CarViewOptions = {}) {
  const { spec } = art;
  const road = groundY(spec.wheel.radiusM);
  const { material, setLights, setPaint } = carMaterial({ sun, paint: options.paint ?? spec.paint, groundY: road, hazed: options.hazed });

  const root = new Group();
  const pivot = new Group();
  pivot.position.y = CAR.massUpM;
  const shell = new Mesh(art.body, material);
  shell.position.y = -CAR.massUpM;
  pivot.add(shell);
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
    steering.position.set((side * spec.body.trackM) / 2, AXLE_Y, z);
    const rolling = new Group();
    const mesh = new Mesh(art.wheel, material);
    mesh.rotation.y = side < 0 ? Math.PI : 0;
    rolling.add(mesh);
    steering.add(rolling);
    root.add(steering);
    return { steering, rolling, isFront };
  });

  const shadowGeometry = new CircleGeometry(1, 4);
  shadowGeometry.rotateX(-Math.PI / 2);
  shadowGeometry.rotateY(Math.PI / 4);
  const shadowMaterial = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const { r, g, b } = themeColor("--color-aland-drive-car-shadow");
  shadowMaterial.colorNode = vec3(r, g, b);
  const [wide, long] = spec.shadowHalf;
  const toEdge = vec2(positionGeometry.x, positionGeometry.z).abs().mul(Math.SQRT2).sub(vec2(1, 1));
  const toScale = vec2(wide + 0.3, long + 0.3).div(0.3);
  const outside = toEdge.mul(toScale).add(1).max(vec2(0, 0)).length();
  shadowMaterial.opacityNode = float(1).sub(smoothstep(float(0), float(1), outside)).mul(SHADOW_STRENGTH);
  const shadow = new Mesh(shadowGeometry, shadowMaterial);
  shadow.scale.set(wide + 0.3, 1, long + 0.3);
  root.add(shadow);

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
      let hang = 0;
      wheels.forEach(({ steering, rolling, isFront }, index) => {
        const y = -SUSPENSION.droopM + state.suspension[index];
        hang += y / wheels.length;
        steering.position.y = y;
        steering.rotation.y = isFront ? -state.steer : 0;
        rolling.rotation.x = -(state.roll * CAR.wheelRadiusM) / spec.wheel.radiusM;
      });
      shadow.position.y = hang - spec.wheel.radiusM + SHADOW_LIFT_M;
    },
    dispose() {
      material.dispose();
      shadowGeometry.dispose();
      shadowMaterial.dispose();
    },
  };
}

export type CarModel = ReturnType<typeof createCarModel>;

/**
 * A drop-in for `render/car.ts`: the same shape, a real car, and `setLights` for
 * what a `CarState` doesn't carry.
 */
export function createCarView(scene: Scene, sun: { azimuthDeg: number; elevationDeg: number }, spec: CarSpec, detail: CarDetail = "near") {
  const art = buildCarArt(spec, detail);
  const model = createCarModel(art, sun);
  scene.add(model.root);
  return {
    draw: model.draw,
    setLights: model.setLights,
    objects: [model.root] as Object3D[],
    dispose() {
      scene.remove(model.root);
      model.dispose();
      art.dispose();
    },
  };
}

export type { CarLights };
