import { BufferAttribute, BufferGeometry, Color, Matrix4, MeshBasicNodeMaterial, Vector3, type Node } from "three/webgpu";
import { attribute, cameraPosition, float, int, mat4, mix, modelWorldMatrix, normalGeometry, positionGeometry, positionWorld, reflect, smoothstep, uniform, uniformArray, varying, vec3, vec4 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { BikeMesh } from "./build";
import { PARTS } from "./rig";
import { SLOTS, type Slot } from "./shapes";

/*
 * One material for a bike and its rider: the world's light, the same sum as the
 * cars', a palette indexed by each face's slot, and the rigid parts moved in the
 * vertex shader from one array of matrices. So a cyclist is one draw call, and
 * its pose and colours are numbers changing.
 */

const AMBIENT = 0.6;
const SUN_SHARE = 0.62;
const SPECULAR_POWER = 90;
const LOW_SHADE = 0.72;

const GLOSS: Record<Slot, number> = {
  frame: 0.5,
  accent: 0.5,
  tyre: 0.04,
  metal: 0.9,
  dark: 0.2,
  saddle: 0.15,
  bag: 0.05,
  basket: 0.05,
  lamp: 0.8,
  skin: 0.08,
  hair: 0.1,
  top: 0,
  bottom: 0,
  shoe: 0.1,
  helmet: 0.5,
};

export function bikeGeometry(mesh: BikeMesh): BufferGeometry {
  const tags = new Float32Array(mesh.triangles * 9);
  mesh.surfaces.forEach((slot, vertex) => {
    tags.set([mesh.parts[vertex], slot, GLOSS[SLOTS[slot]]], vertex * 3);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("bikeTag", new BufferAttribute(tags, 3));
  return geometry;
}

const token = (name: string): Color => themeColor(`--color-aland-drive-${name}`);

export interface BikeMaterialOptions {
  sun: { azimuthDeg: number; elevationDeg: number };
  hazed?: (color: Node<"vec3">) => Node<"vec3">;
}

export function bikeMaterial({ sun, hazed }: BikeMaterialOptions) {
  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  const elevation = (sun.elevationDeg * Math.PI) / 180;
  const toSun = uniform(new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)));

  const matrices = PARTS.map(() => new Matrix4());
  const partMatrices = uniformArray(matrices, "mat4");
  const palette = SLOTS.map(() => new Color());
  const paletteColours = uniformArray(palette, "color");

  const tag = attribute<"vec3">("bikeTag", "vec3");
  const placed = mat4(partMatrices.element(int(tag.x)));
  const position = placed.mul(vec4(positionGeometry, 1)).xyz;
  const normalInModel = placed.mul(vec4(normalGeometry, 0)).xyz;
  const normalInWorld = varying(modelWorldMatrix.mul(vec4(normalInModel, 0)).xyz);
  const base = varying(vec3(paletteColours.element(int(tag.y)) as Node<"vec3">));
  const gloss = varying(tag.z);
  const height = varying(position.y);

  const sky = uniform(token("sky"));
  const sunColour = uniform(token("sun"));

  const normal = normalInWorld.normalize();
  const toCamera = cameraPosition.sub(positionWorld).normalize();
  const ray = reflect(toCamera.negate(), normal);
  const lowShade = mix(float(LOW_SHADE), float(1), smoothstep(float(0), float(0.7), height));
  const lit = float(AMBIENT).mul(lowShade).add(normal.dot(toSun).max(0).mul(SUN_SHARE));
  const fresnel = float(1).sub(normal.dot(toCamera).max(0)).pow(4).mul(gloss).mul(0.6);
  const surface = mix(base.mul(lit), sky.mul(ray.y.max(0).mul(0.5).add(0.5)), fresnel);
  const specular = sunColour.mul(ray.dot(toSun).max(0).pow(SPECULAR_POWER)).mul(gloss.mul(0.7));
  const finished: Node<"vec3"> = vec3(surface.add(specular));

  const material = new MeshBasicNodeMaterial();
  material.positionNode = position;
  material.colorNode = hazed ? hazed(finished) : finished;

  return {
    material,
    /** The rig's matrices, in the order of `PARTS`. */
    setPose(pose: number[][]) {
      pose.forEach((values, at) => matrices[at].fromArray(values));
    },
    setSlot(slot: Slot, tokenName: string) {
      palette[SLOTS.indexOf(slot)].copy(token(tokenName));
    },
  };
}
