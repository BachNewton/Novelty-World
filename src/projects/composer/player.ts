import { audioContext, unlockAudio } from "@/shared/lib/sound";
import type { Score } from "./types";
import { streamFrames, STREAM_CHUNK, type Band } from "./synth/band";
import type { ClipPerformance, RenderReply, RenderRequest, StreamChunk } from "./synth/render.worker";
import { loadStreamProcessor, STREAM_PROCESSOR, type StreamOptions, type StreamReport } from "./synth/stream-worklet";

// The browser side. A piece streams: the worker renders it a chunk at a time
// starting from where it is to play, each chunk on request so a stop leaves
// nothing queued, and the audio thread plays what has arrived. What is rendered
// lives only as long as the play. A short clip renders whole first.

// Enough to carry a slow render past its next chunk, so a stall doesn't chatter.
const RESUME_CHUNKS = 3;

type Rendered = Extract<RenderReply, { left: unknown; chunk?: undefined }>;

export type StreamState = "buffering" | "playing";

export interface StreamEvents {
  onState: (state: StreamState) => void;
  onEnded: () => void;
  onError: (error: Error) => void;
}

interface Stream {
  score: Score;
  band: Band;
  events: StreamEvents;
  context: AudioContext;
  node: AudioWorkletNode;
  total: number;
  // Whether each chunk has arrived.
  have: boolean[];
  // The chunk the worker is rendering, and the render it belongs to.
  job: number | null;
  rendering: number;
  // The chunk the worker should go to once it's free, when it isn't the next one.
  wanted: number | null;
  // Where the piece is, when the audio is running: this frame at this context time.
  anchor: { frame: number; time: number } | null;
  // Where the piece is when it isn't, in seconds.
  held: number;
}

interface Clip {
  source: AudioBufferSourceNode;
  buffer: AudioBuffer;
  startedAt: number;
  context: AudioContext;
  onEnded: () => void;
}

let worker: Worker | null = null;
let nextJob = 0;
let stream: Stream | null = null;
let clip: Clip | null = null;
// Moves on with every stop, so a start still waiting for the audio context can
// see that it has been overtaken.
let starts = 0;
const clipJobs = new Map<number, { resolve: (rendered: Rendered) => void; reject: (error: Error) => void }>();
const clips = new Map<string, Promise<AudioBuffer>>();
let lastTick = { audio: 0, wall: 0 };
// Where the piece sits when it isn't playing, and where it plays from next.
let resting = 0;

function fail(error: Error): void {
  for (const job of clipJobs.values()) job.reject(error);
  clipJobs.clear();
  const failed = stream;
  if (failed === null) return;
  stopStream();
  failed.events.onError(error);
}

function received(data: RenderReply): void {
  if ("error" in data) {
    const error = new Error(`Composer: a render failed: ${data.error}`);
    const job = clipJobs.get(data.id);
    if (job === undefined) {
      if (stream?.job === data.id) fail(error);
      return;
    }
    clipJobs.delete(data.id);
    job.reject(error);
    return;
  }
  if (data.chunk !== undefined) {
    if (stream?.job === data.id) arrived(stream, data);
    return;
  }
  const job = clipJobs.get(data.id);
  if (job === undefined) throw new Error(`Composer: a render no one asked for (${String(data.id)})`);
  clipJobs.delete(data.id);
  job.resolve(data);
}

function renderWorker(): Worker {
  if (worker === null) {
    worker = new Worker(new URL("./synth/render.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<RenderReply>) => received(data);
    worker.onerror = (event) => fail(new Error(`Composer: the render worker failed: ${event.message}`));
  }
  return worker;
}

function post(request: RenderRequest): void {
  renderWorker().postMessage(request);
}

function chunks(active: Stream): number {
  return Math.ceil(active.total / STREAM_CHUNK);
}

function firstMissing(active: Stream, from: number): number | null {
  for (let index = from; index < chunks(active); index++) if (!active.have[index]) return index;
  return null;
}

// Only one request is ever with the worker, so a burst of seeks can't queue up
// renders nobody is waiting for: the latest place wins when the worker is free.
function renderFrom(active: Stream, index: number): void {
  if (active.job !== null) {
    active.wanted = index;
    return;
  }
  active.wanted = null;
  const id = nextJob++;
  active.job = id;
  active.rendering = index;
  post({ id, stream: { score: active.score, band: active.band, sampleRate: active.context.sampleRate, chunk: index } });
}

function arrived(active: Stream, { left, right, chunk }: StreamChunk): void {
  active.have[chunk] = true;
  active.node.port.postMessage({ index: chunk, left, right }, [left.buffer, right.buffer]);
  const { job } = active;
  const next = chunk + 1;
  const wanted = active.wanted;
  if (job !== null && wanted === null && next < chunks(active) && !active.have[next]) {
    active.rendering = next;
    post({ id: job, more: true });
    return;
  }
  active.job = null;
  const gap = wanted === null ? firstMissing(active, next) : firstMissing(active, wanted);
  if (gap !== null) renderFrom(active, gap);
}

function report(active: Stream, data: StreamReport): void {
  if (stream !== active) return;
  if ("playing" in data) {
    active.anchor = { frame: data.playing, time: data.time };
    lastTick = { audio: data.playing / active.context.sampleRate, wall: performance.now() };
    active.events.onState("playing");
  } else if ("stalled" in data) {
    active.anchor = null;
    active.held = data.stalled / active.context.sampleRate;
    active.events.onState("buffering");
  } else {
    resting = 0;
    stopStream();
    active.events.onEnded();
  }
}

function stopStream(): void {
  if (stream === null) return;
  stream.node.port.onmessage = null;
  // A disconnected processor would run on, holding the piece.
  stream.node.port.postMessage({ stop: true });
  stream.node.disconnect();
  if (stream.job !== null) post({ id: stream.job, close: true });
  stream = null;
}

// Plays a band's piece from where it rests, rendering as it goes.
export async function playStream(score: Score, band: Band, events: StreamEvents): Promise<void> {
  unlockAudio();
  const start = ++starts;
  const context = await audioContext();
  await loadStreamProcessor(context);
  if (start !== starts) return;
  stop();
  starts = start;
  const { sampleRate } = context;
  const total = streamFrames(score, sampleRate);
  const from = Math.min(Math.round(resting * sampleRate), total - 1);
  const processorOptions: StreamOptions = { total, from, chunkFrames: STREAM_CHUNK, startFrames: STREAM_CHUNK, resumeFrames: RESUME_CHUNKS * STREAM_CHUNK };
  const node = new AudioWorkletNode(context, STREAM_PROCESSOR, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions });
  node.connect(context.destination);
  const active: Stream = { score, band, events, context, node, total, have: [], job: null, rendering: 0, wanted: null, anchor: null, held: resting };
  node.port.onmessage = ({ data }: MessageEvent<StreamReport>) => report(active, data);
  stream = active;
  events.onState("buffering");
  renderFrom(active, Math.floor(from / STREAM_CHUNK));
}

async function renderClip(performance: ClipPerformance): Promise<AudioBuffer> {
  const { left, right, sampleRate } = await new Promise<Rendered>((resolve, reject) => {
    const id = nextJob++;
    clipJobs.set(id, { resolve, reject });
    post({ id, ...performance });
  });
  const buffer = new AudioBuffer({ numberOfChannels: 2, length: left.length, sampleRate });
  buffer.copyToChannel(left, 0);
  buffer.copyToChannel(right, 1);
  return buffer;
}

const KEEP_CLIPS = 4;

export function prepare(key: string, performance: ClipPerformance): Promise<AudioBuffer> {
  const buffer = clips.get(key) ?? renderClip(performance);
  // A failed render isn't kept, so playing again tries again.
  buffer.catch(() => clips.delete(key));
  clips.delete(key);
  clips.set(key, buffer);
  for (const old of clips.keys()) {
    if (clips.size <= KEEP_CLIPS) break;
    clips.delete(old);
  }
  return buffer;
}

export function stop(): void {
  starts++;
  if (stream !== null) {
    resting = cursor();
    stopStream();
  }
  if (clip === null) return;
  resting = cursor();
  const { source } = clip;
  clip = null;
  source.stop();
}

function sound(context: AudioContext, buffer: AudioBuffer, from: number, onEnded: () => void): void {
  const source = new AudioBufferSourceNode(context, { buffer });
  source.connect(context.destination);
  source.onended = () => {
    if (clip?.source !== source) return;
    clip = null;
    resting = 0;
    onEnded();
  };
  source.start(0, from);
  clip = { source, buffer, startedAt: context.currentTime - from, context, onEnded };
  lastTick = { audio: from, wall: performance.now() };
}

export async function play(buffer: AudioBuffer, onEnded: () => void): Promise<void> {
  unlockAudio();
  const context = await audioContext();
  stop();
  sound(context, buffer, resting, onEnded);
}

function seekStream(active: Stream, seconds: number): void {
  const { sampleRate } = active.context;
  const frame = Math.min(Math.round(seconds * sampleRate), active.total - 1);
  active.anchor = null;
  active.held = seconds;
  active.node.port.postMessage({ seek: frame });
  const gap = firstMissing(active, Math.floor(frame / STREAM_CHUNK));
  if (gap !== null && !(active.job !== null && active.wanted === null && active.rendering === gap)) renderFrom(active, gap);
  active.events.onState(active.have[Math.floor(frame / STREAM_CHUNK)] === true ? "playing" : "buffering");
}

// Moves the piece to a time; if it is playing, it carries on from there.
export function seek(seconds: number): void {
  resting = seconds;
  if (stream !== null) seekStream(stream, seconds);
  if (clip === null) return;
  const { source, buffer, context, onEnded } = clip;
  clip = null;
  source.stop();
  sound(context, buffer, seconds, onEnded);
}

function audioTime(): number | null {
  if (stream?.anchor != null) {
    const { context, anchor } = stream;
    return anchor.frame / context.sampleRate + context.currentTime - anchor.time;
  }
  return clip === null ? null : clip.context.currentTime - clip.startedAt;
}

// How far into the playing piece we are, in seconds, or null when nothing is
// sounding. The audio clock only moves when the browser hands over a buffer, in
// steps a moving view can see, so between steps the wall clock carries it on.
export function position(): number | null {
  const audio = audioTime();
  if (audio === null) return null;
  const wall = performance.now();
  if (audio !== lastTick.audio) lastTick = { audio, wall };
  return lastTick.audio + (wall - lastTick.wall) / 1000;
}

// The time a view should show, playing or not.
export function cursor(): number {
  return position() ?? stream?.held ?? resting;
}
