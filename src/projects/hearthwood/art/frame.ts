import { mrt, normalView, output, pass, vec4 } from "three/tsl";
import { NoToneMapping, RenderPipeline, type Camera, type Node, type PassNode, type Scene, type WebGPURenderer } from "three/webgpu";
import type { FeatureSwitches } from "../features";
import type { FeatureArt, FeatureFrame, PostInput, PostStep } from "./feature-art";
import { toneStep } from "./light/tone-mapping";

/*
 * The frame, drawn: the features' per-frame updates (uniforms, compute),
 * then the scene in one pass, then one post pipeline built from the post
 * steps of the features on, in order, around the tone curve. Three builds
 * the whole chain as one node graph: steps that only recolour a pixel (the
 * grade, the vignette, the tone curve itself) are fused into the one pass
 * that writes the screen, and only steps that need neighbours (bloom, an
 * ink edge) cost passes of their own. The pipeline is built again only when
 * a feature is switched.
 *
 * The GPU's time for the frame is read back through timestamp queries while
 * someone watches the costs (the ~ panel's Features section, the shot
 * tools), where the renderer was made with them (`gpu-canvas.tsx`).
 */

/** The GPU time of the frame, smoothed, read by the features panel and the probe. */
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

  /** The smoothed milliseconds of a span, or null if it has never been timed. */
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

/** The spans the frame is timed in: everything drawn (the scene, shadows and post), and everything computed. */
export const FRAME_SPANS = { render: "render", compute: "compute" } as const;

export interface FrameOptions {
  /** Samples per pixel for the scene's edges: 1 for none. */
  samples: number;
}

/** Draws each frame: the scene, then the post steps of the features on. */
export class FrameRenderer {
  private pipeline: RenderPipeline;
  private scenePass: PassNode | null = null;
  private dirty = true;
  private readonly unsubscribe: () => void;
  private timing: Promise<void> | null = null;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly switches: FeatureSwitches,
    private readonly art: readonly FeatureArt[],
    private readonly options: FrameOptions,
  ) {
    // The tone curve is a step of the pipeline; the pipeline's last step only encodes to the screen.
    renderer.toneMapping = NoToneMapping;
    // The frame's numbers (draws, triangles) count every pass in it, not only the last.
    renderer.info.autoReset = false;
    this.pipeline = new RenderPipeline(renderer);
    this.unsubscribe = switches.subscribe(() => {
      this.dirty = true;
    });
  }

  /** The post steps on now, in the order they run. */
  steps(): readonly PostStep[] {
    const on = this.art.filter((a) => this.switches.isOn(a.feature)).flatMap((a) => a.post ?? []);
    return [...on, toneStep(this.switches.isOn("toneMapping"))].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  private build(scene: Scene, camera: Camera, frame: FeatureFrame): void {
    this.dirty = false;
    const steps = this.steps();
    const normals = steps.some((s) => s.normals === true);
    this.scenePass?.dispose();
    const scenePass = pass(scene, camera, { samples: this.options.samples });
    if (normals) scenePass.setMRT(mrt({ output, normal: normalView.mul(0.5).add(0.5) }));
    this.scenePass = scenePass;
    const input: Omit<PostInput, "colour"> = {
      depth: scenePass.getTextureNode("depth").r,
      depthAt: (uv) => scenePass.getTextureNode("depth").sample(uv).r,
      viewZ: scenePass.getViewZNode().negate(),
      normal: normals ? scenePass.getTextureNode("normal").rgb : null,
      air: frame.atmosphere,
      sky: frame.sky,
    };
    let colour: Node<"vec4"> = vec4(scenePass.getTextureNode("output"));
    for (const step of steps) colour = step.build({ ...input, colour });
    this.pipeline.outputNode = colour;
    this.pipeline.needsUpdate = true;
  }

  render(frame: FeatureFrame, costs: FrameCosts): void {
    const { scene, camera } = frame;
    for (const a of this.art) if (this.switches.isOn(a.feature)) a.frame?.(frame);
    if (this.dirty) this.build(scene, camera, frame);
    this.renderer.info.reset();
    this.pipeline.render();
    if (costs.watched) this.time(costs);
  }

  /** Reads the GPU's time for what was just drawn and computed, a frame or so late, never waiting on it. */
  private time(costs: FrameCosts): void {
    const backend = this.renderer.backend as { trackTimestamp?: boolean };
    costs.available = backend.trackTimestamp === true;
    if (!costs.available || this.timing) return;
    this.timing = Promise.all([this.renderer.resolveTimestampsAsync("render"), this.renderer.resolveTimestampsAsync("compute")]).then(([render, compute]) => {
      this.timing = null;
      const readings = new Map<string, number>();
      if (typeof render === "number") readings.set(FRAME_SPANS.render, render);
      if (typeof compute === "number") readings.set(FRAME_SPANS.compute, compute);
      costs.record(readings);
    });
  }

  dispose(): void {
    this.unsubscribe();
    this.scenePass?.dispose();
    this.pipeline.dispose();
  }
}
