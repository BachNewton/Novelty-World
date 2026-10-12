import type { ReactNode } from "react";
import { starSvgMarkup } from "@/shared/lib/stars";
import { OG_COLORS } from "./colors";

// Satori, which draws these cards to a PNG, takes SVG only as an image, so the
// cards' shapes are SVG strings shown through data-URI <img>s.
function svgSrc(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const { "brand-orange": orange, "brand-blue": blue, "brand-pink": pink, "brand-green": green } = OG_COLORS;
const BRAND = [orange, blue, pink, green] as const;

const STARS_SVG = `<svg viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  ${starSvgMarkup(100, 100, 80, orange)}
  ${starSvgMarkup(1000, 100, 55, pink)}
  ${starSvgMarkup(1100, 220, 40, green)}
</svg>`;

// The sea along the bottom of the site's cards: brand blue in layers over the
// dark background, the nearest band shaded back toward it.
const WAVES_SVG = `<svg viewBox="0 0 1200 200" xmlns="http://www.w3.org/2000/svg">
  <path d="M0 40 Q140 10 280 40 Q420 70 560 40 Q700 10 840 40 Q980 70 1200 40 L1200 200 L0 200 Z" fill="${blue}" opacity="0.26"/>
  <path d="M0 70 Q160 35 320 70 Q480 105 640 70 Q800 35 960 70 Q1080 90 1200 70 L1200 200 L0 200 Z" fill="${blue}" opacity="0.4"/>
  <path d="M0 100 Q140 80 280 100 Q420 120 560 100 Q700 80 840 100 Q960 115 1200 100 L1200 200 L0 200 Z" fill="${blue}" opacity="0.25"/>
  <path d="M0 130 Q180 115 360 130 Q540 145 720 130 Q900 115 1200 130 L1200 200 L0 200 Z" fill="${blue}" opacity="0.23"/>
  <path d="M0 130 Q180 115 360 130 Q540 145 720 130 Q900 115 1200 130 L1200 200 L0 200 Z" fill="${OG_COLORS["surface-primary"]}" opacity="0.22"/>
</svg>`;

/* eslint-disable @next/next/no-img-element -- next/og ImageResponse is rendered by Satori to a PNG, not real React DOM, so next/image cannot be used; plain <img> is the documented Satori API */
function Stars() {
  return <img alt="" src={svgSrc(STARS_SVG)} width={1200} height={630} style={{ position: "absolute", top: 0, left: 0 }} />;
}

/** The sea along a card's bottom edge, `height` tall. */
export function Waves({ height = 200 }: { height?: number }) {
  return (
    <img alt="" src={svgSrc(WAVES_SVG)} width={1200} height={height} style={{ position: "absolute", bottom: 0, left: 0 }} />
  );
}
/* eslint-enable @next/next/no-img-element -- re-enable after the Satori <img>s */

/** "Novelty World", each word's first four letters in the brand colours. */
export function Wordmark({ fontSize }: { fontSize: number }) {
  const letters = ["Novelty", "World"].flatMap((word, w) => [
    ...(w > 0 ? [{ letter: " ", color: "transparent" }] : []),
    ...[...word].map((letter, i) => ({ letter, color: BRAND[i] ?? OG_COLORS["text-primary"] })),
  ]);
  return (
    <div style={{ display: "flex", fontSize, fontWeight: 700 }}>
      {letters.map((t, i) => (
        <span key={i} style={{ color: t.color }}>
          {t.letter}
        </span>
      ))}
    </div>
  );
}

/** The four brand colours as a row of short bars, the site's divider. */
export function BrandBars({ width, height }: { width: number; height: number }) {
  return (
    <div style={{ display: "flex", gap: height * 1.5 }}>
      {BRAND.map((color) => (
        <div key={color} style={{ width, height, backgroundColor: color, borderRadius: height }} />
      ))}
    </div>
  );
}

/** The whole card's background, the site's dark surface, with the sea and,
 *  optionally, the stars. */
export function CardBackground({ stars, children }: { stars: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundColor: OG_COLORS["surface-primary"],
        color: OG_COLORS["text-primary"],
        fontFamily: "Space Grotesk",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {stars && <Stars />}
      <Waves />
      {children}
    </div>
  );
}

/** The site's own card, shared by every page without one of its own. */
export function DefaultOgCard() {
  return (
    <CardBackground stars>
      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          marginTop: -80,
        }}
      >
        <Wordmark fontSize={110} />
        <div style={{ display: "flex", marginTop: 24 }}>
          <BrandBars width={120} height={4} />
        </div>
        <div style={{ color: OG_COLORS["text-secondary"], fontSize: 28, marginTop: 24, fontWeight: 700 }}>
          Kyle&apos;s novel ideas built with imagination and code
        </div>
      </div>
    </CardBackground>
  );
}
