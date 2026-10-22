"use client";

import { useRef, type ReactNode } from "react";
import { Prompt } from "@/shared/components/prompts";
import { isDrag, type InputKind, type Point } from "@/shared/lib/input";
import { cn } from "@/shared/lib/utils";
import type { CardId, Seat } from "../contract";
import { BINDINGS } from "../ui/bindings";
import { cardName, cardSymbol } from "../ui/describe";
import { SEAT_LOOKS, seatColour, shapePath } from "../ui/seats";

/** A seat's shape in its ink, as on its army markers: the cue that doesn't need colour. */
export function SeatMark({ seat, className }: { seat: Seat; className?: string }) {
  return (
    <svg viewBox="-12 -12 24 24" width="1.1em" height="1.1em" aria-hidden className={cn("inline-block shrink-0", className)}>
      <path d={shapePath(SEAT_LOOKS[seat].shape, 17)} fill={seatColour(seat)} stroke="var(--rk-ink)" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

/** A seat's mark and name. */
export function SeatName({ seat, className }: { seat: Seat; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-[0.3em] font-semibold", className)}>
      <SeatMark seat={seat} />
      {SEAT_LOOKS[seat].name}
    </span>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

/** One die's face: the attacker's red or the defender's ivory, struck through when it lost. */
export function Die({ value, side, lost }: { value: number; side: "attack" | "defend"; lost: boolean }) {
  return (
    <svg viewBox="-12 -12 24 24" width="1.8em" height="1.8em" role="img" aria-label={`${side === "attack" ? "Attacker" : "Defender"} rolled ${value}${lost ? ", lost" : ""}`} className={cn("shrink-0", lost && "opacity-45")}>
      <rect x="-11" y="-11" width="22" height="22" rx="4.5" fill={`var(--rk-die-${side})`} stroke="var(--rk-ink)" strokeWidth="1" />
      {PIPS[value].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x * 5.5} cy={y * 5.5} r="2.1" fill={`var(--rk-die-${side}-pip)`} />
      ))}
      {lost && <line x1="-9" y1="9" x2="9" y2="-9" stroke="var(--rk-danger)" strokeWidth="2.5" strokeLinecap="round" />}
    </svg>
  );
}

/** Both sides' dice of one battle, paired as they were compared (`COMBAT-4`). */
export function DiceRow({ attacker, defender }: { attacker: readonly number[]; defender: readonly number[] }) {
  const pairs = Math.min(attacker.length, defender.length);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-[0.5em] gap-y-[0.2em]">
      <span className="inline-flex gap-[0.2em]">
        {attacker.map((value, i) => (
          <Die key={i} value={value} side="attack" lost={i < pairs && value <= defender[i]} />
        ))}
      </span>
      <span className="text-(--rk-muted)">vs</span>
      <span className="inline-flex gap-[0.2em]">
        {defender.map((value, i) => (
          <Die key={i} value={value} side="defend" lost={i < pairs && attacker[i] > value} />
        ))}
      </span>
    </span>
  );
}

const SYMBOL_GLYPH: Record<ReturnType<typeof cardSymbol>, ReactNode> = {
  // An infantryman's helmet, a horse's head, a cannon; a wild shows all three.
  infantry: <path d="M-7 3h14M-6 3c0-6 2.5-9 6-9s6 3 6 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  cavalry: <path d="M-5 7l1-6-3-2 4-6 5 1 4 5-2 2-3-1-1 7z" fill="currentColor" />,
  artillery: (
    <g fill="currentColor">
      <rect x="-8" y="-3" width="13" height="4" rx="2" transform="rotate(-18)" />
      <circle cx="-1" cy="4" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </g>
  ),
  wild: <path d="M0-8l2.4 5 5.6.8-4 3.9.9 5.5L0 4.6-4.9 7.2l.9-5.5-4-3.9 5.6-.8z" fill="currentColor" />,
};

/** A card's symbol, the thing that makes sets. */
export function CardSymbolIcon({ card, className }: { card: CardId; className?: string }) {
  const symbol = cardSymbol(card);
  return (
    <svg viewBox="-10 -10 20 20" width="1.3em" height="1.3em" role="img" aria-label={symbol} className={cn("shrink-0", className)}>
      {SYMBOL_GLYPH[symbol]}
    </svg>
  );
}

/** A card as a chip: its symbol and its territory. */
export function CardChip({ card, owned, className }: { card: CardId; owned?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-[0.35em] rounded-[0.35em] border border-(--rk-brass-dim) bg-(--rk-parchment) px-[0.45em] py-[0.15em] text-(--rk-ink)", className)}>
      <CardSymbolIcon card={card} />
      <span className="font-semibold">{cardName(card)}</span>
      {owned && <span className="text-[0.75em] font-bold uppercase">held</span>}
    </span>
  );
}

/** The cards a hand holds at a turn's start. */
const HAND_LIMIT = 5;

/** A hand's size as cards: a slot for each card a hand holds at a turn's start, filled for each
 *  card held, so a full row is a hand that must trade. Straight after taking an eliminated
 *  player's cards a hand briefly holds up to 9, until it trades down, and the row grows to fit. */
export function CardPips({ count, className }: { count: number; className?: string }) {
  const label = `${count} ${count === 1 ? "card" : "cards"}`;
  return (
    <span role="img" aria-label={label} title={label} className={cn("inline-flex items-center gap-[0.12em]", className)}>
      {Array.from({ length: Math.max(HAND_LIMIT, count) }, (_, i) => (
        <span key={i} className={cn("inline-block h-[0.95em] w-[0.66em] rounded-[0.14em] border", i < count ? "border-(--rk-brass-bright) bg-(--rk-parchment)" : "border-(--rk-muted) opacity-40")} />
      ))}
    </span>
  );
}

/** A number to choose on a track, the number riding on its thumb and the most at its end, so
 *  "all" is dragging to the end. A drag sets it; a tap either side of the thumb nudges it by one,
 *  finer than a finger can drag. The arrow keys step it while it has the focus, and LB / RB (or
 *  [ and ]) step it from anywhere, their glyphs at the track's ends. It runs across, or up in a
 *  tall panel, the most at its top. */
export function Slider({ value, min, max, onChange, input, label, className, thumb, valueText, ends, vertical = false }: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  input: InputKind;
  label: string;
  className?: string;
  /** What the thumb shows, when not the number itself. */
  thumb?: ReactNode;
  valueText?: string;
  /** What marks the track's two ends, when not the most at its end. */
  ends?: readonly [ReactNode, ReactNode];
  vertical?: boolean;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const press = useRef<{ start: Point; dragged: boolean } | null>(null);
  const span = max - min;
  const at = span > 0 ? (value - min) / span : 1;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  /** How far along the track a pointer is, from 0 at its least to 1 at its most. */
  const along = (event: { clientX: number; clientY: number }) => {
    const box = rail.current?.getBoundingClientRect();
    if (!box) return at;
    return vertical ? (box.bottom - event.clientY) / box.height : (event.clientX - box.left) / box.width;
  };
  const valueAt = (event: { clientX: number; clientY: number }) => clamp(min + Math.round(along(event) * span));
  const length = () => {
    const box = rail.current?.getBoundingClientRect();
    return box ? (vertical ? box.height : box.width) : 0;
  };
  const keys: Record<string, number> = { ArrowLeft: value - 1, ArrowDown: value - 1, ArrowRight: value + 1, ArrowUp: value + 1, Home: min, End: max, PageDown: value - 5, PageUp: value + 5 };
  return (
    <div className={cn("flex items-center gap-[0.4em]", vertical ? "min-h-0 flex-col-reverse" : "min-w-0", className)}>
      <Prompt binding={BINDINGS.less} input={input} />
      {ends?.[0]}
      <div
        role="slider"
        tabIndex={span > 0 ? 0 : -1}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        aria-disabled={span === 0 || undefined}
        aria-orientation={vertical ? "vertical" : undefined}
        className={cn(
          "relative flex-1 touch-none rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-(--rk-brass-bright)",
          vertical ? "min-h-[6em] w-[max(2.4em,44px)]" : "h-[max(2.4em,44px)] min-w-[6em]",
          span > 0 ? "cursor-pointer" : "opacity-60",
        )}
        onKeyDown={(event) => {
          if (!(event.key in keys)) return;
          event.preventDefault();
          onChange(clamp(keys[event.key]));
        }}
        onPointerDown={(event) => {
          if (span === 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          press.current = { start: { x: event.clientX, y: event.clientY }, dragged: false };
        }}
        onPointerMove={(event) => {
          const p = press.current;
          if (!p) return;
          if (!p.dragged && isDrag(p.start, { x: event.clientX, y: event.clientY })) p.dragged = true;
          if (p.dragged) onChange(valueAt(event));
        }}
        onPointerUp={(event) => {
          const p = press.current;
          press.current = null;
          if (!p || p.dragged) return;
          const off = (along(event) - at) * length();
          // A tap on the thumb itself changes nothing; either side of it, one step that way.
          const thumbHalf = (vertical ? event.currentTarget.clientWidth : event.currentTarget.clientHeight) / 2;
          if (Math.abs(off) > thumbHalf) onChange(clamp(value + Math.sign(off)));
        }}
        onPointerCancel={() => {
          press.current = null;
        }}
      >
        <div ref={rail} className={cn("absolute rounded-full bg-(--rk-line)", vertical ? "inset-y-[1.2em] left-1/2 w-[0.45em] -translate-x-1/2" : "inset-x-[1.2em] top-1/2 h-[0.45em] -translate-y-1/2")}>
          <div className={cn("absolute rounded-full bg-(--rk-brass)", vertical ? "inset-x-0 bottom-0" : "inset-y-0 left-0")} style={vertical ? { height: `${at * 100}%` } : { width: `${at * 100}%` }} />
          <output
            className={cn(
              "absolute flex h-[2.2em] min-w-[2.2em] -translate-x-1/2 items-center justify-center rounded-full border-2 border-(--rk-brass-bright) bg-(--rk-panel) px-[0.3em] text-[1.05em] font-bold tabular-nums text-(--rk-parchment) shadow",
              vertical ? "left-1/2 translate-y-1/2" : "top-1/2 -translate-y-1/2",
            )}
            style={vertical ? { bottom: `${at * 100}%` } : { left: `${at * 100}%` }}
            aria-live="polite"
          >
            {/* Centred on the digits' own height, not the line's, which leaves room for letters
                that rise and fall below them, so they would sit off centre by a pixel or two. */}
            <span className="block [text-box:trim-both_cap_alphabetic]">{thumb ?? value}</span>
          </output>
        </div>
      </div>
      {ends ? (
        ends[1]
      ) : (
        <span className={cn("text-[0.85em] text-(--rk-muted) tabular-nums", !vertical && "min-w-[1.6ch] text-right")} aria-hidden>
          {max}
        </span>
      )}
      <Prompt binding={BINDINGS.more} input={input} />
    </div>
  );
}
