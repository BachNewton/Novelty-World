import { notFound } from "next/navigation";
import Link from "next/link";
import { findProjectBySlug, PROJECTS, getProjectPath } from "@/shared/lib/constants";
import { Button } from "@/shared/components/ui/button";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const project = findProjectBySlug(slug);
  if (!project) return {};
  return {
    title: `${project.name} — Novelty World`,
    description: project.description,
  };
}

export function generateStaticParams() {
  return PROJECTS.map((project) => ({
    slug: getProjectPath(project).slice(1).split("/"),
  }));
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params;
  const project = findProjectBySlug(slug);

  if (!project) {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-3xl font-bold">{project.name}</h1>
      <p className="text-text-secondary">{project.description}</p>
      <p className="text-sm text-text-muted">Coming soon</p>
      <Link href="/">
        <Button variant="secondary">Back to Novelty World</Button>
      </Link>
    </div>
  );
}
