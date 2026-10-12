import type { ReactElement, ReactNode } from "react";
import { PROJECTS } from "@/shared/lib/constants";
import { OG_COLORS } from "./colors";
import { BrandBars, CardBackground, Wordmark } from "./default-card";

/** What a project's share image module exports: the card, and its alt text
 *  for the link preview. */
export interface ProjectOgImage {
  alt: string;
  Card: () => ReactElement;
}

/** The frame a project's share card usually sits in: the site's wordmark, the
 *  project's name and home-page tagline on the left, and the project's own art
 *  (the children) on the right. A project with its own style can skip it and
 *  draw the whole card. */
export function ProjectOgCard({ slug, children }: { slug: string; children: ReactNode }) {
  const project = PROJECTS.find((p) => p.slug === slug);
  if (!project) throw new Error(`No project with slug "${slug}"`);
  return (
    <CardBackground stars={false}>
      <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 40, padding: "56px 56px 190px" }}>
        <div style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <Wordmark fontSize={30} />
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ fontSize: 80, fontWeight: 700, lineHeight: 1 }}>{project.name}</div>
            <BrandBars width={64} height={4} />
            <div style={{ fontSize: 32, fontWeight: 500, lineHeight: 1.3, color: OG_COLORS["text-secondary"] }}>
              {project.description}
            </div>
          </div>
        </div>
        <div style={{ display: "flex" }}>{children}</div>
      </div>
    </CardBackground>
  );
}
