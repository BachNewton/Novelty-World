import "@/shared/lib/sound/no-audio-context";
import { ZZFX } from "zzfx";
import { zzfxm, type ZzfxmSong } from "./zzfxm";

// Renders a theme off the main thread: a full-length theme takes a fifth of a
// second on a desktop and around a second on a phone, which would freeze the
// game or a menu. The buffers go back transferred, not copied.

export interface RenderRequest {
  id: number;
  song: ZzfxmSong;
}

export type RenderReply =
  | { id: number; sampleRate: number; left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer> }
  | { id: number; error: string };

// `self` in a worker is a DedicatedWorkerGlobalScope, which the project's
// "dom" lib doesn't declare; this is the part used.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RenderRequest>) => void) | null;
  postMessage: (message: RenderReply, transfer?: Transferable[]) => void;
};

scope.onmessage = ({ data: { id, song } }) => {
  try {
    const [left, right] = zzfxm(song, ZZFX.sampleRate, (params) => ZZFX.buildSamples(...params));
    scope.postMessage({ id, sampleRate: ZZFX.sampleRate, left, right }, [left.buffer, right.buffer]);
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
  }
};
