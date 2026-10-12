import type { ReactElement } from "react";
import { ImageResponse } from "next/og";
import { OG_SIZE } from "./metadata";

// The site's fonts, as files Satori can read (it takes TTF, not the WOFF2 the
// pages load).
const FONT_FILES = [
  { name: "Space Grotesk", weight: 500, url: "https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj7aUUsj.ttf" },
  { name: "Space Grotesk", weight: 700, url: "https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj4PVksj.ttf" },
  { name: "Space Mono", weight: 700, url: "https://fonts.gstatic.com/s/spacemono/v17/i7dMIFZifjKcF5UAWdDRaPpZYFI.ttf" },
] as const;

function fetchFonts() {
  return Promise.all(
    FONT_FILES.map(async ({ name, weight, url }) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Font ${name} ${String(weight)} failed to load: ${String(res.status)} from ${url}`);
      return { name, weight, style: "normal" as const, data: await res.arrayBuffer() };
    }),
  );
}

/** A share image: the element drawn at the Open Graph size in the site's
 *  fonts. Text in Space Grotesk by default; numbers set `fontFamily` to
 *  Space Mono, as on the pages. */
export async function renderOgImage(element: ReactElement): Promise<ImageResponse> {
  return new ImageResponse(element, { ...OG_SIZE, fonts: await fetchFonts() });
}
