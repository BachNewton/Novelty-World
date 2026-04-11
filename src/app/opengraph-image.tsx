import { ImageResponse } from "next/og";
import { starSvgMarkup } from "@/shared/lib/stars";

export const alt = "Novelty World — Games, tools, and ideas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TITLE_LETTERS = [
  { letter: "N", color: "#ff8c00" },
  { letter: "o", color: "#00CED1" },
  { letter: "v", color: "#FF2D95" },
  { letter: "e", color: "#22c55e" },
  { letter: "l", color: "#ffffff" },
  { letter: "t", color: "#ffffff" },
  { letter: "y", color: "#ffffff" },
  { letter: "\u00a0", color: "transparent" },
  { letter: "W", color: "#ff8c00" },
  { letter: "o", color: "#00CED1" },
  { letter: "r", color: "#FF2D95" },
  { letter: "l", color: "#22c55e" },
  { letter: "d", color: "#ffffff" },
];

const STARS_SVG = `<svg viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  ${starSvgMarkup(100, 100, 80, "#ff8c00")}
  ${starSvgMarkup(1000, 100, 55, "#FF2D95")}
  ${starSvgMarkup(1100, 220, 40, "#22c55e")}
</svg>`;

const WAVES_SVG = `<svg viewBox="0 0 1200 200" xmlns="http://www.w3.org/2000/svg">
  <path d="M0 40 Q140 10 280 40 Q420 70 560 40 Q700 10 840 40 Q980 70 1200 40 L1200 200 L0 200 Z" fill="#0a5e60" opacity="0.6"/>
  <path d="M0 70 Q160 35 320 70 Q480 105 640 70 Q800 35 960 70 Q1080 90 1200 70 L1200 200 L0 200 Z" fill="#00CED1" opacity="0.4"/>
  <path d="M0 100 Q140 80 280 100 Q420 120 560 100 Q700 80 840 100 Q960 115 1200 100 L1200 200 L0 200 Z" fill="#00CED1" opacity="0.25"/>
  <path d="M0 130 Q180 115 360 130 Q540 145 720 130 Q900 115 1200 130 L1200 200 L0 200 Z" fill="#0a5e60" opacity="0.4"/>
</svg>`;

export default async function Image() {
  const fontData = await fetch(
    "https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj4PVksj.ttf",
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          fontFamily: "Space Grotesk",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Stars */}
        <img
          src={`data:image/svg+xml,${encodeURIComponent(STARS_SVG)}`}
          width={1200}
          height={630}
          style={{ position: "absolute", top: 0, left: 0 }}
        />

        {/* Waves */}
        <img
          src={`data:image/svg+xml,${encodeURIComponent(WAVES_SVG)}`}
          width={1200}
          height={200}
          style={{ position: "absolute", bottom: 0, left: 0 }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: -80,
            zIndex: 1,
          }}
        >
          {/* Title */}
          <div style={{ display: "flex", fontSize: 110, fontWeight: 700 }}>
            {TITLE_LETTERS.map((t, i) => (
              <span key={i} style={{ color: t.color }}>
                {t.letter}
              </span>
            ))}
          </div>

          {/* Divider bars */}
          <div style={{ display: "flex", gap: 6, marginTop: 24 }}>
            <div
              style={{
                width: 120,
                height: 4,
                backgroundColor: "#ff8c00",
                borderRadius: 4,
              }}
            />
            <div
              style={{
                width: 120,
                height: 4,
                backgroundColor: "#00CED1",
                borderRadius: 4,
              }}
            />
            <div
              style={{
                width: 120,
                height: 4,
                backgroundColor: "#FF2D95",
                borderRadius: 4,
              }}
            />
            <div
              style={{
                width: 120,
                height: 4,
                backgroundColor: "#22c55e",
                borderRadius: 4,
              }}
            />
          </div>

          {/* Description */}
          <div
            style={{
              color: "#d4d4d8",
              fontSize: 28,
              marginTop: 24,
              fontWeight: 700,
            }}
          >
            Kyle&apos;s novel ideas built with imagination and code
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Space Grotesk",
          data: fontData,
          weight: 700,
          style: "normal",
        },
      ],
    },
  );
}
