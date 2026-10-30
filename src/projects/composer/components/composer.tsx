"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Music, Play, Square, Upload } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { humanize } from "../humanize";
import { midiToScore, scoreToMidi } from "../midi";
import { isRendered, play, prepare, stop } from "../player";
import { FORMATS, PIECES } from "../pieces";
import { scoreToAbc } from "../score-abc";
import { PERFORMERS } from "../synth/render";
import { barBeats, beatSeconds, scoreBeats, type Piece } from "../types";
import { PianoRoll, ROLE_TOKEN } from "./piano-roll";
import { SheetMusic } from "./sheet-music";

type View = "roll" | "sheet" | "source";

const VIEWS: readonly { id: View; name: string }[] = [
  { id: "roll", name: "Piano roll" },
  { id: "sheet", name: "Sheet music" },
  { id: "source", name: "Source" },
];

const CHIP = "rounded-md border px-3 py-1.5 text-sm transition-colors";
const CHIP_ON = "border-brand-orange bg-surface-elevated text-text-primary";
const CHIP_OFF = "border-border-default text-text-secondary hover:border-border-hover";

function midiName(title: string): string {
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.mid`;
}

export function Composer() {
  const [uploaded, setUploaded] = useState<Piece[]>([]);
  const pieces = useMemo(() => [...PIECES, ...uploaded], [uploaded]);
  const [pieceId, setPieceId] = useState(PIECES[0].id);
  const [performer, setPerformer] = useState(PERFORMERS[0].id);
  const [human, setHuman] = useState(true);
  const [view, setView] = useState<View>("roll");
  const [state, setState] = useState<"idle" | "rendering" | "playing">("idle");
  const requested = useRef<string | null>(null);

  const piece = pieces.find((candidate) => candidate.id === pieceId) ?? pieces[0];
  const written = useMemo(() => piece.score(), [piece]);
  const score = useMemo(() => (human ? humanize(written) : written), [written, human]);
  const renderKey = `${piece.id}|${performer}|${String(human)}`;
  const seconds = scoreBeats(written) * beatSeconds(written);

  const halt = (): void => {
    requested.current = null;
    stop();
    setState("idle");
  };

  useEffect(
    () => () => {
      requested.current = null;
      stop();
    },
    [],
  );

  const start = (): void => {
    requested.current = renderKey;
    if (!isRendered(renderKey)) setState("rendering");
    void prepare(renderKey, score, performer).then(async (buffer) => {
      if (requested.current !== renderKey) return;
      await play(buffer, () => setState("idle"));
      setState("playing");
    });
  };

  // Changing what would play stops what is playing, so what is heard always
  // matches what is shown.
  const choose = (change: () => void): void => {
    halt();
    change();
  };

  const download = (): void => {
    const url = URL.createObjectURL(new Blob([scoreToMidi(written)], { type: "audio/midi" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = midiName(written.title);
    link.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File): Promise<void> => {
    const title = file.name.replace(/\.midi?$/i, "");
    const parsed = midiToScore(new Uint8Array(await file.arrayBuffer()), title);
    const added: Piece = { id: `upload-${title}`, title, format: "midi", source: null, score: () => parsed };
    setUploaded((list) => [...list.filter((entry) => entry.id !== added.id), added]);
    choose(() => setPieceId(added.id));
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-3">
        <div className="rounded-md bg-surface-elevated p-2 text-brand-orange">
          <Music size={24} />
        </div>
        <h1 className="text-2xl font-bold">Composer</h1>
      </header>

      <section aria-label="Pieces" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {pieces.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={entry.id === piece.id}
            onClick={() => choose(() => setPieceId(entry.id))}
            className={cn("rounded-md border px-3 py-2 text-left transition-colors", entry.id === piece.id ? CHIP_ON : CHIP_OFF)}
          >
            <span className="block truncate font-medium text-text-primary">{entry.title}</span>
            <span className="block text-xs text-text-muted">{FORMATS[entry.format]}</span>
          </button>
        ))}
      </section>

      <section aria-label="Performance" className="flex flex-wrap items-center gap-2">
        {state === "playing" ? (
          <Button onClick={halt} aria-label="Stop">
            <Square size={18} />
          </Button>
        ) : (
          <Button onClick={start} disabled={state === "rendering"} aria-label="Play">
            <Play size={18} />
          </Button>
        )}
        {state === "rendering" && <span className="text-sm text-text-muted">Rendering…</span>}
        <div className="flex flex-wrap gap-1">
          {PERFORMERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={entry.id === performer}
              onClick={() => choose(() => setPerformer(entry.id))}
              className={cn(CHIP, entry.id === performer ? CHIP_ON : CHIP_OFF)}
            >
              {entry.name}
            </button>
          ))}
        </div>
        <button type="button" aria-pressed={human} onClick={() => choose(() => setHuman(!human))} className={cn(CHIP, human ? CHIP_ON : CHIP_OFF)}>
          Humanize
        </button>
        <div className="ml-auto flex gap-1">
          <Button variant="secondary" onClick={download} aria-label="Download MIDI" title="Download MIDI">
            <Download size={18} />
          </Button>
          <label title="Open a MIDI file" className={cn(CHIP, CHIP_OFF, "inline-flex cursor-pointer items-center")}>
            <Upload size={18} />
            <span className="sr-only">Open a MIDI file</span>
            <input
              type="file"
              accept=".mid,.midi"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) void upload(file);
              }}
            />
          </label>
        </div>
      </section>

      <section aria-label="Facts" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
        <span>{written.key}</span>
        <span>{written.metre.join("/")}</span>
        <span>{Math.round(written.bpm)} bpm</span>
        <span>{Math.ceil(scoreBeats(written) / barBeats(written))} bars</span>
        <span>
          {Math.floor(seconds / 60)}:{String(Math.round(seconds % 60)).padStart(2, "0")}
        </span>
        {written.tracks.map((track) => (
          <span key={track.name} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: `var(${ROLE_TOKEN[track.role]})` }} />
            {track.name}
          </span>
        ))}
      </section>

      <div role="tablist" className="flex gap-1">
        {VIEWS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === view}
            onClick={() => setView(entry.id)}
            className={cn(CHIP, entry.id === view ? CHIP_ON : CHIP_OFF)}
          >
            {entry.name}
          </button>
        ))}
      </div>

      {view === "roll" && <PianoRoll score={score} />}
      {view === "sheet" && <SheetMusic abc={piece.format === "abc" && piece.source !== null ? piece.source : scoreToAbc(written)} />}
      {view === "source" && (
        <pre className="max-h-[32rem] overflow-auto rounded-lg bg-surface-secondary p-3 text-xs text-text-secondary">
          {piece.source ?? scoreToAbc(written)}
        </pre>
      )}
    </main>
  );
}
