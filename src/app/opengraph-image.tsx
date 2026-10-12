import { DefaultOgCard } from "@/shared/lib/og/default-card";
import { DEFAULT_OG_ALT, OG_CONTENT_TYPE, OG_SIZE } from "@/shared/lib/og/metadata";
import { renderOgImage } from "@/shared/lib/og/og-image";

export const alt = DEFAULT_OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(<DefaultOgCard />);
}
