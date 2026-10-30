import createVerovioModule from "verovio/wasm";
import { VerovioToolkit } from "verovio/esm";
import type { Score } from "../types";
import { headerMei, notationToMei } from "./mei";
import type { TimemapEntry } from "./timeline";
import { transcribe, type Notation } from "./transcribe";

// Transcribes and engraves off the main thread: Verovio's WebAssembly is
// megabytes to compile, and a piece takes a moment to lay out, which would
// stall the audio clock's view if done on the page.

export interface EngraveRequest {
  id: number;
  score: Score;
  tracks: number;
}

export interface Engraved {
  svg: string;
  // One bar of each signature in the piece, for the pinned edge.
  headers: { fifths: number; svg: string }[];
  timemap: TimemapEntry[];
  ties: [string, string[]][];
  keys: Notation["keys"];
  timing: Notation["timing"];
  bars: number;
  staves: number;
  // The track each staff is, top to bottom; a two-staff part is named twice.
  staffTracks: string[];
  // Each note by its place in the score, as an id in the engraving.
  written: [key: string, id: string][];
}

export type EngraveReply = ({ id: number } & Engraved) | { id: number; error: string };

// `self` in a worker is a DedicatedWorkerGlobalScope, which the project's
// "dom" lib doesn't declare; this is the part used.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<EngraveRequest>) => void) | null;
  postMessage: (message: EngraveReply) => void;
};

const OPTIONS = {
  breaks: "none",
  adjustPageHeight: true,
  adjustPageWidth: true,
  noJustification: true,
  header: "none",
  footer: "none",
  svgViewBox: true,
  scale: 40,
  mnumInterval: 1,
  pageMarginLeft: 60,
  pageMarginRight: 60,
  pageMarginTop: 20,
  pageMarginBottom: 20,
  spacingStaff: 4,
  spacingSystem: 0,
} as const;

let toolkit: Promise<VerovioToolkit> | null = null;

function loadToolkit(): Promise<VerovioToolkit> {
  toolkit ??= createVerovioModule().then((module) => {
    const loaded = new VerovioToolkit(module);
    loaded.setOptions(OPTIONS);
    return loaded;
  });
  return toolkit;
}

function engraveMei(engine: VerovioToolkit, mei: string): string {
  if (!engine.loadData(mei)) throw new Error(`Verovio refused the score: ${engine.getLog()}`);
  return engine.renderToSVG(1);
}

async function engrave({ score, tracks }: EngraveRequest): Promise<Engraved> {
  const engine = await loadToolkit();
  const notation = transcribe(score, tracks);
  const { mei, ties, written } = notationToMei(notation);
  const svg = engraveMei(engine, mei);
  const timemap = engine.renderToTimemap({ includeRests: true, includeMeasures: true }) as TimemapEntry[];
  const fifths = [...new Set(notation.keys.map((key) => key.fifths))];
  const headers = fifths.map((key) => ({ fifths: key, svg: engraveMei(engine, headerMei(notation, key)) }));
  const { keys, timing, bars, staves } = notation;
  return { svg, headers, timemap, ties: [...ties], keys, timing, bars, staves: staves.length, staffTracks: staves.map((staff) => staff.name), written };
}

scope.onmessage = ({ data }) => {
  const { id } = data;
  engrave(data)
    .then((engraved) => scope.postMessage({ id, ...engraved }))
    .catch((error: unknown) => scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }));
};
