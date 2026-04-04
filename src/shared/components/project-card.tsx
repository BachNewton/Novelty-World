"use client";

import Link from "next/link";
import { cn } from "@/shared/lib/utils";
import { Card } from "@/shared/components/ui/card";
import { getProjectPath } from "@/shared/lib/constants";
import type { Project } from "@/shared/types";
import { Dice5, Spade, Club, Calculator, type LucideIcon } from "lucide-react";

const ICON_MAP: Partial<Record<string, LucideIcon>> = {
  Dice5,
  Spade,
  Club,
  Calculator,
};

// Full class names so Tailwind can detect them at build time
const BRAND_ICON_STYLES = [
  "text-brand-orange shadow-brand-orange/10",
  "text-brand-blue shadow-brand-blue/10",
  "text-brand-green shadow-brand-green/10",
  "text-brand-purple shadow-brand-purple/10",
] as const;

const BRAND_BORDER_STYLES = [
  "hover:border-brand-orange/30",
  "hover:border-brand-blue/30",
  "hover:border-brand-green/30",
  "hover:border-brand-purple/30",
] as const;

interface ProjectCardProps {
  project: Project;
  index: number;
}

export function ProjectCard({ project, index }: ProjectCardProps) {
  const Icon = ICON_MAP[project.icon];
  const brandIndex = index % BRAND_ICON_STYLES.length;

  return (
    <Link href={getProjectPath(project)}>
      <Card
        className={cn(
          "group relative p-5 transition-all duration-200",
          "hover:-translate-y-1 hover:shadow-lg",
          BRAND_BORDER_STYLES[brandIndex]
        )}
      >
        <div className="flex items-start gap-4">
          {Icon && (
            <div
              className={cn(
                "rounded-md bg-surface-elevated p-2.5",
                BRAND_ICON_STYLES[brandIndex]
              )}
            >
              <Icon size={22} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-text-primary">{project.name}</h3>
            <p className="mt-1 text-sm text-text-muted line-clamp-2">
              {project.description}
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
