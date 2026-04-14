import { ImageResponse } from "next/og";
import { starSvgMarkup } from "@/shared/lib/stars";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

const STARS_SVG = `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  ${starSvgMarkup(120, 210, 38, "#FF2D95")}
  ${starSvgMarkup(256, 135, 83, "#ff8c00")}
  ${starSvgMarkup(392, 210, 38, "#22c55e")}
</svg>`;

const WAVES_SVG = `<svg viewBox="0 0 512 200" xmlns="http://www.w3.org/2000/svg">
  <path d="M0 40 Q64 10 128 40 Q192 70 256 40 Q320 10 384 40 Q448 70 512 40 L512 200 L0 200 Z" fill="#0a5e60" opacity="0.6"/>
  <path d="M0 70 Q80 35 160 70 Q240 105 320 70 Q400 35 480 70 Q496 78 512 70 L512 200 L0 200 Z" fill="#00CED1" opacity="0.4"/>
  <path d="M0 100 Q70 80 140 100 Q210 120 280 100 Q350 80 420 100 Q470 115 512 100 L512 200 L0 200 Z" fill="#00CED1" opacity="0.25"/>
  <path d="M0 130 Q90 115 180 130 Q270 145 360 130 Q450 115 512 130 L512 200 L0 200 Z" fill="#0a5e60" opacity="0.4"/>
</svg>`;

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#0a0a0a",
          borderRadius: 96,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* eslint-disable @next/next/no-img-element -- next/og ImageResponse is rendered by Satori to a PNG, not real React DOM, so next/image cannot be used; plain <img> is the documented Satori API */}
        <img
          alt=""
          src={`data:image/svg+xml,${encodeURIComponent(STARS_SVG)}`}
          width={512}
          height={512}
          style={{ position: "absolute", top: 0, left: 0 }}
        />
        <img
          alt=""
          src={`data:image/svg+xml,${encodeURIComponent(WAVES_SVG)}`}
          width={512}
          height={200}
          style={{ position: "absolute", bottom: 0, left: 0 }}
        />
        {/* eslint-enable @next/next/no-img-element -- re-enable after Satori <img> block */}
      </div>
    ),
    size,
  );
}
