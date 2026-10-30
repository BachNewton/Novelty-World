"use client";

import { useEffect, useRef } from "react";
import { position } from "../player";
import { barBeats, beatSeconds, scoreBeats, type Role, type Score } from "../types";

// The piano roll: time across, pitch up, one colour per role. The playhead
// follows the audio clock on animation frames, which is the feature.

const BEAT_WIDTH = 28;
const NOTE_HEIGHT = 6;
const MARGIN_PITCHES = 2;

export const ROLE_TOKEN: Record<Role, string> = {
  lead: "--color-brand-orange",
  keys: "--color-brand-blue",
  bass: "--color-brand-pink",
  pad: "--color-brand-green",
  drums: "--color-text-muted",
};

function pitchRange(score: Score): [number, number] {
  const pitches = score.tracks.flatMap((track) => (track.role === "drums" ? [] : track.notes.map((note) => note.pitch)));
  if (pitches.length === 0) return [48, 72];
  return [Math.min(...pitches) - MARGIN_PITCHES, Math.max(...pitches) + MARGIN_PITCHES];
}

export function PianoRoll({ score }: { score: Score }) {
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const beats = Math.ceil(scoreBeats(score));
  const [low, high] = pitchRange(score);
  const width = beats * BEAT_WIDTH;
  const height = (high - low + 1) * NOTE_HEIGHT;

  useEffect(() => {
    const element = canvas.current;
    if (element === null) return;
    const scale = window.devicePixelRatio;
    element.width = width * scale;
    element.height = height * scale;
    const draw = element.getContext("2d");
    if (draw === null) throw new Error("Composer: no 2D canvas");
    draw.scale(scale, scale);
    const styles = getComputedStyle(element);
    const token = (name: string): string => styles.getPropertyValue(name);

    draw.fillStyle = token("--color-surface-secondary");
    draw.fillRect(0, 0, width, height);
    // Each C, for reading height.
    draw.fillStyle = token("--color-surface-tertiary");
    for (let pitch = low; pitch <= high; pitch++) {
      if (pitch % 12 === 0) draw.fillRect(0, (high - pitch) * NOTE_HEIGHT, width, NOTE_HEIGHT);
    }
    draw.fillStyle = token("--color-border-hover");
    for (let beat = 0; beat <= beats; beat += barBeats(score)) draw.fillRect(beat * BEAT_WIDTH, 0, 1, height);

    for (const track of score.tracks) {
      if (track.role === "drums") continue;
      draw.fillStyle = token(ROLE_TOKEN[track.role]);
      for (const note of track.notes) {
        draw.globalAlpha = 0.45 + 0.55 * note.velocity;
        draw.fillRect(
          note.start * BEAT_WIDTH,
          (high - note.pitch) * NOTE_HEIGHT,
          Math.max(2, note.duration * BEAT_WIDTH - 1),
          NOTE_HEIGHT - 1,
        );
      }
    }
    draw.globalAlpha = 1;
  }, [score, beats, low, high, width, height]);

  useEffect(() => {
    const seconds = beatSeconds(score);
    let frame = requestAnimationFrame(function follow() {
      const at = position();
      const head = playhead.current;
      const view = scroller.current;
      if (head !== null && view !== null) {
        head.hidden = at === null;
        if (at !== null) {
          const x = (at / seconds) * BEAT_WIDTH;
          head.style.transform = `translateX(${String(x)}px)`;
          view.scrollLeft = x - view.clientWidth / 3;
        }
      }
      frame = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(frame);
  }, [score]);

  return (
    <div ref={scroller} className="overflow-x-auto rounded-lg">
      <div className="relative" style={{ width, height }}>
        <canvas ref={canvas} role="img" aria-label={`Piano roll of ${score.title}`} style={{ width, height }} />
        <div ref={playhead} hidden className="absolute top-0 left-0 h-full w-0.5 bg-text-primary" />
      </div>
    </div>
  );
}
