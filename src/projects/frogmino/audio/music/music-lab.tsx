"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { coopCourseById } from "../../coop-courses";
import { MuteButton } from "../mute-button";
import { unlockAudio } from "../sound-board";
import { VolumeSlider } from "../volume-slider";
import { themeCourses } from "./course-music";
import { isRendered, playMusic, prepareTheme, setMusicLoop, stopMusic } from "./music-board";
import { themeSeconds, zzfxmSource, type Theme } from "./song";
import { COURSE_THEMES, SKETCHES, THEMES } from "./themes";

// The `?music` page: the courses' themes, as the game plays them, and the
// earlier sketches, which it doesn't.

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
  const playsOn = themeCourses(theme, (id) => coopCourseById(id).name);
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-secondary p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold text-text-primary">{theme.name}</h3>
        <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs text-text-muted">
          {theme.kind === "loop" ? "Loop" : "Jingle"}
        </span>
      </div>
      {playsOn.length > 0 && (
        <p className="text-sm font-bold text-brand-green">Plays on: {playsOn.join("; ")}</p>
      )}
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
        <h4 className="text-xs font-bold text-text-muted">Draws on</h4>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-text-secondary">
          {theme.style.map((trait) => (
            <li key={trait}>{trait}</li>
          ))}
        </ul>
      </div>
    </li>
  );
}

function ThemeList({ title, note, themes, card }: { title: string; note?: string; themes: readonly Theme[]; card: (theme: Theme) => ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-bold text-text-primary">{title}</h2>
      {note !== undefined && <p className="text-sm text-text-secondary">{note}</p>}
      <ul className="grid gap-4 md:grid-cols-2">{themes.map(card)}</ul>
    </section>
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
    // The click is the input that lets audio start.
    unlockAudio();
    void prepareTheme(theme).then((buffer) => {
      if (fresh) {
        setRendering((ids) => {
          const rest = new Set(ids);
          rest.delete(theme.id);
          return rest;
        });
      }
      if (requested.current !== theme.id) return;
      playMusic(buffer, loopsNow.current[theme.id], () => {
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

  const card = (theme: Theme) => (
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
  );

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
          <h1 className="text-2xl font-bold text-brand-green">Frogmino music</h1>
          <p className="text-sm text-text-secondary">
            Each course has a theme of its own, playing under the sound effects from the drop to the finish line. They all
            rework one Frogmino motif (hop, hop, leap, and tumble down) in their own style, borrowing the <em>style</em> of
            Grant Kirkhope&rsquo;s Banjo-Kazooie music and the Pok&eacute;mon games (listed on each card), never their melodies. Each
            is made with ZzFXM, a tiny tracker built on ZzFX, the library behind the sound effects, so it is code, not an audio
            file, and renders off the page&rsquo;s thread the first time it plays. &ldquo;Copy for the tracker&rdquo; copies the
            song for the ZzFXM tracker, which plays it a little brighter, since it has no low-pass filter. Edit the themes in{" "}
            <code>audio/music/</code>.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <VolumeSlider />
            <MuteButton />
          </div>
        </header>
        <ThemeList title="The courses' themes" themes={COURSE_THEMES} card={card} />
        <ThemeList
          title="Earlier sketches"
          note="Ideas from before the courses had themes, kept to listen to; none plays in the game. The two Frog Polkkas arrange the Finnish folk tune Ievan Polkka."
          themes={SKETCHES}
          card={card}
        />
      </div>
    </main>
  );
}
