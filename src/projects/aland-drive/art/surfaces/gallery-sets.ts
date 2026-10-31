import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshBasicNodeMaterial, NoColorSpace, OrthographicCamera, RenderTarget, Scene, WebGPURenderer, type Material, type Node } from "three/webgpu";
import { texture, uv } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { Place } from "../../render/game";
import type { World } from "../../sim/world";
import { createSignSheet, signMaterial, signNames, signPlate, signPost, signPostMaterial, type SignSheet } from "./signs";

/* Props the gallery stands in front of the camera, for art that has no place in the world yet. */

export interface SetHook {
  scene: Scene;
  world: World;
  manifest: { worldOrigin: { east: number; north: number } };
  signSheet: SignSheet;
  wallMaterial: Material;
  colour: (name: string) => Node<"vec3">;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
  sun: { azimuthDeg: number; elevationDeg: number };
}

const GAP_M = 0.5;
const PLATE_UP_M = 2;
const ROW = ["speed-50", "speed-100", "speed-area-40", "no-entry", "give-way", "stop", "crossroads", "side-road-right", "side-road-left", "moose", "roadworks", "bend", "priority-road", "end-of-priority", "pedestrian-crossing", "parking", "bus-stop", "one-way-ahead", "built-up", "built-up-end", "information", "to-Mariehamn", "to-Eckerö", "to-Vårdö"];

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

// WebGPU reads rows back padded to 256 bytes, so a width of 960 comes back with none.
const PLATE_PIXELS = 960;
const PLATE_FRAME = 1.1;

/** Each plate front-on with no perspective, on its own canvas, for measuring against the regulation's drawing. */
export async function startPlates() {
  const renderer = new WebGPURenderer({ antialias: true });
  await renderer.init();
  const target = new RenderTarget(PLATE_PIXELS, PLATE_PIXELS, { samples: 4 });
  renderer.setClearColor(new Color(1, 0, 1));
  const sheet = createSignSheet((name) => themeColor(`--color-aland-drive-${name}`).getStyle(), ["Helsinki 119"]);
  // Read straight back, so the sheet's own bytes stay as they are, with no trip through linear light.
  sheet.texture.colorSpace = NoColorSpace;
  const material = new MeshBasicNodeMaterial();
  material.colorNode = texture(sheet.texture, uv()).rgb;
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;
  return {
    names: signNames(sheet),
    size: PLATE_PIXELS,
    async show(name: string): Promise<string> {
      scene.clear();
      scene.add(new Mesh(signPlate(sheet, name), material));
      const sign = sheet.signs.get(name);
      if (!sign) throw new Error(`no sign ${name}`);
      const half = (Math.max(sign.widthM, sign.heightM) * PLATE_FRAME) / 2;
      Object.assign(camera, { left: -half, right: half, top: half, bottom: -half });
      camera.updateProjectionMatrix();
      renderer.setRenderTarget(target);
      await renderer.renderAsync(scene, camera);
      const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, PLATE_PIXELS, PLATE_PIXELS);
      const bytes = pixels as Uint8Array;
      let text = "";
      for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
      return btoa(text);
    },
  };
}

let started: SetHook | null = null;
const group = new Group();

export function startSets(hook: SetHook): void {
  started = hook;
  hook.scene.add(group);
}

export function showSet(what: string | null, at: Place & { away: number }): void {
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
  const post = signPostMaterial({ colour, hazed }, sun);
  const x = at.east - manifest.worldOrigin.east;
  const z = -(at.north - manifest.worldOrigin.north);
  const [forwardX, forwardZ] = [-Math.sin(at.yaw), -Math.cos(at.yaw)];
  const [rightX, rightZ] = [-forwardZ, forwardX];
  const row = what === "signs-back" ? ROW.slice(0, 6) : ROW;
  const facing = what === "signs-back" ? at.yaw + Math.PI : at.yaw;
  let offset = -row.reduce((sum, name) => sum + plateWidth(signSheet, name) + GAP_M, 0) / 2;
  for (const name of row) {
    const width = plateWidth(signSheet, name);
    offset += width / 2 + GAP_M / 2;
    const [px, pz] = [x + forwardX * at.away + rightX * offset, z + forwardZ * at.away + rightZ * offset];
    offset += width / 2 + GAP_M / 2;
    const ground = world.height(px, pz);
    const sign = signSheet.signs.get(name);
    if (!sign) throw new Error(`no sign ${name}`);
    const plate = new Mesh(signPlate(signSheet, name), material);
    plate.position.set(px, ground + PLATE_UP_M, pz);
    plate.rotation.y = facing;
    const pole = new Mesh(signPost(PLATE_UP_M + sign.heightM / 2 - 0.05, [PLATE_UP_M - sign.heightM / 3, PLATE_UP_M + sign.heightM / 3]), post);
    const behind = what === "signs-back" ? -0.05 : 0.05;
    pole.position.set(px + forwardX * behind, ground, pz + forwardZ * behind);
    group.add(plate, pole);
  }
}

const plateWidth = (sheet: SignSheet, name: string) => sheet.signs.get(name)?.widthM ?? 0;
