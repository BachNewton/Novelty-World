import Image from "next/image";
import type { CSSProperties } from "react";
import type { ShownSymbol } from "../heritage-symbols";

// The height raster art is requested at, so the image optimizer serves a
// small rendering of a large scan rather than the scan itself.
const RASTER_HEIGHT = 96;

interface HeritageSymbolProps {
  symbol: ShownSymbol;
  // Size one dimension; the other follows the symbol's own proportions.
  className?: string;
  style?: CSSProperties;
}

// A heritage symbol drawn whole, in its own proportions and colours.
export function HeritageSymbol({ symbol, className, style }: HeritageSymbolProps) {
  const scale = RASTER_HEIGHT / symbol.height;
  return (
    <Image
      src={symbol.src}
      width={Math.round(symbol.width * scale)}
      height={RASTER_HEIGHT}
      alt=""
      aria-hidden
      draggable={false}
      className={className}
      style={{ aspectRatio: `${symbol.width} / ${symbol.height}`, ...style }}
    />
  );
}
