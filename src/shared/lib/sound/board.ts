import { renderSound, type SoundDesign } from "./design";
import { SoundPlayer, type AudioOutput, type PlayOptions, type SoundSettings } from "./player";

// The browser side of sound: the page's one AudioContext, ZzFX's own, and a
// sound board per game, its sounds rendered once into AudioBuffers and
// replayed from them, which is cheap on older phones.
//
// Browsers keep audio off until the player interacts with the page (the
// autoplay policy): a context created before then starts suspended, and only
// a call to `resume` made inside an input event (a key press, a click, a tap)
// starts it. So the first input, through `unlockAudio`, resumes it, and from
// then on the page keeps that permission. A sound triggered before that first
// input is dropped, not queued for later. A controller's buttons don't count
// as interacting: a player who only ever uses a pad hears nothing until a key,
// a click or a tap.
//
// A game loads its board as it opens, before any input: creating a browser
// session's first AudioContext blocks the page for a tenth of a second or
// more while the browser starts its audio, so it must not wait for the input
// that does something.

let context: AudioContext | null = null;
let loading: Promise<AudioContext> | null = null;
let unlocked = false;

// The page's one AudioContext, created on first use. Music and every game's
// sounds play through it, so the first input unlocks them all.
export function audioContext(): Promise<AudioContext> {
  // Imported here, not at the top: ZzFX creates its AudioContext as it loads,
  // which can't happen on the server.
  loading ??= import("zzfx").then(({ ZZFX }) => {
    context = ZZFX.audioContext;
    // An input that came while ZzFX was loading has unlocked audio, and the
    // page keeps that permission, so the context may start now.
    if (unlocked && context.state === "suspended") void context.resume();
    return context;
  });
  return loading;
}

// Call from a user input event: audio may start from then on. It resumes the
// context if the browser kept it suspended, which must happen inside the
// event, and creates the context if nothing has yet.
export function unlockAudio(): void {
  unlocked = true;
  if (context === null) {
    void audioContext();
    return;
  }
  if (context.state === "suspended") void context.resume();
}

// These are the input events a browser counts as the player interacting, so
// audio may start inside them. A touch counts on lifting the finger, not on
// touching down, hence pointerup alongside pointerdown.
const UNLOCKING_EVENTS = ["keydown", "pointerdown", "pointerup"] as const;

// Unlocks audio on the player's inputs until the returned function is called.
// Capturing, so an input a page stops short still counts.
export function listenForAudioUnlock(): () => void {
  for (const type of UNLOCKING_EVENTS) window.addEventListener(type, unlockAudio, { capture: true });
  return () => {
    for (const type of UNLOCKING_EVENTS) window.removeEventListener(type, unlockAudio, { capture: true });
  };
}

export interface SoundBoard<Id extends string> {
  // Starts rendering the sounds, if nothing has yet, and resolves to the
  // player once they are. Needs no input: a game calls it as it opens.
  load(): Promise<SoundPlayer<Id>>;
  // The trigger API: plays a sound now, with its variation and minimum gap,
  // or drops it while audio is locked or the sounds are still rendering.
  play(id: Id, options?: PlayOptions): void;
  // The player, unlocked: for an audition page, whose play buttons are the
  // input that unlocks audio.
  audition(): Promise<SoundPlayer<Id>>;
}

// A game's sounds, rendered into the page's context and played at the
// settings `settings` reads at each play.
export function createSoundBoard<Id extends string>(designs: Readonly<Record<Id, SoundDesign>>, settings: () => SoundSettings): SoundBoard<Id> {
  let rendering: Promise<SoundPlayer<Id>> | null = null;
  let player: SoundPlayer<Id> | null = null;

  async function render(): Promise<SoundPlayer<Id>> {
    const { ZZFX } = await import("zzfx");
    const audio = await audioContext();
    const buffers = new Map<string, AudioBuffer>();
    for (const [id, design] of Object.entries<SoundDesign>(designs)) {
      const samples = renderSound(design, ZZFX.sampleRate, (params) => ZZFX.buildSamples(...params));
      const buffer = audio.createBuffer(1, samples.length, ZZFX.sampleRate);
      buffer.copyToChannel(samples, 0);
      buffers.set(id, buffer);
    }
    const output: AudioOutput<Id> = {
      now: () => audio.currentTime,
      play: (id, at, rate, gain) => {
        const buffer = buffers.get(id);
        if (buffer === undefined) throw new Error(`The ${id} sound was never rendered`);
        const source = new AudioBufferSourceNode(audio, { buffer, playbackRate: rate });
        const level = new GainNode(audio, { gain });
        source.connect(level).connect(audio.destination);
        source.start(at);
      },
    };
    player = new SoundPlayer(designs, output, settings);
    return player;
  }

  const load = () => (rendering ??= render());
  return {
    load,
    play: (id, options) => {
      if (!unlocked) return;
      player?.play(id, options);
    },
    audition: () => {
      unlockAudio();
      return load();
    },
  };
}
