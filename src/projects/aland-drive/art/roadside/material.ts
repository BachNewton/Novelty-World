import { BufferAttribute, BufferGeometry, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, Vector3, type Node } from "three/webgpu";
import { attribute, cameraPosition, cos, cross, dot, float, fract, int, mix, normalGeometry, normalize, positionGeometry, round, screenCoordinate, select, sin, smoothstep, uniformArray, uv, varying, vec2, vec3 } from "three/tsl";
import { outsideCar } from "../car-volume";
import { placeSeed, unitOf } from "../hash";
import { PARTS, type Part } from "./mesh";
import { POLE_CONDUCTORS, WIRE_SAG_SHARE, type RoadsideModel } from "./models";
import { flatNormal } from "../flat-normal";
import { towardsSun, type Sun } from "../sun";

/*
 * Every roadside object draws through the same two materials (near and far) and
 * the same instance layout, as the forest does: a list of places is uploaded once,
 * and the shader shows each one at the version its distance calls for, or folds
 * it to a point. So nothing runs on the CPU as the car moves, and no material or
 * draw call is added for a new object beyond its near mesh and its far one.
 *
 * Nothing switches on a line. Round its swap the two versions trade pixels by a
 * fixed screen pattern, and towards its reach the last version dissolves the same
 * way, never shrinking or growing: a pixel or two thinning out isn't seen, a lamp
 * rising out of the ground would be. The pattern means a `discard`, so these
 * materials keep to objects, never to anything that covers the screen.
 *
 * Its light is the street and rural kits' too, so the three kits sit together.
 */

export interface RoadsideInputs {
  linear: (name: string) => Vector3;
  colour: (name: string) => Node<"vec3">;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
  sun: Sun;
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
  /** Lengthens along the model's +z, so a building fits its outline. Only the rural kit's materials read it. */
  depth?: number;
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
};

/** The light every placed kit shares: the sky's, the sun's on a face turned to it, and a darker last metre to the ground, as the buildings have. */
export const KIT_LIGHT = { ambient: 0.68, sunShare: 0.5, footShade: 0.72, footM: 1.1 } as const;
/** Each place swaps somewhere in this share past its model's swap, so they don't all go on one line, and none nearer than the swap measured (`lod-swaps.ts`). */
export const SWAP_SPREAD = 0.2;
/** The band two versions trade pixels over, as a share either side of the swap. */
const SWAP_BAND = 0.1;
/**
 * How far from the camera a list of a model's near version has to hold places, with a margin: a place swaps up to
 * `SWAP_SPREAD` past its model's swap and the two versions trade pixels up to the band past that, and a model with no
 * far version shows its near one to its reach. A list that holds only these draws exactly what one holding every place
 * would, since `placing` folds the rest to nothing anyway.
 */
export const nearRangeM = (model: Pick<RoadsideModel, "far" | "swapM" | "reachM">, marginM: number) => (model.far === null ? model.reachM : model.swapM * (1 + SWAP_SPREAD) * (1 + SWAP_BAND)) + marginM;
/** The same for a list of the far version, which goes at its reach. */
export const farRangeM = (model: Pick<RoadsideModel, "reachM">, marginM: number) => model.reachM + marginM;
/** The share of its reach over which the last version dissolves. */
const LEAVE_SHARE = 0.15;

/** A flat-shaded face's own normal, and the kit's light on it. */
export function facetLight(sun: RoadsideInputs["sun"]) {
  const normal = flatNormal();
  return { normal, lit: float(KIT_LIGHT.ambient).add(normal.dot(towardsSun(sun)).max(0).mul(KIT_LIGHT.sunShare)) };
}

/** Darker in the last metre to the ground: 1 above it. */
export const footShade = (foot: Node<"float">) => mix(float(KIT_LIGHT.footShade), float(1), smoothstep(float(0), float(KIT_LIGHT.footM), foot));

/** A place's pseudo-random share, the same every time it's asked. */
/** A place's own seed, made in the vertex stage from the place as stored, so every pixel of its model reads the same one. */
export const seedAt = (place: Node<"vec2">): Node<"uint"> => varying(placeSeed(place));
export const rollOf = (place: Node<"vec2">) => unitOf(seedAt(place), 1);

/** Interleaved gradient noise: an even spread of thresholds over the screen, the same every frame for a still pixel. */
export const screenPattern = () => fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));

/** How a vertex of this kit is coloured and lit. */
function paintOf({ linear, sun }: Pick<RoadsideInputs, "linear" | "sun">, foot: Node<"float">) {
  const colours = PARTS.map((part) => {
    const { from, to, share = 0, gain = 1 } = PAINT[part];
    return linear(from).lerp(to === undefined ? linear(from) : linear(to), share).multiplyScalar(gain);
  });
  const palette = uniformArray(colours);
  const tint = attribute<"vec4">("tint", "vec4");
  const base = (palette.element(int(round(tint.r.mul(255)))) as unknown as Node<"vec3">).mul(tint.g.mul(255 / 128));
  return base.mul(facetLight(sun).lit.mul(footShade(foot)));
}

/**
 * Where a place's vertex goes, its normal turned with it, and which of its pixels
 * show: `isNear` picks the version. A model with no far version has its swap at
 * its reach, so its near version dissolves there.
 */
function placing(isNear: boolean) {
  const place = attribute<"vec4">("place", "vec4");
  const fit = attribute<"vec4">("fit", "vec4");
  const reach = attribute<"vec2">("reach", "vec2");
  const distance = place.xz.sub(cameraPosition.xz).length();
  const roll = rollOf(place.xz);
  const swap = reach.x.mul(float(1).add(roll.mul(SWAP_SPREAD)));
  const end = reach.y.mul(float(1).sub(roll.mul(SWAP_SPREAD * 0.5)));
  const shown = isNear ? distance.lessThan(swap.mul(1 + SWAP_BAND)) : distance.greaterThanEqual(swap.mul(1 - SWAP_BAND)).and(distance.lessThan(end));
  const scale = select(shown, fit.x, float(0));
  const x = positionGeometry.x.mul(fit.y);
  const up = positionGeometry.y.add(x.mul(fit.z));
  const yawCos = cos(place.w);
  const yawSin = sin(place.w);
  const turned = (along: Node<"float">, across: Node<"float">) => vec2(along.mul(yawCos).add(across.mul(yawSin)), across.mul(yawCos).sub(along.mul(yawSin)));
  const flat = turned(x, positionGeometry.z).mul(scale);
  const normalFlat = turned(normalGeometry.x, normalGeometry.z);

  const pattern = screenPattern();
  const swapped = smoothstep(swap.mul(1 - SWAP_BAND), swap.mul(1 + SWAP_BAND), distance);
  const leaving = smoothstep(end.mul(1 - LEAVE_SHARE), end, distance);
  return {
    position: vec3(place.x.add(flat.x), place.y.add(up.mul(scale)), place.z.add(flat.y)),
    normal: vec3(normalFlat.x, normalGeometry.y, normalFlat.y),
    mask: isNear ? pattern.greaterThanEqual(swapped) : pattern.lessThan(swapped).and(pattern.greaterThanEqual(leaving)),
    foot: up.mul(fit.x),
  };
}

function placedMaterial(inputs: RoadsideInputs, isNear: boolean): MeshBasicNodeMaterial {
  const { position, mask, foot } = placing(isNear);
  const material = new MeshBasicNodeMaterial();
  material.name = isNear ? "roadside-near" : "roadside-far";
  material.positionNode = position;
  material.maskNode = mask.and(outsideCar());
  material.colorNode = inputs.hazed(paintOf(inputs, foot));
  material.side = DoubleSide;
  return material;
}

/** The kit's materials, made once for the game; all objects share them. */
export function roadsideMaterials(inputs: RoadsideInputs) {
  return { near: placedMaterial(inputs, true), far: placedMaterial(inputs, false) };
}

export type RoadsideMaterials = ReturnType<typeof roadsideMaterials>;

/**
 * Where a road sign's plate or post goes (`art/surfaces`' `signPlate` and
 * `signPost`, drawn by its `signMaterial` and `signPostMaterial`), placed as this
 * kit's models are and dissolving at its reach. Plates of one outline share a
 * mesh, and each reads its own sign by `signShift`: its cell's offset on the sheet
 * from the cell the mesh was cut for.
 */
export function signPlacing() {
  const { position, normal, mask } = placing(true);
  return { position, normal, mask, uv: uv().add(attribute<"vec2">("signShift", "vec2")) };
}

/** Plates of one outline at their places, each shifted on the sheet to its own sign. */
export function placeSignPlates(model: RoadsideModel, places: readonly Placement[], shifts: readonly (readonly [number, number])[], material: MeshBasicNodeMaterial): Mesh {
  const mesh = new Mesh(instanced(model.near, { ...instanceBuffers(model, places), signShift: new InstancedBufferAttribute(Float32Array.from(shifts.flat()), 2) }, places.length), material);
  mesh.frustumCulled = false;
  return mesh;
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
  places.forEach(({ x, y, z, yaw = 0, scale = 1, stretch = 1, shear = 0, depth = 1 }, index) => {
    data.set([x, y, z, yaw, scale, stretch, shear, depth, model.swapM, model.reachM], index * STRIDE);
  });
  const part = (size: number, from: number) => {
    const column = new Float32Array(places.length * size);
    for (let index = 0; index < places.length; index++) column.set(data.subarray(index * STRIDE + from, index * STRIDE + from + size), index * size);
    return new InstancedBufferAttribute(column, size);
  };
  return { place: part(4, 0), fit: part(4, 4), reach: part(2, 8) };
}

/** A model at all its places: one or two meshes to add to the scene, which then need nothing further. */
export function placeModel(model: RoadsideModel, places: readonly Placement[], materials: RoadsideMaterials): Mesh[] {
  return [...placeVersion(model, "near", places, materials), ...placeVersion(model, "far", places, materials)];
}

/** One version of a model at its places, for lists that hold different places: none for a far version the model hasn't. */
export function placeVersion(model: RoadsideModel, version: "near" | "far", places: readonly Placement[], materials: RoadsideMaterials): Mesh[] {
  const geometry = model[version];
  if (geometry === null) return [];
  const mesh = new Mesh(instanced(geometry, instanceBuffers(model, places), places.length), materials[version]);
  mesh.frustumCulled = false;
  return [mesh];
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
  material.name = "wires";
  // A span goes as one, so a long one can't fan out to a point from half inside the reach, and it dissolves as the poles do.
  const away = middle.sub(cameraPosition).length();
  material.positionNode = select(away.lessThan(WIRE_REACH_M), point.add(side.mul(positionGeometry.y).mul(width)), middle);
  material.maskNode = screenPattern().greaterThanEqual(smoothstep(float(WIRE_REACH_M * (1 - LEAVE_SHARE)), float(WIRE_REACH_M), away));
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
