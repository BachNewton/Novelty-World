// What a WebGPU frame costs, counted at the API rather than timed: the GPU's own work, the same on every run whatever
// the machine's load. Nothing in the page changes for it: `installGpuMeter` runs before the page's scripts and wraps the
// WebGPU objects the page is given, so every draw, dispatch, upload and pipeline is written down as it's encoded.
//
// A frame is everything encoded from the end of one pass that drew to the canvas to the end of the next. For each pass
// it counts the draw calls and their vertex shader invocations (an indirect draw's arguments are read back from the
// GPU), the pipeline and bind group changes, and the bytes its attachments move: what each colour and depth attachment
// loads, stores and resolves, which is the frame-buffer traffic a bandwidth-bound GPU pays. For the frame it counts the
// compute dispatches and their invocations (the workgroup size read off the kernel's WGSL) and the bytes written to
// buffers and textures. And it counts the fragments each pass shaded: every depth buffer is made a depth-stencil
// buffer, every pipeline increments the stencil wherever a fragment passes the depth test, and a small compute pass of
// the meter's own sums the stencil over the pass. With MSAA each sample counts, so the meter reports both the samples
// written and, per pixel, the most any of its samples saw, which is the fragments shaded at that pixel: a fragment runs
// once per pixel it covers, not once per sample. A fragment the shader discards (a screen-door dissolve, an alpha test)
// is shaded but never passes, so it isn't counted; nor is one the depth test rejects, since on today's GPUs the test
// runs before the shader wherever it can (`rasterized` counts those too, for a shader that can't be tested early).
//
// The scene pass is the pass with the most draws; three draws the scene into an offscreen target and blits it to the
// canvas through its output colour transform, so the canvas pass is one triangle. Per-draw attribution redraws the held
// frame once per draw of the scene pass with the draws after it skipped, so a draw's fragments are those it wrote with
// everything before it in place.
//
// The page side is `installGpuMeter`, serialised into the page by Playwright, so it stands alone; the node side reads
// what it hands back. A game's own tool opens its page, puts it where it wants to measure and asks the meter.

/**
 * Runs in the page before any of its scripts. Stands alone: Playwright serialises its source.
 * `options.stencil` is `written` (fragments that passed the depth test), `rasterized` (every fragment that reached the
 * test, passed or not) or `none` (no fragment counting, depth buffers untouched).
 */
export function installGpuMeter(options) {
  const STENCIL = options?.stencil ?? "written";
  const STENCIL_FORMATS = { depth32float: "depth32float-stencil8", depth24plus: "depth24plus-stencil8" };
  const KEEP_FRAMES = 4;
  const BYTES_PER_PIXEL = { r8unorm: 1, r16float: 2, rg8unorm: 2, r32float: 4, rg16float: 4, rgba8unorm: 4, "rgba8unorm-srgb": 4, bgra8unorm: 4, "bgra8unorm-srgb": 4, rgb10a2unorm: 4, rg32float: 8, rgba16float: 8, rgba32float: 16, depth16unorm: 2, depth24plus: 4, "depth24plus-stencil8": 4, depth32float: 4, "depth32float-stencil8": 5 };
  const meter = {
    adapter: null,
    device: null,
    pipelines: new Map(),
    pipelineList: [],
    modules: new Map(),
    textures: new WeakMap(),
    views: new WeakMap(),
    canvasTextures: new WeakSet(),
    frames: [],
    frame: null,
    frameCount: 0,
    lastClosed: null,
    /** Which of the frame's render passes is the scene's, from the last frame: the one with the most draws. */
    scenePassIndex: -1,
    /** Draws from this index on in the scene pass aren't issued: how a draw's own fragments are told apart. */
    skipFrom: Number.POSITIVE_INFINITY,
    pending: null,
    own: false,
    resolvers: new Map(),
    stencil: STENCIL,
  };
  window.__gpuMeter = meter;

  const wrap = (proto, name, make) => {
    const original = proto[name];
    if (typeof original !== "function") return;
    proto[name] = make(original);
  };
  const hasStencil = (format) => typeof format === "string" && format.endsWith("stencil8");
  const withStencil = (format) => (STENCIL === "none" ? format : (STENCIL_FORMATS[format] ?? format));
  const face = { compare: "always", failOp: "keep", depthFailOp: STENCIL === "rasterized" ? "increment-clamp" : "keep", passOp: "increment-clamp" };
  const inputsOf = (code) => [...(/fn main\(([\s\S]*?)\)\s*->/.exec(code)?.[1] ?? "").matchAll(/@location\(\s*\d+\s*\)\s*(\w+)/g)].map((match) => match[1]).sort().join(", ") || "(none)";
  const workgroupOf = (code) => {
    const found = /@workgroup_size\(([^)]*)\)/.exec(code ?? "");
    return found ? found[1].split(",").reduce((product, size) => product * (Number(size.trim()) || 1), 1) : 1;
  };

  wrap(GPUAdapter.prototype, "requestDevice", (original) =>
    function (descriptor = {}) {
      const wanted = ["depth32float-stencil8"].filter((feature) => this.features.has(feature));
      const requiredFeatures = [...new Set([...(descriptor.requiredFeatures ?? []), ...wanted])];
      return original.call(this, { ...descriptor, requiredFeatures }).then((device) => {
        meter.adapter = this;
        meter.device = device;
        return device;
      });
    },
  );

  wrap(GPUDevice.prototype, "createShaderModule", (original) =>
    function (descriptor) {
      const shader = original.call(this, descriptor);
      meter.modules.set(shader, descriptor.code);
      return shader;
    },
  );
  const recordPipeline = (pipeline, kind, descriptor) => {
    const code = (stage) => meter.modules.get(stage?.module) ?? "";
    const record = {
      id: meter.pipelineList.length,
      kind,
      label: descriptor.label ?? "",
      inputs: kind === "render" ? inputsOf(code(descriptor.vertex)) : "",
      vertexChars: kind === "render" ? code(descriptor.vertex).length : 0,
      fragmentChars: kind === "render" ? code(descriptor.fragment).length : 0,
      workgroupSize: kind === "compute" ? workgroupOf(code(descriptor.compute)) : 0,
      topology: descriptor.primitive?.topology ?? "triangle-list",
      blends: Boolean(descriptor.fragment?.targets?.some((target) => target?.blend)),
      depthWrite: descriptor.depthStencil?.depthWriteEnabled ?? false,
    };
    meter.pipelines.set(pipeline, record);
    meter.pipelineList.push(record);
  };
  const withStencilState = (descriptor) => {
    const depthStencil = descriptor.depthStencil;
    if (!depthStencil || STENCIL === "none") return descriptor;
    const format = withStencil(depthStencil.format);
    if (!hasStencil(format)) return descriptor;
    return { ...descriptor, depthStencil: { ...depthStencil, format, stencilFront: face, stencilBack: face, stencilReadMask: 0xff, stencilWriteMask: 0xff } };
  };
  wrap(GPUDevice.prototype, "createRenderPipeline", (original) =>
    function (descriptor) {
      const used = withStencilState(descriptor);
      const pipeline = original.call(this, used);
      recordPipeline(pipeline, "render", used);
      return pipeline;
    },
  );
  wrap(GPUDevice.prototype, "createRenderPipelineAsync", (original) =>
    function (descriptor) {
      const used = withStencilState(descriptor);
      return original.call(this, used).then((pipeline) => {
        recordPipeline(pipeline, "render", used);
        return pipeline;
      });
    },
  );
  wrap(GPUDevice.prototype, "createComputePipeline", (original) =>
    function (descriptor) {
      const pipeline = original.call(this, descriptor);
      recordPipeline(pipeline, "compute", descriptor);
      return pipeline;
    },
  );
  wrap(GPUDevice.prototype, "createComputePipelineAsync", (original) =>
    function (descriptor) {
      return original.call(this, descriptor).then((pipeline) => {
        recordPipeline(pipeline, "compute", descriptor);
        return pipeline;
      });
    },
  );

  wrap(GPUDevice.prototype, "createTexture", (original) =>
    function (descriptor) {
      let used = descriptor;
      if (STENCIL !== "none" && STENCIL_FORMATS[descriptor.format]) used = { ...descriptor, format: STENCIL_FORMATS[descriptor.format], usage: descriptor.usage | GPUTextureUsage.TEXTURE_BINDING };
      const texture = original.call(this, used);
      meter.textures.set(texture, used);
      return texture;
    },
  );
  wrap(GPUTexture.prototype, "createView", (original) =>
    function (descriptor) {
      const view = original.call(this, descriptor);
      meter.views.set(view, this);
      return view;
    },
  );
  wrap(GPUCanvasContext.prototype, "getCurrentTexture", (original) =>
    function () {
      const texture = original.call(this);
      meter.canvasTextures.add(texture);
      if (!meter.textures.has(texture)) meter.textures.set(texture, { size: { width: texture.width, height: texture.height }, format: texture.format, sampleCount: texture.sampleCount, usage: texture.usage });
      return texture;
    },
  );
  // A buffer a mapped read can't share with a copy keeps its usage; every other buffer can be copied, so an indirect draw's arguments can be read.
  wrap(GPUDevice.prototype, "createBuffer", (original) =>
    function (descriptor) {
      const mapped = (descriptor.usage & GPUBufferUsage.MAP_READ) !== 0 || (descriptor.usage & GPUBufferUsage.MAP_WRITE) !== 0;
      return original.call(this, mapped ? descriptor : { ...descriptor, usage: descriptor.usage | GPUBufferUsage.COPY_SRC });
    },
  );

  const newFrame = () => ({
    index: meter.frameCount,
    renderPasses: [],
    computePasses: [],
    writes: { bufferBytes: 0, bufferCalls: 0, textureBytes: 0, textureCalls: 0 },
    copies: { bufferToBuffer: 0, textureToTexture: 0, bufferToTexture: 0, textureToBuffer: 0 },
    submits: 0,
  });
  meter.frame = newFrame();
  const scenePassOf = (frame) => frame.renderPasses.reduce((best, pass, index) => (pass.draws.length > (frame.renderPasses[best]?.draws.length ?? -1) ? index : best), -1);
  const closeFrame = () => {
    const frame = meter.frame;
    meter.frames.push(frame);
    if (meter.frames.length > KEEP_FRAMES) meter.frames.shift();
    meter.frameCount++;
    meter.lastClosed = frame;
    meter.scenePassIndex = scenePassOf(frame);
    meter.frame = newFrame();
  };

  const passRecords = new WeakMap();
  const passPipeline = new WeakMap();
  const describe = (texture) => {
    const descriptor = texture ? meter.textures.get(texture) : undefined;
    if (!descriptor) return { width: 0, height: 0, sampleCount: 1, format: "" };
    const size = descriptor.size;
    const width = Array.isArray(size) ? size[0] : (size?.width ?? 0);
    const height = Array.isArray(size) ? (size[1] ?? 1) : (size?.height ?? 1);
    return { width, height, sampleCount: descriptor.sampleCount ?? 1, format: descriptor.format ?? "" };
  };
  const bytesOf = ({ width, height, sampleCount, format }) => width * height * sampleCount * (BYTES_PER_PIXEL[format] ?? 4);
  /** What a pass's attachments move: a load reads, a store writes, a resolve reads every sample and writes the pixel. */
  const trafficOf = (descriptor, depthTexture) => {
    let bytes = 0;
    const attachments = [];
    for (const attachment of descriptor.colorAttachments ?? []) {
      if (!attachment) continue;
      const texture = describe(meter.views.get(attachment.view));
      const loads = attachment.loadOp === "load" ? bytesOf(texture) : 0;
      const stores = attachment.storeOp === "discard" ? 0 : bytesOf(texture);
      const resolve = attachment.resolveTarget ? describe(meter.views.get(attachment.resolveTarget)) : null;
      const resolves = resolve ? bytesOf(texture) + bytesOf(resolve) : 0;
      bytes += loads + stores + resolves;
      attachments.push({ kind: "color", format: texture.format, sampleCount: texture.sampleCount, loads, stores, resolves, resolveFormat: resolve?.format ?? null });
    }
    const depth = descriptor.depthStencilAttachment;
    if (depth) {
      const texture = describe(depthTexture);
      const loads = depth.depthLoadOp === "load" ? bytesOf(texture) : 0;
      const stores = depth.depthStoreOp === "discard" ? 0 : bytesOf(texture);
      bytes += loads + stores;
      attachments.push({ kind: "depth", format: texture.format, sampleCount: texture.sampleCount, loads, stores, resolves: 0, resolveFormat: null });
    }
    return { bytes, attachments };
  };
  wrap(GPUCommandEncoder.prototype, "beginRenderPass", (original) =>
    function (descriptor) {
      let used = descriptor;
      const attachment = descriptor.depthStencilAttachment;
      const depthTexture = attachment ? meter.views.get(attachment.view) : undefined;
      const depthFormat = depthTexture ? meter.textures.get(depthTexture)?.format : undefined;
      if (attachment && hasStencil(depthFormat) && attachment.stencilLoadOp === undefined) {
        used = { ...descriptor, depthStencilAttachment: { ...attachment, stencilLoadOp: "clear", stencilClearValue: 0, stencilStoreOp: "store" } };
      }
      const pass = original.call(this, used);
      if (meter.own) return pass;
      const first = descriptor.colorAttachments?.[0];
      const colorTexture = first ? meter.views.get(first.view) : undefined;
      const resolveTexture = first?.resolveTarget ? meter.views.get(first.resolveTarget) : undefined;
      const canvas = [colorTexture, resolveTexture].some((texture) => texture && meter.canvasTextures.has(texture));
      const { width, height, sampleCount } = describe(colorTexture ?? depthTexture);
      const index = meter.frame.renderPasses.length;
      const record = { index, canvas, scene: index === meter.scenePassIndex, depthTexture: depthTexture ?? null, depthFormat: depthFormat ?? null, width, height, sampleCount, draws: [], pipelineSets: 0, bindGroupSets: 0, skipped: 0, traffic: trafficOf(descriptor, depthTexture) };
      meter.frame.renderPasses.push(record);
      passRecords.set(pass, record);
      return pass;
    },
  );
  wrap(GPURenderPassEncoder.prototype, "setPipeline", (original) =>
    function (pipeline) {
      const record = passRecords.get(this);
      if (record) {
        record.pipelineSets++;
        passPipeline.set(this, meter.pipelines.get(pipeline) ?? null);
      }
      return original.call(this, pipeline);
    },
  );
  wrap(GPURenderPassEncoder.prototype, "setBindGroup", (original) =>
    function (...args) {
      const record = passRecords.get(this);
      if (record) record.bindGroupSets++;
      return original.apply(this, args);
    },
  );
  const draw = (kind) => (original) =>
    function (...args) {
      const record = passRecords.get(this);
      if (!record) return original.apply(this, args);
      const pipeline = passPipeline.get(this) ?? null;
      const entry = { index: record.draws.length, kind, pipeline: pipeline?.id ?? -1, count: null, instances: null, vertices: null, indirect: null, skipped: false };
      if (kind === "draw" || kind === "drawIndexed") {
        entry.count = args[0];
        entry.instances = args[1] ?? 1;
        entry.vertices = entry.count * entry.instances;
      } else {
        entry.indirect = { buffer: args[0], offset: args[1] };
      }
      record.draws.push(entry);
      if (record.scene && entry.index >= meter.skipFrom) {
        entry.skipped = true;
        record.skipped++;
        return undefined;
      }
      return original.apply(this, args);
    };
  for (const kind of ["draw", "drawIndexed", "drawIndirect", "drawIndexedIndirect"]) wrap(GPURenderPassEncoder.prototype, kind, draw(kind));
  wrap(GPURenderPassEncoder.prototype, "end", (original) =>
    function () {
      const record = passRecords.get(this);
      const result = original.call(this);
      if (record?.canvas) closeFrame();
      return result;
    },
  );

  wrap(GPUCommandEncoder.prototype, "beginComputePass", (original) =>
    function (descriptor) {
      const pass = original.call(this, descriptor);
      if (meter.own) return pass;
      const record = { dispatches: [], pipelineSets: 0 };
      meter.frame.computePasses.push(record);
      passRecords.set(pass, record);
      return pass;
    },
  );
  wrap(GPUComputePassEncoder.prototype, "setPipeline", (original) =>
    function (pipeline) {
      const record = passRecords.get(this);
      if (record) {
        record.pipelineSets++;
        passPipeline.set(this, meter.pipelines.get(pipeline) ?? null);
      }
      return original.call(this, pipeline);
    },
  );
  wrap(GPUComputePassEncoder.prototype, "dispatchWorkgroups", (original) =>
    function (x = 1, y = 1, z = 1) {
      const record = passRecords.get(this);
      if (record) {
        const pipeline = passPipeline.get(this) ?? null;
        record.dispatches.push({ pipeline: pipeline?.id ?? -1, workgroups: x * y * z, invocations: x * y * z * (pipeline?.workgroupSize ?? 1), indirect: false });
      }
      return original.call(this, x, y, z);
    },
  );
  wrap(GPUComputePassEncoder.prototype, "dispatchWorkgroupsIndirect", (original) =>
    function (...args) {
      const record = passRecords.get(this);
      if (record) {
        const pipeline = passPipeline.get(this) ?? null;
        record.dispatches.push({ pipeline: pipeline?.id ?? -1, workgroups: null, invocations: null, indirect: true });
      }
      return original.apply(this, args);
    },
  );

  const copies = { copyBufferToBuffer: "bufferToBuffer", copyTextureToTexture: "textureToTexture", copyBufferToTexture: "bufferToTexture", copyTextureToBuffer: "textureToBuffer" };
  for (const [name, key] of Object.entries(copies)) {
    wrap(GPUCommandEncoder.prototype, name, (original) =>
      function (...args) {
        if (!meter.own) meter.frame.copies[key]++;
        return original.apply(this, args);
      },
    );
  }
  const bytesPerElement = (data) => (ArrayBuffer.isView(data) && !(data instanceof DataView) ? data.BYTES_PER_ELEMENT : 1);
  wrap(GPUQueue.prototype, "writeBuffer", (original) =>
    function (buffer, offset, data, dataOffset = 0, size) {
      if (!meter.own) {
        const unit = bytesPerElement(data);
        meter.frame.writes.bufferBytes += size === undefined ? data.byteLength - dataOffset * unit : size * unit;
        meter.frame.writes.bufferCalls++;
      }
      return original.call(this, buffer, offset, data, dataOffset, size);
    },
  );
  wrap(GPUQueue.prototype, "writeTexture", (original) =>
    function (destination, data, layout, size) {
      if (!meter.own) {
        const width = Array.isArray(size) ? size[0] : size.width;
        const height = Array.isArray(size) ? (size[1] ?? 1) : (size.height ?? 1);
        const depth = Array.isArray(size) ? (size[2] ?? 1) : (size.depthOrArrayLayers ?? 1);
        const rows = (layout.rowsPerImage ?? height) * depth;
        const rowBytes = layout.bytesPerRow ?? Math.ceil((data.byteLength - (layout.offset ?? 0)) / Math.max(1, rows));
        // The last row of each image is only as long as the width needs; the rest span bytesPerRow.
        const widthBytes = Math.min(rowBytes, Math.ceil(rowBytes * (width / Math.max(1, width))));
        meter.frame.writes.textureBytes += Math.min(data.byteLength - (layout.offset ?? 0), rowBytes * Math.max(0, rows - 1) + widthBytes);
        meter.frame.writes.textureCalls++;
      }
      return original.call(this, destination, data, layout, size);
    },
  );
  wrap(GPUQueue.prototype, "copyExternalImageToTexture", (original) =>
    function (source, destination, size) {
      if (!meter.own) {
        const width = Array.isArray(size) ? size[0] : size.width;
        const height = Array.isArray(size) ? (size[1] ?? 1) : (size.height ?? 1);
        meter.frame.writes.textureBytes += width * height * 4;
        meter.frame.writes.textureCalls++;
      }
      return original.call(this, source, destination, size);
    },
  );
  wrap(GPUQueue.prototype, "submit", (original) =>
    function (buffers) {
      const result = original.call(this, buffers);
      if (meter.own) return result;
      meter.frame.submits++;
      const frame = meter.lastClosed;
      const request = meter.pending;
      if (frame && request && frame === meter.frames[meter.frames.length - 1]) {
        meter.lastClosed = null;
        meter.pending = null;
        meter.skipFrom = Number.POSITIVE_INFINITY;
        readBack(frame, request.options).then(request.resolve, request.reject);
      }
      return result;
    },
  );

  /** The compute pipeline that sums a stencil over a pass, one per sample count. */
  const resolver = (sampleCount) => {
    const made = meter.resolvers.get(sampleCount);
    if (made) return made;
    const multisampled = sampleCount > 1;
    const code = `
      struct Params { width: u32, height: u32, image: u32, pad: u32 }
      @group(0) @binding(0) var stencil: ${multisampled ? "texture_multisampled_2d<u32>" : "texture_2d<u32>"};
      @group(0) @binding(1) var<storage, read_write> image: array<u32>;
      @group(0) @binding(2) var<storage, read_write> totals: array<atomic<u32>, 4>;
      @group(0) @binding(3) var<uniform> params: Params;
      var<workgroup> groupMost: atomic<u32>;
      var<workgroup> groupSum: atomic<u32>;
      var<workgroup> groupCovered: atomic<u32>;
      @compute @workgroup_size(16, 16)
      fn main(@builtin(global_invocation_id) id: vec3<u32>, @builtin(local_invocation_index) local: u32) {
        var most = 0u;
        var sum = 0u;
        if (id.x < params.width && id.y < params.height) {
          ${multisampled ? `for (var sample = 0u; sample < ${sampleCount}u; sample++) { let value = textureLoad(stencil, vec2<i32>(id.xy), i32(sample)).r; most = max(most, value); sum += value; }` : "let value = textureLoad(stencil, vec2<i32>(id.xy), 0).r; most = value; sum = value;"}
          if (params.image != 0u) { image[id.y * params.width + id.x] = most | (sum << 8u); }
        }
        atomicAdd(&groupMost, most);
        atomicAdd(&groupSum, sum);
        atomicAdd(&groupCovered, select(0u, 1u, most > 0u));
        workgroupBarrier();
        if (local == 0u) {
          let groupTotal = atomicLoad(&groupSum);
          atomicAdd(&totals[0], atomicLoad(&groupMost));
          let before = atomicAdd(&totals[1], groupTotal);
          if (before > 0xffffffffu - groupTotal) { atomicAdd(&totals[2], 1u); }
          atomicAdd(&totals[3], atomicLoad(&groupCovered));
        }
      }`;
    const shader = meter.device.createShaderModule({ label: "gpu-meter stencil sum", code });
    const pipeline = meter.device.createComputePipeline({ label: "gpu-meter stencil sum", layout: "auto", compute: { module: shader, entryPoint: "main" } });
    meter.resolvers.set(sampleCount, pipeline);
    return pipeline;
  };

  /** What the meter's own commands read back from the GPU for a frame: indirect draw arguments and each pass's stencil sums. */
  async function readBack(frame, { indirect = true, fragments = true, image = false } = {}) {
    const device = meter.device;
    meter.own = true;
    const staging = [];
    const made = [];
    try {
      const encoder = device.createCommandEncoder({ label: "gpu-meter readback" });
      const indirectDraws = frame.renderPasses.flatMap((pass) => pass.draws).filter((entry) => entry.indirect !== null);
      if (indirect && indirectDraws.length > 0) {
        const buffer = device.createBuffer({ label: "gpu-meter indirect arguments", size: indirectDraws.length * 20, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        indirectDraws.forEach((entry, at) => encoder.copyBufferToBuffer(entry.indirect.buffer, entry.indirect.offset, buffer, at * 20, 20));
        staging.push({
          buffer,
          apply(data) {
            const words = new Uint32Array(data);
            indirectDraws.forEach((entry, at) => {
              entry.count = words[at * 5];
              entry.instances = words[at * 5 + 1];
              entry.vertices = entry.count * entry.instances;
            });
          },
        });
      }
      const scene = scenePassOf(frame);
      const stencils = [];
      let picture = null;
      if (fragments) {
        for (const pass of frame.renderPasses) {
          if (!pass.depthTexture || !hasStencil(pass.depthFormat)) continue;
          const { width, height, sampleCount } = describe(pass.depthTexture);
          const pipeline = resolver(sampleCount);
          const wantImage = image && pass.index === scene;
          const totals = device.createBuffer({ label: "gpu-meter totals", size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
          const params = device.createBuffer({ label: "gpu-meter params", size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
          device.queue.writeBuffer(params, 0, new Uint32Array([width, height, wantImage ? 1 : 0, 0]));
          const imageBuffer = device.createBuffer({ label: "gpu-meter image", size: wantImage ? width * height * 4 : 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
          made.push(totals, params, imageBuffer);
          const view = pass.depthTexture.createView({ aspect: "stencil-only" });
          const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: view },
              { binding: 1, resource: { buffer: imageBuffer } },
              { binding: 2, resource: { buffer: totals } },
              { binding: 3, resource: { buffer: params } },
            ],
          });
          encoder.clearBuffer(totals);
          const compute = encoder.beginComputePass({ label: "gpu-meter stencil sum" });
          compute.setPipeline(pipeline);
          compute.setBindGroup(0, bindGroup);
          compute.dispatchWorkgroups(Math.ceil(width / 16), Math.ceil(height / 16));
          compute.end();
          const totalsRead = device.createBuffer({ label: "gpu-meter totals read", size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
          encoder.copyBufferToBuffer(totals, 0, totalsRead, 0, 16);
          const stencil = { pass: pass.index, width, height, sampleCount, pixels: width * height, fragments: 0, samples: 0, covered: 0 };
          stencils.push(stencil);
          staging.push({
            buffer: totalsRead,
            apply(data) {
              const words = new Uint32Array(data);
              stencil.fragments = words[0];
              stencil.samples = words[1] + words[2] * 2 ** 32;
              stencil.covered = words[3];
            },
          });
          if (wantImage) {
            const imageRead = device.createBuffer({ label: "gpu-meter image read", size: width * height * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
            encoder.copyBufferToBuffer(imageBuffer, 0, imageRead, 0, width * height * 4);
            staging.push({
              buffer: imageRead,
              apply(data) {
                picture = { width, height, image: new Uint32Array(data) };
              },
            });
          }
        }
      }
      device.queue.submit([encoder.finish()]);
      await Promise.all(staging.map((entry) => entry.buffer.mapAsync(GPUMapMode.READ)));
      for (const entry of staging) {
        entry.apply(entry.buffer.getMappedRange().slice(0));
        entry.buffer.unmap();
      }
      return { frame: summary(frame, stencils), picture };
    } finally {
      for (const entry of staging) entry.buffer.destroy();
      for (const buffer of made) buffer.destroy();
      meter.own = false;
    }
  }

  /** A frame's counts, as plain data. */
  const summary = (frame, stencils) => {
    const scene = scenePassOf(frame);
    const triangles = (entry, pipeline) => (pipeline?.topology === "triangle-list" ? Math.floor((entry.count ?? 0) / 3) * (entry.instances ?? 0) : pipeline?.topology === "triangle-strip" ? Math.max(0, (entry.count ?? 0) - 2) * (entry.instances ?? 0) : 0);
    const passes = frame.renderPasses.map((pass) => ({
      index: pass.index,
      canvas: pass.canvas,
      scene: pass.index === scene,
      width: pass.width,
      height: pass.height,
      sampleCount: pass.sampleCount,
      pipelineSets: pass.pipelineSets,
      bindGroupSets: pass.bindGroupSets,
      traffic: pass.traffic,
      stencil: stencils.find((entry) => entry.pass === pass.index) ?? null,
      draws: pass.draws.map((entry) => {
        const pipeline = meter.pipelineList[entry.pipeline] ?? null;
        return { index: entry.index, kind: entry.kind, pipeline: entry.pipeline, label: pipeline?.label ?? "", inputs: pipeline?.inputs ?? "", count: entry.count, instances: entry.instances, vertices: entry.vertices, triangles: triangles(entry, pipeline), indirect: entry.indirect !== null, skipped: entry.skipped };
      }),
    }));
    const computes = frame.computePasses.map((pass) => ({ pipelineSets: pass.pipelineSets, dispatches: pass.dispatches.map((entry) => ({ ...entry, label: meter.pipelineList[entry.pipeline]?.label ?? "" })) }));
    return { index: frame.index, passes, computes, writes: { ...frame.writes }, copies: { ...frame.copies }, submits: frame.submits };
  };

  /** Resolves with the next frame's counts once the GPU has answered. `skipFrom` leaves the scene pass's draws from that index on undrawn. */
  meter.measure = (options = {}) =>
    new Promise((resolve, reject) => {
      meter.skipFrom = options.skipFrom ?? Number.POSITIVE_INFINITY;
      meter.pending = { options: { indirect: options.indirect ?? true, fragments: options.fragments ?? true, image: options.image ?? false }, resolve, reject };
    });

  /**
   * The fragments each draw of the scene pass wrote with everything before it in place: the frame redrawn once per
   * draw, each time with the draws after it skipped, so the differences between one frame's total and the next's are each
   * draw's own. The frame must hold still meanwhile.
   */
  meter.measureDraws = async () => {
    const whole = await meter.measure({ indirect: true, fragments: true });
    const scene = whole.frame.passes.find((pass) => pass.scene);
    if (!scene?.stencil) return null;
    const totals = [0];
    for (let drawn = 1; drawn <= scene.draws.length; drawn++) {
      const partial = await meter.measure({ indirect: false, fragments: true, skipFrom: drawn });
      totals.push(partial.frame.passes.find((pass) => pass.scene)?.stencil?.fragments ?? totals[totals.length - 1]);
    }
    return scene.draws.map((entry, at) => ({ ...entry, fragments: totals[at + 1] - totals[at] }));
  };

  /** A PNG of the scene pass's overdraw, from the picture a measurement with `image` read: how many fragments each pixel saw. */
  meter.heatMap = async ({ image, width, height }) => {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    const pixels = context.createImageData(width, height);
    // 0 black; 1 blue; 2 green; 3 yellow; 4 orange; 5 red; more, towards white.
    const ramp = [
      [0, 0, 0],
      [30, 60, 200],
      [40, 170, 60],
      [230, 220, 40],
      [240, 140, 30],
      [220, 40, 30],
    ];
    for (let at = 0; at < width * height; at++) {
      const most = image[at] & 0xff;
      const [red, green, blue] = most < ramp.length ? ramp[most] : [220 + Math.min(35, (most - 5) * 6), 40 + Math.min(215, (most - 5) * 40), 30 + Math.min(225, (most - 5) * 40)];
      pixels.data[at * 4] = red;
      pixels.data[at * 4 + 1] = green;
      pixels.data[at * 4 + 2] = blue;
      pixels.data[at * 4 + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
    return btoa(binary);
  };

  /** How many pixels saw each count of fragments, from a measurement's picture. */
  meter.histogram = ({ image }) => {
    const counts = new Array(256).fill(0);
    for (let at = 0; at < image.length; at++) counts[image[at] & 0xff]++;
    return counts.slice(0, counts.findLastIndex((pixels) => pixels > 0) + 1);
  };

  meter.adapterInfo = () => {
    const info = meter.adapter?.info;
    return info ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description } : null;
  };
  meter.pipelinesOut = () => meter.pipelineList.map((record) => ({ ...record }));
}

/** The totals of one frame's summary, as a game's tool prints them: the scene pass's work, and the other passes' beside it. */
export function totalsOf(frame) {
  const scene = frame.passes.find((pass) => pass.scene) ?? { draws: [], pipelineSets: 0, bindGroupSets: 0, traffic: { bytes: 0 }, stencil: null, width: 0, height: 0, sampleCount: 1 };
  const drawn = scene.draws.filter((entry) => !entry.skipped);
  const sum = (items, pick) => items.reduce((total, item) => total + (pick(item) ?? 0), 0);
  const others = frame.passes.filter((pass) => !pass.scene);
  return {
    width: scene.width,
    height: scene.height,
    sampleCount: scene.sampleCount,
    pixels: scene.width * scene.height,
    draws: drawn.length,
    triangles: sum(drawn, (entry) => entry.triangles),
    vertices: sum(drawn, (entry) => entry.vertices),
    indirectDraws: drawn.filter((entry) => entry.indirect).length,
    fragments: scene.stencil?.fragments ?? null,
    samples: scene.stencil?.samples ?? null,
    covered: scene.stencil?.covered ?? null,
    pipelineSets: scene.pipelineSets,
    bindGroupSets: scene.bindGroupSets,
    attachmentBytes: sum(frame.passes, (pass) => pass.traffic?.bytes),
    sceneAttachmentBytes: scene.traffic?.bytes ?? 0,
    renderPasses: frame.passes.length,
    otherPasses: others.map((pass) => ({ index: pass.index, canvas: pass.canvas, draws: pass.draws.length, fragments: pass.stencil?.fragments ?? null, width: pass.width, height: pass.height, sampleCount: pass.sampleCount, attachmentBytes: pass.traffic?.bytes ?? 0 })),
    computePasses: frame.computes.length,
    dispatches: sum(frame.computes, (pass) => pass.dispatches.length),
    computeInvocations: sum(frame.computes, (pass) => sum(pass.dispatches, (entry) => entry.invocations)),
    uploadBytes: frame.writes.bufferBytes + frame.writes.textureBytes,
    uploadCalls: frame.writes.bufferCalls + frame.writes.textureCalls,
    copies: Object.values(frame.copies).reduce((total, items) => total + items, 0),
    submits: frame.submits,
  };
}

/** Draws of one pass grouped by pipeline, with each group's counts: what each shader cost the frame. */
export function byPipeline(draws) {
  const groups = new Map();
  for (const entry of draws) {
    if (entry.skipped) continue;
    const key = entry.pipeline;
    const group = groups.get(key) ?? { pipeline: key, label: entry.label, inputs: entry.inputs, draws: 0, triangles: 0, vertices: 0, fragments: 0 };
    group.draws++;
    group.triangles += entry.triangles ?? 0;
    group.vertices += entry.vertices ?? 0;
    group.fragments += entry.fragments ?? 0;
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** A number as a tool prints it: thousands separated, or in millions to a decimal past ten million. */
export const count = (value) => (value === null || value === undefined ? "?" : Math.abs(value) >= 1e7 ? `${(value / 1e6).toFixed(1)} M` : Math.round(value).toLocaleString("en-US"));

/** A change between two counts, signed and as a share. */
export const change = (before, after) => {
  if (before === null || before === undefined || after === null || after === undefined) return "";
  const delta = after - before;
  if (delta === 0) return "same";
  const share = before === 0 ? "" : ` (${delta > 0 ? "+" : ""}${((delta / before) * 100).toFixed(1)}%)`;
  return `${delta > 0 ? "+" : "-"}${count(Math.abs(delta))}${share}`;
};
