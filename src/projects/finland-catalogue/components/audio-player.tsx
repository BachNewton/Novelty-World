"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/shared/lib/utils";

type State = "idle" | "loading" | "playing" | "paused";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—:—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function countWords(parts: readonly string[]): number {
  return parts.join(" ").trim().split(/\s+/).filter(Boolean).length;
}

// Ava Multilingual reads English prose at roughly 150 words per minute.
// The streaming response has no Content-Length so the browser can't
// report a duration until the full MP3 has arrived; estimating from word
// count lets the scrubber and time display work from the first frame.
// durationchange replaces this with the real value once known.
const WORDS_PER_SECOND = 2.5;

export function AudioPlayer({
  slug,
  kind,
  approxWordCount,
  className,
}: {
  slug: string;
  kind: "idea" | "topic";
  approxWordCount: number;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<State>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(approxWordCount / WORDS_PER_SECOND);

  const audioUrl = `/api/finland-tts?kind=${kind}&slug=${slug}`;

  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        // Drop the src and reload the element so the browser cancels the
        // in-flight HTTP stream — otherwise a slow Edge TTS synthesis can
        // keep an orphan <audio> playing after the user navigates away.
        a.removeAttribute("src");
        a.load();
        audioRef.current = null;
      }
    };
  }, []);

  function createAudio(): HTMLAudioElement {
    const a = new Audio(audioUrl);
    const onMeta = () => {
      if (Number.isFinite(a.duration)) setDuration(a.duration);
    };
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("timeupdate", () => setCurrentTime(a.currentTime));
    a.addEventListener("seeked", () => setCurrentTime(a.currentTime));
    a.addEventListener("playing", () => setState("playing"));
    a.addEventListener("waiting", () => {
      if (!a.paused) setState("loading");
    });
    a.addEventListener("pause", () => {
      if (!a.ended) setState("paused");
    });
    a.addEventListener("ended", () => {
      setState("idle");
      setCurrentTime(0);
    });
    a.addEventListener("error", () => {
      console.error("Audio load failed");
      audioRef.current = null;
      setState("idle");
    });
    return a;
  }

  function togglePlay() {
    let a = audioRef.current;
    if (!a) {
      a = createAudio();
      audioRef.current = a;
    }
    if (a.paused) {
      setState("loading");
      void a.play().catch(() => {
        // play() rejects on autoplay restrictions, navigation, or media
        // load failure; the audio's own "error" event handles the latter.
        setState("idle");
      });
    } else {
      a.pause();
    }
  }

  function seek(seconds: number) {
    const a = audioRef.current;
    if (!a || duration <= 0) return;
    const clamped = Math.min(Math.max(0, seconds), duration);
    a.currentTime = clamped;
    setCurrentTime(clamped);
  }

  const pct =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const isPlaying = state === "playing";
  const isLoading = state === "loading";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-full border border-border-default bg-surface-secondary px-3 py-2",
        className,
      )}
    >
      <button
        type="button"
        onClick={togglePlay}
        disabled={isLoading}
        aria-label={isPlaying ? "Pause narration" : "Play narration"}
        aria-pressed={isPlaying}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-blue text-surface-primary transition-colors hover:bg-brand-blue/90 disabled:opacity-60"
      >
        {isLoading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : isPlaying ? (
          <Pause size={18} fill="currentColor" />
        ) : (
          <Play size={18} fill="currentColor" />
        )}
      </button>

      <div
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={duration || 0}
        aria-valuenow={currentTime}
        aria-disabled={!duration}
        tabIndex={0}
        onPointerDown={(e) => {
          if (!duration) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const rect = e.currentTarget.getBoundingClientRect();
          seek(((e.clientX - rect.left) / rect.width) * duration);
        }}
        onPointerMove={(e) => {
          if (!duration || !(e.buttons & 1)) return;
          const rect = e.currentTarget.getBoundingClientRect();
          seek(((e.clientX - rect.left) / rect.width) * duration);
        }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        className={cn(
          "relative flex h-4 flex-1 items-center touch-none select-none",
          duration ? "cursor-pointer" : "cursor-not-allowed",
        )}
      >
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-surface-elevated" />
        <div
          className="pointer-events-none absolute left-0 h-1.5 rounded-full bg-brand-blue"
          style={{ width: `${pct}%` }}
        />
        <div
          className="pointer-events-none absolute size-3 -translate-x-1/2 rounded-full bg-brand-blue shadow"
          style={{ left: `${pct}%` }}
        />
      </div>

      <span className="shrink-0 font-mono text-xs tabular-nums text-text-secondary">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
}
