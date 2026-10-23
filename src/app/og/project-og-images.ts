import type { Project } from "@/shared/types";
import { DEFAULT_OG_IMAGE, OG_CONTENT_TYPE, OG_SIZE, type OgImageDescriptor } from "@/shared/lib/og/metadata";
import type { ProjectOgImage } from "@/shared/lib/og/project-card";

// The projects with a share image of their own, each in its project's
// `og-image.tsx`. Served at /og/<slug>; every other project shares the site's.
export const PROJECT_OG_IMAGES: Partial<Record<string, () => Promise<ProjectOgImage>>> = {
  "for-the-stats-2": () => import("@/projects/for-the-stats-2/og-image").then((m) => m.ogImage),
  audiobook: () => import("@/projects/audiobook/og-image").then((m) => m.ogImage),
};

/** The share image a project's pages show: its own, or the site's. */
export async function projectOgImage(project: Project): Promise<OgImageDescriptor> {
  const load = PROJECT_OG_IMAGES[project.slug];
  if (!load) return DEFAULT_OG_IMAGE;
  const { alt } = await load();
  return { url: `/og/${project.slug}`, ...OG_SIZE, type: OG_CONTENT_TYPE, alt };
}
