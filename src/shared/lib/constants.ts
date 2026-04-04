import type { Category, Project } from "@/shared/types";

export const CATEGORIES: Category[] = [
  { name: "Games", slug: "games", description: "Multiplayer and single-player games" },
  { name: "Tools", slug: "tools", description: "Utilities and solvers" },
];

export const PROJECTS: Project[] = [
  {
    name: "Monopoly",
    slug: "monopoly",
    description: "The classic property trading board game",
    categorySlug: "games",
    icon: "Dice5",
  },
  {
    name: "Euchre",
    slug: "euchre",
    description: "The trick-taking card game",
    categorySlug: "games",
    icon: "Spade",
  },
  {
    name: "Poker",
    slug: "poker",
    description: "Texas Hold'em and more",
    categorySlug: "games",
    icon: "Club",
  },
  {
    name: "Pi Solver",
    slug: "pi-solver",
    description: "Compute digits of Pi with various algorithms",
    categorySlug: "tools",
    icon: "Calculator",
  },
];

/** Build the full URL path for a project (e.g., "/games/monopoly") */
export function getProjectPath(project: Project): string {
  const category = CATEGORIES.find((c) => c.slug === project.categorySlug);
  if (!category) return `/${project.slug}`;

  const segments: string[] = [];
  let current: Category | undefined = category;
  while (current) {
    segments.unshift(current.slug);
    current = current.parentSlug
      ? CATEGORIES.find((c) => c.slug === current!.parentSlug)
      : undefined;
  }
  segments.push(project.slug);
  return `/${segments.join("/")}`;
}

/** Find a project by its URL slug segments (e.g., ["games", "monopoly"]) */
export function findProjectBySlug(slug: string[]): Project | undefined {
  if (slug.length < 2) return undefined;
  const projectSlug = slug[slug.length - 1];
  const categorySlug = slug[slug.length - 2];
  return PROJECTS.find(
    (p) => p.slug === projectSlug && p.categorySlug === categorySlug
  );
}

/** Get categories organized as a tree */
export function getCategoryTree(): (Category & { children: Category[] })[] {
  const roots = CATEGORIES.filter((c) => !c.parentSlug);
  return roots.map((root) => ({
    ...root,
    children: CATEGORIES.filter((c) => c.parentSlug === root.slug),
  }));
}

/** Get all projects in a category (including subcategories) */
export function getProjectsByCategory(categorySlug: string): Project[] {
  const childSlugs = CATEGORIES
    .filter((c) => c.parentSlug === categorySlug)
    .map((c) => c.slug);
  const allSlugs = [categorySlug, ...childSlugs];
  return PROJECTS.filter((p) => allSlugs.includes(p.categorySlug));
}
