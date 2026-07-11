"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { GpuTimer } from "./gpu-timer";

export interface BloomOptions {
  /** Start with bloom on (default true when a bloom option is given at all). `ctx.setBloom` overrides. */
  enabled?: boolean;
  strength?: number;
  radius?: number;
  threshold?: number;
  /**
   * Maximum luminance a single pixel may contribute to the bloom, in the scene's own linear units.
   * Defaults to `Infinity` (three's stock behaviour).
   *
   * WHY IT EXISTS: `UnrealBloomPass` adds `strength × blur(highpass(colour))` with no bound. That is
   * fine for LDR-ish content whose highlights sit at 2–5× white. It is catastrophic for a physically
   * scaled scene, where a sun disc's radiance is `E / Ω` — several hundred times the sky — and one
   * pixel of it blows the entire frame to white. A real lens spreads only a bounded fraction of a
   * source's energy into its wide glare tail; the clamp is that bound. Hue is preserved (the colour is
   * scaled, not clipped per channel), which is the whole point: it is what lets a warm sun keep its
   * warmth in the glow around a clipping core.
   */
  clamp?: number;
  /**
   * Render the bloom pyramid at this fraction of the drawing buffer (default 1). Bloom is a BLUR, so
   * half resolution is visually near-free and quarters its fill cost. `UnrealBloomPass` already halves
   * again internally for its first mip.
   */
  resolutionScale?: number;
  /**
   * MSAA samples on the composer's HDR target (default 4). On a bandwidth-starved iGPU this, and NOT
   * the blur, is what "adding bloom" actually costs: a 1080p HalfFloat 4x target is ~66 MB to write
   * and resolve every frame. Set 0 when the scene already supersamples via its render scale.
   */
  samples?: number;
}

export interface ThreeSceneOptions {
  /** Overlay a three.js FPS/ms stats panel in the top-left corner. */
  stats?: boolean;
  /**
   * Overlay a per-pass **GPU-time** panel (`EXT_disjoint_timer_query_webgl2`). Unlike
   * the `stats` panel — which measures CPU submit time and frame cadence — this reports
   * how long the GPU actually spent executing each pass. The hook times its own `main`
   * render; a scene brackets its extra passes via `ctx.gpuTimer.span(name, fn)`. Dev
   * affordance; degrades to an "n/a" panel where the extension is unavailable.
   */
  gpuStats?: boolean;
  /**
   * MSAA on the main framebuffer (default `true`). Smooths geometry edges but costs
   * a 4× framebuffer + a per-frame resolve. Set `false` when the scene supersamples
   * (render scale ≥ device ratio), which already antialiases everything — saves
   * bandwidth on weak/iGPU targets. Fixed at mount (WebGL context creation).
   */
  antialias?: boolean;
  /**
   * Render through an HDR bloom pipeline. `true` uses defaults; pass an object to tune. Can also be
   * switched at runtime via `ctx.setBloom` — the composer is built on first enable and reused, and
   * disabling it goes back to a direct `renderer.render`, so an A/B measures bloom's REAL cost rather
   * than the cost of a composer that happens to be idle.
   */
  bloom?: boolean | BloomOptions;
  /**
   * Tone-mapping operator (default `ACESFilmicToneMapping`). Live via `ctx.setToneMapping`.
   * Changing it recompiles every material, which is fine for an A/B and not for a hot path.
   */
  toneMapping?: THREE.ToneMapping;
  /**
   * Allocate a render target with a colour texture **and** a depth texture, exposed
   * on the context as `sceneCapture`. A scene renders itself into it (typically
   * hiding the surface being shaded) so a shader can read the scene behind/around a
   * surface — the shared basis for screen-space reflection, refraction, and
   * depth-based effects (soft edges, water absorption). The hook owns its lifecycle:
   * it is kept sized to the drawing buffer and disposed on unmount. Opt-in; nothing
   * is allocated unless this is set. Pass `{ resolutionScale }` (e.g. 0.5) to render
   * the capture below screen resolution — reflections/refraction through moving water
   * hide the softening, and it saves bandwidth + VRAM. Sampled by normalised screen
   * UV, so the scale is transparent to the consuming shader.
   */
  sceneCapture?: boolean | SceneCaptureOptions;
  /**
   * Cap on the device-pixel-ratio the renderer draws at (default 2). The drawing
   * buffer is `min(devicePixelRatio, maxPixelRatio)`. Lower it to trade sharpness
   * for a big fill-rate saving on weak GPUs — fragment-heavy scenes (SSR) scale
   * with pixel count. Adjustable live via `ctx.setPixelRatio`.
   */
  maxPixelRatio?: number;
}

/**
 * A colour + depth capture of the rendered scene. `target.texture` is HDR-linear
 * colour; `target.depthTexture` is the scene depth. The owning scene populates it
 * each frame (`renderer.setRenderTarget(target)` … render … `setRenderTarget(null)`);
 * the hook keeps it sized to the drawing buffer.
 */
export interface SceneCaptureOptions {
  /** Render the capture at this fraction of the drawing buffer (default 1). */
  resolutionScale?: number;
  /**
   * MSAA samples on the composer's HDR target (default 4). On a bandwidth-starved iGPU this, and NOT
   * the blur, is what "adding bloom" actually costs: a 1080p HalfFloat 4x target is ~66 MB to write
   * and resolve every frame. Set 0 when the scene already supersamples via its render scale.
   */
  samples?: number;
}

export interface SceneCapture {
  target: THREE.WebGLRenderTarget;
  depthTexture: THREE.DepthTexture;
}

export interface ThreeSceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  container: HTMLDivElement;
  /** The bloom pass, once bloom has been enabled at least once. Tune `strength` / `radius` /
   *  `threshold` on it directly. NB `threshold` is applied to the UNEXPOSED linear image, so a scene
   *  with auto-exposure must scale it by `1 / toneMappingExposure` or the whole sky will bloom at dusk. */
  bloomPass: () => UnrealBloomPass | undefined;
  /** Turn the HDR bloom pipeline on or off. Off means no composer at all. */
  setBloom: (enabled: boolean) => void;
  isBloomEnabled: () => boolean;
  /**
   * Set the bloom's prefilter. A scene with auto-exposure must call this whenever the exposure moves:
   * bloom sees the UNEXPOSED linear image, while "bright" is a statement about the display, so both
   * `threshold` and `clamp` are display-space numbers divided by the exposure. No-op without bloom.
   */
  setBloomPrefilter: (prefilter: { threshold: number; clamp: number; smoothWidth?: number }) => void;
  /**
   * Post-tonemap display grade: saturation + contrast, applied after the tonemap + sRGB encode (where a
   * grade belongs — it puts back the punch AgX deliberately holds off the highlights). Runs the composer
   * if needed, like bloom; a neutral grade (saturation 1, contrast 1) is identity. Contrast pivots about
   * display mid-grey. It is a camera/art operator, not physics — uniform across every frame.
   */
  setGrade: (grade: { enabled?: boolean; saturation?: number; contrast?: number }) => void;
  isGradeEnabled: () => boolean;
  /** Swap the tone-mapping operator. Recompiles materials. */
  setToneMapping: (mode: THREE.ToneMapping) => void;
  /** Present when the `sceneCapture` option is enabled — a colour+depth scene target. */
  sceneCapture?: SceneCapture;
  /**
   * Present when `gpuStats` is enabled. Bracket a scene's own passes with
   * `gpuTimer.span(name, fn)` to break out their GPU cost alongside the hook's `main`
   * render in the panel. Spans must not overlap.
   */
  gpuTimer?: GpuTimer;
  /**
   * Set the live device-pixel-ratio (clamped to the `maxPixelRatio` option), then
   * resize the drawing buffer + capture target to match. Lets a scene expose a
   * render-scale control for weak GPUs.
   */
  setPixelRatio: (ratio: number) => void;
  /**
   * Frame-rate cap by vsync stride: render 1 of every `stride` animation-frame callbacks
   * (1 = uncapped/every frame, 2 = every other, …). Since `setAnimationLoop` is vsync-locked
   * by the browser, the only achievable rates are refresh ÷ stride — so a stride guarantees a
   * clean divisor (even cadence), unlike a raw ms cap which lands unpredictably. Trades latency
   * for smoothness + cooler clocks (a solid lower rate beats a jittery near-refresh one, and less
   * load keeps an APU off its thermal/power limit — see shipwright/docs/PERFORMANCE.md).
   */
  setFrameStride: (stride: number) => void;
  /**
   * Wall-clock CPU cost (ms) of the LAST main render — i.e. how long `renderer.render` (or the
   * bloom composer) took on the CPU to submit the scene's draw calls, the ANGLE→D3D11 submission
   * cost. Measured every frame and reported for the frame just rendered, so a perf harness reads it
   * on the NEXT frame. The hook's `gpuTimer` already breaks out the main render's GPU *execution*
   * time; this is its CPU *submission* counterpart. Generic perf primitive, not game-specific.
   */
  mainRenderMs: () => number;
}

export interface ThreeSceneHandlers {
  /** Called once per animation frame. `delta` is seconds since the last frame. */
  onFrame?: (delta: number) => void;
  /** Called after the camera/renderer have been resized to the container. */
  onResize?: (width: number, height: number) => void;
  /** Called on unmount to release scene-specific GPU resources. */
  dispose?: () => void;
}

/**
 * Add a hue-preserving energy clamp to `UnrealBloomPass`'s luminosity high-pass.
 *
 * Everything except the two marked lines is three's own `LuminosityHighPassShader`. We cannot subclass
 * our way to this: the material is built in the constructor from a module-private shader object.
 */
const patchBloomPrefilter = (pass: UnrealBloomPass, clamp: number): void => {
  const material = pass.materialHighPassFilter;
  material.uniforms.bloomClamp = { value: clamp };
  // NB the sampler is `tDiffuse`, which is what `UnrealBloomPass.render()` binds every frame. Naming
  // it anything else compiles fine and silently reads whatever texture is bound to unit 0 — a glow
  // that ignores every parameter you give it. (Found by a blind reviewer noticing that a 12-cell
  // parameter sweep produced twelve byte-identical images.)
  material.fragmentShader = /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 defaultColor;
    uniform float defaultOpacity;
    uniform float luminosityThreshold;
    uniform float smoothWidth;
    uniform float bloomClamp;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D( tDiffuse, vUv );
      float v = dot( texel.xyz, vec3( 0.299, 0.587, 0.114 ) );
      vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );
      float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );
      // Bound the energy one pixel may pour into the glare tail, WITHOUT clipping its hue: scale the
      // whole colour, so a 1.84 : 1 : 0.21 sunset sun still glows orange rather than white.
      vec3 bounded = texel.xyz * min( 1.0, bloomClamp / max( v, 1e-8 ) );
      gl_FragColor = mix( outputColor, vec4( bounded, texel.a ), alpha );
    }
  `;
  material.needsUpdate = true;
};

/**
 * A display-space colour grade — saturation + contrast — run AFTER the tonemap + sRGB encode
 * (`OutputPass`), which is where a grade belongs: the tonemap has already decided highlight roll-off and
 * (with AgX) desaturated the brights, so this is the honest place to put punch back. Neutral (1 / 1) is
 * identity. Contrast pivots about display mid-grey (0.5). NOT physics — a camera/art operator, uniform
 * across every frame, so it stays consistent where a per-elevation sky hack could not.
 */
const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSaturation: { value: 1 },
    uContrast: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    varying vec2 vUv;
    void main() {
      vec4 t = texture2D(tDiffuse, vUv);
      vec3 c = t.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); // display-space luma (post-tonemap)
      c = mix(vec3(l), c, uSaturation);               // saturation about luma
      c = (c - 0.5) * uContrast + 0.5;                // contrast about mid-grey
      gl_FragColor = vec4(c, t.a);
    }
  `,
};

/**
 * Mounts a vanilla three.js renderer into a container `<div>` and drives its
 * whole lifecycle from React: it creates the `WebGLRenderer` + a
 * `PerspectiveCamera`, runs the animation loop, keeps the drawing buffer sized
 * to the container (via `ResizeObserver`), and disposes everything on unmount.
 * With the `bloom` option it renders through an HDR `EffectComposer` pipeline.
 *
 * The `setup` callback builds the scene from the provided context and returns
 * per-frame / resize / dispose handlers (return `{}` for a static scene).
 * Attach the returned ref to the container element.
 *
 * This is the shared bridge between React and imperative three.js — the first
 * consumer is Shipwright, but it deliberately knows nothing game-specific so
 * future 3D projects can reuse it.
 */
export function useThreeScene(
  setup: (ctx: ThreeSceneContext) => ThreeSceneHandlers,
  options: ThreeSceneOptions = {},
): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);
  // The scene is built once on mount from the setup passed at that time; refs
  // hold it so the mount effect can stay dependency-free without going stale.
  const setupRef = useRef(setup);
  const showStatsRef = useRef(options.stats ?? false);
  const gpuStatsRef = useRef(options.gpuStats ?? false);
  const antialiasRef = useRef(options.antialias ?? true);
  const bloomRef = useRef(options.bloom ?? false);
  const toneMappingRef = useRef(options.toneMapping ?? THREE.ACESFilmicToneMapping);
  const sceneCaptureRef = useRef(options.sceneCapture ?? false);
  const maxPixelRatioRef = useRef(options.maxPixelRatio ?? 2);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const maxPixelRatio = maxPixelRatioRef.current;
    // MSAA (antialias) only smooths geometry edges and costs a 4× framebuffer + a
    // per-frame resolve. When a scene supersamples (render scale ≥ device ratio) that
    // already antialiases everything MSAA can't (shader shimmer), so MSAA is mostly
    // redundant there — opt out to save bandwidth on weak/iGPU targets.
    const renderer = new THREE.WebGLRenderer({ antialias: antialiasRef.current });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = toneMappingRef.current;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      1,
      20000,
    );

    // Optional HDR bloom pipeline. Rendering through an EffectComposer backed by a HalfFloat +
    // multisampled target keeps the very bright sun in HDR, so bloom turns it into a coloured glow
    // instead of clipping to white; the final OutputPass applies the renderer's tone mapping +
    // exposure and the sRGB encode.
    //
    // Built lazily and kept, so `setBloom(false)` really is "no composer" — the honest baseline for a
    // GPU-cost A/B. NB three renders with NoToneMapping into a render target, so the whole scene
    // arrives at the OutputPass in linear HDR: exactly what bloom needs, and why the water's composite
    // had to move out of display space first.
    const bloomOption = bloomRef.current;
    let composer: EffectComposer | undefined;
    let bloomPass: UnrealBloomPass | undefined;
    let gradePass: ShaderPass | undefined;
    let bloomEnabled =
      bloomOption !== false && (typeof bloomOption !== "object" || bloomOption.enabled !== false);
    let gradeEnabled = false;
    // The composer runs whenever bloom OR grade is active; each pass is individually `.enabled`, so
    // grade can run without bloom and vice-versa. With both off we skip the composer entirely (a direct
    // `renderer.render`), so bloom's cost stays honestly measurable.
    const composerActive = () => bloomEnabled || gradeEnabled;
    const buildComposer = () => {
      if (composer) return;
      const settings = typeof bloomOption === "object" ? bloomOption : {};
      const size = new THREE.Vector2(container.clientWidth, container.clientHeight);
      const target = new THREE.WebGLRenderTarget(size.x, size.y, {
        type: THREE.HalfFloatType,
        samples: settings.samples ?? 4,
      });
      composer = new EffectComposer(renderer, target);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(size.x, size.y);
      const bloomScale = settings.resolutionScale ?? 1;
      bloomPass = new UnrealBloomPass(
        size.clone().multiplyScalar(bloomScale),
        settings.strength ?? 0.5,
        settings.radius ?? 0.4,
        settings.threshold ?? 0.9,
      );
      patchBloomPrefilter(bloomPass, settings.clamp ?? Infinity);
      bloomPass.enabled = bloomEnabled;
      gradePass = new ShaderPass(GRADE_SHADER);
      gradePass.enabled = gradeEnabled;
      // RenderPass → bloom (HDR glow) → OutputPass (tonemap + sRGB) → grade (display-space sat/contrast).
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
      composer.addPass(gradePass);
    };
    if (composerActive()) buildComposer();
    const setBloom = (enabled: boolean) => {
      bloomEnabled = enabled;
      if (enabled) buildComposer();
      if (bloomPass) bloomPass.enabled = enabled;
    };
    const setGrade = (grade: { enabled?: boolean; saturation?: number; contrast?: number }) => {
      if (grade.enabled !== undefined) gradeEnabled = grade.enabled;
      if (gradeEnabled) buildComposer();
      if (gradePass) {
        gradePass.enabled = gradeEnabled;
        if (grade.saturation !== undefined) gradePass.uniforms.uSaturation.value = grade.saturation;
        if (grade.contrast !== undefined) gradePass.uniforms.uContrast.value = grade.contrast;
      }
    };
    const setBloomPrefilter = ({
      threshold,
      clamp,
      smoothWidth,
    }: {
      threshold: number;
      clamp: number;
      smoothWidth?: number;
    }) => {
      if (!bloomPass) return;
      bloomPass.threshold = threshold;
      // `highPassUniforms` is typed `object` by @types/three; the material owns the same object with a
      // usable type.
      const uniforms = bloomPass.materialHighPassFilter.uniforms;
      uniforms.luminosityThreshold.value = threshold;
      // The stock smoothWidth is an ABSOLUTE 0.01, which swamps a threshold that tracks a large
      // exposure. Make it relative to the threshold so the knee has the same softness at any exposure.
      uniforms.smoothWidth.value = smoothWidth ?? threshold * 0.5;
      uniforms.bloomClamp.value = clamp;
    };

    // Optional colour+depth scene capture for screen-space effects (SSR,
    // refraction, depth). Sized to the drawing buffer × resolutionScale; shaders
    // sample it by normalised screen UV, so a reduced scale is transparent (just
    // softer + cheaper). Colour is HalfFloat (HDR-linear); depth is a real
    // DepthTexture so shaders can reconstruct view-space position + compare depth.
    const captureOption = sceneCaptureRef.current;
    const captureScale =
      typeof captureOption === "object" ? (captureOption.resolutionScale ?? 1) : 1;
    let sceneCapture: SceneCapture | undefined;
    if (captureOption) {
      const db = renderer.getDrawingBufferSize(new THREE.Vector2());
      const w = Math.max(1, Math.round(db.x * captureScale));
      const h = Math.max(1, Math.round(db.y * captureScale));
      const depthTexture = new THREE.DepthTexture(w, h);
      const target = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType,
        depthTexture,
      });
      sceneCapture = { target, depthTexture };
    }

    // `resize` is defined below (it closes over `handlers`), so route setPixelRatio
    // through a holder that's filled in once resize exists.
    let applyResize = () => {};
    const setPixelRatio = (ratio: number) => {
      renderer.setPixelRatio(Math.min(ratio, maxPixelRatio));
      applyResize();
    };

    // Frame-rate cap: render 1 of every `frameStride` vsync callbacks (1 = uncapped).
    let frameStride = 1;
    const setFrameStride = (stride: number) => {
      frameStride = Math.max(1, Math.floor(stride));
    };

    // Built before setup so a scene can grab it from the context and add its own spans.
    const gpuTimer = gpuStatsRef.current ? new GpuTimer(renderer) : undefined;

    // CPU submission cost (ms) of the last main render — the ANGLE→D3D11 draw-submission counterpart
    // to the gpuTimer's `main` GPU-execution span. Measured every frame below; a perf harness reads
    // the prior frame's value via the context getter.
    let lastMainRenderMs = 0;

    const handlers = setupRef.current({
      scene,
      camera,
      renderer,
      container,
      bloomPass: () => bloomPass,
      setBloom,
      isBloomEnabled: () => bloomEnabled,
      setBloomPrefilter,
      setGrade,
      isGradeEnabled: () => gradeEnabled,
      setToneMapping: (mode) => {
        renderer.toneMapping = mode;
      },
      sceneCapture,
      gpuTimer,
      setPixelRatio,
      setFrameStride,
      mainRenderMs: () => lastMainRenderMs,
    });

    const stats = showStatsRef.current ? new Stats() : undefined;
    if (stats) {
      stats.showPanel(0);
      container.appendChild(stats.dom);
    }
    if (gpuTimer) container.appendChild(gpuTimer.dom);

    const timer = new THREE.Timer();
    // Uses the Page Visibility API to avoid a huge delta when the tab regains focus.
    timer.connect(document);
    const renderMain = (d: number) => {
      if (composerActive() && composer) composer.render(d);
      else renderer.render(scene, camera);
    };
    // Frame-rate cap: render 1 of every `frameStride` vsync callbacks (even cadence).
    let frameCount = 0;
    renderer.setAnimationLoop(() => {
      frameCount++;
      if (frameStride > 1 && frameCount % frameStride !== 0) return;
      timer.update();
      const delta = timer.getDelta();
      handlers.onFrame?.(delta);
      const mainStart = performance.now();
      if (gpuTimer) gpuTimer.span("main", () => renderMain(delta));
      else renderMain(delta);
      lastMainRenderMs = performance.now() - mainStart;
      gpuTimer?.poll();
      stats?.update();
    });

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      composer?.setSize(width, height);
      if (sceneCapture) {
        const db = renderer.getDrawingBufferSize(new THREE.Vector2());
        sceneCapture.target.setSize(
          Math.max(1, Math.round(db.x * captureScale)),
          Math.max(1, Math.round(db.y * captureScale)),
        );
      }
      handlers.onResize?.(width, height);
    };
    applyResize = resize;
    // Apply once now so any pixel-ratio a scene set during setup (via setPixelRatio,
    // whose resize was a no-op before this point) takes effect on the first frame.
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      timer.disconnect();
      timer.dispose();
      stats?.dom.remove();
      gpuTimer?.dispose();
      handlers.dispose?.();
      composer?.dispose();
      sceneCapture?.target.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return containerRef;
}
