import type { Category, Project } from "@/shared/types";

export const CATEGORIES: Category[] = [
  { name: "Games", slug: "games", description: "Multiplayer and single-player games" },
  { name: "Trivia", slug: "trivia", parentSlug: "games", description: "Test your knowledge" },
  { name: "Card Games", slug: "card-games", parentSlug: "games", description: "Classic card games" },
  { name: "2D Games", slug: "2d-games", parentSlug: "games", description: "Two-dimensional game worlds" },
  { name: "3D Games", slug: "3d-games", parentSlug: "games", description: "Three-dimensional game worlds" },
  { name: "Board Games", slug: "board-games", parentSlug: "games", description: "Classic board games" },
  { name: "Tools", slug: "tools", description: "Utilities and solvers" },
];

export const PROJECTS: Project[] = [
  {
    name: "Monopoly",
    slug: "monopoly",
    description: "The classic property trading board game",
    categorySlug: "board-games",
    icon: "Dice5",
  },
  {
    name: "Euchre",
    slug: "euchre",
    description: "The trick-taking card game",
    categorySlug: "card-games",
    icon: "Spade",
  },
  {
    name: "Poker",
    slug: "poker",
    description: "Texas Hold'em and more",
    categorySlug: "card-games",
    icon: "Club",
  },
  {
    name: "Tic Tac Toe",
    slug: "tic-tac-toe",
    description: "The classic game of X's and O's",
    categorySlug: "games",
    icon: "Hash",
  },
  {
    name: "Burraco",
    slug: "burraco",
    description: "The Italian rummy card game",
    categorySlug: "card-games",
    icon: "Club",
  },
  {
    name: "Pokémon Ranker",
    slug: "pokemon-ranker",
    description: "Rank and tier your favorite Pokémon",
    categorySlug: "games",
    icon: "Star",
  },
  {
    name: "RPG",
    slug: "rpg",
    description: "A 2D role-playing game adventure",
    categorySlug: "2d-games",
    icon: "Swords",
  },
  {
    name: "Labyrinth",
    slug: "labyrinth",
    description: "Navigate the shifting maze board game",
    categorySlug: "board-games",
    icon: "Grid3x3",
  },
  {
    name: "Flag Game",
    slug: "flag-game",
    description: "Test your knowledge of world flags",
    categorySlug: "trivia",
    icon: "Flag",
  },
  {
    name: "Halo",
    slug: "halo",
    description: "Guess the Halo map from its image",
    categorySlug: "trivia",
    icon: "Crosshair",
  },
  {
    name: "Fortuna",
    slug: "fortuna",
    description: "A 3D game of fortune and chance",
    categorySlug: "3d-games",
    icon: "Box",
  },
  {
    name: "Network Test",
    slug: "network-test",
    description: "Multiplayer network diagnostics and benchmarking",
    categorySlug: "tools",
    icon: "Activity",
  },
  {
    name: "Pi Solver",
    slug: "pi-solver",
    description: "Compute digits of Pi with various algorithms",
    categorySlug: "tools",
    icon: "Calculator",
  },
  {
    name: "Open World Test",
    slug: "open-world-test",
    description: "Real-time peer connection mesh visualizer",
    categorySlug: "tools",
    icon: "Globe",
  },
  {
    name: "For The Stats 2",
    slug: "for-the-stats-2",
    description: "Advanced sports statistics and analytics",
    categorySlug: "tools",
    icon: "BarChart3",
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
