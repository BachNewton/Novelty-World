import { BufferAttribute, BufferGeometry, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, Vector3, type Node } from "three/webgpu";
import { attribute, cameraPosition, cos, cross, dFdx, dFdy, dot, float, fract, int, mix, normalize, positionGeometry, positionWorld, round, select, sin, smoothstep, uniform, uniformArray, uv, vec2, vec3 } from "three/tsl";
import { PARTS, type Part } from "./mesh";
import { POLE_CONDUCTORS, WIRE_SAG_SHARE, type RoadsideModel } from "./models";

/*
 * Every roadside object draws through the same two materials (near and far) and
 * the same instance layout, as the forest does: a list of places is uploaded once,
 * and the shader shows each one at the version its distance calls for, or folds
 * it to a point. So nothing runs on the CPU as the car moves, and no material or
 * draw call is added for a new object beyond its near mesh and its far one.
 */

export interface RoadsideInputs {
  linear: (name: string) => Vector3;
  colour: (name: string) => Node<"vec3">;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
  sun: { azimuthDeg: number; elevationDeg: number };
}

export interface Placement {
  x: number;
  /** The ground, or the water, or the road's surface for a bridge. */
  y: number;
  z: number;
  /** Turns the model's +z towards (sin yaw, cos yaw) on the ground. */
  yaw?: number;
  /** A pine's height; 1 otherwise. */
  scale?: number;
  /** Lengthens along the model's +x, so a fence section fits its run. */
  stretch?: number;
  /** Metres up per metre along +x, so a fence follows a slope. */
  shear?: number;
}

/** The paint of each part: a token, or two mixed; then a brightness. All colour comes from the game's own tokens. */
const PAINT: Record<Part, { from: string; to?: string; share?: number; gain?: number }> = {
  galvanised: { from: "wall-grey", to: "wall-pale", share: 0.72, gain: 1.05 },
  lens: { from: "car-lamp", gain: 0.92 },
  "pole-wood": { from: "tree-bark", to: "wall-grey", share: 0.22, gain: 0.8 },
  "steel-band": { from: "wall-plinth", gain: 0.9 },
  porcelain: { from: "wall-pale", to: "wall-trim", share: 0.5 },
  "fence-wood": { from: "wall-grey", to: "tree-bark", share: 0.5, gain: 1.05 },
  "fence-white": { from: "wall-trim" },
  "post-wood": { from: "wall-grey", to: "wall-door", share: 0.55 },
  "mailbox-red": { from: "wall-red", to: "car-body", share: 0.6, gain: 1.05 },
  "shelter-red": { from: "wall-red" },
  "shelter-trim": { from: "wall-trim" },
  "shelter-roof": { from: "wall-plinth", gain: 0.85 },
  "shelter-inside": { from: "wall-red", to: "wall-plinth", share: 0.5, gain: 0.7 },
  concrete: { from: "wall-pale", to: "wall-grey", share: 0.3 },
  "concrete-dark": { from: "wall-pale", to: "wall-grey", share: 0.75, gain: 0.8 },
  "rail-steel": { from: "wall-pale", to: "wall-grey", share: 0.4, gain: 0.85 },
  "pier-wood": { from: "wall-grey", to: "wall-door", share: 0.3, gain: 1.02 },
  "pier-wood-pale": { from: "wall-grey", to: "wall-door", share: 0.12, gain: 1.08 },
  "pile-wood": { from: "wall-door", to: "wall-plinth", share: 0.5, gain: 0.8 },
  "pontoon-hull": { from: "wall-plinth", gain: 0.55 },
  bark: { from: "tree-bark", to: "wall-grey", share: 0.25 },
  "bark-upper": { from: "tree-bark", to: "edge", share: 0.12, gain: 1.3 },
  needles: { from: "tree-pine", gain: 1.05 },
  "needles-lit": { from: "tree-pine", to: "tree-birch", share: 0.3, gain: 1.15 },
  "sign-back": { from: "wall-pale", to: "wall-grey", share: 0.45 },
  "sign-face": { from: "wall-trim" },
};

const AMBIENT = 0.68;
const SUN_SHARE = 0.5;
/** Grounded the way the buildings are: darker in the last metre to the ground. */
const FOOT_SHADE = 0.72;
const FOOT_M = 1.1;
/** Each place swaps to its far version somewhere in this share of the distance, so they don't all go on one line. */
const SWAP_SPREAD = 0.2;

const SIGN_FACE = PARTS.indexOf("sign-face");

/** How a vertex of this kit is coloured and lit, for anything that draws it: a material here, or the forest's. */
function paintOf({ linear, sun }: Pick<RoadsideInputs, "linear" | "sun">, foot: Node<"float">) {
  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  const elevation = (sun.elevationDeg * Math.PI) / 180;
  const toSun = uniform(new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)));
  const colours = PARTS.map((part) => {
    const { from, to, share = 0, gain = 1 } = PAINT[part];
    return linear(from).lerp(to === undefined ? linear(from) : linear(to), share).multiplyScalar(gain);
  });
  const palette = uniformArray(colours);
  const tint = attribute<"vec4">("tint", "vec4");
  const part = round(tint.r.mul(255));
  const base = (palette.element(int(part)) as unknown as Node<"vec3">).mul(tint.g.mul(255 / 128));

  const facing = normalize(cross(dFdx(positionWorld), dFdy(positionWorld)));
  const normal = select(facing.dot(cameraPosition.sub(positionWorld)).lessThan(0), facing.negate(), facing);
  const lit = float(AMBIENT).add(normal.dot(toSun).max(0).mul(SUN_SHARE));
  const grounded = mix(float(FOOT_SHADE), float(1), smoothstep(float(0), float(FOOT_M), foot));
  return { base, lit: lit.mul(grounded), part };
}

/** A place's pseudo-random share, the same every time it's asked. */
const rollOf = (place: Node<"vec2">) => fract(sin(dot(place, vec2(12.9898, 78.233))).mul(43758.5453));

function placedMaterial(inputs: RoadsideInputs, isNear: boolean, signFace?: Node<"vec3">): MeshBasicNodeMaterial {
  const place = attribute<"vec4">("place", "vec4");
  const fit = attribute<"vec4">("fit", "vec4");
  const reach = attribute<"vec2">("reach", "vec2");
  const distance = place.xz.sub(cameraPosition.xz).length();
  const swap = reach.x.mul(float(1).sub(rollOf(place.xz).mul(SWAP_SPREAD)));
  const shown = isNear ? distance.lessThan(swap) : distance.greaterThanEqual(swap).and(distance.lessThan(reach.y));
  const scale = select(shown, fit.x, float(0));
  const local = positionGeometry;
  const x = local.x.mul(fit.y);
  const up = local.y.add(x.mul(fit.z));
  const yawCos = cos(place.w);
  const yawSin = sin(place.w);

  const material = new MeshBasicNodeMaterial();
  material.positionNode = vec3(place.x.add(x.mul(yawCos).add(local.z.mul(yawSin)).mul(scale)), place.y.add(up.mul(scale)), place.z.add(local.z.mul(yawCos).sub(x.mul(yawSin)).mul(scale)));
  const { base, lit, part } = paintOf(inputs, up.mul(fit.x));
  const painted = signFace === undefined ? base : select(part.equal(SIGN_FACE), signFace, base);
  material.colorNode = inputs.hazed(painted.mul(lit));
  material.side = DoubleSide;
  return material;
}

/** The kit's materials, made once for the game; all objects share them. */
export function roadsideMaterials(inputs: RoadsideInputs) {
  return { near: placedMaterial(inputs, true), far: placedMaterial(inputs, false) };
}

export type RoadsideMaterials = ReturnType<typeof roadsideMaterials>;

/**
 * A sign plate's material. `face` colours its front, typically the sign sheet
 * sampled at `signSheetUv()`.
 */
export function signMaterial(inputs: RoadsideInputs, face: Node<"vec3">): MeshBasicNodeMaterial {
  return placedMaterial(inputs, true, face);
}

/** Where a sign's front reads the sheet: its plate's own 0 to 1 within the instance's `cell`. */
export function signSheetUv(): Node<"vec2"> {
  const cell = attribute<"vec4">("cell", "vec4");
  return uv().mul(cell.zw).add(cell.xy);
}

const STRIDE = 10;

function instanced(geometry: BufferGeometry, buffers: Record<string, InstancedBufferAttribute>, count: number): InstancedBufferGeometry {
  const copy = new InstancedBufferGeometry();
  copy.index = geometry.index;
  for (const [name, values] of Object.entries(geometry.attributes)) copy.setAttribute(name, values as BufferAttribute);
  for (const [name, values] of Object.entries(buffers)) copy.setAttribute(name, values);
  copy.instanceCount = count;
  return copy;
}

function instanceBuffers(model: RoadsideModel, places: readonly Placement[]) {
  const data = new Float32Array(places.length * STRIDE);
  places.forEach(({ x, y, z, yaw = 0, scale = 1, stretch = 1, shear = 0 }, index) => {
    data.set([x, y, z, yaw, scale, stretch, shear, 0, model.swapM, model.reachM], index * STRIDE);
  });
  const part = (size: number, from: number) => {
    const column = new Float32Array(places.length * size);
    for (let index = 0; index < places.length; index++) column.set(data.subarray(index * STRIDE + from, index * STRIDE + from + size), index * size);
    return new InstancedBufferAttribute(column, size);
  };
  return { place: part(4, 0), fit: part(4, 4), reach: part(2, 8) };
}

/** A model at all its places: one or two meshes to add to the scene, which then need nothing further. */
export function placeModel(model: RoadsideModel, places: readonly Placement[], { near, far }: RoadsideMaterials): Mesh[] {
  const buffers = instanceBuffers(model, places);
  const meshes = [new Mesh(instanced(model.near, buffers, places.length), near)];
  if (model.far !== null) meshes.push(new Mesh(instanced(model.far, buffers, places.length), far));
  for (const mesh of meshes) mesh.frustumCulled = false;
  return meshes;
}

export interface SignPlacement extends Placement {
  /** This sign's cell of the sheet: left, bottom, width, height, in the sheet's uv. */
  cell: readonly [number, number, number, number];
}

/** Plates of one shape at their places, each with its own cell of the sign sheet. */
export function placeSigns(model: RoadsideModel, places: readonly SignPlacement[], material: MeshBasicNodeMaterial): Mesh {
  const cells = new Float32Array(places.length * 4);
  places.forEach(({ cell }, index) => cells.set(cell, index * 4));
  const mesh = new Mesh(instanced(model.near, { ...instanceBuffers(model, places), cell: new InstancedBufferAttribute(cells, 4) }, places.length), material);
  mesh.frustumCulled = false;
  return mesh;
}

/** Thinnest a wire draws, in pixels: under one, so the antialiasing thins it with distance, and over the width where it would break into dashes. */
const WIRE_MIN_PIXELS = 0.8;
const WIRE_RADIUS_M = 0.009;
const WIRE_REACH_M = 700;

/** The wires' own material, which bends the unit span between two poles and keeps it at least a pixel wide. */
export function wireMaterial({ colour, hazed }: Pick<RoadsideInputs, "colour" | "hazed">, viewHeightPixels: Node<"float">, fieldOfViewDeg: number): MeshBasicNodeMaterial {
  const from = attribute<"vec4">("wireFrom", "vec4");
  const to = attribute<"vec4">("wireTo", "vec4");
  const conductor = int(round(positionGeometry.z));
  const heights = uniformArray(POLE_CONDUCTORS.map(({ up }) => up), "float");
  const offsets = uniformArray(POLE_CONDUCTORS.map(({ across }) => across), "float");
  const offset = offsets.element(conductor) as unknown as Node<"float">;
  const up = heights.element(conductor) as unknown as Node<"float">;
  // An offset across the line: the model's z axis at each pole's own yaw.
  const atPole = (pole: typeof from) => vec3(pole.x.add(sin(pole.w).mul(offset)), pole.y.add(up), pole.z.add(cos(pole.w).mul(offset)));
  const start = atPole(from);
  const end = atPole(to);
  const along = positionGeometry.x;
  const line = end.sub(start);
  const sag = line.length().mul(WIRE_SAG_SHARE).mul(along.mul(float(1).sub(along)).mul(4));
  const point = mix(start, end, along).sub(vec3(0, sag, 0));
  const toCamera = cameraPosition.sub(point);
  const distance = toCamera.length();
  const middle = mix(start, end, 0.5);
  const side = normalize(cross(line, toCamera));
  const metresPerPixel = distance.mul(Math.tan((fieldOfViewDeg * Math.PI) / 360) * 2).div(viewHeightPixels);
  const width = metresPerPixel.mul(WIRE_MIN_PIXELS / 2).max(float(WIRE_RADIUS_M));

  const material = new MeshBasicNodeMaterial();
  // A span goes as one, so a long one can't fan out to a point from half inside the reach.
  material.positionNode = select(middle.sub(cameraPosition).length().lessThan(WIRE_REACH_M), point.add(side.mul(positionGeometry.y).mul(width)), middle);
  material.colorNode = hazed(mix(colour("car-tyre"), colour("sky"), 0.25));
  material.side = DoubleSide;
  return material;
}

export interface WireSpan {
  /** The poles' feet and yaws, as they were placed. */
  from: Required<Pick<Placement, "x" | "y" | "z" | "yaw">>;
  to: Required<Pick<Placement, "x" | "y" | "z" | "yaw">>;
}

/** Every span of wire, in one mesh. */
export function placeWires(model: RoadsideModel, spans: readonly WireSpan[], material: MeshBasicNodeMaterial): Mesh {
  const column = (end: "from" | "to") => new InstancedBufferAttribute(Float32Array.from(spans.flatMap((span) => [span[end].x, span[end].y, span[end].z, span[end].yaw])), 4);
  const mesh = new Mesh(instanced(model.near, { wireFrom: column("from"), wireTo: column("to") }, spans.length), material);
  mesh.frustumCulled = false;
  return mesh;
}
