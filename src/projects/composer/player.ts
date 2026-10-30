import { audioContext, unlockAudio } from "@/shared/lib/sound";
import type { Score } from "./types";
import type { RenderReply, RenderRequest } from "./synth/render.worker";

// The browser side: renders in a worker, keeps the last few renders, and
// plays one at a time through the page's AudioContext.

const KEEP = 4;

type Samples = Extract<RenderReply, { left: unknown }>;

let worker: Worker | null = null;
let nextJob = 0;
const jobs = new Map<number, { resolve: (samples: Samples) => void; reject: (error: Error) => void }>();
const rendered = new Map<string, Promise<AudioBuffer>>();
let current: { source: AudioBufferSourceNode; startedAt: number; context: AudioContext } | null = null;

function renderWorker(): Worker {
  if (worker === null) {
    worker = new Worker(new URL("./synth/render.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<RenderReply>) => {
      const job = jobs.get(data.id);
      if (job === undefined) throw new Error(`Composer: a render no one asked for (${String(data.id)})`);
      jobs.delete(data.id);
      if ("error" in data) job.reject(new Error(`Composer: a render failed: ${data.error}`));
      else job.resolve(data);
    };
    worker.onerror = (event) => {
      const error = new Error(`Composer: the render worker failed: ${event.message}`);
      for (const job of jobs.values()) job.reject(error);
      jobs.clear();
    };
  }
  return worker;
}

async function render(score: Score, performer: string): Promise<AudioBuffer> {
  const { left, right, sampleRate } = await new Promise<Samples>((resolve, reject) => {
    const id = nextJob++;
    jobs.set(id, { resolve, reject });
    const request: RenderRequest = { id, score, performer };
    renderWorker().postMessage(request);
  });
  const buffer = new AudioBuffer({ numberOfChannels: 2, length: left.length, sampleRate });
  buffer.copyToChannel(left, 0);
  buffer.copyToChannel(right, 1);
  return buffer;
}

export function isRendered(key: string): boolean {
  return rendered.has(key);
}

export function prepare(key: string, score: Score, performer: string): Promise<AudioBuffer> {
  const buffer = rendered.get(key) ?? render(score, performer);
  rendered.delete(key);
  rendered.set(key, buffer);
  for (const old of rendered.keys()) {
    if (rendered.size <= KEEP) break;
    rendered.delete(old);
  }
  return buffer;
}

export function stop(): void {
  if (current === null) return;
  const { source } = current;
  current = null;
  source.stop();
}

export async function play(buffer: AudioBuffer, onEnded: () => void): Promise<void> {
  unlockAudio();
  const context = await audioContext();
  stop();
  const source = new AudioBufferSourceNode(context, { buffer });
  source.connect(context.destination);
  source.onended = () => {
    if (current?.source !== source) return;
    current = null;
    onEnded();
  };
  source.start();
  current = { source, startedAt: context.currentTime, context };
}

// How far into the playing piece we are, in seconds, or null when nothing is
// playing.
export function position(): number | null {
  return current === null ? null : current.context.currentTime - current.startedAt;
}
