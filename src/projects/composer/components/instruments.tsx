"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Pause, Play } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { playStream, seek, stop } from "../player";
import { PIECES } from "../pieces";
import { estimateLevel, type Band } from "../synth/band";
import { FAMILIES, INSTRUMENT_IDS, LIBRARY, type Instrument, type InstrumentId } from "../synth/library";
import { bandsOf, type Note, type PedalSpan, type Score } from "../types";

// The catalogue: every instrument in the library by family, generated from it,
// each alone on a few short examples suited to it, and streamed through the same
// worker a piece plays on. Which pieces use one is read off their bands.

interface Example {
  name: string;
  notes: Note[];
  pedal?: PedalSpan[];
}

const AUDITION_HALL: Band["hall"] = { size: 0.8, wet: 0.2, damp: 0.55, preDelay: 0.028 };
const STRENGTH = 0.75;
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
const CHORD = [0, 7, 12, 16, 19];
const PHRASE: readonly (readonly [step: number, beats: number])[] = [[0, 1.5], [3, 0.5], [2, 1], [7, 1.5], [5, 0.5], [3, 2]];
const RIFF: readonly (readonly [step: number, beats: number])[] = [[0, 1], [0, 0.5], [7, 0.5], [5, 1], [3, 1], [0, 2]];

const TOUCH = [0.15, 0.35, 0.55, 0.75, 1];
const PEDALLED = [0, 7, 12, 16, 19, 24, 28];
// General MIDI's drum notes.
const KICK = 36;
const SNARE = 38;
const HAT = 42;
const OPEN_HAT = 46;
const CRASH = 49;
const TOMS = [50, 47, 45, 41];
const GROOVE: readonly (readonly [pitch: number, beat: number])[] = [
  [KICK, 0], [HAT, 0], [HAT, 0.5], [SNARE, 1], [HAT, 1], [HAT, 1.5], [KICK, 2], [HAT, 2], [KICK, 2.5], [HAT, 2.5], [SNARE, 3], [HAT, 3], [OPEN_HAT, 3.5],
];
const GROOVE_BARS = 2;

function single(pitch: number): Note[] {
  return [{ pitch, start: 0, duration: 3, velocity: STRENGTH }];
}

function run(root: number, steps: readonly (readonly [number, number])[]): Note[] {
  let start = 0;
  return steps.map(([step, beats]) => {
    const note = { pitch: root + step, start, duration: beats, velocity: STRENGTH };
    start += beats;
    return note;
  });
}

function hit(pitch: number, start = 0): Note {
  return { pitch, start, duration: 0.5, velocity: STRENGTH };
}

function kitExamples(): Example[] {
  return [
    { name: "Kick", notes: [hit(KICK)] },
    { name: "Snare", notes: [hit(SNARE)] },
    { name: "Hat", notes: [hit(HAT), hit(HAT, 0.5), hit(OPEN_HAT, 1)] },
    { name: "Crash", notes: [hit(CRASH)] },
    { name: "Toms", notes: TOMS.map((pitch, index) => hit(pitch, index * 0.5)) },
    { name: "Pattern", notes: Array.from({ length: GROOVE_BARS }, (_, bar) => GROOVE.map(([pitch, beat]) => hit(pitch, bar * 4 + beat))).flat() },
  ];
}

function held(pitch: number, beats: number, start = 0): Note {
  return { pitch, start, duration: beats, velocity: STRENGTH };
}

function hitExamples(low: number, middle: number): Example[] {
  return [
    { name: "Low", notes: [hit(low + 5)] },
    { name: "Mid", notes: [hit(middle)] },
    { name: "Fourth", notes: [hit(low + 5), hit(low + 10, 1), hit(low + 5, 2), hit(low + 10, 3)] },
    { name: "Roll", notes: Array.from({ length: 16 }, (_, index) => ({ ...hit(middle, index * 0.25), velocity: 0.35 + index * 0.04 })) },
  ];
}

function pluckExamples(middle: number): Example[] {
  return [
    { name: "Mid", notes: single(middle) },
    { name: "Scale", notes: run(middle, MAJOR.map((step) => [step, 0.5] as const)) },
    { name: "Arpeggio", notes: run(middle - 7, [0, 4, 7, 12, 16, 12, 7, 4, 0, 5, 9, 12, 17, 12, 9, 5].map((step) => [step, 0.25] as const)) },
    { name: "Strum", notes: CHORD.map((step, index) => held(middle - 12 + step, 4 - index * 0.1, index * 0.1)) },
  ];
}

function bassExamples(low: number, middle: number): Example[] {
  return [
    { name: "Low", notes: single(low + 5) },
    { name: "Mid", notes: single(middle) },
    { name: "Held", notes: [held(low + 8, 12)] },
    { name: "Riff", notes: run(low + 8, RIFF) },
  ];
}

function droneExamples(low: number): Example[] {
  const root = low + 8;
  return [
    { name: "Held", notes: [held(root, 20)] },
    { name: "Fifth", notes: [held(root, 20), held(root + 7, 20)] },
    { name: "Moving", notes: [0, 5, 3, 7].map((step, index) => held(root + step, 7.5, index * 8)) },
  ];
}

function examples(id: InstrumentId): Example[] {
  const instrument: Instrument = LIBRARY[id];
  if (instrument.kind === "kit" || instrument.kind === "soft-kit") return kitExamples();
  const { range, family } = instrument;
  const [low, high] = range;
  const middle = Math.round((low + high) / 2);
  if (instrument.showcase === "hit") return hitExamples(low, middle);
  if (instrument.showcase === "pluck") return pluckExamples(middle);
  if (instrument.showcase === "bass") return bassExamples(low, middle);
  if (instrument.showcase === "drone") return droneExamples(low);
  if (instrument.kind === undefined && instrument.layers.length === 0) {
    return [
      { name: "Swell", notes: single(middle) },
      { name: "Two waves", notes: [{ pitch: middle, start: 0, duration: 1.5, velocity: 0.5 }, { pitch: middle, start: 2, duration: 4, velocity: 1 }] },
    ];
  }
  const scale = run(Math.min(middle, high - 12), MAJOR.map((step) => [step, 0.5] as const));
  const notes: Example[] = [
    { name: "Low", notes: single(low + 5) },
    { name: "Mid", notes: single(middle) },
    { name: "High", notes: single(high) },
    { name: "Scale", notes: scale },
  ];
  if (family === "Low end") return [...notes, { name: "Riff", notes: run(low + 5, RIFF) }];
  const root = Math.min(middle, high - 19);
  const pianist: Example[] =
    instrument.kind === "struck"
      ? [
          { name: "Touch", notes: TOUCH.map((velocity, index) => ({ pitch: 60, start: index, duration: 0.9, velocity })) },
          { name: "Pedal", notes: PEDALLED.map((step, index) => ({ pitch: 48 + step, start: index * 0.5, duration: 0.5, velocity: 0.55 })), pedal: [{ start: 0, end: 8 }] },
        ]
      : [];
  return [
    ...notes,
    ...pianist,
    { name: "Chord", notes: CHORD.map((step) => ({ pitch: root + step, start: 0, duration: 4, velocity: STRENGTH })) },
    { name: "Phrase", notes: run(Math.min(middle, high - 7), PHRASE) },
  ];
}

function audition(id: InstrumentId, example: Example): { score: Score; band: Band } {
  const score: Score = { title: `${LIBRARY[id].name}: ${example.name}`, tempo: [{ beat: 0, bpm: 80 }], pedal: example.pedal ?? [], metre: [4, 4], key: "C", tracks: [{ name: "audition", role: "lead", notes: example.notes }] };
  const band: Band = { hall: AUDITION_HALL, level: 1, chairs: { audition: [{ instrument: id, gain: 1, pan: 0, send: 0.5 }] } };
  return { score, band: { ...band, level: estimateLevel(score, band) } };
}

function piecesUsing(id: InstrumentId): string[] {
  return PIECES.filter((piece) => bandsOf(piece).some((band) => Object.values(band.chairs).flat().some((chair) => chair.instrument === id))).map((piece) => piece.title);
}

export function Instruments() {
  const [active, setActive] = useState<{ key: string; state: "rendering" | "playing" } | null>(null);
  const requested = useRef<string | null>(null);

  useEffect(
    () => () => {
      requested.current = null;
      stop();
      seek(0);
    },
    [],
  );

  const toggle = (id: InstrumentId, example: Example): void => {
    const key = `${id}|${example.name}`;
    stop();
    seek(0);
    if (active?.key === key) {
      requested.current = null;
      setActive(null);
      return;
    }
    requested.current = key;
    setActive({ key, state: "rendering" });
    const { score, band } = audition(id, example);
    const live = (): boolean => requested.current === key;
    void playStream(score, band, {
      onState: (state) => {
        if (live()) setActive({ key, state: state === "playing" ? "playing" : "rendering" });
      },
      onEnded: () => {
        if (live()) setActive(null);
      },
      onError: (error) => {
        if (live()) setActive(null);
        throw error;
      },
    });
  };

  return (
    <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto p-4">
      {FAMILIES.map((family) => (
        <section key={family} aria-label={family} className="mb-6">
          <h2 className="mb-2 text-lg font-bold text-text-primary">{family}</h2>
          {INSTRUMENT_IDS.filter((id) => LIBRARY[id].family === family).map((id) => {
            const used = piecesUsing(id);
            return (
              <article key={id} className="mb-3 rounded-md border border-border-default bg-surface-elevated p-3">
                <h3 className="font-bold text-text-primary">{LIBRARY[id].name}</h3>
                <p className="mb-2 text-sm text-text-secondary">{LIBRARY[id].description}</p>
                <div className="mb-2 flex flex-wrap gap-1">
                  {examples(id).map((example) => {
                    const state = active?.key === `${id}|${example.name}` ? active.state : null;
                    return (
                      <Button key={example.name} variant="secondary" aria-pressed={state !== null} onClick={() => toggle(id, example)} aria-label={`${LIBRARY[id].name}: ${example.name}`}>
                        {state === "rendering" ? <LoaderCircle size={16} className="animate-spin" /> : state === "playing" ? <Pause size={16} /> : <Play size={16} />}
                        {example.name}
                      </Button>
                    );
                  })}
                </div>
                {used.length > 0 && <p className="text-xs text-text-secondary">{used.join(" · ")}</p>}
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
