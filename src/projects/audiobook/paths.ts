import { getProjectPath, PROJECTS } from "@/shared/lib/constants";

const project = PROJECTS.find((p) => p.slug === "audiobook");
if (!project) throw new Error("The audiobook project isn't registered");

export const AUDIOBOOK_PATH = getProjectPath(project);

export function bookPath(slug: string): string {
  return `${AUDIOBOOK_PATH}/${slug}`;
}
