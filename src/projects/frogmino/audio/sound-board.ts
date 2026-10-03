import { SoundPlayer, type AudioOutput, type PlayOptions } from "./player";
import { renderSound, SOUND_IDS, SOUNDS, type SoundId } from "./sounds";
import { useSoundSettings } from "./settings";

// The game's one sound board, in the browser. It loads as the game opens,
// before any input: that imports ZzFX, whose AudioContext is the game's one
// context, and renders every sound once into an AudioBuffer. Creating the
// first AudioContext of a browser session blocks the page for a tenth of a
// second or more while the browser starts its audio, so it must not wait for
// the player's first key press, which is usually the drop off the overpass.
// Browsers keep a context created before any input suspended, and the first
// input, through `unlockAudio`, resumes it. From then on a play is a buffer
// source started through a gain, cheap on older phones.

interface Board {
  context: AudioContext;
  player: SoundPlayer;
}

let loading: Promise<Board> | null = null;
let board: Board | null = null;
let unlocked = false;

async function load(): Promise<Board> {
  // Imported here, not at the top: ZzFX creates its AudioContext as it loads,
  // which can't happen on the server.
  const { ZZFX } = await import("zzfx");
  const context = ZZFX.audioContext;
  const buffers = new Map<SoundId, AudioBuffer>();
  for (const id of SOUND_IDS) {
    const samples = renderSound(SOUNDS[id], ZZFX.sampleRate, (params) => ZZFX.buildSamples(...params));
    const buffer = context.createBuffer(1, samples.length, ZZFX.sampleRate);
    buffer.copyToChannel(samples, 0);
    buffers.set(id, buffer);
  }
  const output: AudioOutput = {
    now: () => context.currentTime,
    play: (id, at, rate, gain) => {
      const buffer = buffers.get(id);
      if (buffer === undefined) throw new Error(`The ${id} sound was never rendered`);
      const source = new AudioBufferSourceNode(context, { buffer, playbackRate: rate });
      const level = new GainNode(context, { gain });
      source.connect(level).connect(context.destination);
      source.start(at);
    },
  };
  // An input that came while the sounds were loading has unlocked audio,
  // and the page keeps that permission, so the context may start now.
  if (unlocked && context.state === "suspended") void context.resume();
  board = { context, player: new SoundPlayer(output, () => useSoundSettings.getState().settings) };
  return board;
}

// Starts loading the sounds, if they aren't loading yet, and resolves to the
// player once they have. Needs no input: the game calls it as it opens.
export function loadSounds(): Promise<SoundPlayer> {
  loading ??= load();
  return loading.then(({ player }) => player);
}

// Call from a user input event (a key press, a click, a tap): audio may start
// from then on. It resumes the context if the browser kept it suspended,
// which must happen inside an input event, and loads the sounds if nothing
// has yet.
export function unlockAudio(): void {
  unlocked = true;
  if (board === null) {
    void loadSounds();
    return;
  }
  if (board.context.state === "suspended") void board.context.resume();
}

// The sound board unlocked, once it has loaded; for the `?sounds` page, whose
// play buttons are the input that unlocks audio.
export function soundPlayer(): Promise<SoundPlayer> {
  unlockAudio();
  return loadSounds();
}

// The trigger API: plays a sound now, with its variation and minimum gap.
// Before the first input has unlocked audio there is nothing to hear, so the
// play is dropped rather than queued for later.
export function playSound(id: SoundId, options?: PlayOptions): void {
  if (!unlocked) return;
  board?.player.play(id, options);
}
