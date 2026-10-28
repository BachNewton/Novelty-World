import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshBasicNodeMaterial, Quaternion, Vector3 } from "three/webgpu";
import { normalize, positionWorld, varying } from "three/tsl";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRng } from "@/shared/lib/seeded-random";
import type { Place } from "../engine/places";
import type { World } from "../engine/world";
import { lit, throughAir } from "./air";
import type { Palette } from "./palette";
import { plantShape } from "./plant-shapes";
import { vec3Attribute } from "./tsl";

/*
 * The land's own sights near the camera: a tor's stack of weathered slabs
 * on its rise, and a cascade's white water tumbling down a valley wall along
 * its fall line. Tarns are the land's and water's own, and a river's falls
 * are its water stepping down a terrace, so neither needs anything more.
 */

/** How far off the places are drawn, in metres, and how far the camera moves before that is worked out again. */
const REACH = 1500;
const RECHECK = 64;
/** A cascade's width, in metres. */
const CASCADE_WIDTH = 2.6;

function solidMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  const colour = vec3Attribute("color");
  const normal = normalize(vec3Attribute("normal"));
  material.colorNode = varying(throughAir(lit(colour, normal), positionWorld));
  material.fog = false;
  return material;
}

/** A tor: big rounded slabs piled on its rise, each a rock design turned, squashed and stacked. */
function torGeometry(place: Place, world: World, palette: Palette): BufferGeometry {
  const rng = createRng(place.seed);
  const parts: BufferGeometry[] = [];
  const slabs = 5 + Math.floor(rng.next() * 4);
  const m = new Matrix4();
  const q = new Quaternion();
  for (let k = 0; k < slabs; k++) {
    const shape = plantShape("rock", Math.floor(rng.next() * 3), "near", palette);
    if (!shape) continue;
    const angle = rng.next() * Math.PI * 2;
    const out = k === 0 ? 0 : 1.5 + rng.next() * 3.5;
    const x = place.x + Math.cos(angle) * out;
    const z = place.z + Math.sin(angle) * out;
    const size = 2.2 + rng.next() * 2.4 - out * 0.2;
    const stacked = k > 0 && k < 3 ? size * 0.45 : 0;
    q.setFromAxisAngle(new Vector3(0, 1, 0), rng.next() * Math.PI * 2);
    m.compose(new Vector3(x, world.heightAt(x, z) - size * 0.15 + stacked, z), q, new Vector3(size * 1.2, size * 0.6, size));
    parts.push(shape.applyMatrix4(m));
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}

/** A cascade: a ribbon of white water down its fall line, lying just over the ground. */
function cascadeGeometry(fall: Float32Array, palette: Palette): BufferGeometry {
  const points = fall.length / 3;
  const positions = new Float32Array(points * 2 * 3);
  const colours = new Float32Array(points * 2 * 3);
  const normals = new Float32Array(points * 2 * 3);
  const foam = palette.things["water-foam"];
  for (let k = 0; k < points; k++) {
    const next = Math.min(points - 1, k + 1);
    const prev = Math.max(0, k - 1);
    const dx = fall[next * 3] - fall[prev * 3];
    const dz = fall[next * 3 + 2] - fall[prev * 3 + 2];
    const length = Math.hypot(dx, dz) || 1;
    const across = { x: (-dz / length) * CASCADE_WIDTH * 0.5, z: (dx / length) * CASCADE_WIDTH * 0.5 };
    const y = fall[k * 3 + 1] + 0.25;
    positions.set([fall[k * 3] - across.x, y, fall[k * 3 + 2] - across.z, fall[k * 3] + across.x, y, fall[k * 3 + 2] + across.z], k * 6);
    const shade = 0.85 + 0.15 * Math.sin(k * 1.7);
    colours.set([foam.r * shade, foam.g * shade, foam.b * shade, foam.r * shade, foam.g * shade, foam.b * shade], k * 6);
    normals.set([0, 1, 0, 0, 1, 0], k * 6);
  }
  const indices: number[] = [];
  for (let k = 0; k < points - 1; k++) {
    const a = k * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colours, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

export interface Places {
  object: Group;
  update: (eye: Vector3) => void;
  dispose: () => void;
}

export function makePlaces(world: World, palette: Palette): Places {
  const object = new Group();
  const material = solidMaterial();
  const drawn = new Map<string, Mesh>();
  let from: { x: number; z: number } | null = null;

  const meshOf = (place: Place): Mesh | null => {
    if (place.kind === "tor") return new Mesh(torGeometry(place, world, palette), material);
    if (place.kind === "cascade" && place.fall) return new Mesh(cascadeGeometry(place.fall, palette), material);
    return null;
  };

  return {
    object,
    update(eye) {
      if (from !== null && Math.hypot(eye.x - from.x, eye.z - from.z) < RECHECK) return;
      from = { x: eye.x, z: eye.z };
      const near = new Set<string>();
      for (const place of world.placesNear(eye.x, eye.z, REACH)) {
        const key = `${String(place.cellX)},${String(place.cellZ)}`;
        near.add(key);
        if (drawn.has(key)) continue;
        const mesh = meshOf(place);
        if (!mesh) continue;
        drawn.set(key, mesh);
        object.add(mesh);
      }
      for (const [key, mesh] of drawn) {
        if (near.has(key)) continue;
        object.remove(mesh);
        mesh.geometry.dispose();
        drawn.delete(key);
      }
    },
    dispose() {
      for (const mesh of drawn.values()) mesh.geometry.dispose();
      drawn.clear();
      material.dispose();
      object.clear();
    },
  };
}
