"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, FileMusic, Library, LoaderCircle, Music, Pause, Piano, Play } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { featuresOf, type Feature, type Section as FormSection } from "../analysis";
import { playStream, seek, stop } from "../player";
import { PIECES, shelve } from "../pieces";
import { instrumentNamesForTrack, LIBRARY, PIANO_IDS, pianoOf, withPiano, type InstrumentId } from "../synth/library";
import { timingOf } from "../tempo";
import { bandsOf, barBeats, scoreBeats } from "../types";
import { FeaturePicker } from "./feature-picker";
import { HarmonyLane } from "./harmony-lane";
import { Instruments } from "./instruments";
import { PianoRoll } from "./piano-roll";
import { Sampler } from "./sampler";
import { Scrubber } from "./scrubber";
import { SheetMusic } from "./sheet-music";
import { TrackLegend, trackLabel } from "./track-legend";

type View = "roll" | "sheet";

const VIEWS = [
  { id: "roll", name: "Piano roll", Icon: Piano },
  { id: "sheet", name: "Sheet music", Icon: FileMusic },
] as const satisfies readonly { id: View; name: string; Icon: typeof Piano }[];

type Area = "music" | "instruments" | "sampler";

const AREAS = [
  { id: "music", name: "Music", Icon: Music },
  { id: "instruments", name: "Instruments", Icon: Library },
  { id: "sampler", name: "Sampler", Icon: AudioLines },
] as const satisfies readonly { id: Area; name: string; Icon: typeof Piano }[];

const CHIP = "shrink-0 rounded-md border px-3 py-1.5 text-sm transition-colors";
const CHIP_ON = "border-brand-orange bg-surface-elevated text-text-primary";
const CHIP_OFF = "border-border-default text-text-secondary hover:border-border-hover";

export function Composer() {
  const [area, setArea] = useState<Area>("music");
  const [pieceId, setPieceId] = useState(PIECES[0].id);
  const [view, setView] = useState<View>("roll");
  const [state, setState] = useState<"idle" | "rendering" | "playing">("idle");
  const [failure, setFailure] = useState<string | null>(null);
  const requested = useRef<string | null>(null);

  const piece = PIECES.find((candidate) => candidate.id === pieceId) ?? PIECES[0];
  const score = useMemo(() => piece.score(), [piece]);
  const [pianos, setPianos] = useState<Partial<Record<string, InstrumentId>>>({});
  const [bandChoices, setBandChoices] = useState<Partial<Record<string, number>>>({});
  const bands = useMemo(() => bandsOf(piece), [piece]);
  const bandIndex = bandChoices[piece.id] ?? 0;
  const chosenBand = bands[bandIndex];
  const pianoKey = `${piece.id}|${String(bandIndex)}`;
  const ownPiano = pianoOf(chosenBand);
  const piano = ownPiano === undefined ? undefined : (pianos[pianoKey] ?? ownPiano);
  const band = useMemo(() => (piano === undefined ? chosenBand : withPiano(chosenBand, piano)), [chosenBand, piano]);
  const features = useMemo(() => (piece.analysis === undefined ? [] : featuresOf(score, piece.analysis)), [piece, score]);
  const trackInstruments = useMemo(
    () => Object.fromEntries(score.tracks.map(({ name }) => [name, instrumentNamesForTrack(band, name).join(", ") || trackLabel(name)])),
    [score, band],
  );
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = features.find((feature) => feature.id === pickedId) ?? null;
  const [focus, setFocus] = useState<string | null>(null);
  const [formSection, setFormSection] = useState<FormSection | undefined>();
  const [detail, setDetail] = useState("");
  const onSection = useCallback((next: FormSection | undefined) => setFormSection(next), []);
  const light = useMemo(() => {
    const index = score.tracks.findIndex((track) => track.name === focus);
    return { notes: picked?.notes ?? null, tone: picked?.tone ?? 1, focus: index < 0 ? null : index };
  }, [picked, focus, score]);
  const pickFeature = (feature: Feature | null): void => {
    setPickedId(feature?.id ?? null);
    setDetail(feature === null ? "" : `${feature.name}: ${feature.about}`);
  };
  const renderKey = `${pianoKey}|${String(piano)}`;

  const halt = (): void => {
    requested.current = null;
    setFailure(null);
    stop();
    setState("idle");
  };

  useEffect(
    () => () => {
      requested.current = null;
      stop();
      seek(0);
    },
    [],
  );

  const start = (): void => {
    requested.current = renderKey;
    setFailure(null);
    setState("rendering");
    const live = (): boolean => requested.current === renderKey;
    void playStream(score, band, {
      onState: (next) => {
        if (live()) setState(next === "playing" ? "playing" : "rendering");
      },
      onEnded: () => {
        if (live()) setState("idle");
      },
      onError: (error) => {
        if (!live()) return;
        setState("idle");
        setFailure(error.message.split("\n")[0]);
        throw error;
      },
    });
  };

  // Changing what would play stops what is playing, so what is heard always
  // matches what is shown.
  const choose = (change: () => void): void => {
    halt();
    change();
  };

  const pick = (id: string): void => {
    choose(() => setPieceId(id));
    setPickedId(null);
    setFocus(null);
    setDetail("");
    seek(0);
  };

  const areas = (
    <nav aria-label="Composer" className="flex shrink-0 gap-1 overflow-x-auto px-2 pt-2 max-md:hidden">
      {AREAS.map(({ id, name, Icon }) => (
        <button
          key={id}
          type="button"
          aria-current={id === area ? "page" : undefined}
          onClick={() => choose(() => setArea(id))}
          className={cn(CHIP, "inline-flex items-center gap-1.5", id === area ? CHIP_ON : CHIP_OFF)}
        >
          <Icon size={16} />
          {name}
        </button>
      ))}
    </nav>
  );

  if (area !== "music") {
    return (
      <main className="flex h-dvh w-full flex-col overflow-hidden">
        {areas}
        {area === "instruments" ? <Instruments /> : <Sampler />}
      </main>
    );
  }

  return (
    <main className="flex h-dvh w-full flex-col overflow-hidden">
      {areas}
      <section aria-label="Tracks" className="flex items-center gap-2 p-2">
        {state === "idle" ? (
          <Button onClick={start} aria-label="Play" className="shrink-0">
            <Play size={18} />
          </Button>
        ) : (
          <Button onClick={halt} aria-label={state === "rendering" ? "Stop rendering" : "Pause"} className="shrink-0">
            {state === "rendering" ? <LoaderCircle size={18} className="animate-spin" /> : <Pause size={18} />}
          </Button>
        )}
        <select
          aria-label="Track"
          value={piece.id}
          onChange={(event) => pick(event.target.value)}
          className="min-w-0 flex-1 truncate rounded-md border border-border-default bg-surface-elevated px-3 py-1.5 text-sm text-text-primary"
        >
          {shelve(PIECES).map((shelf) => (
            <optgroup key={shelf.name} label={shelf.name}>
              {shelf.pieces.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.after === undefined ? entry.title : `${entry.after} – ${entry.title}`}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {bands.length > 1 && (
          <select
            aria-label="Band"
            title="Band"
            value={bandIndex}
            onChange={(event) => choose(() => setBandChoices({ ...bandChoices, [piece.id]: Number(event.target.value) }))}
            className="w-40 shrink-0 truncate rounded-md border border-border-default bg-surface-elevated px-2 py-1.5 text-sm text-text-primary max-md:hidden"
          >
            {bands.map((entry, index) => (
              <option key={entry.name} value={index}>
                {entry.name}
                {index === 0 ? " ★" : ""}
              </option>
            ))}
          </select>
        )}
        {piano !== undefined && (
          <select
            aria-label="Piano"
            title="Piano"
            value={piano}
            onChange={(event) => choose(() => setPianos({ ...pianos, [pianoKey]: event.target.value as InstrumentId }))}
            className="w-40 shrink-0 truncate rounded-md border border-border-default bg-surface-elevated px-2 py-1.5 text-sm text-text-primary max-md:hidden"
          >
            {PIANO_IDS.map((id) => (
              <option key={id} value={id}>
                {LIBRARY[id].name}
                {id === ownPiano ? " ★" : ""}
              </option>
            ))}
          </select>
        )}
        <div role="tablist" className="flex shrink-0 gap-1">
          {VIEWS.map(({ id, name, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === view}
              aria-label={name}
              title={name}
              onClick={() => setView(id)}
              className={cn(CHIP, id === view ? CHIP_ON : CHIP_OFF)}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
      </section>

      {failure !== null && (
        <p role="alert" className="px-2 pb-2 text-sm text-brand-pink">
          {failure}
        </p>
      )}

      {view === "roll" && <TrackLegend score={score} instruments={trackInstruments} focus={focus} onFocus={setFocus} />}
      <HarmonyLane score={score} analysis={piece.analysis} picked={picked} onDetail={setDetail} />
      {view === "roll" && <PianoRoll score={score} light={light} />}
      {view === "sheet" && <SheetMusic score={score} light={light} instruments={trackInstruments} />}
      {piece.analysis !== undefined && (
        <FeaturePicker features={features} section={formSection} barLength={barBeats(score)} picked={picked} onPick={pickFeature} detail={detail} />
      )}
      <Scrubber
        key={piece.id}
        seconds={timingOf(score).seconds(scoreBeats(score))}
        barLength={barBeats(score)}
        time={timingOf(score)}
        analysis={piece.analysis}
        picked={picked}
        onSection={onSection}
        onDetail={setDetail}
      />
    </main>
  );
}
