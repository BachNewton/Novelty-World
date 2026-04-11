"use client";

import Link from "next/link";
import { getProjectPath } from "@/shared/lib/constants";
import type { Project } from "@/shared/types";
import {
  Dice5,
  Spade,
  Club,
  Hash,
  Calculator,
  Activity,
  Globe,
  Star,
  Swords,
  BarChart3,
  Grid3x3,
  Flag,
  Box,
  Crosshair,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Partial<Record<string, LucideIcon>> = {
  Dice5,
  Spade,
  Club,
  Hash,
  Calculator,
  Activity,
  Globe,
  Star,
  Swords,
  BarChart3,
  Grid3x3,
  Flag,
  Box,
  Crosshair,
};

const BRAND_COLORS = [
  "text-brand-orange",
  "text-brand-blue",
  "text-brand-pink",
  "text-brand-green",
] as const;

interface ProjectRowProps {
  project: Project;
  index: number;
}

export function ProjectRow({ project, index }: ProjectRowProps) {
  const Icon = ICON_MAP[project.icon];
  const iconColor = BRAND_COLORS[index % BRAND_COLORS.length];

  return (
    <Link href={getProjectPath(project)} className="block">
      <div className="group flex items-center gap-4 rounded-md border-l-2 border-transparent px-2 py-3 transition-colors hover:border-brand-pink hover:bg-surface-secondary">
        {Icon && (
          <div className={`shrink-0 rounded-md bg-surface-elevated p-2 ${iconColor}`}>
            <Icon size={20} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <span className="font-medium text-text-primary">
            {project.name}
          </span>
          <span className="ml-3 hidden text-sm text-text-secondary sm:inline">
            {project.description}
          </span>
          <p className="truncate text-sm text-text-secondary sm:hidden">
            {project.description}
          </p>
        </div>
        <ChevronRight
          size={18}
          className="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-text-secondary"
        />
      </div>
    </Link>
  );
}
