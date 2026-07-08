import * as THREE from "three";

// EXT_disjoint_timer_query_webgl2 isn't in lib.dom's typed getExtension overloads,
// so `getContext().getExtension(...)` returns `any` for it — declare the two
// constants we use so the rest of the file stays typed.
interface DisjointTimerQueryExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

interface InFlight {
  name: string;
  query: WebGLQuery;
}

// One graphed row in the panel: a label + a scrolling history sparkline, à la the
// Stats.js panel but per pass. `ema` is the smoothed number shown in the label (a
// readable average); `history` is the raw per-frame samples the graph draws (so
// spikes and jitter stay visible); `peak` is the tallest sample still on screen.
interface SpanView {
  label: HTMLDivElement;
  ctx2d: CanvasRenderingContext2D | null;
  history: number[];
  ema: number | null;
}

const GRAPH_W = 74; // CSS px — also the number of history samples (one per column)
const GRAPH_H = 26;
const FG = "#7fffd4";
const BG = "rgba(127,255,212,0.12)";
const CLIP = "#ff8c69"; // samples past the graph's scale — railed to the top in a warm tint

/**
 * Per-pass GPU timing via `EXT_disjoint_timer_query_webgl2`. Wrap a span of draw
 * commands with `span(name, fn)` and it reports how long the GPU spent *executing*
 * them — not the CPU submit time three's Stats panel measures (WebGL is async, so
 * the CPU returns from `render()` long before the GPU finishes). Use it to see
 * where GPU work is actually going and tune fidelity-per-cost in real time.
 *
 * Each pass gets its own row in the panel (`.dom`): a smoothed millisecond average
 * plus a **scrolling history graph** — so, like the Stats.js FPS graph, you can see
 * spikes and whether a pass is stable, not just a number twitching every frame.
 * (stats-gl / Stats.js only graph a single whole-frame total; this graphs each pass
 * separately, which is what makes an individual knob's effect legible.)
 *
 * Results read back asynchronously a frame or two later, so call `poll()` once per
 * frame after every span is submitted. Spans must NOT overlap: WebGL2 allows only
 * one `TIME_ELAPSED` query active at a time, so a span opened while another is active
 * runs un-timed. Degrades to a no-op "n/a" panel when the extension is unavailable
 * (Safari, some mobile GPUs, or when a browser strips it as a timing-attack
 * mitigation).
 */
export class GpuTimer {
  readonly dom: HTMLDivElement;
  readonly available: boolean;
  private readonly gl: WebGL2RenderingContext;
  private readonly ext: DisjointTimerQueryExt | null;
  private readonly pool: WebGLQuery[] = [];
  private inFlight: InFlight[] = [];
  private readonly latest = new Map<string, number>();
  private readonly views = new Map<string, SpanView>();
  private readonly order: string[] = [];
  private readonly dpr = Math.min(2, Math.max(1, Math.round(window.devicePixelRatio)));
  private active = false;
  private enabled = true;

  constructor(renderer: THREE.WebGLRenderer) {
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.ext = this.gl.getExtension(
      "EXT_disjoint_timer_query_webgl2",
    ) as DisjointTimerQueryExt | null;
    this.available = this.ext !== null;
    this.dom = this.buildPanel();
  }

  /**
   * Turn the timer's GPU queries on/off at runtime WITHOUT tearing down the panel. When off,
   * `span()` runs `fn` un-timed — no `beginQuery`/`endQuery`, so ANGLE need not fence/flush the
   * command buffer around each span. Lets a benchmark measure the pure CPU submit cost of a render
   * with the timer's own overhead removed (the `EXT_disjoint_timer_query` fences are not free), to
   * check whether this dev overlay is itself inflating the frame.
   */
  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  /** Time the GPU cost of the draw commands `fn` submits, under `name`. */
  span(name: string, fn: () => void): void {
    if (this.ext === null || this.active || !this.enabled) {
      // No timer, disabled, or a span is already open (can't nest TIME_ELAPSED) — run un-timed.
      fn();
      return;
    }
    const query = this.pool.pop() ?? this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.active = true;
    fn();
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.active = false;
    if (!this.order.includes(name)) this.order.push(name);
    this.inFlight.push({ name, query });
  }

  /**
   * The most recent raw per-pass GPU-ms reading (one entry per span name, e.g.
   * `capture` / `ssr` / `main`). Unlike the panel's label — which shows a smoothed
   * EMA — this is the last value `poll()` read back, so it's the right source for a
   * benchmark sampling per-frame cost. Reflects a reading from ~1–2 frames ago
   * (queries resolve asynchronously); a caller wanting per-frame attribution should
   * let a few frames of warmup pass after any scene change so the readback catches up.
   */
  values(): Map<string, number> {
    return new Map(this.latest);
  }

  /** Collect finished query results and advance every graph one frame. Call once per frame. */
  poll(): void {
    if (this.ext === null) return;
    // A disjoint event (context switch, GPU power-state change) invalidates timings
    // recorded during the interval — read the results but don't trust them.
    const disjoint = Boolean(this.gl.getParameter(this.ext.GPU_DISJOINT_EXT));
    const still: InFlight[] = [];
    for (const item of this.inFlight) {
      const ready = Boolean(
        this.gl.getQueryParameter(item.query, this.gl.QUERY_RESULT_AVAILABLE),
      );
      if (!ready) {
        still.push(item);
        continue;
      }
      if (!disjoint) {
        const ms = Number(this.gl.getQueryParameter(item.query, this.gl.QUERY_RESULT)) / 1e6;
        this.latest.set(item.name, ms);
      }
      this.pool.push(item.query);
    }
    this.inFlight = still;
    this.advance();
  }

  dispose(): void {
    for (const query of this.pool) this.gl.deleteQuery(query);
    for (const { query } of this.inFlight) this.gl.deleteQuery(query);
    this.pool.length = 0;
    this.inFlight = [];
    this.dom.remove();
  }

  // Push this frame's sample onto each row's graph (carrying the last value forward if
  // no new result landed) and repaint. A derived `total` row sums the measured passes.
  private advance(): void {
    let total = 0;
    for (const name of this.order) {
      const value = this.latest.get(name) ?? 0;
      total += value;
      this.updateRow(name, value);
    }
    if (this.order.length > 0) this.updateRow("total", total);
  }

  private updateRow(name: string, value: number): void {
    const view = this.views.get(name) ?? this.createRow(name);
    view.history.push(value);
    if (view.history.length > GRAPH_W) view.history.shift();
    // EMA for the label so the number reads as a stable average, not per-frame noise.
    view.ema = view.ema === null ? value : view.ema + (value - view.ema) * 0.1;
    const peak = Math.max(...view.history);
    view.label.textContent = `${name.padEnd(9)}${view.ema.toFixed(2)}`;
    view.label.title = `${name}: ${view.ema.toFixed(2)} ms avg, ${peak.toFixed(2)} ms peak`;
    // Scale to a few × the smoothed average, NOT the window peak — so a transient spike
    // clips at the top instead of rescaling (and squashing) the whole graph. The axis
    // then only drifts as smoothly as the average does.
    this.drawGraph(view, Math.max(view.ema * 2, 0.01));
  }

  private drawGraph(view: SpanView, scale: number): void {
    const ctx = view.ctx2d;
    if (ctx === null) return;
    ctx.clearRect(0, 0, GRAPH_W, GRAPH_H);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, GRAPH_W, GRAPH_H);
    const n = view.history.length;
    // Right-align so the newest sample is at the right edge and history scrolls left.
    for (let i = 0; i < n; i++) {
      const value = view.history[i];
      const h = Math.min(value / scale, 1) * GRAPH_H;
      ctx.fillStyle = value > scale ? CLIP : FG; // spikes past the axis rail the top
      ctx.fillRect(GRAPH_W - n + i, GRAPH_H - h, 1, h);
    }
  }

  private createRow(name: string): SpanView {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:5px;margin-top:2px";
    const label = document.createElement("div");
    label.style.cssText = "white-space:pre;min-width:66px";
    const canvas = document.createElement("canvas");
    canvas.width = GRAPH_W * this.dpr;
    canvas.height = GRAPH_H * this.dpr;
    canvas.style.width = `${GRAPH_W}px`;
    canvas.style.height = `${GRAPH_H}px`;
    const ctx2d = canvas.getContext("2d");
    if (ctx2d !== null) ctx2d.scale(this.dpr, this.dpr);
    row.append(label, canvas);
    this.dom.append(row);
    const view: SpanView = { label, ctx2d, history: [], ema: null };
    this.views.set(name, view);
    return view;
  }

  private buildPanel(): HTMLDivElement {
    const dom = document.createElement("div");
    // Dev-only debug overlay, same category as the Stats / lil-gui panels — styled
    // imperatively here rather than through the app's Tailwind design tokens.
    dom.style.cssText =
      "position:fixed;top:48px;left:0;z-index:10000;width:fit-content;padding:4px 6px;" +
      "background:rgba(0,0,0,0.8);color:#7fffd4;font:9px/1.4 monospace;" +
      "pointer-events:none";
    const title = document.createElement("div");
    title.textContent = this.available ? "GPU ms" : "GPU ms · n/a";
    dom.append(title);
    return dom;
  }
}
