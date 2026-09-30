import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { BRAND_TEXT_COLORS } from "@/shared/lib/brand-colors";
import type { Credit } from "@/shared/lib/credits";
import { CREDIT_GROUPS } from "./credit-groups";

export const metadata: Metadata = {
  title: "Credits — Novelty World",
  description: "The artists, photographers and projects whose work Novelty World uses",
};

function LicenseChip({ license }: { license: Credit["license"] }) {
  const chip =
    "inline-block rounded-full border border-border-hover px-2 py-0.5 text-xs text-text-secondary";
  if (license.url === null) return <span className={chip}>{license.name}</span>;
  return (
    <a
      href={license.url}
      target="_blank"
      rel="noreferrer"
      className={`${chip} transition-colors hover:border-brand-pink hover:text-text-primary`}
    >
      {license.name}
    </a>
  );
}

function CreditItem({ credit }: { credit: Credit }) {
  return (
    <li className="break-words rounded-md border border-border-default bg-surface-secondary px-4 py-3">
      <a
        href={credit.source}
        target="_blank"
        rel="noreferrer"
        className="group font-medium text-text-primary hover:text-brand-blue"
      >
        {credit.work}
        <ExternalLink size={14} className="ml-1.5 inline align-[-1px] text-text-muted group-hover:text-brand-blue" />
      </a>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-text-secondary">
        <span>by {credit.author}</span>
        <LicenseChip license={credit.license} />
      </div>
      {credit.attribution && (
        <p className="mt-2 font-mono text-xs text-text-muted">{credit.attribution}</p>
      )}
    </li>
  );
}

export default function CreditsPage() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 pb-16 pt-8 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
      >
        <ArrowLeft size={16} />
        Novelty World
      </Link>

      <header className="mt-6">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Credits</h1>
        <div className="mt-4 flex gap-1.5">
          <div className="h-1 w-12 rounded-full bg-brand-orange" />
          <div className="h-1 w-12 rounded-full bg-brand-blue" />
          <div className="h-1 w-12 rounded-full bg-brand-pink" />
          <div className="h-1 w-12 rounded-full bg-brand-green" />
        </div>
        <p className="mt-4 text-text-secondary">
          Novelty World stands on the work of generous artists, photographers and
          open projects. Thank you!
        </p>
      </header>

      <main className="mt-10 space-y-10">
        {CREDIT_GROUPS.map((group, index) => (
          <section key={group.name}>
            <h2 className="mb-3 text-2xl font-semibold">
              <Link
                href={group.href}
                className={`${BRAND_TEXT_COLORS[index % BRAND_TEXT_COLORS.length]} hover:underline`}
              >
                {group.name}
              </Link>
            </h2>
            <ul className="space-y-2">
              {group.credits.map((credit) => (
                <CreditItem key={credit.source + credit.work} credit={credit} />
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
