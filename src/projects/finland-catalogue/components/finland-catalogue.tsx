"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { IDEAS } from "../ideas";
import { CatalogueGrid } from "./catalogue-grid";
import { IdeaDetail } from "./idea-detail";

const BASE_PATH = "/tools/travel/finland-catalogue";

export function FinlandCatalogue() {
  const pathname = usePathname();

  // Strip the base path; whatever remains is the in-project route.
  const rest = pathname.startsWith(BASE_PATH)
    ? pathname.slice(BASE_PATH.length).replace(/^\/|\/$/g, "")
    : "";

  if (!rest) {
    return <CatalogueGrid basePath={BASE_PATH} />;
  }

  const idea = IDEAS.find((i) => i.slug === rest);

  if (!idea) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-bold text-text-primary">Idea not found</h1>
        <p className="text-text-secondary">
          We don&apos;t have an entry for{" "}
          <code className="rounded bg-surface-elevated px-1.5 py-0.5 text-sm">
            {rest}
          </code>
          .
        </p>
        <Link
          href={BASE_PATH}
          className="inline-flex items-center gap-1.5 text-sm text-brand-pink hover:underline"
        >
          <ArrowLeft size={16} />
          Back to catalogue
        </Link>
      </div>
    );
  }

  return <IdeaDetail idea={idea} basePath={BASE_PATH} />;
}
