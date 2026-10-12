import { renderOgImage } from "@/shared/lib/og/og-image";
import { PROJECT_OG_IMAGES } from "../project-og-images";

// Only the projects with an image of their own, each drawn once at build time.
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PROJECT_OG_IMAGES).map((project) => ({ project }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  const load = PROJECT_OG_IMAGES[project];
  if (!load) return new Response(null, { status: 404 });
  const { Card } = await load();
  return renderOgImage(<Card />);
}
