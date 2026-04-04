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

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const Icon = ICON_MAP[project.icon];

  return (
    <Link href={getProjectPath(project)}>
      <Card
        className={cn(
          "group relative p-5 transition-all duration-200 border-brand-blue/20",
          "hover:-translate-y-1 hover:border-brand-pink/40 hover:shadow-lg"
        )}
      >
        <div className="flex items-start gap-4">
          {Icon && (
            <div className="rounded-md bg-surface-elevated p-2.5 text-brand-orange">
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
