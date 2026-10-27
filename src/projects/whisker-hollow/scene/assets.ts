import * as THREE from "three/webgpu";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { themeColor } from "@/shared/lib/three/theme-color";
import { POLY_MODELS } from "../models/poly-models";

/** The players' caretaker; every other model is Poly by Google's, by its poly.pizza id. */
const CARETAKER_URL = "/whisker-hollow/models/caretaker.glb";
const POLY_PATH = "/whisker-hollow/poly";

export type Models = ReadonlyMap<string, GLTF>;

export async function loadModels(onProgress: (loaded: number, total: number) => void): Promise<Models> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const files: [string, string][] = [["caretaker", CARETAKER_URL], ...POLY_MODELS.map((m): [string, string] => [m.id, `${POLY_PATH}/${m.id}.glb`])];
  let loaded = 0;
  const entries = await Promise.all(
    files.map(async ([key, url]) => {
      const gltf = await loader.loadAsync(url);
      loaded += 1;
      onProgress(loaded, files.length);
      return [key, gltf] as const;
    }),
  );
  return new Map(entries);
}

function gltfOf(models: Models, file: string): GLTF {
  const gltf = models.get(file);
  if (gltf === undefined) throw new Error(`whisker hollow: model ${file} is not loaded`);
  return gltf;
}

/**
 * Stand an object on the ground at the origin, `height` tall: scaled, centred
 * on its footprint and with its lowest point at y = 0. Returns a wrapper so
 * the caller can place and turn it freely.
 */
export function grounded(object: THREE.Object3D, height: number): THREE.Group {
  object.position.set(0, 0, 0);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object, true);
  const size = box.getSize(new THREE.Vector3());
  const scale = height / size.y;
  object.scale.multiplyScalar(scale);
  object.position.set(
    -((box.min.x + box.max.x) / 2) * scale,
    -box.min.y * scale,
    -((box.min.z + box.max.z) / 2) * scale,
  );
  const wrapper = new THREE.Group();
  wrapper.add(object);
  return wrapper;
}

function castShadows(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

/**
 * A copy of a Poly by Google model, `height` tall. The pipeline stands every
 * one on the ground, centred and exactly 1 tall, so its height is its scale.
 * Copies share their geometry and materials.
 */
export function polyInstance(models: Models, id: string, height: number, shadows = true): THREE.Group {
  const copy = gltfOf(models, id).scene.clone();
  if (shadows) castShadows(copy);
  copy.scale.setScalar(height);
  const wrapper = new THREE.Group();
  wrapper.add(copy);
  return wrapper;
}

/** A copy of an animated model with its own skeleton, and its clips by short name ("Idle", "Walk"…). */
export function animatedInstance(models: Models, file: string): { root: THREE.Object3D; clips: Map<string, THREE.AnimationClip> } {
  const gltf = gltfOf(models, file);
  const root = cloneSkinned(gltf.scene);
  castShadows(root);
  const clips = new Map<string, THREE.AnimationClip>();
  for (const clip of gltf.animations) {
    // Quaternius names clips "Armature|Name", or "Armature|Rat_Name".
    const short = (clip.name.split("|").pop() ?? clip.name).replace(/^Rat_/, "");
    clips.set(short, clip);
  }
  return { root, clips };
}

const paintedMaterials = new Map<string, THREE.Material>();

/** A model's material slot repainted in a design token: one per slot and token, shared by everyone wearing it. */
function paintedMaterial(original: THREE.Material, token: string): THREE.Material {
  const key = `${original.name}|${token}`;
  let material = paintedMaterials.get(key);
  if (material === undefined) {
    const painted = original.clone();
    if (!(painted instanceof THREE.MeshStandardMaterial)) throw new Error(`whisker hollow: ${original.name} is not a standard material`);
    painted.color = themeColor(token);
    material = painted;
    paintedMaterials.set(key, material);
  }
  return material;
}

/** Repaint a model's material slots, by the slots' own names, each in its design token. */
export function repaint(root: THREE.Object3D, paints: Partial<Record<string, string>>): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
      const token = paints[child.material.name];
      if (token !== undefined) child.material = paintedMaterial(child.material, token);
    }
  });
}
