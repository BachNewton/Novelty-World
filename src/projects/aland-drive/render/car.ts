import { BoxGeometry, CircleGeometry, CylinderGeometry, Group, Mesh, MeshBasicNodeMaterial, type Object3D, type Scene } from "three/webgpu";
import { float, normalWorld, uniform, vec2, vec3, positionGeometry, smoothstep } from "three/tsl";
import { Vector3 } from "three/webgpu";
import { themeColor } from "@/shared/lib/three/theme-color";
import { CAR, SUSPENSION } from "../sim/tuning";
import type { CarState } from "../sim/car-state";

/*
 * The placeholder car, built of boxes and drawn from a `CarState` and nothing
 * else, so that a car heard from another player will draw the same way. A soft
 * dark patch sits under it, which is what puts it on the road.
 */

const AMBIENT = 0.55;
const SUN_SHARE = 0.55;
const SHADOW_STRENGTH = 0.55;
const SHADOW_SIZE = { wide: 2.9, long: 5.4 } as const;
const SHADOW_DROP_M = 0.5;

const token = (name: string) => themeColor(`--color-aland-drive-${name}`);

interface Part {
  size: [wide: number, tall: number, long: number];
  at: [x: number, y: number, z: number];
  paint: string;
}

const PARTS: Part[] = [
  { size: [1.8, 0.55, 4.4], at: [0, 0.03, 0], paint: "car-body" },
  { size: [1.5, 0.48, 2.1], at: [0, 0.54, 0.25], paint: "car-glass" },
  { size: [1.46, 0.07, 1.8], at: [0, 0.81, 0.3], paint: "car-body" },
  { size: [1.5, 0.12, 0.05], at: [0, 0.12, -2.21], paint: "car-lamp" },
  { size: [1.5, 0.12, 0.05], at: [0, 0.14, 2.21], paint: "car-tail" },
];

export function createCarView(scene: Scene, sun: { azimuthDeg: number; elevationDeg: number }) {
  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  const elevation = (sun.elevationDeg * Math.PI) / 180;
  const toSun = uniform(new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)));
  const lit = float(AMBIENT).add(normalWorld.dot(toSun).max(0).mul(SUN_SHARE));

  const materials = new Map<string, MeshBasicNodeMaterial>();
  const painted = (name: string) => {
    const known = materials.get(name);
    if (known) return known;
    const material = new MeshBasicNodeMaterial();
    const { r, g, b } = token(name);
    material.colorNode = vec3(r, g, b).mul(lit);
    materials.set(name, material);
    return material;
  };

  const body = new Group();
  const geometries: { dispose: () => void }[] = [];
  for (const { size, at, paint } of PARTS) {
    const geometry = new BoxGeometry(...size);
    geometries.push(geometry);
    const mesh = new Mesh(geometry, painted(paint));
    mesh.position.set(...at);
    body.add(mesh);
  }

  const wheelGeometry = new CylinderGeometry(CAR.wheelRadiusM, CAR.wheelRadiusM, 0.26, 16);
  wheelGeometry.rotateZ(Math.PI / 2);
  geometries.push(wheelGeometry);
  const hubGeometry = new BoxGeometry(0.28, 0.14, CAR.wheelRadiusM * 1.5);
  geometries.push(hubGeometry);
  const wheels = [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ].map(([side, end]) => {
    const steering = new Group();
    steering.position.set((side * CAR.trackM) / 2, 0, (-end * CAR.wheelBaseM) / 2);
    const rolling = new Group();
    rolling.add(new Mesh(wheelGeometry, painted("car-tyre")), new Mesh(hubGeometry, painted("car-glass")));
    steering.add(rolling);
    body.add(steering);
    return { steering, rolling, isFront: end === 1 };
  });
  scene.add(body);

  const shadowGeometry = new CircleGeometry(0.5, 24);
  shadowGeometry.rotateX(-Math.PI / 2);
  geometries.push(shadowGeometry);
  const shadowMaterial = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const { r, g, b } = token("car-shadow");
  shadowMaterial.colorNode = vec3(r, g, b);
  shadowMaterial.opacityNode = float(1).sub(smoothstep(float(0.2), float(0.5), vec2(positionGeometry.x, positionGeometry.z).length())).mul(SHADOW_STRENGTH);
  const shadow = new Mesh(shadowGeometry, shadowMaterial);
  shadow.scale.set(SHADOW_SIZE.wide, 1, SHADOW_SIZE.long);
  scene.add(shadow);

  return {
    draw(state: CarState) {
      const [x, y, z] = state.position;
      body.position.set(x, y, z);
      body.quaternion.set(...state.rotation);
      wheels.forEach(({ steering, rolling, isFront }, index) => {
        steering.position.y = -SUSPENSION.droopM + state.suspension[index];
        steering.rotation.y = isFront ? -state.steer : 0;
        rolling.rotation.x = -state.roll;
      });
      shadow.position.set(x, y - SHADOW_DROP_M, z);
      shadow.quaternion.copy(body.quaternion);
      shadow.position.y += 0.1;
    },
    objects: [body, shadow] as Object3D[],
    dispose() {
      scene.remove(body, shadow);
      geometries.forEach((geometry) => {
        geometry.dispose();
      });
      materials.forEach((material) => {
        material.dispose();
      });
      shadowMaterial.dispose();
    },
  };
}
