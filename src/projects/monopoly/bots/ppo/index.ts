// ---------------------------------------------------------------------------
// The manifest-driven policy runner, public surface.
//
// The layering, from the bottom:
//
//   manifest.ts   an unknown JSON blob -> a typed description of a MODEL. Knows
//                 nothing about any game, on purpose.
//   heads.ts      the four distribution primitives and the masking semantics the
//                 trainer must be reproduced on, bit for bit.
//   greedy.ts     argmax, the ONLY decode. The bot executes the policy's own
//                 selection; there is no sampled alternative to reach.
//   bundle.ts     fetch -> checksum every declared file -> cache.
//   session.ts    feed assembly from `feat_layout`, one forward pass, and the
//                 game-facing runner the bot consults.
//
// `synthetic.ts` and `assets.ts` are test infrastructure and are NOT re-exported:
// `assets.ts` touches the filesystem at import time, which has no business in a
// browser bundle, and `synthetic.ts` exists only to prove none of the above is
// shaped like the game it happens to be shipped with.
// ---------------------------------------------------------------------------

export {
  ActionSpaceMismatch,
  HEAD_KINDS,
  ManifestError,
  SUPPORTED_CONTRACT_VERSION,
  assertActionGeometry,
  headByName,
  isDiscreteHead,
  locateFeatField,
  parseManifest,
  parseManifestJson,
  type ActionGeometry,
  type CategoricalHead,
  type Composition,
  type Dim,
  type EntityPointerHead,
  type FeatField,
  type FeatLayout,
  type FeatSection,
  type GateSpec,
  type GaussianHead,
  type GroupSpec,
  type HeadKind,
  type HeadSpec,
  type InputSpec,
  type Manifest,
  type MaskSpec,
  type MaskingSpec,
  type PerEntityCategoricalHead,
  type SelectMode,
  type SourceSpec,
  type StorageSpec,
  type ValueSpec,
} from "./manifest";

export {
  HeadError,
  assertCountMaskSourced,
  countMask,
  gaussianSlotsFromWire,
  gaussianStd,
  gaussianWireVector,
  headEntropy,
  headGeometry,
  headLogProb,
  headProbs,
  itemProbs,
  maskedSoftmax,
  resolveColumn,
  type HeadGeometry,
  type HeadProbs,
  type MaskBits,
} from "./heads";

export { greedyIndex } from "./greedy";

export {
  BundleError,
  MANIFEST_NAME,
  detectCacheKind,
  directoryFetcher,
  hasSyncFilesystem,
  httpFetcher,
  loadBundle,
  loadBundleSync,
  openCache,
  sha256Hex,
  sha256HexAsync,
  warmup,
  type BundleCache,
  type BundleFetch,
  type CacheKind,
  type LoadOptions,
  type LoadedBundle,
} from "./bundle";

export {
  PolicySession,
  SessionError,
  adaptSyncSession,
  createExecutor,
  createPolicyRunner,
  encodeOptionsFromDims,
  hasExecutorFactory,
  registerExecutorFactory,
  type ExecTensor,
  type ExecutorFactory,
  type GaussianOutput,
  type HeadNames,
  type Observation,
  type PolicyDistributions,
  type PolicyOutput,
  type PolicyRunner,
  type SyncExecutor,
  type WireValue,
} from "./session";

export {
  FIXTURE_FORMAT,
  FIXTURE_FORMAT_VERSION,
  FixtureError,
  assertFixtureBundle,
  decodeArray,
  parseFixture,
  parseFixtureJson,
  type Fixture,
  type FixtureArray,
  type FixtureCase,
  type FixtureTolerance,
} from "./fixture";
