import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, type Material } from "three";
import { cameraViewMatrix, cameraWorldMatrix, dot, float, max, mix, normalize, positionLocal, positionWorld, pow, select, smoothstep, step, vec2, vec3, vec4 } from "three/tsl";
import { LightingModel, NodeMaterial, type LightingModelDirectInput, type Node, type NodeBuilder } from "three/webgpu";
import { liveFeatures, type FeatureId, type FeatureSwitches } from "../../features";
import type { LandTile } from "../../engine/tiles";
import { hash2, throughAir, valueNoise, type AtmosphereUniforms } from "../atmosphere";
import type { FeatureArt, StageContext, Stages } from "../feature-art";
import { FEATURE_ART } from "../features";
import type { Palette } from "../palette";
import type { SkyUniforms } from "../sky/sky";
import { earthCurve } from "../terrain";
import { colourUniform, typed } from "../tsl";
import { regionAbsorption, tileAbsorption } from "./absorption";
import { WATER_STEPS } from "./steps";
import { waterBelow, waterDepth, waterFalling, waterFlowDir, waterFootprint, waterMoving, waterP, waterView, type WaterColours, type WaterStep, type WaterSurface } from "./surface";
import { mirrored } from "./sky-reflection";

/*
 * Water: one node material for every lake, river, fall and pool, opaque (no
 * blending, so no overdraw), lighting itself from the air's light (the sky's
 * and the ground's all round, `uHwSkyLight`, and the key light,
 * `uHwKeyLight` from `uHwSunDir`) rather than three's lights, but for the
 * key light's shadow, which it takes as every lit thing does. On its own,
 * with every water feature off, it is plain: shallows to deep by how far
 * the bed lies below (the engine's depth, carried in the mesh), a flat
 * share of the sky over it, and where a river runs, streaks the way it
 * flows, running fast and white over falls. It ends in the air.
 *
 * Each water feature is a step of its own (`steps.ts`), building the surface
 * up in the group's order: the ripples bend the normal; the colour from
 * depth, the sky's mirror, the shore's foam and the ice each take the
 * surface on. Then the light: what comes up out of the body and the foam is
 * lit by the sky's light and by the key light where its shadow lets it
 * through; the mirror is light already; the key light glints off the
 * ripples where the sky is mirrored. The features of other groups reach the
 * water by their stages for the "water" kind, folded in as `materials.ts`
 * folds them; for water, `light`'s direct and indirect are the light the
 * body and foam give back from the key light and from all round.
 *
 * The far tiles' water (`farWater`) is this same material, so the same
 * graph and pipeline: its ripples, streaks and sparkles fade out by how
 * much surface a pixel spans, which leaves far water flat and still.
 */

/** The water lying on a tile, or null when it is dry: a grid at the water table, over every square any of whose corners is under water. */
export function waterGeometry(tile: LandTile): BufferGeometry | null {
  if (!tile.wet) return null;
  const { side, spacing, x0, z0 } = tile;
  const count = side * side;
  const positions = new Float32Array(count * 3);
  const depths = new Float32Array(count);
  for (let v = 0; v < count; v++) depths[v] = tile.water[v] - tile.heights[v];
  for (let v = 0; v < count; v++) {
    const c = v % side;
    const r = Math.floor(v / side);
    // On dry ground at the water's edge the surface stays level with the water beside it, under the bank, rather than climbing to another terrace's water table.
    let level = tile.water[v];
    if (depths[v] < 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const n = (r + dr) * side + c + dc;
          if (r + dr >= 0 && c + dc >= 0 && r + dr < side && c + dc < side && depths[n] >= 0) level = Math.min(level, tile.water[n]);
        }
      }
    }
    positions.set([x0 + c * spacing, level, z0 + r * spacing], v * 3);
  }
  const indices: number[] = [];
  for (let r = 0; r < side - 1; r++) {
    for (let c = 0; c < side - 1; c++) {
      const a = r * side + c;
      if ([a, a + side, a + 1, a + side + 1].every((i) => depths[i] < -0.3)) continue;
      indices.push(a, a + side, a + 1, a + 1, a + side, a + side + 1);
    }
  }
  if (indices.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("depth", new BufferAttribute(depths, 1));
  geometry.setAttribute("flow", new BufferAttribute(tile.flow, 2));
  geometry.setAttribute("fall", new BufferAttribute(tile.fall, 1));
  geometry.setAttribute("absorb", tileAbsorption(tile.regions, count));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** A round pool of still water at height 0, deepest in its middle, its shore at `radius`: a tarn or a pond shown on its own. */
export function poolGeometry(radius: number): BufferGeometry {
  const rings = 8;
  const segments = 40;
  const positions: number[] = [0, 0, 0];
  const depths: number[] = [1.8];
  for (let r = 1; r <= rings; r++) {
    const out = (r / rings) * radius * 1.06;
    for (let s = 0; s < segments; s++) {
      const angle = (s / segments) * Math.PI * 2;
      positions.push(Math.cos(angle) * out, 0, Math.sin(angle) * out);
      depths.push(1.8 * (1 - (out / radius) ** 2));
    }
  }
  const indices: number[] = [];
  for (let s = 0; s < segments; s++) indices.push(0, 1 + ((s + 1) % segments), 1 + s);
  for (let r = 1; r < rings; r++) {
    const inner = 1 + (r - 1) * segments;
    const outer = 1 + r * segments;
    for (let s = 0; s < segments; s++) {
      const n = (s + 1) % segments;
      indices.push(inner + s, inner + n, outer + s, inner + n, outer + n, outer + s);
    }
  }
  const count = positions.length / 3;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("depth", new BufferAttribute(new Float32Array(depths), 1));
  geometry.setAttribute("flow", new BufferAttribute(new Float32Array(count * 2), 2));
  geometry.setAttribute("fall", new BufferAttribute(new Float32Array(count), 1));
  geometry.setAttribute("absorb", regionAbsorption("highlands", count));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

const SHARED = new WeakMap<AtmosphereUniforms, WaterColours>();

/** The palette's water colours, as the uniforms every water material in one world shares, so they all build one shader. */
function waterColours(palette: Palette, air: AtmosphereUniforms, sky: SkyUniforms): WaterColours {
  const shared = SHARED.get(air);
  if (shared?.sky === sky) return shared;
  const made: WaterColours = {
    air,
    sky,
    shallow: colourUniform(new Color().copy(palette.things["water-shallow"])),
    deep: colourUniform(new Color().copy(palette.things["water-deep"])),
    foam: colourUniform(new Color().copy(palette.things["water-foam"])),
    // The bed as the land draws it under shallow water: its shore, stonier.
    bed: colourUniform(new Color().copy(palette.things["ground-shore"]).lerp(palette.things.rock, 0.4)),
  };
  SHARED.set(air, made);
  return made;
}

/** A river's streaks, running the way it flows, fast and white where it falls: how white, 0 to 1. */
function streaks(time: Node<"float">): Node<"float"> {
  const along = dot(waterP, waterFlowDir);
  const across = dot(waterP, vec2(waterFlowDir.y.negate(), waterFlowDir.x));
  const speed = waterFalling.mul(4).add(1.2);
  const a = typed<"float">(valueNoise(vec2(along.mul(0.5).sub(time.mul(speed)), across.mul(3))));
  const b = typed<"float">(valueNoise(vec2(along.mul(1.4).sub(time.mul(speed).mul(1.3)), across.mul(6).add(4))));
  const streak = a.mul(b);
  // Finer than the pixel, the streaks average out to their mean.
  const fine = smoothstep(0.15, 0.6, waterFootprint);
  const lines = mix(smoothstep(0.4, 0.65, streak), float(0.12), fine);
  return max(waterMoving.mul(lines).mul(0.35), waterFalling.mul(streak.mul(0.35).add(0.65)));
}

/** The key light's glint off the surface: a sharp core in a path of sparkles, in a broad sheen, as a share of the key light. */
function glintOf(normal: Node<"vec3">, air: AtmosphereUniforms, time: Node<"float">): Node<"float"> {
  const toKey = max(dot(mirrored(normal), air.uHwSunDir), 0);
  const keyUp = smoothstep(-0.02, 0.06, air.uHwSunDir.y);
  // Wavelets finer than the ripples break the glint into sparkles that come and go; finer than the pixel, they average out.
  const grid = waterP.mul(7).add(vec2(time.mul(1.7), time.mul(-1.3)));
  const cell = grid.floor();
  const flash = time.mul(3).add(typed<"float">(hash2(cell)).mul(3)).floor();
  const spot = vec2(typed<"float">(hash2(cell.add(flash).add(0.5))), typed<"float">(hash2(cell.sub(flash).add(7.1)))).mul(0.6).add(0.2);
  const lit = step(0.75, typed<"float">(hash2(cell.add(flash))));
  const sparkle = mix(lit.mul(float(1).sub(smoothstep(0.05, 0.16, grid.fract().sub(spot).length()))), float(0.06), smoothstep(0.06, 0.2, waterFootprint));
  return pow(toKey, 2000).mul(12).add(sparkle.mul(pow(toKey, 300)).mul(60)).add(pow(toKey, 40).mul(0.25)).mul(keyUp);
}

interface LightContext {
  reflectedLight: { directDiffuse: Node<"vec3">; directSpecular: Node<"vec3">; indirectDiffuse: Node<"vec3">; indirectSpecular: Node<"vec3"> };
}

/**
 * The water's light. Three's directional light (the key light) is used only
 * for its shadow, so the water takes shadows as every lit thing does: its
 * colour reaches `direct` already times the shadow, and over the light's
 * own unshadowed colour leaves the shadow alone. Everything else is the
 * water's own (`shade`), put out as the direct diffuse once the lights
 * have been gathered.
 */
class WaterLighting extends LightingModel {
  private shadow: Node<"vec3"> | null = null;

  constructor(private readonly shade: (shadow: Node<"vec3">) => Node<"vec3">) {
    super();
  }

  override start(builder: NodeBuilder): void {
    super.start(builder);
    const { reflectedLight } = builder.context as unknown as LightContext;
    reflectedLight.directDiffuse.assign(this.shade(this.shadow ?? vec3(1)));
    reflectedLight.directSpecular.assign(vec3(0));
    reflectedLight.indirectDiffuse.assign(vec3(0));
    reflectedLight.indirectSpecular.assign(vec3(0));
  }

  override direct({ lightColor, lightNode }: LightingModelDirectInput): void {
    const node = lightNode as unknown as { light?: { isDirectionalLight?: boolean }; baseColorNode?: Node | null };
    if (node.light?.isDirectionalLight !== true || this.shadow || !node.baseColorNode) return;
    this.shadow = typed<"vec3">(lightColor).div(max(typed<"vec3">(node.baseColorNode), vec3(1e-5))).clamp(0, 1);
  }
}

type Step<T> = (value: T, context: StageContext) => T;

function fold<T>(start: T, steps: readonly Step<T>[], context: StageContext): T {
  return steps.reduce((value, step) => step(value, context), start);
}

/** The water's own material: every lake, river, fall and pool, near and far, is one of these, all one graph. */
export class WaterMaterial extends NodeMaterial {
  readonly isWaterMaterial = true;
  private stages: Stages[] = [];
  private steps: WaterStep[] = [];
  private built = false;
  private replaced = false;
  private readonly context: StageContext;

  constructor(
    private readonly colours: WaterColours,
    private readonly switches: FeatureSwitches = liveFeatures(),
    private readonly art: readonly FeatureArt[] = FEATURE_ART,
    private readonly waterSteps: readonly WaterStep[] = WATER_STEPS,
  ) {
    super();
    this.lights = true;
    this.fog = false;
    // A fall's sheet is seen from below as well as from above, and so is a lake by an eye under it.
    this.side = DoubleSide;
    this.context = { kind: "water", air: colours.air };
    this.rebuild();
    const off = switches.subscribe(() => this.rebuild());
    this.addEventListener("dispose", off);
  }

  private on(feature: FeatureId): boolean {
    return this.switches.isOn(feature);
  }

  private stagesOf<K extends "position" | "surface" | "normal" | "light" | "colour">(key: K): NonNullable<Stages[K]>[] {
    return this.stages.flatMap((s) => (s[key] ? [s[key] as NonNullable<Stages[K]>] : []));
  }

  private rebuild(): void {
    const stages = this.art.filter((a) => this.on(a.feature)).flatMap((a) => (a.stages ?? []).filter((s) => s.kinds.includes("water")));
    const steps = this.waterSteps.filter((s) => this.on(s.feature));
    const replaced = this.art.some((a) => a.replacesAir === true && this.on(a.feature));
    const key = [...stages, ...steps, replaced];
    const was = [...this.stages, ...this.steps, this.replaced];
    if (this.built && key.length === was.length && key.every((k, i) => k === was[i])) return;
    this.built = true;
    this.stages = stages;
    this.steps = steps;
    this.replaced = replaced;
    // The water's meshes stand at the world's origin, so their own space is the world's: lowered by the curve of the earth after any feature moves them.
    this.positionNode = earthCurve(fold(positionLocal, this.stagesOf("position"), this.context));
    // The flat surface's normal, for anything of three's that asks (the shadow's bias): the water's own is worked out in its light.
    this.normalNode = cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz;
    this.needsUpdate = true;
  }

  /** The surface, built up by the plain water and then each water feature on, in order. */
  private surface(): WaterSurface {
    const { colours } = this;
    const { air } = colours;
    // Seen from below, the face the eye sees faces down.
    let normal: Node<"vec3"> = select(waterBelow, vec3(0, -1, 0), vec3(0, 1, 0));
    for (const step of this.steps) if (step.normal) normal = step.normal(normal, colours);
    const viewStages = this.stagesOf("normal");
    if (viewStages.length > 0) {
      const view = fold(cameraViewMatrix.mul(vec4(normal, 0)).xyz, viewStages, this.context);
      normal = cameraWorldMatrix.mul(vec4(view, 0)).xyz;
    }
    normal = normalize(normal).toVar();
    const facing = max(dot(waterView, normal), 0);
    let surface: WaterSurface = {
      normal,
      body: mix(colours.shallow, colours.deep, smoothstep(0.05, 2.6, waterDepth).mul(float(1).sub(waterMoving.mul(0.5)))),
      reflect: mix(air.uHwHaze, colours.sky.uSky, 0.7),
      fresnel: pow(float(1).sub(facing), 3).mul(0.45).add(0.08),
      foam: streaks(air.uHwTime),
      glint: float(0),
      ice: float(0),
    };
    for (const step of this.steps) if (step.surface) surface = step.surface(surface, colours);
    const body = fold(surface.body, this.stagesOf("surface"), this.context);
    // From below, the sky shows through where the eye looks steeply up, the surface mirrors the water at a glance, and nothing glints.
    const fresnel = select(waterBelow, float(1).sub(surface.fresnel), surface.fresnel);
    const glint = select(waterBelow, float(0), surface.glint);
    return { ...surface, body, fresnel, glint };
  }

  /** The water's colour, linear, before the air: what comes up out of it lit by the light all round and the key light (as much as its shadow lets through), the mirror, and the glint. */
  private shade(surface: WaterSurface, shadow: Node<"vec3">): Node<"vec3"> {
    const { air, foam } = this.colours;
    const whiten = surface.foam.clamp(0, 1).mul(0.85);
    const albedo = mix(surface.body, foam, whiten);
    // Light into the water comes through its surface, and from the sun or moon whatever the ripples' tilt; foam and ice take it as a surface does.
    const keyIn = air.uHwKeyLight.mul(shadow).mul(max(air.uHwSunDir.y, 0).mul(0.5).add(max(dot(surface.normal, air.uHwSunDir), 0).mul(0.5)));
    const lit = fold({ direct: albedo.mul(keyIn).mul(1 / Math.PI), indirect: albedo.mul(air.uHwSkyLight) }, this.stagesOf("light"), this.context);
    const glint = air.uHwKeyLight.mul(shadow).mul(surface.glint.mul(glintOf(surface.normal, air, air.uHwTime)));
    return mix(lit.direct.add(lit.indirect), surface.reflect, surface.fresnel.mul(float(1).sub(whiten))).add(glint);
  }

  /** The surface as this build of the material made it: three asks for the outgoing light before the lighting model, both from one surface. */
  private made: WaterSurface | null = null;

  /** With no lights in the scene at all three skips the lighting model: the water is lit by the air alone, unshadowed. */
  override setupOutgoingLight(): Node {
    this.made = this.surface();
    return this.shade(this.made, vec3(1));
  }

  override setupLightingModel(): LightingModel {
    const surface = this.made ?? this.surface();
    return new WaterLighting((shadow) => this.shade(surface, shadow));
  }

  override setupOutput(builder: NodeBuilder, outputNode: Node): Node {
    let rgb: Node<"vec3"> = typed<"vec4">(outputNode).rgb;
    if (!this.replaced) rgb = throughAir(this.colours.air, rgb, positionWorld);
    rgb = fold(rgb, this.stagesOf("colour"), this.context);
    return super.setupOutput(builder, vec4(rgb, 1));
  }
}

export function waterMaterial(palette: Palette, atmosphere: AtmosphereUniforms, sky: SkyUniforms): WaterMaterial {
  return new WaterMaterial(waterColours(palette, atmosphere, sky));
}

/** A mesh of water: it takes the key light's shadow and casts none. */
export function waterMesh(geometry: BufferGeometry, material: Material): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}
