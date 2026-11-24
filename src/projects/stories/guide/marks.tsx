import type { Kind } from "../tools/story-world";

export const KIND_NAMES: Record<Kind, string> = { real: "Real history", canon: "Star Trek canon", story: "The story" };

export const KIND_COLORS: Record<Kind, string> = {
  real: "var(--story-real)",
  canon: "var(--story-canon)",
  story: "var(--story-own)",
};

/** A kind's shape in the page's text: a square for real history, a diamond for canon, a dot for the story. */
export function KindMark({ kind }: { kind: Kind }) {
  const shape = { real: "rounded-[1px]", canon: "rotate-45 scale-[0.85] rounded-[1px]", story: "rounded-full" }[kind];
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 ${shape}`} style={{ background: KIND_COLORS[kind] }} />;
}

export function BornMark() {
  return <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full border-2 border-story-ink-soft" />;
}

export function DiedMark() {
  return <span aria-hidden className="inline-block h-3 w-[3px] shrink-0 bg-story-ink" />;
}

export function ChapterMark() {
  return <span aria-hidden className="inline-block h-3.5 w-1 shrink-0 rounded-[1px] bg-story-chapter" />;
}

/** The same shapes on the timeline's axis. */
export function AxisMark({ kind, x, y }: { kind: Kind | "born" | "died"; x: number; y: number }) {
  switch (kind) {
    case "story":
      return <circle cx={x} cy={y} r={4.5} fill={KIND_COLORS.story} />;
    case "canon":
      return <rect x={x - 4} y={y - 4} width={8} height={8} fill={KIND_COLORS.canon} transform={`rotate(45 ${x} ${y})`} />;
    case "real":
      return <rect x={x - 4} y={y - 4} width={8} height={8} fill={KIND_COLORS.real} />;
    case "born":
      return <circle cx={x} cy={y} r={4} className="fill-story-night stroke-story-ink-soft" strokeWidth={1.5} />;
    case "died":
      return <rect x={x - 1.5} y={y - 6} width={3} height={12} className="fill-story-ink" />;
  }
}
