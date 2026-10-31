import { BufferAttribute, BufferGeometry, CylinderGeometry, Group, Mesh, MeshBasicNodeMaterial, type Node, type Scene } from "three/webgpu";
import type { Place } from "../../render/game";
import type { World } from "../../sim/world";
import { signMaterial, signPlate, type SignSheet } from "./signs";

/* Props the gallery stands in front of the camera, for art that has no place in the world yet. */

export interface SetHook {
  scene: Scene;
  world: World;
  manifest: { worldOrigin: { east: number; north: number } };
  signSheet: SignSheet;
  wallMaterial: MeshBasicNodeMaterial;
  colour: (name: string) => Node<"vec3">;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
  sun: { azimuthDeg: number; elevationDeg: number };
}

const SPACING_M = 1.5;
const PLATE_UP_M = 2;
const AWAY_M = 12;
const ROW = ["speed-50", "speed-80", "give-way", "stop", "crossroads", "side-road-right", "moose", "priority-road", "pedestrian-crossing", "to-Mariehamn", "to-Eckerö"];

/** Made-up buildings, for shops and roofs up close: the walls' real material, on the attributes the pipeline writes. */
const STREET = [
  { width: 9, eaves: 6.2, colour: 3, roof: [122, 96, 88] },
  { width: 16, eaves: 9, colour: 1, roof: [86, 88, 92] },
  { width: 12, eaves: 6.4, colour: 2, roof: [150, 86, 70] },
  { width: 20, eaves: 9.2, colour: 5, roof: [98, 104, 110] },
];
const PLASTER = 2;
const ROOF_STYLE = 0;
const ROOF_RUN_M = 6;
const ROOF_RISE_M = 3.4;

function streetGeometry(x: number, z: number, ground: number, yaw: number): BufferGeometry {
  const [rightX, rightZ] = [Math.cos(yaw), -Math.sin(yaw)];
  const [awayX, awayZ] = [-Math.sin(yaw), -Math.cos(yaw)];
  const positions: number[] = [];
  const facades: number[] = [];
  const tints: number[] = [];
  const indices: number[] = [];
  const quad = (corners: [number, number, number][], facade: number[][], tint: number[]) => {
    const first = positions.length / 3;
    for (const [at, [right, up, away]] of corners.entries()) {
      positions.push(x + rightX * right + awayX * away, ground + up, z + rightZ * right + awayZ * away);
      facades.push(...facade[at]);
      tints.push(...tint);
    }
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  };
  let left = -STREET.reduce((sum, { width }) => sum + width, 0) / 2;
  for (const { width, eaves, colour, roof } of STREET) {
    const right = left + width;
    quad([[left, 0, 0], [right, 0, 0], [right, eaves, 0], [left, eaves, 0]], [[0, 0, width, eaves], [width, 0, width, eaves], [width, eaves, width, eaves], [0, eaves, width, eaves]], [colour, 255, 128, PLASTER]);
    const none = [0, 0, 0, 0];
    quad([[left, eaves, 0], [right, eaves, 0], [right, eaves + ROOF_RISE_M, ROOF_RUN_M], [left, eaves + ROOF_RISE_M, ROOF_RUN_M]], [none, none, none, none], [...roof, ROOF_STYLE]);
    left = right;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setAttribute("facade", new BufferAttribute(Float32Array.from(facades), 4));
  geometry.setAttribute("tint", new BufferAttribute(Uint8Array.from(tints), 4, true));
  geometry.setIndex(indices);
  return geometry;
}

let started: SetHook | null = null;
const group = new Group();

export function startSets(hook: SetHook): void {
  started = hook;
  hook.scene.add(group);
}

export function showSet(what: string | null, at: Place): void {
  group.clear();
  if (what === null || !started) return;
  const { world, manifest, signSheet, wallMaterial, colour, hazed, sun } = started;
  if (what.startsWith("street:")) {
    const away = Number(what.slice("street:".length));
    const [streetX, streetZ] = [at.east - manifest.worldOrigin.east - Math.sin(at.yaw) * away, -(at.north - manifest.worldOrigin.north) - Math.cos(at.yaw) * away];
    group.add(new Mesh(streetGeometry(streetX, streetZ, world.height(streetX, streetZ), at.yaw), wallMaterial));
    return;
  }
  const material = signMaterial(signSheet, { colour, hazed }, sun);
  const post = new MeshBasicNodeMaterial();
  post.colorNode = hazed(colour("sign-back"));
  const x = at.east - manifest.worldOrigin.east;
  const z = -(at.north - manifest.worldOrigin.north);
  const [forwardX, forwardZ] = [-Math.sin(at.yaw), -Math.cos(at.yaw)];
  const [rightX, rightZ] = [-forwardZ, forwardX];
  ROW.forEach((name, slot) => {
    const offset = (slot - (ROW.length - 1) / 2) * SPACING_M;
    const [px, pz] = [x + forwardX * AWAY_M + rightX * offset, z + forwardZ * AWAY_M + rightZ * offset];
    const ground = world.height(px, pz);
    const plate = new Mesh(signPlate(signSheet, name), material);
    plate.position.set(px, ground + PLATE_UP_M, pz);
    plate.rotation.y = at.yaw;
    const pole = new Mesh(new CylinderGeometry(0.03, 0.03, PLATE_UP_M, 8), post);
    pole.position.set(px + forwardX * 0.03, ground + PLATE_UP_M / 2, pz + forwardZ * 0.03);
    group.add(plate, pole);
  });
}
