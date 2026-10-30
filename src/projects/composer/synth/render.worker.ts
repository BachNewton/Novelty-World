import "@/shared/lib/sound/no-audio-context";
import { ZZFX } from "zzfx";
import type { Score } from "../types";
import { performerById, renderScore, type Rendered } from "./render";

// Renders a score off the main thread: a piece takes seconds, which would
// freeze the page. The buffers go back transferred, not copied.

export interface RenderRequest {
  id: number;
  score: Score;
  performer: string;
}

export type RenderReply = ({ id: number } & Rendered) | { id: number; error: string };

// `self` in a worker is a DedicatedWorkerGlobalScope, which the project's
// "dom" lib doesn't declare; this is the part used.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RenderRequest>) => void) | null;
  postMessage: (message: RenderReply, transfer?: Transferable[]) => void;
};

scope.onmessage = ({ data: { id, score, performer } }) => {
  try {
    const rendered = renderScore(score, performerById(performer), {
      sampleRate: ZZFX.sampleRate,
      build: (params) => ZZFX.buildSamples(...params),
    });
    scope.postMessage({ id, ...rendered }, [rendered.left.buffer, rendered.right.buffer]);
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
  }
};
