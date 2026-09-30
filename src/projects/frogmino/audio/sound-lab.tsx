"use client";

import { useHydrated } from "@/shared/lib/use-hydrated";
import { MuteButton } from "./mute-button";
import type { PlayOptions } from "./player";
import { useSoundSettings } from "./settings";
import { soundPlayer } from "./sound-board";
import { passStreakSemitones, SOUND_IDS, SOUNDS, zzfxParams, type SoundId } from "./sounds";

// The `?sounds` page: every sound with its trigger and ZzFX parameters, to
// audition and tweak. Plays go through the game's own player, so they carry
// the same variation, minimum gap, volume and mute as in play.

const REPEATS = 10;

function play(id: SoundId, options?: PlayOptions): void {
  void soundPlayer().then((player) => player.play(id, options));
}

// Ten plays at about the busiest rate the game can trigger the sound, timed on
// the audio clock. Passes climb their streak, as clean passes in a row do.
function playInARow(id: SoundId): void {
  const every = SOUNDS[id].busiestEvery;
  void soundPlayer().then((player) => {
    for (let i = 0; i < REPEATS; i++) {
      player.play(id, { delay: i * every, semitones: id === "pass" ? passStreakSemitones(i) : 0 });
    }
  });
}

function formatParams(params: number[]): string {
  return `zzfx(...[${params.map((p) => String(Math.round(p * 1000) / 1000)).join(",")}])`;
}

function SoundCard({ id }: { id: SoundId }) {
  const design = SOUNDS[id];
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-secondary p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-text-primary">{design.label}</h2>
        <code className="text-xs text-text-muted">{id}</code>
      </div>
      <p className="text-sm text-text-secondary">{design.trigger}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => play(id)}
          className="rounded-lg bg-brand-green px-4 py-2 text-sm font-bold text-surface-primary transition-opacity hover:opacity-90"
        >
          Play
        </button>
        <button
          type="button"
          onClick={() => playInARow(id)}
          className="rounded-lg border border-border-hover px-4 py-2 text-sm font-bold text-text-primary transition-colors hover:bg-surface-tertiary"
        >
          {REPEATS} in a row, every {design.busiestEvery} s
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-text-muted">Pitch stray</dt>
        <dd className="text-text-secondary">±{Math.round(design.variation.pitch * 1000) / 10}%</dd>
        <dt className="text-text-muted">Volume stray</dt>
        <dd className="text-text-secondary">up to −{Math.round(design.variation.volume * 100)}%</dd>
        <dt className="text-text-muted">Minimum gap</dt>
        <dd className="text-text-secondary">{design.minGap} s</dd>
      </dl>
      <ul className="flex flex-col gap-1">
        {design.layers.map((layer, i) => (
          <li key={i} className="rounded-md bg-surface-tertiary px-2 py-1 font-mono text-xs break-all text-text-secondary">
            {design.layers.length > 1 && <span className="text-text-muted">+{layer.at} s </span>}
            {formatParams(zzfxParams(layer.zzfx))}
          </li>
        ))}
      </ul>
    </li>
  );
}

function VolumeSlider() {
  const hydrated = useHydrated();
  const volume = useSoundSettings((s) => s.settings.volume);
  const setVolume = useSoundSettings((s) => s.setVolume);
  if (!hydrated) return null;
  return (
    <label className="flex items-center gap-2 text-sm text-text-secondary">
      Volume
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        className="w-32 accent-brand-green"
      />
      <span className="w-10 font-mono text-xs text-text-muted">{Math.round(volume * 100)}%</span>
    </label>
  );
}

export function SoundLab() {
  return (
    <main className="min-h-[100dvh] bg-surface-primary px-4 py-6 sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold text-brand-green">Frogmino sounds</h1>
          <p className="text-sm text-text-secondary">
            Each sound plays through the game&apos;s own player, with its random pitch and volume stray and its minimum gap.
            The ZzFX parameters paste into the ZzFX designer; edit them in <code>audio/sounds.ts</code>. Slides, turns and
            jumps are silent on purpose.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <VolumeSlider />
            <MuteButton />
          </div>
        </header>
        <ul className="grid gap-4 md:grid-cols-2">
          {SOUND_IDS.map((id) => (
            <SoundCard key={id} id={id} />
          ))}
        </ul>
      </div>
    </main>
  );
}
