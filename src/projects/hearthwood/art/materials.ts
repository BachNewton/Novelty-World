import { Color, type Side } from "three";
import { BRDF_Lambert, cameraViewMatrix, diffuseColor, dot, float, max, normalView, positionLocal, positionViewDirection, positionWorld, pow, smoothstep, vec3, vec4 } from "three/tsl";
import { LightingModel, NodeMaterial, type LightingModelDirectInput, type Node, type NodeBuilder } from "three/webgpu";
import { liveFeatures, type FeatureSwitches } from "../features";
import { throughAir, valueNoise, type AtmosphereUniforms } from "./atmosphere";
import type { FeatureArt, MaterialKind, ReflectedLight, StageContext, Stages } from "./feature-art";
import { FEATURE_ART } from "./features";
import { typed } from "./tsl";

/*
 * The shared materials: every lit thing in the world is one of a few kinds
 * (see `feature-art.ts`), made through `diorama()` with the stages of every
 * feature on for its kind compiled in, in the order the features are listed.
 * Switching a feature rebuilds the materials it reaches; a feature that is
 * off is in no shader. Every material ends in the world's air, and is lit by
 * the storybook light below rather than three's own.
 *
 * The storybook light: the key light (the sun or the moon) wraps a little
 * past the terminator, so forms turn softly into shade rather than cutting
 * off, and every slope near or far has a lit side and a shaded side; the
 * shade keeps the sky's and the ground's light, the moment's own colour. A
 * soft rim of the key light's colour lifts silhouettes that stand against a
 * low light: the backlit edge of a storybook picture.
 */

/** How far past the terminator the key light wraps, as a share of the light at a right angle. */
const WRAP = 0.35;
/** The backlit rim's strength, against the key light. */
const RIM = 0.22;

export type LitKind = Exclude<MaterialKind, "water" | "sky">;

/** What a material of its own adds under the shared stages: the land's per-pixel ground, a coat's patterns. */
export interface OwnNodes {
  /** The vertex in the mesh's own space, before the features' position stages. */
  position?: Node<"vec3">;
  /** The surface's own colour, in place of the material's (and vertex and instance) colour, before the features' surface stages. */
  surface?: Node<"vec3">;
  /** Light the surface gives off itself (a coat's sheen, an eye's glint), added after lighting, before the air. */
  emissive?: Node<"vec3">;
  /** The view-space normal, before the features' normal stages. */
  normal?: Node<"vec3">;
}

type Step<T> = (value: T, context: StageContext) => T;

function fold<T>(start: T, steps: readonly Step<T>[], context: StageContext): T {
  return steps.reduce((value, step) => step(value, context), start);
}

/** The key light's direction in view space. */
function keyDirectionView(air: AtmosphereUniforms): Node<"vec3"> {
  return cameraViewMatrix.mul(vec4(air.uHwSunDir, 0)).xyz.normalize();
}

interface LightContext {
  irradiance: Node<"vec3">;
  reflectedLight: { directDiffuse: Node<"vec3">; indirectDiffuse: Node<"vec3"> };
}

class StorybookLighting extends LightingModel {
  constructor(
    private readonly air: AtmosphereUniforms,
    private readonly light: readonly Step<ReflectedLight>[],
    private readonly context: StageContext,
  ) {
    super();
  }

  override start(builder: NodeBuilder): void {
    super.start(builder);
    const { reflectedLight } = builder.context as unknown as LightContext;
    // The rim: where the eye looks across a silhouette towards the key light.
    const facing = max(dot(normalView, positionViewDirection), 0);
    const backlit = smoothstep(0, 1, max(dot(positionViewDirection.negate(), keyDirectionView(this.air)), 0));
    reflectedLight.directDiffuse.addAssign(this.air.uHwKeyLight.mul(diffuseColor.rgb.add(0.08)).mul(pow(float(1).sub(facing), 3).mul(backlit).mul(RIM)));
    if (this.light.length === 0) return;
    const lit = fold<ReflectedLight>({ direct: reflectedLight.directDiffuse, indirect: reflectedLight.indirectDiffuse }, this.light, this.context);
    const direct = lit.direct.toVar();
    const indirect = lit.indirect.toVar();
    reflectedLight.directDiffuse.assign(direct);
    reflectedLight.indirectDiffuse.assign(indirect);
  }

  override direct({ lightDirection, lightColor, reflectedLight }: LightingModelDirectInput): void {
    const wrapped = dot(normalView, typed<"vec3">(lightDirection)).add(WRAP).div(1 + WRAP).clamp();
    typed<"vec3">(reflectedLight.directDiffuse).addAssign(typed<"vec3">(lightColor).mul(wrapped).mul(typed<"vec3">(BRDF_Lambert({ diffuseColor: diffuseColor.rgb }))));
  }

  override indirect(builder: NodeBuilder): void {
    const { irradiance, reflectedLight } = builder.context as unknown as LightContext;
    reflectedLight.indirectDiffuse.addAssign(irradiance.mul(typed<"vec3">(BRDF_Lambert({ diffuseColor: diffuseColor.rgb }))));
  }
}

/** The parameters a shared material is made with: those of three's own materials it needs. */
export interface MaterialOptions {
  vertexColors?: boolean;
  color?: number | string;
  side?: Side;
  transparent?: boolean;
  opacity?: number;
  flatShading?: boolean;
  depthWrite?: boolean;
  /** Whether it ends in the world's air: everything does but what makes its own light. */
  air?: boolean;
}

/** A shared material: one of the kinds, lit by the storybook light, ending in the air, with the features' stages for its kind. */
export class DioramaMaterial extends NodeMaterial {
  readonly isDioramaMaterial = true;
  /** Light the surface gives off itself: three reads it from any node material, though only some declare it. */
  emissiveNode: Node | null = null;
  /** The material's own colour, times the vertex and instance colours: three's node materials read it only where a material declares it, and a bare node material doesn't. */
  readonly color = new Color(1, 1, 1);
  /** Faceted shading from the triangles' own normals: three's node builder reads it from any material, though only some declare it. */
  flatShading = false;
  private readonly withAir: boolean;
  private stages: Stages[] = [];
  private built = false;

  constructor(
    readonly kind: LitKind,
    readonly air: AtmosphereUniforms,
    options: MaterialOptions = {},
    readonly own: OwnNodes = {},
    private readonly switches: FeatureSwitches = liveFeatures(),
    private readonly art: readonly FeatureArt[] = FEATURE_ART,
  ) {
    super();
    this.lights = true;
    this.fog = false;
    const { air: withAir = true, ...values } = options;
    this.withAir = withAir;
    this.setValues(values);
    this.rebuild();
    const off = switches.subscribe(() => this.rebuild());
    this.addEventListener("dispose", off);
  }

  private get stageContext(): StageContext {
    return { kind: this.kind, air: this.air };
  }

  private steps<K extends "position" | "surface" | "normal" | "light" | "colour">(key: K): NonNullable<Stages[K]>[] {
    return this.stages.flatMap((s) => (s[key] ? [s[key] as NonNullable<Stages[K]>] : []));
  }

  /** Takes the stages of the features on now, and has three build the material again if they changed. */
  private rebuild(): void {
    const stages = this.art.filter((a) => this.switches.isOn(a.feature)).flatMap((a) => (a.stages ?? []).filter((s) => s.kinds.includes(this.kind)));
    const unchanged = stages.length === this.stages.length && stages.every((s, i) => s === this.stages[i]);
    if (this.built && unchanged) return;
    this.built = true;
    this.stages = stages;
    const position = this.steps("position");
    this.positionNode = position.length > 0 || this.own.position ? fold(this.own.position ?? positionLocal, position, this.stageContext) : null;
    const normal = this.steps("normal");
    this.normalNode = normal.length > 0 || this.own.normal ? fold(this.own.normal ?? normalView, normal, this.stageContext).normalize() : null;
    this.emissiveNode = this.own.emissive ?? null;
    this.needsUpdate = true;
  }

  override setupDiffuseColor(builder: NodeBuilder): void {
    super.setupDiffuseColor(builder);
    let colour: Node<"vec3"> = this.own.surface ?? diffuseColor.rgb;
    if (this.kind === "land" || this.kind === "ground") colour = grain(colour);
    colour = fold(colour, this.steps("surface"), this.stageContext);
    if (colour !== diffuseColor.rgb) diffuseColor.rgb.assign(colour.toVar());
  }

  override setupLightingModel(): LightingModel {
    return new StorybookLighting(this.air, this.steps("light"), this.stageContext);
  }

  override setupOutput(builder: NodeBuilder, outputNode: Node): Node {
    const replaced = this.art.some((a) => a.replacesAir === true && this.switches.isOn(a.feature));
    const out = typed<"vec4">(outputNode);
    let rgb: Node<"vec3"> = out.rgb;
    if (this.withAir && !replaced) rgb = throughAir(this.air, rgb, positionWorld);
    rgb = fold(rgb, this.steps("colour"), this.stageContext);
    return super.setupOutput(builder, vec4(rgb, out.a));
  }
}

/** A little noise over the ground, so a field reads as grass and not as paint. */
function grain(colour: Node<"vec3">): Node<"vec3"> {
  const g = valueNoise(positionWorld.xz.mul(0.9)).mul(0.6).add(valueNoise(positionWorld.xz.mul(3.1)).mul(0.4));
  return colour.mul(g.mul(0.36).add(0.82));
}

/** A shared material of a kind. */
export function diorama(kind: LitKind, air: AtmosphereUniforms, options: MaterialOptions = {}, own: OwnNodes = {}): DioramaMaterial {
  return new DioramaMaterial(kind, air, options, own);
}
