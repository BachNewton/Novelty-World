import { FAMILY_TREE_CREDITS } from "@/projects/family-tree/credits";
import { HALO_CREDITS } from "@/projects/halo/credits";
import { POKEMON_CREDITS } from "@/projects/pokemon/credits";
import { RPG_CREDITS } from "@/projects/rpg/credits";
import { SHIPWRIGHT_CREDITS } from "@/projects/shipwright/credits";
import { getProjectPath, PROJECTS } from "@/shared/lib/constants";
import { SITE_CREDITS, type Credit } from "@/shared/lib/credits";

// Each project's credits, by project slug. A project that shows anyone
// else's work registers its list here.
export const PROJECT_CREDITS: Partial<Record<string, readonly Credit[]>> = {
  "family-tree": FAMILY_TREE_CREDITS,
  halo: HALO_CREDITS,
  pokemon: POKEMON_CREDITS,
  rpg: RPG_CREDITS,
  shipwright: SHIPWRIGHT_CREDITS,
};

export interface CreditGroup {
  name: string;
  href: string;
  credits: readonly Credit[];
}

// The site's own credits first, then each project's in directory order.
export const CREDIT_GROUPS: readonly CreditGroup[] = [
  { name: "Novelty World", href: "/", credits: SITE_CREDITS },
  ...PROJECTS.flatMap((project) => {
    const credits = PROJECT_CREDITS[project.slug];
    return credits ? [{ name: project.name, href: getProjectPath(project), credits }] : [];
  }),
];
