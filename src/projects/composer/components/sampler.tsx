"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Dices, LoaderCircle, Play, Square, Star, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { play, prepare, seek, stop } from "../player";
import { clipOf, clipOfPair, PAIRINGS, PLAIN_CODE, SCALES, stepOf, surprise, type Clip, type Pairing } from "../synth/vocabulary";

// The shared dictionary: every word in `synth/vocabulary.ts`, played. The owner
// says what they hear by code, and Claude reads the same code as parameters.

interface Heard {
  // What the page shows and keeps: a code or several, or a pair's name.
  label: string;
  words: string;
  clip: Clip;
}

const STORAGE_KEY = "composer-sampler-kept";
// Clips are quick to render but not free: comparing along a row should be instant.
const KEEP_BUFFERS = 24;
const TILE = "flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-md border px-1 py-1 font-mono text-xs transition-colors";
const TILE_ON = "border-brand-orange bg-surface-elevated text-text-primary";
const TILE_OFF = "border-border-default text-text-secondary hover:border-border-hover";

function wordsOf(codes: readonly string[]): string {
  return codes.map((code) => stepOf(code)?.word ?? "unknown code").join(", ");
}

function heardOf(codes: readonly string[]): Heard {
  return { label: codes.join(" "), words: wordsOf(codes), clip: clipOf(codes) };
}

function heardOfPair(pairing: Pairing, solo?: number): Heard {
  const seat = solo === 0 ? pairing.upper.name : solo === 1 ? pairing.lower.name : "both lines";
  const part = solo === undefined ? "" : `-${solo === 0 ? "A" : "B"}`;
  return { label: `${pairing.code}${part}`, words: `${pairing.word}: ${seat}`, clip: clipOfPair(pairing, solo) };
}

function readKept(): string[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function writeKept(kept: readonly string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // Storage can be blocked; the list still works for this visit.
  }
}

function keptText(kept: readonly string[]): string {
  return kept.map((label) => `${label} (${wordsOfLabel(label)})`).join("\n");
}

function pairOfLabel(label: string): Heard | undefined {
  const pairing = PAIRINGS.find(({ code }) => label === code || label.startsWith(`${code}-`));
  if (pairing === undefined) return undefined;
  return heardOfPair(pairing, label.endsWith("-A") ? 0 : label.endsWith("-B") ? 1 : undefined);
}

function heardOfLabel(label: string): Heard {
  return pairOfLabel(label) ?? heardOf(label.split(" "));
}

function wordsOfLabel(label: string): string {
  return heardOfLabel(label).words;
}

export function Sampler() {
  const [active, setActive] = useState<{ label: string; rendering: boolean } | null>(null);
  const [shown, setShown] = useState<Heard | null>(null);
  const [kept, setKept] = useState(readKept);
  const [copied, setCopied] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const requested = useRef<string | null>(null);
  const buffers = useRef(new Map<string, Promise<AudioBuffer>>());

  useEffect(
    () => () => {
      requested.current = null;
      stop();
      seek(0);
    },
    [],
  );

  const bufferFor = ({ label, clip }: Heard): Promise<AudioBuffer> => {
    const known = buffers.current.get(label);
    if (known !== undefined) return known;
    const buffer = prepare(`sampler|${label}`, { clip });
    buffers.current.set(label, buffer);
    for (const old of buffers.current.keys()) {
      if (buffers.current.size <= KEEP_BUFFERS) break;
      buffers.current.delete(old);
    }
    return buffer;
  };

  const halt = (): void => {
    requested.current = null;
    stop();
    seek(0);
    setActive(null);
  };

  const toggle = (heard: Heard): void => {
    const { label } = heard;
    if (active?.label === label) {
      halt();
      return;
    }
    stop();
    seek(0);
    requested.current = label;
    setFailure(null);
    setShown(heard);
    setActive({ label, rendering: true });
    bufferFor(heard)
      .then(async (buffer) => {
        if (requested.current !== label) return;
        await play(buffer, () => {
          if (requested.current === label) setActive(null);
        });
        setActive({ label, rendering: false });
      })
      .catch((error: unknown) => {
        buffers.current.delete(label);
        if (requested.current === label) {
          setActive(null);
          setFailure((error instanceof Error ? error.message : String(error)).split("\n")[0]);
        }
        throw error;
      });
  };

  const change = (next: readonly string[]): void => {
    setKept([...next]);
    writeKept(next);
    setCopied(false);
  };

  const copy = (): void => {
    void navigator.clipboard.writeText(keptText(kept)).then(() => setCopied(true));
  };

  const tile = (heard: Heard, children?: ReactNode): ReactNode => (
    <button key={heard.label} type="button" aria-pressed={active?.label === heard.label} title={heard.words} onClick={() => toggle(heard)} className={cn(TILE, active?.label === heard.label ? TILE_ON : TILE_OFF)}>
      {active?.label === heard.label && active.rendering && <LoaderCircle size={12} className="animate-spin" />}
      {children ?? heard.label}
    </button>
  );

  const isKept = shown !== null && kept.includes(shown.label);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-border-default bg-surface-primary px-4 py-2">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
          <Button onClick={() => toggle(heardOf(surprise(Math.random)))} aria-label="Surprise me" title="Surprise me" className="shrink-0">
            <Dices size={18} /> <span className="hidden sm:inline">Surprise me</span>
          </Button>
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="font-mono text-xs text-text-primary">{shown?.label ?? "Pick a sound"}</p>
            <p className="text-xs text-text-secondary">{shown?.words ?? "Same notes, one word at a time"}</p>
          </div>
          <Button variant="secondary" disabled={active === null} onClick={halt} aria-label="Stop" title="Stop" className="shrink-0">
            <Square size={16} />
          </Button>
          <Button
            variant="secondary"
            disabled={shown === null}
            aria-pressed={isKept}
            aria-label={isKept ? "Stop keeping this one" : "Keep this one"}
            title="Keep"
            onClick={() => {
              if (shown === null) return;
              change(isKept ? kept.filter((label) => label !== shown.label) : [...kept, shown.label]);
            }}
            className="shrink-0"
          >
            <Star size={16} className={cn(isKept && "fill-current text-brand-orange")} />
          </Button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 py-3">
        {failure !== null && (
          <p role="alert" className="mb-2 text-sm text-brand-pink">
            {failure}
          </p>
        )}

        {kept.length > 0 && (
          <section aria-label="Kept sounds" className="mb-4 rounded-md border border-border-default bg-surface-secondary p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-bold text-text-primary">Kept</h2>
              <Button variant="secondary" onClick={copy}>
                {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <ul>
              {kept.map((label) => {
                const heard = heardOfLabel(label);
                return (
                  <li key={label} className="flex items-center gap-1 border-t border-border-default py-1">
                    <button type="button" aria-label={`Play ${label}`} onClick={() => toggle(heard)} className="flex min-h-9 min-w-0 flex-1 items-center gap-2 text-left">
                      <Play size={14} className="shrink-0 text-text-secondary" />
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-xs text-text-primary">{label}</span>
                        <span className="block truncate text-xs text-text-secondary">{heard.words}</span>
                      </span>
                    </button>
                    <button type="button" aria-label={`Remove ${label}`} onClick={() => change(kept.filter((entry) => entry !== label))} className="flex size-9 shrink-0 items-center justify-center text-text-secondary hover:text-text-primary">
                      <X size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section aria-label="Pairs" className="mb-4">
          <h2 className="text-lg font-bold text-text-primary">Two lines together</h2>
          <p className="mb-2 text-sm text-text-secondary">Listen to A, then B, then try to follow each inside both.</p>
          {PAIRINGS.map((pairing) => (
            <article key={pairing.code} className="mb-2 rounded-md border border-border-default bg-surface-secondary p-3">
              <h3 className="font-bold text-text-primary">{pairing.word}</h3>
              <p className="text-sm text-text-secondary">{pairing.says}</p>
              <p className="mb-2 text-xs text-text-muted">{pairing.maps}</p>
              <div className="grid grid-cols-3 gap-1">
                {tile(heardOfPair(pairing), "Both")}
                {tile(heardOfPair(pairing, 0), "A")}
                {tile(heardOfPair(pairing, 1), "B")}
              </div>
              <p className="mt-1 font-mono text-xs text-text-muted">{pairing.code}</p>
            </article>
          ))}
        </section>

        <section aria-label="Word scales">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-text-primary">Word scales</h2>
            {tile(heardOf([PLAIN_CODE]))}
          </div>
          {SCALES.map((scale) => (
            <article key={scale.id} className="mb-2 rounded-md border border-border-default bg-surface-secondary p-3">
              <h3 className="flex justify-between font-bold text-text-primary">
                <span>{scale.low}</span>
                <span>{scale.high}</span>
              </h3>
              <p className="text-sm text-text-secondary">{scale.says}</p>
              <p className="mb-2 text-xs text-text-muted">{scale.maps}</p>
              <div className="grid grid-cols-5 gap-1">{scale.steps.map((step) => tile(heardOf([step.code])))}</div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
