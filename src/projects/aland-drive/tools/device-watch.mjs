// Runs in the page before the game: wraps the WebGPU device so every shader module and pipeline it makes is written
// down, for `tools/shader-count.mjs` (what a cold page compiles) and `tools/load-count.mjs` (when, during the start).
// Stands alone: Playwright serialises its source into the page.

/** Runs in the page before any of its scripts; the record is `window.__shaderCount`. */
export function watchDevice() {
  const record = { modules: [], pipelines: [] };
  window.__shaderCount = record;
  const ids = new WeakMap();
  const requestDevice = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (...args) {
    const device = await requestDevice.apply(this, args);
    const createShaderModule = device.createShaderModule.bind(device);
    device.createShaderModule = (descriptor) => {
      const shader = createShaderModule(descriptor);
      ids.set(shader, record.modules.length);
      record.modules.push(descriptor.code);
      return shader;
    };
    const stages = (descriptor) => [descriptor.vertex?.module, descriptor.fragment?.module, descriptor.compute?.module].filter(Boolean).map((shader) => ids.get(shader));
    for (const [name, kind] of [["createRenderPipeline", "render"], ["createRenderPipelineAsync", "render"], ["createComputePipeline", "compute"], ["createComputePipelineAsync", "compute"]]) {
      const original = device[name].bind(device);
      device[name] = (descriptor) => {
        record.pipelines.push({ kind, modules: stages(descriptor), label: descriptor.label ?? "" });
        return original(descriptor);
      };
    }
    return device;
  };
}
