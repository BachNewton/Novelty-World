import {
  BufferAttribute,
  BufferGeometry,
  DepthTexture,
  FloatType,
  Mesh,
  OrthographicCamera,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from "three";
import type { GpuTimer } from "@/shared/lib/three/gpu-timer";
import type { FeatureId, FeatureSwitches } from "../features";
import type { FeatureArt, FeatureFrame, FeaturePass, PassSpec, PassStage } from "./feature-art";

/*
 * The frame, drawn: the features' per-frame updates, then their passes
 * round the scene's own draw, in a declared order. With no pass on, the
 * scene is drawn straight to the screen as it always was. With any `opaque`
 * or `post` pass on, it is drawn into a multisampled target instead (with a
 * reversed float depth texture when a pass reads depth), exactly as it
 * would be on the screen: tone mapped and encoded by its materials, and
 * blended as the screen blends. So the passes work on the frame as it
 * shows, and the look is the same pixel for pixel whatever passes are on.
 * The last post pass draws to the screen. A pass is made, and its targets
 * allocated, only while its feature is on, and disposed the moment it is
 * switched off; the scene's own target exists only while some pass needs
 * it.
 *
 * Each part is timed on the GPU while someone is watching the costs (the
 * features panel), and not at all otherwise.
 */

/** What is drawn after the `opaque` passes: water, once something reads the scene behind it. Lit objects here are lit like the rest (the day's lights shine on every layer). */
export const LATE_LAYER = 1;

const STAGES: readonly PassStage[] = ["before", "opaque", "post"];

/** The GPU-time names of the scene's own draws, and of the copy to the screen when no post pass draws there. */
export const SCENE_SPANS = { scene: "scene", late: "scene-late", output: "output" } as const;

/** One triangle over the whole screen, for passes that draw a frame from a texture. */
export class FullScreen {
  private readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  private static readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /** The material's colours are the frame's as it shows, so it is never tone mapped again. */
  constructor(readonly material: ShaderMaterial) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    material.toneMapped = false;
    material.depthTest = false;
    material.depthWrite = false;
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  render(gl: WebGLRenderer, target: WebGLRenderTarget | null): void {
    gl.setRenderTarget(target);
    gl.render(this.mesh, FullScreen.camera);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/** The vertex shader for a `FullScreen` material: `vUv` across the screen. */
export const FULL_SCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** The frame to the screen as it is, when only `opaque` passes are on. */
function copyPass(): FullScreen {
  return new FullScreen(
    new ShaderMaterial({
      uniforms: { tColour: { value: null } },
      vertexShader: FULL_SCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColour;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(tColour, vUv);
        }
      `,
    }),
  );
}

/** The scene's target: drawn into exactly as the screen is, and multisampled like it. */
function sceneTarget(width: number, height: number, depth: boolean): WebGLRenderTarget {
  const target = new WebGLRenderTarget(width, height, {
    type: UnsignedByteType,
    colorSpace: SRGBColorSpace,
    // Holds the encoded colours as they are, as the screen does, rather than decoding and encoding again as an sRGB format would.
    internalFormat: "RGBA8",
    samples: 4,
    // A float depth is what makes a reversed depth precise to the horizon.
    depthTexture: depth ? new DepthTexture(width, height, FloatType) : null,
  });
  // Three tone-maps and encodes only what is drawn to the screen or to an XR target; flagged as one, this target is drawn into as the screen is.
  Object.assign(target, { isXRRenderTarget: true });
  return target;
}

/** A target between post passes, holding the frame as it shows. */
function postTarget(width: number, height: number): WebGLRenderTarget {
  return new WebGLRenderTarget(width, height, { type: UnsignedByteType, depthBuffer: false });
}

interface Running {
  feature: FeatureId;
  spec: PassSpec;
  pass: FeaturePass;
}

/** The GPU time of each part of the frame, smoothed, read by the features panel. */
export class FrameCosts {
  private watchers = 0;
  /** Whether this browser can time the GPU at all. */
  available = false;
  private readonly smoothed = new Map<string, number>();
  private latest: ReadonlyMap<string, number> = new Map();

  /** Starts timing the frame, until the returned stop is called. */
  watch(): () => void {
    this.watchers++;
    return () => {
      this.watchers--;
    };
  }

  get watched(): boolean {
    return this.watchers > 0;
  }

  record(readings: ReadonlyMap<string, number>): void {
    this.latest = readings;
    for (const [name, ms] of readings) {
      const was = this.smoothed.get(name);
      this.smoothed.set(name, was === undefined ? ms : was + (ms - was) * 0.1);
    }
  }

  /** The smoothed milliseconds of a span, or null if it has never been timed. A pass that stops running falls to 0. */
  ms(name: string): number | null {
    return this.smoothed.get(name) ?? null;
  }

  /** The last reading of every span timed so far, by name, unsmoothed. */
  lastReadings(): Record<string, number> {
    return Object.fromEntries(this.latest);
  }

  total(): number {
    let sum = 0;
    for (const ms of this.smoothed.values()) sum += ms;
    return sum;
  }
}

/** Draws each frame with the passes of the features that are on. */
export class FrameRenderer {
  private running: Running[] = [];
  private scene: WebGLRenderTarget | null = null;
  private readonly post: WebGLRenderTarget[] = [];
  private copy: FullScreen | null = null;
  private readonly size = new Vector2();
  private readonly unsubscribe: () => void;
  private dirty = true;

  constructor(
    private readonly gl: WebGLRenderer,
    private readonly switches: FeatureSwitches,
    private readonly art: readonly FeatureArt[],
    private readonly timer: GpuTimer | null,
  ) {
    // Shadows are drawn once a frame, by whichever draw comes first, not again for every pass that draws the scene.
    gl.shadowMap.autoUpdate = false;
    // The frame's numbers (triangles, draws) count every draw in it, not only the last.
    gl.info.autoReset = false;
    this.unsubscribe = switches.subscribe(() => {
      this.dirty = true;
    });
  }

  /** The passes on now, in the order they run. */
  passes(): readonly { feature: FeatureId; id: string; stage: PassStage }[] {
    return this.running.map(({ feature, spec }) => ({ feature, id: spec.id, stage: spec.stage }));
  }

  /** Makes the passes of features switched on and disposes those switched off, and the targets with them. */
  private sync(width: number, height: number): void {
    this.dirty = false;
    const wanted = this.art
      .filter((a) => this.switches.isOn(a.feature))
      .flatMap((a) => (a.passes ?? []).map((spec) => ({ feature: a.feature, spec })))
      .sort((a, b) => STAGES.indexOf(a.spec.stage) - STAGES.indexOf(b.spec.stage) || a.spec.order - b.spec.order || a.spec.id.localeCompare(b.spec.id));
    const kept = new Map(this.running.map((r) => [r.spec.id, r]));
    this.running = wanted.map(({ feature, spec }) => {
      const was = kept.get(spec.id);
      if (was) {
        kept.delete(spec.id);
        return was;
      }
      const pass = spec.create(this.gl);
      pass.setSize?.(width, height);
      return { feature, spec, pass };
    });
    for (const gone of kept.values()) gone.pass.dispose();

    const needsScene = this.running.some((r) => r.spec.stage !== "before");
    const needsDepth = this.running.some((r) => r.spec.depth === true);
    if (this.scene && (!needsScene || (this.scene.depthTexture !== null) !== needsDepth)) {
      this.scene.depthTexture?.dispose();
      this.scene.dispose();
      this.scene = null;
    }
    if (needsScene && !this.scene) this.scene = sceneTarget(width, height, needsDepth);

    // The last post pass draws to the screen, and those before it to and fro between two targets.
    const posts = this.running.filter((r) => r.spec.stage === "post").length;
    const between = Math.max(0, Math.min(posts - 1, 2));
    if (posts === 0 && needsScene) this.copy ??= copyPass();
    else {
      this.copy?.dispose();
      this.copy = null;
    }
    for (const target of this.post.splice(between)) target.dispose();
    while (this.post.length < between) this.post.push(postTarget(width, height));
  }

  private resize(width: number, height: number): void {
    this.scene?.setSize(width, height);
    for (const target of this.post) target.setSize(width, height);
    for (const { pass } of this.running) pass.setSize?.(width, height);
  }

  private span(name: string, draw: () => void): void {
    if (this.timer) this.timer.span(name, draw);
    else draw();
  }

  /** Runs a stage's passes in order, each reading the frame so far; a post pass draws to the next target, the last to the screen. */
  private stage(name: PassStage, frame: FeatureFrame, colour: Texture | null): void {
    const passes = this.running.filter((r) => r.spec.stage === name);
    const depth = name === "before" ? null : (this.scene?.depthTexture ?? null);
    const { x: width, y: height } = this.size;
    passes.forEach(({ spec, pass }, i) => {
      const output = name === "post" && i < passes.length - 1 ? this.post[i % 2] : null;
      const seen = colour;
      this.span(spec.id, () => pass.render({ ...frame, colour: seen, depth, output, width, height }));
      if (output) colour = output.texture;
    });
  }

  render(frame: FeatureFrame, costs: FrameCosts): void {
    const { gl, scene, camera } = frame;
    const timer = costs.watched ? this.timer : null;
    this.timer?.setEnabled(timer !== null);
    gl.info.reset();
    gl.shadowMap.needsUpdate = true;

    gl.getDrawingBufferSize(this.size);
    const { x: width, y: height } = this.size;
    if (this.dirty) this.sync(width, height);
    else if (this.scene && (this.scene.width !== width || this.scene.height !== height)) this.resize(width, height);

    for (const a of this.art) if (this.switches.isOn(a.feature)) a.frame?.(frame);

    camera.layers.enable(LATE_LAYER);
    this.stage("before", frame, null);

    const target = this.scene;
    if (!target) {
      gl.setRenderTarget(null);
      this.span(SCENE_SPANS.scene, () => gl.render(scene, camera));
    } else {
      gl.setRenderTarget(target);
      if (this.running.some((r) => r.spec.stage === "opaque")) {
        const layers = camera.layers.mask;
        camera.layers.disable(LATE_LAYER);
        this.span(SCENE_SPANS.scene, () => gl.render(scene, camera));
        this.stage("opaque", frame, target.texture);
        camera.layers.set(LATE_LAYER);
        const autoClear = gl.autoClear;
        gl.autoClear = false;
        gl.setRenderTarget(target);
        this.span(SCENE_SPANS.late, () => gl.render(scene, camera));
        gl.autoClear = autoClear;
        camera.layers.mask = layers;
      } else {
        this.span(SCENE_SPANS.scene, () => gl.render(scene, camera));
      }

      const copy = this.copy;
      if (copy) {
        copy.material.uniforms.tColour.value = target.texture;
        this.span(SCENE_SPANS.output, () => copy.render(gl, null));
      } else this.stage("post", frame, target.texture);
    }

    if (timer) {
      timer.poll();
      costs.available = timer.available;
      costs.record(timer.values());
    }
  }

  dispose(): void {
    this.unsubscribe();
    for (const { pass } of this.running) pass.dispose();
    this.running = [];
    this.scene?.depthTexture?.dispose();
    this.scene?.dispose();
    for (const target of this.post) target.dispose();
    this.copy?.dispose();
    this.timer?.dispose();
  }
}
