import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { IDEAS } from "../ideas";
import { IdeaCard } from "./idea-card";

export function CatalogueGrid({ basePath }: { basePath: string }) {
  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 self-start text-sm text-text-secondary transition-colors hover:text-brand-pink"
          >
            <ArrowLeft size={16} />
            Back to Novelty World
          </Link>

          <div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              <span className="text-brand-blue">Finland</span>{" "}
              <span className="text-text-primary">Catalogue</span>
            </h1>
            <p className="mt-2 text-text-secondary">
              Hand-picked things to do in Finland — for friends, family, and anyone planning a visit.
            </p>
          </div>
        </div>

        {IDEAS.length === 0 ? (
          <div className="rounded-lg border border-border-default bg-surface-secondary p-8 text-center text-text-secondary">
            No ideas yet — add some with the{" "}
            <code className="rounded bg-surface-elevated px-1.5 py-0.5 text-xs">
              /add-finland-idea
            </code>{" "}
            skill.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {IDEAS.map((idea) => (
              <IdeaCard key={idea.slug} idea={idea} basePath={basePath} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
