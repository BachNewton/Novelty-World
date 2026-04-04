import { ProjectCard } from "@/shared/components/project-card";
import {
  CATEGORIES,
  PROJECTS,
  getProjectsByCategory,
  getCategoryTree,
} from "@/shared/lib/constants";

export default function HomePage() {
  const categoryTree = getCategoryTree();

  return (
    <div className="min-h-screen px-4 py-12 sm:px-6 lg:px-8">
      <header className="mx-auto max-w-5xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          <span className="text-brand-orange">N</span>
          <span className="text-brand-blue">o</span>
          <span className="text-brand-pink">v</span>
          <span className="text-brand-green">e</span>
          <span>lty </span>
          <span className="text-brand-orange">W</span>
          <span className="text-brand-blue">o</span>
          <span className="text-brand-pink">r</span>
          <span className="text-brand-green">l</span>
          <span>d</span>
        </h1>
        <p className="mt-3 text-text-secondary">
          Kyle's novel ideas built with imagination and code
        </p>
        <div className="mx-auto mt-4 flex justify-center gap-1.5">
          <div className="h-1 w-20 rounded-full bg-brand-orange" />
          <div className="h-1 w-20 rounded-full bg-brand-blue" />
          <div className="h-1 w-20 rounded-full bg-brand-pink" />
          <div className="h-1 w-20 rounded-full bg-brand-green" />
        </div>
      </header>

      <main className="mx-auto mt-12 max-w-5xl space-y-10">
        {categoryTree.map((category) => {
          const projects = getProjectsByCategory(category.slug);
          if (projects.length === 0) return null;

          return (
            <section key={category.slug}>
              <h2 className="mb-4 text-lg font-semibold text-text-secondary">
                {category.name}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {projects.map((project) => (
                  <ProjectCard key={project.slug} project={project} />
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
