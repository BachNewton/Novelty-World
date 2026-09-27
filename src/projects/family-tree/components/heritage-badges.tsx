import { FLAGS } from "../flags";
import { HERITAGES } from "../heritages";
import type { HeritageCode } from "../heritages";
import { formatShare } from "../logic";
import type { HeritageBreakdown } from "../logic";
import type { LaidOutNode } from "../types";
import { Flag } from "./flag";

// How far a corner flag reaches, corner to corner, for a heritage's share of
// the mix: a big base size so even a small share reads, growing with the
// share.
function flagDiagonal(share: number): number {
  return Math.round(44 * (0.7 + 0.6 * share));
}

// A corner flag's size: the whole flag in its own proportions, with the given
// diagonal.
function cornerFlagSize(code: HeritageCode, diagonal: number): { w: number; h: number } {
  const { width, height } = FLAGS[code];
  const scale = diagonal / Math.hypot(width, height);
  return { w: width * scale, h: height * scale };
}

const MAX_CORNER_FLAGS = 4;
// Clearance between the chips and a bottom corner flag.
const CHIP_CLEARANCE = 4;

// A card's heritage decoration, drawn over and around the card, never inside
// it: one flag centered on each corner for the largest shares (top-left,
// top-right, bottom-left, bottom-right by rank) and a row of chips under the
// card listing every share. A person with no known heritage gets nothing, so
// a tree without heritage entered looks exactly as it would without the
// feature. Clicks pass through to the card and the canvas.
export function HeritageBadges({
  node,
  heritage,
}: {
  node: LaidOutNode;
  heritage: HeritageBreakdown;
}) {
  const { known, unknown } = heritage;
  if (known.length === 0) return null;

  const cornerFlags = known.slice(0, MAX_CORNER_FLAGS).map((entry, rank) => ({
    ...entry,
    ...cornerFlagSize(entry.code, flagDiagonal(entry.share)),
    right: rank % 2 === 1,
    bottom: rank >= 2,
  }));
  const bottomHalfWidths = cornerFlags.filter((f) => f.bottom).map((f) => f.w / 2);
  const chipInset =
    bottomHalfWidths.length > 0 ? Math.max(...bottomHalfWidths) + CHIP_CLEARANCE : 0;

  return (
    <>
      {cornerFlags.map((f) => (
        <div
          key={f.code}
          aria-hidden
          className="pointer-events-none absolute overflow-hidden rounded-[2px] shadow-family-flag"
          style={{
            left: node.x + (f.right ? node.w : 0) - f.w / 2,
            top: node.y + (f.bottom ? node.h : 0) - f.h / 2,
            width: f.w,
            height: f.h,
          }}
        >
          <Flag code={f.code} className="block h-full w-full" />
          <span className="absolute inset-0 rounded-[2px] inset-shadow-family-flag" />
        </div>
      ))}
      <div
        className="pointer-events-none absolute flex flex-wrap justify-center gap-x-[3px] gap-y-[6px]"
        style={{
          left: node.x + chipInset,
          top: node.y + node.h + 4,
          width: node.w - 2 * chipInset,
        }}
      >
        {known.map((entry) => (
          <HeritageChip key={entry.code} code={entry.code} share={entry.share} />
        ))}
        {unknown > 0 ? <HeritageChip code={null} share={unknown} /> : null}
      </div>
    </>
  );
}

// A small flag-and-percentage pill. `code` null is the unknown share, shown
// as "?" in the flag slot. "panel" is the larger size for the person panel.
export function HeritageChip({
  code,
  share,
  size = "card",
}: {
  code: HeritageCode | null;
  share: number;
  size?: "card" | "panel";
}) {
  const name = code === null ? "Unknown" : HERITAGES[code].name;
  return (
    <span
      title={name}
      className={[
        "inline-flex items-center gap-[3px] whitespace-nowrap rounded-full border border-border-hover bg-surface-tertiary font-mono leading-[1.15] text-text-secondary",
        size === "card" ? "py-px pr-[5px] pl-[2px] text-[9px]" : "py-0.5 pr-2 pl-1 text-xs",
      ].join(" ")}
    >
      {code === null ? (
        <span
          className={[
            "inline-flex items-center justify-center rounded-[2px] bg-surface-elevated text-text-muted",
            size === "card" ? "h-2 w-3 text-[7px]" : "h-3 w-[18px] text-[10px]",
          ].join(" ")}
        >
          ?
        </span>
      ) : (
        <Flag
          code={code}
          className={["block w-auto rounded-[1px]", size === "card" ? "h-2" : "h-3"].join(" ")}
        />
      )}
      <span className="sr-only">{name} </span>
      {formatShare(share)}
    </span>
  );
}
