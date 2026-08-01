// ---------------------------------------------------------------------------
// A dependency-free, SYNCHRONOUS ONNX inference engine.
//
// It exists because onnxruntime's JavaScript backends all return a Promise from
// `run()` — an async boundary no synchronous caller can cross — while a bot
// whose whole contract is `(state) => decision` has no await to spend. Loading
// stays async-friendly (hand `load()` bytes you fetched however you like); only
// the forward pass is synchronous.
//
// It knows nothing about any particular model: feed it tensors named after the
// graph's inputs, get back tensors named after its outputs. Anything
// model-specific — feature layout, masking, head geometry, sampling — belongs
// in the layer above.
//
//   const session = SyncOnnxSession.load(bytes);
//   const out = session.run({ x: tensorOf([1, 4], [1, 2, 3, 4]) });
//
// An op the executor cannot run is rejected by `load()`, by name, before any
// number is produced — never silently approximated.
// ---------------------------------------------------------------------------

export { SyncOnnxSession, type SessionOptions, type IoSpec } from "./session";
export {
  Tensor,
  tensorOf,
  allocData,
  broadcastShapes,
  broadcastStrides,
  computeStrides,
  numElements,
  dtypeFromCode,
  codeFromDtype,
  isFloatDType,
  type DType,
  type TensorData,
} from "./tensor";
export { parseModel, float16ToFloat32, type OnnxModel, type OnnxGraph, type OnnxNode } from "./model";
export { KERNELS, KNOWN_UNIMPLEMENTED, DIRECT_ALLOCATOR, type OpContext, type Kernel } from "./ops";
export { ProtoReader } from "./protobuf";
