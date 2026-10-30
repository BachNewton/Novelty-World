import "@/shared/lib/sound/no-audio-context";
import { ZZFX } from "zzfx";
import type { Score } from "../types";
import { BandStream, STREAM_CHUNK, type Band } from "./band";
import { renderClip } from "./clip";
import type { Rendered } from "./render";
import type { Clip } from "./vocabulary";

// Renders off the main thread, which would otherwise freeze the page. A piece is
// a stream: each chunk is rendered on request, so nothing runs ahead of a stop. A
// sampler clip is short and comes back whole. Buffers go back transferred, not
// copied.

export type ClipPerformance = { clip: Clip };

export type RenderRequest =
  | ({ id: number } & ClipPerformance)
  // Opens a stream at a chunk of the piece, and renders that chunk.
  | { id: number; stream: { score: Score; band: Band; sampleRate: number; chunk: number } }
  | { id: number; more: true }
  | { id: number; close: true };

export type StreamChunk = { id: number; chunk: number; left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer> };

export type RenderReply = ({ id: number; chunk?: undefined } & Rendered) | StreamChunk | { id: number; error: string };

// `self` in a worker is a DedicatedWorkerGlobalScope, which the project's
// "dom" lib doesn't declare; this is the part used.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RenderRequest>) => void) | null;
  postMessage: (message: RenderReply, transfer?: Transferable[]) => void;
};

let open: { id: number; stream: BandStream; chunk: number } | null = null;

function sendChunk(): void {
  if (open === null) throw new Error("Composer: more asked of no stream");
  const part = open.stream.next();
  if (part === null) throw new Error("Composer: more asked past the end of a stream");
  const { left, right } = part;
  scope.postMessage({ id: open.id, chunk: open.chunk++, left, right }, [left.buffer, right.buffer]);
}

function describe(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function guarded(id: number, act: () => void): void {
  try {
    act();
  } catch (error) {
    scope.postMessage({ id, error: describe(error) });
  }
}

scope.onmessage = ({ data }) => {
  const { id } = data;
  if ("close" in data) {
    if (open?.id === id) open = null;
    return;
  }
  if ("more" in data) {
    guarded(id, sendChunk);
    return;
  }
  if ("stream" in data) {
    const { score, band, sampleRate, chunk } = data.stream;
    guarded(id, () => {
      open = { id, stream: new BandStream(score, band, sampleRate, chunk * STREAM_CHUNK), chunk };
      sendChunk();
    });
    return;
  }
  guarded(id, () => {
    const { left, right, sampleRate } = renderClip(data.clip, ZZFX.sampleRate);
    scope.postMessage({ id, left, right, sampleRate }, [left.buffer, right.buffer]);
  });
};
