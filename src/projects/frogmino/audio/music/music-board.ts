import { useSoundSettings, type SoundSettings } from "../settings";
import { unlockAudio } from "../sound-board";
import { compileTheme, type Theme } from "./song";
import { zzfxm } from "./zzfxm";

// The music themes in the browser, for the `?music` page. They play through
// ZzFX's AudioContext, the game's one context, which the sound board unlocks,
// and one gain that follows the sound settings' volume and mute. One theme
// plays at a time. A theme is rendered the first time it is played, then
// kept.

const rendered = new Map<string, Promise<AudioBuffer>>();
let output: { context: AudioContext; gain: GainNode } | null = null;
let current: AudioBufferSourceNode | null = null;

function level({ muted, volume }: SoundSettings): number {
  return muted ? 0 : volume;
}

async function musicOutput(): Promise<{ context: AudioContext; gain: GainNode }> {
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

// Resolves once the browser has painted the next frame. A second animation
// frame's callback runs after the first frame has painted, so work started
// there doesn't hold back what the page has just shown.
function afterNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

async function render(theme: Theme): Promise<AudioBuffer> {
  const { ZZFX } = await import("zzfx");
  const { context } = await musicOutput();
  await afterNextPaint();
  const [left, right] = zzfxm(compileTheme(theme), ZZFX.sampleRate, (params) => ZZFX.buildSamples(...params));
  const buffer = context.createBuffer(2, left.length, ZZFX.sampleRate);
  buffer.copyToChannel(left, 0);
  buffer.copyToChannel(right, 1);
  return buffer;
}

export function isRendered(theme: Theme): boolean {
  return rendered.has(theme.id);
}

// Call from the play button's click: it unlocks audio inside the input event,
// then renders the theme off the event, once the page has shown it rendering.
export function renderTheme(theme: Theme): Promise<AudioBuffer> {
  unlockAudio();
  let buffer = rendered.get(theme.id);
  if (buffer === undefined) {
    buffer = render(theme);
    rendered.set(theme.id, buffer);
  }
  return buffer;
}

// Plays a rendered theme from the start, stopping whatever was playing.
// `onEnded` comes only when it reaches its end by itself, not looping.
export async function playMusic(buffer: AudioBuffer, loop: boolean, onEnded: () => void): Promise<void> {
  const { context, gain } = await musicOutput();
  stopMusic();
  const source = new AudioBufferSourceNode(context, { buffer, loop });
  source.connect(gain);
  source.onended = () => {
    if (current !== source) return;
    current = null;
    onEnded();
  };
  source.start();
  current = source;
}

export function stopMusic(): void {
  current?.stop();
  current = null;
}

// Whether the playing theme goes round again when it reaches its end.
export function setMusicLoop(loop: boolean): void {
  if (current !== null) current.loop = loop;
}
