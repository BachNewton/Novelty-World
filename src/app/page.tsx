import { ProfileEditor } from "@/shared/components/profile-editor";
import { ProjectRow } from "@/shared/components/project-row";
import {
  getCategoryTree,
  PROJECTS,
} from "@/shared/lib/constants";

export default function HomePage() {
  const categoryTree = getCategoryTree();

  let colorIndex = 0;

  return (
    <div className="relative flex h-screen flex-col">
      {/* Stars - scale with viewport width */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[20vw]">
        {/* Orange star - top left */}
        <svg className="absolute left-[2vw] top-[1vw] h-[10vw] w-[10vw]" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
          <circle cx="60" cy="60" r="50" fill="#ff8c00" opacity="0.15" />
          <polygon points="60,5 72,42 110,42 79,64 90,100 60,78 30,100 41,64 10,42 48,42" fill="#ff8c00" />
        </svg>

        {/* Pink star - top right, slightly lower */}
        <svg className="absolute right-[8vw] top-[2vw] h-[7vw] w-[7vw]" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
          <circle cx="60" cy="60" r="50" fill="#FF2D95" opacity="0.12" />
          <polygon points="60,5 72,42 110,42 79,64 90,100 60,78 30,100 41,64 10,42 48,42" fill="#FF2D95" />
        </svg>

        {/* Green star - top right, lower */}
        <svg className="absolute right-[2vw] top-[7vw] h-[5vw] w-[5vw]" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
          <circle cx="60" cy="60" r="50" fill="#22c55e" opacity="0.12" />
          <polygon points="60,5 72,42 110,42 79,64 90,100 60,78 30,100 41,64 10,42 48,42" fill="#22c55e" />
        </svg>
      </div>

      <div className="relative z-10 flex h-full flex-col">
        {/* Header — fixed at top, doesn't scroll */}
        <header className="shrink-0 px-4 pb-4 pt-8 text-center sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
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
              Kyle&apos;s novel ideas built with imagination and code
            </p>
            <div className="mx-auto mt-4 flex justify-center gap-1.5">
              <div className="h-1 w-20 rounded-full bg-brand-orange" />
              <div className="h-1 w-20 rounded-full bg-brand-blue" />
              <div className="h-1 w-20 rounded-full bg-brand-pink" />
              <div className="h-1 w-20 rounded-full bg-brand-green" />
            </div>
            <ProfileEditor />
          </div>
        </header>

        {/* Projects — scrollable area with gradient fade */}
        <div className="relative min-h-0 flex-1">
          <main className="h-full space-y-8 overflow-y-auto px-4 pb-44 pt-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-5xl">
              {categoryTree.map((category) => {
                const directProjects = PROJECTS.filter(
                  (p) => p.categorySlug === category.slug,
                );
                const hasContent =
                  directProjects.length > 0 || category.children.length > 0;
                if (!hasContent) return null;

                return (
                  <section key={category.slug} className="mb-8">
                    <h2 className="mb-3 text-2xl font-semibold text-brand-orange">
                      {category.name}
                    </h2>

                    {/* Root category's own projects */}
                    {directProjects.length > 0 && (
                      <div className="divide-y divide-border-default">
                        {directProjects.map((project) => (
                          <ProjectRow
                            key={project.slug}
                            project={project}
                            index={colorIndex++}
                          />
                        ))}
                      </div>
                    )}

                    {/* Subcategories */}
                    {category.children.map((child) => {
                      const childProjects = PROJECTS.filter(
                        (p) => p.categorySlug === child.slug,
                      );
                      if (childProjects.length === 0) return null;

                      return (
                        <div key={child.slug} className="mt-4 ml-6">
                          <h3 className="mb-2 text-xl font-medium text-brand-blue">
                            {child.name}
                          </h3>
                          <div className="divide-y divide-border-default">
                            {childProjects.map((project) => (
                              <ProjectRow
                                key={project.slug}
                                project={project}
                                index={colorIndex++}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          </main>

        </div>
      </div>

      {/* Version badge */}
      <span className="fixed bottom-2 left-3 z-20 select-none text-xs text-text-primary">
        v{process.env.APP_VERSION}
      </span>

      {/* Wave footer */}
      <svg
        className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-32 w-full sm:h-40"
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="0" y="130" width="1200" height="70" fill="#0a0a0a" />
        <path
          d="M0 80 Q140 40 280 80 Q420 120 560 80 Q700 40 840 80 Q980 120 1200 80 L1200 200 L0 200 Z"
          fill="#0a5e60"
          opacity="0.6"
        />
        <path
          d="M0 110 Q160 70 320 110 Q480 150 640 110 Q800 70 960 110 Q1080 140 1200 110 L1200 200 L0 200 Z"
          fill="#00CED1"
          opacity="0.4"
        />
        <path
          d="M0 140 Q140 120 280 140 Q420 160 560 140 Q700 120 840 140 Q960 155 1200 140 L1200 200 L0 200 Z"
          fill="#00CED1"
          opacity="0.25"
        />
        <path
          d="M0 165 Q180 150 360 165 Q540 180 720 165 Q900 150 1200 165 L1200 200 L0 200 Z"
          fill="#0a5e60"
          opacity="0.4"
        />
      </svg>
    </div>
  );
}
