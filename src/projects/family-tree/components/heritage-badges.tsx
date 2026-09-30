import { shareTitle, type ShownHeritage, type ShownShare, type ShownSymbol } from "../heritage-symbols";
import { PEOPLES } from "../heritages";
import { formatShare } from "../logic";
import type { LaidOutNode } from "../types";
import { HeritageSymbol } from "./heritage-symbol";

// How far a corner symbol reaches, corner to corner, for a heritage's share
// of the mix: a big base size so even a small share reads, growing with the
// share.
function symbolDiagonal(share: number): number {
  return Math.round(44 * (0.7 + 0.6 * share));
}

// A corner symbol's size: the whole symbol in its own proportions, with the
// given diagonal.
function cornerSymbolSize(symbol: ShownSymbol, diagonal: number): { w: number; h: number } {
  const scale = diagonal / Math.hypot(symbol.width, symbol.height);
  return { w: symbol.width * scale, h: symbol.height * scale };
}

const MAX_CORNER_SYMBOLS = 4;
// Clearance between the chips and a bottom corner symbol, or the line that
// drops from a lone parent's card.
const CHIP_CLEARANCE = 4;

// A card's heritage decoration, drawn over and around the card, never inside
// it: one symbol centered on each corner for the largest shares (top-left,
// top-right, bottom-left, bottom-right by rank) and a row of chips under the
// card listing every share. Each symbol is its era's for the person's birth
// year, drawn whole: a flag with its shadow outside it, a coat of arms in its
// own outline. A person with no known heritage gets nothing, so a tree
// without heritage entered looks exactly as it would without the feature.
// Clicks pass through to the card and the canvas, except on the chips, which
// take the pointer so their hover text can show (a drag started on one still
// reaches the canvas and pans). When a line drops from the
// bottom center of the card (a lone parent's), the chips sit to its right, so
// the line never crosses a symbol.
export function HeritageBadges({
  node,
  heritage,
  lineBelow,
}: {
  node: LaidOutNode;
  heritage: ShownHeritage;
  lineBelow: boolean;
}) {
  const { shares, unknown } = heritage;
  if (shares.length === 0) return null;

  const corners = shares.slice(0, MAX_CORNER_SYMBOLS).map((share, rank) => ({
    share,
    ...cornerSymbolSize(share.symbol, symbolDiagonal(share.share)),
    right: rank % 2 === 1,
    bottom: rank >= 2,
  }));
  const bottomHalfWidths = corners.filter((c) => c.bottom).map((c) => c.w / 2);
  const chipInset =
    bottomHalfWidths.length > 0 ? Math.max(...bottomHalfWidths) + CHIP_CLEARANCE : 0;
  const chipsLeft = lineBelow ? node.x + node.w / 2 + CHIP_CLEARANCE : node.x + chipInset;
  const chipsRight = node.x + node.w - chipInset;

  return (
    <>
      {corners.map((c) => (
        <HeritageSymbol
          key={c.share.people}
          symbol={c.share.symbol}
          className={[
            "pointer-events-none absolute block",
            c.share.symbol.emblem ? "" : "shadow-family-flag",
          ].join(" ")}
          style={{
            left: node.x + (c.right ? node.w : 0) - c.w / 2,
            top: node.y + (c.bottom ? node.h : 0) - c.h / 2,
            width: c.w,
            height: c.h,
          }}
        />
      ))}
      <div
        className={[
          "pointer-events-none absolute flex flex-wrap gap-x-[3px] gap-y-[6px]",
          lineBelow ? "justify-start" : "justify-center",
        ].join(" ")}
        style={{
          left: chipsLeft,
          top: node.y + node.h + 4,
          width: chipsRight - chipsLeft,
        }}
      >
        {shares.map((share) => (
          <HeritageChip key={share.people} share={share} />
        ))}
        {unknown > 0 ? <UnknownChip share={unknown} /> : null}
      </div>
    </>
  );
}

const CHIP = {
  card: {
    pill: "py-px pr-[5px] pl-[2px] text-[9px]",
    symbol: "h-2",
    unknown: "h-2 w-3 text-[7px]",
  },
  panel: {
    pill: "py-0.5 pr-2 pl-1 text-xs",
    symbol: "h-3",
    unknown: "h-3 w-[18px] text-[10px]",
  },
};
const PILL =
  "pointer-events-auto inline-flex items-center gap-[3px] whitespace-nowrap rounded-full border border-border-hover bg-surface-tertiary font-mono leading-[1.15] text-text-secondary";

// A small symbol-and-percentage pill; its hover text names the people and
// the symbol's era. "panel" is the larger size for the person panel.
export function HeritageChip({ share, size = "card" }: { share: ShownShare; size?: "card" | "panel" }) {
  const percent = formatShare(share.share);
  return (
    <span title={shareTitle(share, percent)} className={`${PILL} ${CHIP[size].pill}`}>
      <HeritageSymbol symbol={share.symbol} className={`block w-auto ${CHIP[size].symbol}`} />
      <span className="sr-only">{PEOPLES[share.people].name} </span>
      {percent}
    </span>
  );
}

// The unknown share, shown as "?" in the symbol slot.
export function UnknownChip({ share, size = "card" }: { share: number; size?: "card" | "panel" }) {
  return (
    <span title={`Unknown ${formatShare(share)}`} className={`${PILL} ${CHIP[size].pill}`}>
      <span
        className={`inline-flex items-center justify-center rounded-[2px] bg-surface-elevated text-text-muted ${CHIP[size].unknown}`}
      >
        ?
      </span>
      <span className="sr-only">Unknown </span>
      {formatShare(share)}
    </span>
  );
}
