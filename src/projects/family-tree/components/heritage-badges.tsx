import { COUNTRIES } from "../countries";
import type { CountryCode } from "../countries";
import { formatShare } from "../logic";
import type { HeritageBreakdown } from "../logic";
import type { LaidOutNode } from "../types";
import { Flag } from "./flag";

// Medallion diameter for a heritage's share of the mix: a big base size so
// even a small share reads, growing with the share.
function medallionDiameter(share: number): number {
  return Math.round(44 * (0.7 + 0.6 * share));
}

const MAX_MEDALLIONS = 4;
// Clearance between the chips and a bottom medallion.
const CHIP_CLEARANCE = 4;

// A card's heritage decoration, drawn over and around the card, never inside
// it: one flag medallion per corner for the largest shares (top-left,
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

  const medallions = known.slice(0, MAX_MEDALLIONS).map((entry, rank) => ({
    ...entry,
    diameter: medallionDiameter(entry.share),
    right: rank % 2 === 1,
    bottom: rank >= 2,
  }));
  const bottomRadii = medallions.filter((m) => m.bottom).map((m) => m.diameter / 2);
  const chipInset = bottomRadii.length > 0 ? Math.max(...bottomRadii) + CHIP_CLEARANCE : 0;

  return (
    <>
      {medallions.map((m) => {
        const r = m.diameter / 2;
        return (
          <div
            key={m.code}
            aria-hidden
            className="pointer-events-none absolute overflow-hidden rounded-full shadow-family-medallion"
            style={{
              left: node.x + (m.right ? node.w : 0) - r,
              top: node.y + (m.bottom ? node.h : 0) - r,
              width: m.diameter,
              height: m.diameter,
            }}
          >
            <Flag code={m.code} fit="fill" className="block h-full w-full" />
            <span className="absolute inset-0 rounded-full inset-shadow-family-medallion" />
          </div>
        );
      })}
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
// as "?" in the flag slot. "panel" is the larger size for the action panel.
export function HeritageChip({
  code,
  share,
  size = "card",
}: {
  code: CountryCode | null;
  share: number;
  size?: "card" | "panel";
}) {
  const name = code === null ? "Unknown" : COUNTRIES[code].name;
  return (
    <span
      title={name}
      className={[
        "inline-flex items-center gap-[3px] whitespace-nowrap rounded-full border border-border-hover bg-surface-tertiary font-mono leading-[1.15] text-text-secondary",
        size === "card" ? "py-px pr-[5px] pl-[2px] text-[9px]" : "py-0.5 pr-2 pl-1 text-xs",
      ].join(" ")}
    >
      <span
        className={[
          "inline-flex items-center justify-center overflow-hidden rounded-[2px] bg-surface-elevated text-text-muted",
          size === "card" ? "h-2 w-3 text-[7px]" : "h-3 w-[18px] text-[10px]",
        ].join(" ")}
      >
        {code === null ? "?" : <Flag code={code} fit="stretch" className="block h-full w-full" />}
      </span>
      <span className="sr-only">{name} </span>
      {formatShare(share)}
    </span>
  );
}
