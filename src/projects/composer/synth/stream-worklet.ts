// The audio-thread end of a stream: chunks of a piece, played sample by sample
// off one counter, so no join between them can gap, click or drift. It holds
// what has arrived for the length of the play, and seeks among it at once. A
// jump, and running out, fade over a few milliseconds rather than cutting.
//
// Loaded as a blob since a bundler won't compile an AudioWorklet's module: this
// runs as written, so it stays plain JavaScript.

export const STREAM_PROCESSOR = "composer-stream";

export type StreamReport = { playing: number; time: number } | { stalled: number } | { ended: true };

export interface StreamOptions {
  total: number;
  from: number;
  chunkFrames: number;
  // Frames that must be waiting before playing starts, and before it picks up
  // again after running out.
  startFrames: number;
  resumeFrames: number;
}

const SOURCE = `
const FADE = 256;

class Stream extends AudioWorkletProcessor {
  constructor({ processorOptions }) {
    super();
    this.total = processorOptions.total;
    this.at = processorOptions.from;
    this.chunkFrames = processorOptions.chunkFrames;
    this.startFrames = processorOptions.startFrames;
    this.resumeFrames = processorOptions.resumeFrames;
    this.needed = this.startFrames;
    this.chunks = [];
    this.wanted = null;
    this.gain = 0;
    this.running = false;
    this.stopped = false;
    this.port.onmessage = ({ data }) => {
      if (data.stop === true) this.stopped = true;
      else if (data.seek !== undefined) this.wanted = data.seek;
      else this.chunks[data.index] = data;
    };
  }

  chunkAt(frame) {
    return this.chunks[Math.floor(frame / this.chunkFrames)];
  }

  ahead(limit) {
    let frames = 0;
    let frame = this.at;
    while (frames < limit) {
      const chunk = this.chunkAt(frame);
      if (chunk === undefined) break;
      const left = chunk.left.length - (frame % this.chunkFrames);
      frames += left;
      frame += left;
    }
    return frames;
  }

  process(_, outputs) {
    if (this.stopped) return false;
    const [left, right] = outputs[0];
    const count = left.length;
    if (this.wanted !== null && this.gain === 0) {
      this.at = this.wanted;
      this.wanted = null;
      this.running = false;
      this.needed = this.startFrames;
    }
    const remaining = this.total - this.at;
    if (!this.running) {
      if (this.wanted !== null || this.ahead(this.needed) < Math.min(this.needed, remaining)) return true;
      this.running = true;
      this.port.postMessage({ playing: this.at, time: currentTime });
    }
    const reserve = Math.min(FADE + count, remaining);
    const target = this.wanted === null && this.ahead(reserve) >= reserve ? 1 : 0;
    const step = 1 / FADE;
    let gain = this.gain;
    let i = 0;
    while (i < count) {
      const chunk = this.chunkAt(this.at);
      if (chunk === undefined) break;
      const offset = this.at % this.chunkFrames;
      const run = Math.min(count - i, chunk.left.length - offset);
      for (let n = 0; n < run; n++) {
        gain = target > gain ? Math.min(target, gain + step) : Math.max(target, gain - step);
        left[i + n] = chunk.left[offset + n] * gain;
        right[i + n] = chunk.right[offset + n] * gain;
      }
      this.at += run;
      i += run;
    }
    this.gain = gain;
    if (this.at >= this.total) {
      this.port.postMessage({ ended: true });
      return false;
    }
    if (gain === 0 && target === 0) {
      this.running = false;
      if (this.wanted === null) {
        this.needed = this.resumeFrames;
        this.port.postMessage({ stalled: this.at });
      }
    }
    return true;
  }
}

registerProcessor("${STREAM_PROCESSOR}", Stream);
`;

const loaded = new WeakMap<AudioContext, Promise<void>>();

export function loadStreamProcessor(context: AudioContext): Promise<void> {
  const known = loaded.get(context);
  if (known !== undefined) return known;
  const url = URL.createObjectURL(new Blob([SOURCE], { type: "text/javascript" }));
  const loading = context.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
  loaded.set(context, loading);
  return loading;
}
