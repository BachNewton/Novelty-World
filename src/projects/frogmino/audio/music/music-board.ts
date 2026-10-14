import { useSoundSettings, type SoundSettings } from "../settings";
import type { RenderReply, RenderRequest } from "./render.worker";
import { compileTheme, type Theme } from "./song";

// The music in the browser, for the game and the `?music` page. Themes render
// in a worker, so rendering never holds up a frame, and play through ZzFX's
// AudioContext, the game's one context, which the sound board unlocks. One
// gain follows the sound settings' volume and mute, at the music's mix level.
// One theme plays at a time.

// The music's level under the master volume. The themes are about as loud as
// the sound effects, so this keeps them some 9 dB under, and the effects
// clear.
export const MUSIC_LEVEL = 0.35;

// How many rendered themes to keep. A full-length theme is some 30 MB of
// samples, and a game only needs the one it plays.
const KEEP = 3;

interface Output {
  context: AudioContext;
  gain: GainNode;
}

const rendered = new Map<string, Promise<AudioBuffer>>();
let output: Output | null = null;
let current: { source: AudioBufferSourceNode; fade: GainNode } | null = null;

function level({ muted, volume }: SoundSettings): number {
  return muted ? 0 : volume * MUSIC_LEVEL;
}

async function musicOutput(): Promise<Output> {
  // Imported here, not at the top: ZzFX creates its AudioContext as it loads,
  // which can't happen on the server.
  const { ZZFX } = await import("zzfx");
  if (output === null) {
    const context = ZZFX.audioContext;
    const gain = new GainNode(context, { gain: level(useSoundSettings.getState().settings) });
    gain.connect(context.destination);
    useSoundSettings.subscribe(({ settings }) => {
      gain.gain.value = level(settings);
    });
    output = { context, gain };
  }
  return output;
}

type Samples = Extract<RenderReply, { left: unknown }>;

let worker: Worker | null = null;
let nextJob = 0;
const jobs = new Map<number, { resolve: (samples: Samples) => void; reject: (error: Error) => void }>();

// The render worker, started on the first render. It renders one theme at a
// time, in the order asked.
function renderWorker(): Worker {
  if (worker === null) {
    worker = new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<RenderReply>) => {
      const job = jobs.get(data.id);
      if (job === undefined) throw new Error(`Frogmino music: a render no one asked for (${String(data.id)})`);
      jobs.delete(data.id);
      if ("error" in data) job.reject(new Error(`Frogmino music: a theme failed to render: ${data.error}`));
      else job.resolve(data);
    };
    worker.onerror = (event) => {
      const error = new Error(`Frogmino music: the render worker failed: ${event.message}`);
      for (const job of jobs.values()) job.reject(error);
      jobs.clear();
    };
  }
  return worker;
}

async function render(theme: Theme): Promise<AudioBuffer> {
  const [{ left, right, sampleRate }] = await Promise.all([
    new Promise<Samples>((resolve, reject) => {
      const id = nextJob++;
      jobs.set(id, { resolve, reject });
      const request: RenderRequest = { id, song: compileTheme(theme) };
      renderWorker().postMessage(request);
    }),
    musicOutput(),
  ]);
  const buffer = new AudioBuffer({ numberOfChannels: 2, length: left.length, sampleRate });
  buffer.copyToChannel(left, 0);
  buffer.copyToChannel(right, 1);
  return buffer;
}

export function isRendered(theme: Theme): boolean {
  return rendered.has(theme.id);
}

// Renders a theme, if it isn't rendered or rendering already, and resolves
// once it is ready to play. Needs no input: the game calls it ahead, while
// the players are still in a menu, so the theme is ready by the time it plays.
export function prepareTheme(theme: Theme): Promise<AudioBuffer> {
  const buffer = rendered.get(theme.id) ?? render(theme);
  // Most recently wanted last, so the oldest go first.
  rendered.delete(theme.id);
  rendered.set(theme.id, buffer);
  for (const id of rendered.keys()) {
    if (rendered.size <= KEEP) break;
    rendered.delete(id);
  }
  return buffer;
}

// Plays a prepared theme from the start, stopping whatever was playing.
// `onEnded` comes only when it reaches its end by itself, not looping.
export function playMusic(buffer: AudioBuffer, loop: boolean, onEnded: () => void): void {
  if (output === null) throw new Error("Frogmino music: a theme played before any was prepared");
  stopMusic();
  const { context, gain } = output;
  const source = new AudioBufferSourceNode(context, { buffer, loop });
  const fade = new GainNode(context);
  source.connect(fade).connect(gain);
  source.onended = () => {
    if (current?.source !== source) return;
    current = null;
    onEnded();
  };
  source.start();
  current = { source, fade };
}

// Stops the playing theme, at once or fading out over `fadeSeconds` on the
// audio clock.
export function stopMusic(fadeSeconds = 0): void {
  if (current === null || output === null) return;
  const { source, fade } = current;
  current = null;
  if (fadeSeconds <= 0) {
    source.stop();
    return;
  }
  const now = output.context.currentTime;
  fade.gain.setValueAtTime(fade.gain.value, now);
  fade.gain.linearRampToValueAtTime(0, now + fadeSeconds);
  source.stop(now + fadeSeconds);
}

// Whether the playing theme goes round again when it reaches its end.
export function setMusicLoop(loop: boolean): void {
  if (current !== null) current.source.loop = loop;
}
