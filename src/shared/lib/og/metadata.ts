import type { Metadata } from "next";

// What a page's metadata says about the share images, apart from the code that
// draws them, so pages import no renderer.

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";
export const DEFAULT_OG_ALT = "Novelty World — Games, tools, and ideas";

/** One entry of a page's `openGraph.images`. */
export type OgImageDescriptor = Extract<NonNullable<NonNullable<Metadata["openGraph"]>["images"]>, readonly unknown[]>[number];

/** The site's own card, which the root opengraph-image draws. */
export const DEFAULT_OG_IMAGE = {
  url: "/opengraph-image",
  ...OG_SIZE,
  type: OG_CONTENT_TYPE,
  alt: DEFAULT_OG_ALT,
} satisfies OgImageDescriptor;
