import { SoundPlayer, type AudioOutput, type PlayOptions } from "./player";
import { renderSound, SOUND_IDS, SOUNDS, type SoundId } from "./sounds";
import { useSoundSettings } from "./settings";

// The game's one sound board, in the browser. Browsers keep audio off until
// the player interacts with the page, so nothing loads until the first input
// calls `unlockAudio`: that imports ZzFX, whose AudioContext is the game's one
// context, and renders every sound once into an AudioBuffer. From then on a
// play is a buffer source started through a gain, cheap on older phones.

interface Board {
  context: AudioContext;
  player: SoundPlayer;
}

let loading: Promise<Board> | null = null;
let board: Board | null = null;

async function load(): Promise<Board> {
  // Imported here, not at the top: ZzFX creates its AudioContext as it loads,
  // which can't happen on the server, and in the browser should happen during
  // the input that unlocks audio so the context starts running.
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
  if (context.state === "suspended") void context.resume();
  board = { context, player: new SoundPlayer(output, () => useSoundSettings.getState().settings) };
  return board;
}

// Call from a user input event (a key press, a click, a tap). The first call
// loads the sounds; later calls resume the context if the browser suspended
// it, which must happen inside an input event.
export function unlockAudio(): void {
  if (board === null) {
    loading ??= load();
    return;
  }
  if (board.context.state === "suspended") void board.context.resume();
}

// The sound board once it has loaded, loading it if it hasn't; for the
// `?sounds` page, whose play buttons are the input that unlocks audio.
export function soundPlayer(): Promise<SoundPlayer> {
  unlockAudio();
  if (loading === null) throw new Error("Unlocking audio didn't start loading the sounds");
  return loading.then(({ player }) => player);
}

// The trigger API: plays a sound now, with its variation and minimum gap.
// Before the first input has unlocked audio there is nothing to hear, so the
// play is dropped rather than queued for later.
export function playSound(id: SoundId, options?: PlayOptions): void {
  board?.player.play(id, options);
}
