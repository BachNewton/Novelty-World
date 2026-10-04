"use client";

import { useEffect, useRef, useState } from "react";
import { MuteButton } from "../mute-button";
import { VolumeSlider } from "../volume-slider";
import { isRendered, playMusic, renderTheme, setMusicLoop, stopMusic } from "./music-board";
import { themeSeconds, zzfxmSource, type Theme } from "./song";
import { THEMES } from "./themes";

// The `?music` page: music ideas for Frogmino, to listen to and pick from.
// None of it plays in the game yet.

type Loops = Readonly<Record<string, boolean>>;

const BUTTON = "rounded-lg px-4 py-2 text-sm font-bold transition-colors";
const PRIMARY = `${BUTTON} bg-brand-green text-surface-primary hover:opacity-90 disabled:opacity-60`;
const SECONDARY = `${BUTTON} border border-border-hover text-text-primary hover:bg-surface-tertiary`;

interface CardProps {
  theme: Theme;
  playing: boolean;
  rendering: boolean;
  loop: boolean;
  onPlay: () => void;
  onStop: () => void;
  onLoop: (loop: boolean) => void;
}

function ThemeCard({ theme, playing, rendering, loop, onPlay, onStop, onLoop }: CardProps) {
  const [copied, setCopied] = useState(false);
  const seconds = themeSeconds(theme);
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-secondary p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-text-primary">{theme.name}</h2>
        <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs text-text-muted">
          {theme.kind === "loop" ? "Loop" : "Jingle"}
        </span>
      </div>
      <p className="text-sm text-text-secondary">
        <span className="font-bold text-text-primary">{theme.use}</span> {theme.mood}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {playing ? (
          <button type="button" onClick={onStop} className={PRIMARY}>
            Stop
          </button>
        ) : (
          <button type="button" onClick={onPlay} disabled={rendering} className={PRIMARY}>
            {rendering ? "Rendering…" : "Play"}
          </button>
        )}
        <label className="flex items-center gap-2 px-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => onLoop(e.target.checked)}
            className="accent-brand-green"
          />
          Loop
        </label>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(zzfxmSource(theme)).then(() => setCopied(true));
          }}
          className={SECONDARY}
        >
          {copied ? "Copied ✓" : "Copy for the tracker"}
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-text-muted">Key</dt>
        <dd className="text-text-secondary">
          {theme.key}, {theme.beatsPerBar}/4
        </dd>
        <dt className="text-text-muted">Tempo</dt>
        <dd className="text-text-secondary">{theme.bpm} BPM</dd>
        <dt className="text-text-muted">Length</dt>
        <dd className="text-text-secondary">
          {seconds.toFixed(1)} s{theme.kind === "loop" ? " a time round" : ""}
        </dd>
        <dt className="text-text-muted">Voices</dt>
        <dd className="text-text-secondary">{[...new Set(theme.instruments.map((i) => i.name))].join(", ")}</dd>
      </dl>
      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-bold text-text-muted">Draws on</h3>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-text-secondary">
          {theme.style.map((trait) => (
            <li key={trait}>{trait}</li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export function MusicLab() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [rendering, setRendering] = useState<ReadonlySet<string>>(new Set());
  const [loops, setLoops] = useState<Loops>(() =>
    Object.fromEntries(THEMES.map((theme) => [theme.id, theme.kind === "loop"])),
  );
  // Read when a render finishes, so a play uses the loop setting and the
  // latest request as they are then, not as they were at the click.
  const loopsNow = useRef(loops);
  const requested = useRef<string | null>(null);

  useEffect(
    () => () => {
      requested.current = null;
      stopMusic();
    },
    [],
  );

  const play = (theme: Theme): void => {
    requested.current = theme.id;
    const fresh = !isRendered(theme);
    if (fresh) setRendering((ids) => new Set(ids).add(theme.id));
    void renderTheme(theme).then(async (buffer) => {
      if (fresh) {
        setRendering((ids) => {
          const rest = new Set(ids);
          rest.delete(theme.id);
          return rest;
        });
      }
      if (requested.current !== theme.id) return;
      await playMusic(buffer, loopsNow.current[theme.id], () => {
        setPlaying((id) => (id === theme.id ? null : id));
      });
      setPlaying(theme.id);
    });
  };

  const stop = (): void => {
    requested.current = null;
    stopMusic();
    setPlaying(null);
  };

  const setLoop = (theme: Theme, loop: boolean): void => {
    const next = { ...loopsNow.current, [theme.id]: loop };
    loopsNow.current = next;
    setLoops(next);
    if (playing === theme.id) setMusicLoop(loop);
  };

  return (
    <main className="min-h-[100dvh] bg-surface-primary px-4 py-6 sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold text-brand-green">Frogmino music ideas</h1>
          <p className="text-sm text-text-secondary">
            Themes to listen to and pick from; none of them plays in the game yet. Each is made with ZzFXM, a tiny
            tracker built on ZzFX, the library behind the sound effects, so it is code, not an audio file. Most are
            original tunes borrowing the <em>style</em> of the arcade Frogger and Game Boy Tetris music, or of Grant Kirkhope (listed
            on each card), never their melodies; the two Frog Polkkas arrange the Finnish folk tune Ievan Polkka, as Tetris did a
            Russian one, in the sound of its Loituma and Hatsune Miku recordings. A theme renders the first time it plays. &ldquo;Copy for the tracker&rdquo; copies the song
            for the ZzFXM tracker, which plays it a little brighter, since it has no low-pass filter. Edit the themes in{" "}
            <code>audio/music/</code>.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <VolumeSlider />
            <MuteButton />
          </div>
        </header>
        <ul className="grid gap-4 md:grid-cols-2">
          {THEMES.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              playing={playing === theme.id}
              rendering={rendering.has(theme.id)}
              loop={loops[theme.id]}
              onPlay={() => play(theme)}
              onStop={stop}
              onLoop={(loop) => setLoop(theme, loop)}
            />
          ))}
        </ul>
      </div>
    </main>
  );
}
