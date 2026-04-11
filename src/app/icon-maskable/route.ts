import { starSvgMarkup } from "@/shared/lib/stars";

const WAVES = `
  <path d="M0 340 Q64 310 128 340 Q192 370 256 340 Q320 310 384 340 Q448 370 512 340 L512 512 L0 512 Z" fill="#0a5e60" opacity="0.6"/>
  <path d="M0 370 Q80 335 160 370 Q240 405 320 370 Q400 335 480 370 Q496 378 512 370 L512 512 L0 512 Z" fill="#00CED1" opacity="0.4"/>
  <path d="M0 400 Q70 380 140 400 Q210 420 280 400 Q350 380 420 400 Q470 415 512 400 L512 512 L0 512 Z" fill="#00CED1" opacity="0.25"/>
  <path d="M0 430 Q90 415 180 430 Q270 445 360 430 Q450 415 512 430 L512 512 L0 512 Z" fill="#0a5e60" opacity="0.4"/>
`;

export function GET() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0a0a0a"/>
  ${starSvgMarkup(120, 210, 38, "#FF2D95")}
  ${starSvgMarkup(256, 135, 83, "#ff8c00")}
  ${starSvgMarkup(392, 210, 38, "#22c55e")}
  ${WAVES}
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
