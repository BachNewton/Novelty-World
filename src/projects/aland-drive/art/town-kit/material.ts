import { InstancedBufferAttribute, Vector3, type Mesh, type MeshBasicNodeMaterial, type Node, type Texture } from "three/webgpu";
import { attribute, cameraPosition, cross, dFdx, dFdy, float, fract, int, mix, normalize, positionGeometry, positionWorld, round, select, smoothstep, texture, uniform, uniformArray } from "three/tsl";
import { placeModel, signSheetUv, type Placement } from "../roadside/material";
import type { RoadsideModel } from "../roadside/models";
import { streetMaterials, type StreetInputs } from "../street/material";
import { TOWN_PARTS, type TownPart } from "./paint";
import "./tokens.css";

/*
 * The street kit's two materials, kept for where a vertex goes (the same instance layout, grow-in and near/far
 * dissolve), with the colour replaced so they read this kit's paints. So `placeModel` places these models and the
 * dissolve can't drift from the street's. Traffic lights and name plates are the same with one more thing each: a
 * lamp that follows a clock, and a face read from a sheet.
 */

const PAINT: Record<TownPart, { from: string; to?: string; share?: number; gain?: number }> = {
  "lamp-iron": { from: "wall-plinth", gain: 0.5 },
  "lamp-roof": { from: "wall-plinth", gain: 0.42 },
  "lamp-glass": { from: "car-lamp", to: "wall-pale", share: 0.35 },
  galvanised: { from: "wall-grey", to: "wall-pale", share: 0.72, gain: 1.05 },
  "signal-black": { from: "car-tyre", gain: 1.3 },
  "signal-red": { from: "signal-red" },
  "signal-amber": { from: "signal-amber" },
  "signal-green": { from: "signal-green" },
  "signal-walk": { from: "signal-green" },
  "signal-stop": { from: "signal-red" },
  "plate-blue": { from: "plate-blue" },
  "plate-white": { from: "wall-trim" },
  "plate-black": { from: "car-tyre", gain: 1.2 },
  "plate-yellow": { from: "plate-yellow" },
  "plate-back": { from: "wall-grey", to: "wall-pale", share: 0.5 },
  "name-face": { from: "plate-blue" },
  "stripe-black": { from: "car-tyre", gain: 1.4 },
  "stripe-white": { from: "wall-trim" },
  "post-wood": { from: "wall-door", to: "wall-grey", share: 0.3 },
  "board-white": { from: "wall-trim" },
  "roof-red": { from: "wall-red", gain: 0.95 },
  "box-white": { from: "wall-trim", to: "wall-grey", share: 0.1 },
  soil: { from: "tree-bark", gain: 0.5 },
  leaf: { from: "tree-birch", to: "tree-pine", share: 0.25, gain: 1.05 },
  "leaf-lit": { from: "tree-birch", to: "wall-yellow", share: 0.1, gain: 1.2 },
  "bloom-red": { from: "wall-red", to: "signal-red", share: 0.5 },
  "bloom-white": { from: "wall-trim", gain: 1.05 },
  "bike-red": { from: "bike-red" },
  "bike-blue": { from: "bike-blue" },
  "bike-black": { from: "car-tyre", to: "wall-plinth", share: 0.3 },
  "bike-tyre": { from: "car-tyre" },
  "bike-steel": { from: "car-rim" },
  "bike-saddle": { from: "car-trim", gain: 1.5 },
  "deck-boards": { from: "wall-grey", to: "wall-door", share: 0.25, gain: 1.08 },
  "float-dark": { from: "wall-plinth", gain: 0.55 },
  "boat-white": { from: "wall-trim" },
  "boat-navy": { from: "car-paint-navy" },
  "boat-under": { from: "wall-red", to: "wall-plinth", share: 0.5, gain: 0.7 },
  "boat-deck": { from: "wall-cream", to: "wall-grey", share: 0.2 },
  "boat-glass": { from: "car-glass", to: "water", share: 0.25 },
  mast: { from: "wall-pale", gain: 1.08 },
  "sail-cover": { from: "water", gain: 0.7 },
  "clad-pale": { from: "wall-pale", to: "wall-trim", share: 0.3 },
  "clad-grey": { from: "wall-pale", to: "wall-grey", share: 0.6 },
  "clad-roof": { from: "wall-grey", to: "wall-plinth", share: 0.3 },
  "terminal-glass": { from: "terminal-glass" },
  "frame-dark": { from: "wall-plinth", gain: 0.8 },
  "steel-leg": { from: "wall-pale", to: "wall-grey", share: 0.3, gain: 0.92 },
  "ramp-steel": { from: "ramp-blue" },
  "ramp-deck": { from: "road-main", to: "wall-grey", share: 0.25 },
  "ramp-rail": { from: "plate-yellow", to: "wall-grey", share: 0.25 },
  concrete: { from: "wall-pale", to: "wall-grey", share: 0.45 },
  "ferry-white": { from: "wall-trim" },
  "ferry-shade": { from: "wall-trim", to: "wall-grey", share: 0.4 },
  "ferry-hull": { from: "ferry-hull" },
  "ferry-boot": { from: "ferry-boot" },
  "ferry-glass": { from: "car-glass", to: "water", share: 0.3 },
  "ferry-deck": { from: "wall-cream", to: "wall-grey", share: 0.45 },
  "ferry-funnel": { from: "ferry-funnel" },
  "ferry-funnel-top": { from: "car-tyre", gain: 1.5 },
  "ferry-lifeboat": { from: "ferry-lifeboat" },
  "ferry-steel": { from: "wall-grey", to: "wall-plinth", share: 0.4 },
};

const AMBIENT = 0.68;
const SUN_SHARE = 0.5;
const FOOT_SHADE = 0.72;
const FOOT_M = 1.1;

/** Parts that give their own light: the sun doesn't shade them. */
const GLOWING: readonly TownPart[] = ["signal-red", "signal-amber", "signal-green", "signal-walk", "signal-stop"];
const GLOW_GAIN = 1.5;
const UNLIT_SHARE = 0.09;

/** Seconds of one whole cycle, and where in it each lamp is on: green, then amber, then red, then red and amber together before green. */
const CYCLE_S = 36;
const GREEN_ENDS = 0.4;
const AMBER_ENDS = 0.46;
const RED_AMBER_FROM = 0.94;

const partIs = (part: Node<"float">, name: TownPart) => part.equal(TOWN_PARTS.indexOf(name));

const partOf = () => round(attribute<"vec4">("tint", "vec4").r.mul(255));

function painted({ linear }: Pick<StreetInputs, "linear">) {
  const palette = uniformArray(TOWN_PARTS.map((part) => {
    const { from, to, share = 0, gain = 1 } = PAINT[part];
    return linear(from).lerp(to === undefined ? linear(from) : linear(to), share).multiplyScalar(gain);
  }));
  return (palette.element(int(partOf())) as unknown as Node<"vec3">).mul(attribute<"vec4">("tint", "vec4").g.mul(255 / 128));
}

function lightOf({ sun }: Pick<StreetInputs, "sun">) {
  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  const elevation = (sun.elevationDeg * Math.PI) / 180;
  const toSun = uniform(new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)));
  const fit = attribute<"vec4">("fit", "vec4");
  const up = positionGeometry.y.add(positionGeometry.x.mul(fit.y).mul(fit.z)).mul(fit.x);
  const facing = normalize(cross(dFdx(positionWorld), dFdy(positionWorld)));
  const normal = select(facing.dot(cameraPosition.sub(positionWorld)).lessThan(0), facing.negate(), facing);
  return float(AMBIENT).add(normal.dot(toSun).max(0).mul(SUN_SHARE)).mul(mix(float(FOOT_SHADE), float(1), smoothstep(float(0), float(FOOT_M), up)));
}

function recoloured(inputs: StreetInputs, colourOf: (base: Node<"vec3">, lit: Node<"float">) => Node<"vec3">) {
  const { near, far } = streetMaterials(inputs);
  for (const material of [near, far]) material.colorNode = inputs.hazed(colourOf(painted(inputs), lightOf(inputs)));
  return { near, far };
}

/** The kit's materials, made once for the game; every model but the traffic lights and the name plates shares them. */
export function townMaterials(inputs: StreetInputs) {
  return recoloured(inputs, (base, lit) => base.mul(lit));
}

export type TownMaterials = ReturnType<typeof townMaterials>;

/** How much of its light a lamp of a head has, at this moment of the head's cycle. */
function signalShare(inputs: StreetInputs) {
  const phase = fract(inputs.time.div(CYCLE_S).add(attribute<"float">("signalPhase", "float")));
  const on = (when: Node<"bool">) => select(when, float(1), float(0));
  const green = phase.lessThan(GREEN_ENDS);
  const amber = phase.greaterThanEqual(GREEN_ENDS).and(phase.lessThan(AMBER_ENDS)).or(phase.greaterThanEqual(RED_AMBER_FROM));
  const red = phase.greaterThanEqual(AMBER_ENDS);
  const part = partOf();
  return select(partIs(part, "signal-red").or(partIs(part, "signal-stop")), on(red), select(partIs(part, "signal-amber"), on(amber), on(green)));
}

/** Traffic lights': the street's, with lamps that follow `time` round one cycle, each head from its own start. */
export function trafficLightMaterials(inputs: StreetInputs) {
  return recoloured(inputs, (base, lit) => {
    const part = partOf();
    const glowing = GLOWING.reduce<Node<"bool">>((any, name) => any.or(partIs(part, name)), part.lessThan(0));
    return select(glowing, base.mul(mix(float(UNLIT_SHARE), float(GLOW_GAIN), signalShare(inputs))), base.mul(lit));
  });
}

export interface SignalPlacement extends Placement {
  /** Where in the cycle this head starts, 0 to 1: half a turn apart for two roads that take turns. */
  phase: number;
}

/** A model of traffic lights at its places. */
export function placeTrafficLights(model: RoadsideModel, places: readonly SignalPlacement[], materials: ReturnType<typeof trafficLightMaterials>): Mesh[] {
  const meshes = placeModel(model, places, materials);
  const phases = new InstancedBufferAttribute(Float32Array.from(places, ({ phase }) => phase), 1);
  for (const mesh of meshes) mesh.geometry.setAttribute("signalPhase", phases);
  return meshes;
}

/** A name plate's: the street's near material, whose `name-face` reads the cell of `sheet` that its instance names. */
export function namePlateMaterial(inputs: StreetInputs, sheet: Texture): MeshBasicNodeMaterial {
  const { near } = recoloured(inputs, (base, lit) => select(partIs(partOf(), "name-face"), texture(sheet, signSheetUv()).rgb.mul(lit), base.mul(lit)));
  return near;
}
