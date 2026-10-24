"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useHydrated } from "@/shared/lib/use-hydrated";
import { useCatalog } from "../catalog";
import { AUDIOBOOK_PATH } from "../paths";
import { Player } from "./player";
import { Shelf } from "./shelf";

/** The shelf at the project's path, and each book's player at `<path>/<book slug>`. */
export function Audiobook() {
  const pathname = usePathname();
  const catalog = useCatalog();
  // Progress lives in this browser's storage, so nothing that shows it renders on the server.
  const hydrated = useHydrated();

  const slug = pathname.startsWith(AUDIOBOOK_PATH) ? pathname.slice(AUDIOBOOK_PATH.length).replace(/^\/|\/$/g, "") : "";

  if (catalog.status === "error") {
    return (
      <Page>
        <p role="alert" className="rounded-md border-2 border-brand-pink px-3 py-2 text-sm text-brand-pink">
          {catalog.message}
        </p>
      </Page>
    );
  }
  if (catalog.status === "loading" || !hydrated) {
    return (
      <Page>
        <p className="py-12 text-center text-text-muted">Loading…</p>
      </Page>
    );
  }

  if (slug === "") return <Shelf books={catalog.catalog.books} />;

  const book = catalog.catalog.books.find((b) => b.slug === slug);
  if (!book) {
    return (
      <Page>
        <p className="py-12 text-center text-text-secondary">No book called “{slug}” is on the shelf.</p>
        <Link href={AUDIOBOOK_PATH} className="mx-auto inline-flex items-center gap-2 text-brand-blue hover:underline">
          <ArrowLeft size={16} aria-hidden /> Back to the shelf
        </Link>
      </Page>
    );
  }
  return <Player key={book.slug} book={book} />;
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-6">{children}</div>;
}
