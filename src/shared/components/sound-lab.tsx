"use client";

import { useEffect, useState, type ReactNode } from "react";
import { audioContext, zzfxParams, type PlayOptions, type SoundDesign, type SoundPlayer } from "@/shared/lib/sound";

// A game's `?sounds` page: every sound with its trigger and ZzFX parameters,
// to audition and tweak by ear. Plays go through the game's own player, so
// they carry the same variation, minimum gap, volume and mute as in play.

const REPEATS = 10;

function formatParams(params: number[]): string {
  return `zzfx(...[${params.map((p) => String(Math.round(p * 1000) / 1000)).join(",")}])`;
}

interface LabProps<Id extends string> {
  title: string;
  // What the page is for, and where the designs are edited.
  intro: ReactNode;
  // The settings to audition at: the mute toggle and the volumes.
  controls: ReactNode;
  ids: readonly Id[];
  designs: Readonly<Record<Id, SoundDesign>>;
  // The game's player, unlocked (`SoundBoard.audition`).
  player: () => Promise<SoundPlayer<Id>>;
  // How the i-th of ten plays in a row differs, as a streak climbing a scale.
  inARow?: (id: Id, i: number) => PlayOptions;
}

function SoundCard<Id extends string>({ id, design, player, inARow }: { id: Id; design: SoundDesign } & Pick<LabProps<Id>, "player" | "inARow">) {
  const play = () => void player().then((p) => p.play(id));
  // Ten plays at about the busiest rate the game can trigger the sound, timed
  // on the audio clock.
  const playInARow = () =>
    void player().then((p) => {
      for (let i = 0; i < REPEATS; i++) p.play(id, { ...inARow?.(id, i), delay: i * design.busiestEvery });
    });
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-secondary p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-text-primary">{design.label}</h2>
        <code className="text-xs text-text-muted">{id}</code>
      </div>
      <p className="text-sm text-text-secondary">{design.trigger}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={play} className="rounded-lg bg-brand-green px-4 py-2 text-sm font-bold text-surface-primary transition-opacity hover:opacity-90">
          Play
        </button>
        <button
          type="button"
          onClick={playInARow}
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

/** Whether the page's audio is running yet: until the first press unlocks it, nothing sounds. */
function AudioState() {
  const [state, setState] = useState<AudioContextState | null>(null);
  useEffect(() => {
    let context: AudioContext | null = null;
    const changed = () => setState(context?.state ?? null);
    void audioContext().then((audio) => {
      context = audio;
      audio.addEventListener("statechange", changed);
      changed();
    });
    return () => context?.removeEventListener("statechange", changed);
  }, []);
  return <span className="text-xs text-text-muted">Audio {state ?? "loading"}</span>;
}

export function SoundLab<Id extends string>({ title, intro, controls, ids, designs, player, inARow }: LabProps<Id>) {
  return (
    <main className="min-h-[100dvh] bg-surface-primary px-4 py-6 sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold text-brand-green">{title}</h1>
          <p className="text-sm text-text-secondary">{intro}</p>
          <div className="flex flex-wrap items-center gap-4">
            {controls}
            <AudioState />
          </div>
        </header>
        <ul className="grid gap-4 md:grid-cols-2">
          {ids.map((id) => (
            <SoundCard key={id} id={id} design={designs[id]} player={player} inARow={inARow} />
          ))}
        </ul>
      </div>
    </main>
  );
}
