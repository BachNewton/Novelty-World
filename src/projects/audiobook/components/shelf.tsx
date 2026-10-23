"use client";

import Link from "next/link";
import { Headphones } from "lucide-react";
import { bookLength, clampPlace, elapsedInBook, formatLength } from "../logic";
import { bookPath } from "../paths";
import { useListening } from "../store";
import type { Book } from "../types";
import { BookArt } from "./book-art";

export function Shelf({ books }: { books: Book[] }) {
  const progress = useListening((s) => s.books);

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center gap-3">
        <span className="rounded-md bg-surface-elevated p-2 text-brand-orange">
          <Headphones size={28} aria-hidden />
        </span>
        <h1 className="text-3xl font-bold">
          Audio<span className="text-brand-pink">book</span>
        </h1>
      </header>

      {books.length === 0 && <p className="py-12 text-center text-text-muted">The shelf is empty.</p>}

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {books.map((book) => {
          const length = bookLength(book);
          const saved = progress[book.slug];
          const done = saved ? elapsedInBook(book, clampPlace(book, saved)) / length : 0;
          return (
            <li key={book.slug}>
              <Link
                href={bookPath(book.slug)}
                className="group flex flex-col gap-2 rounded-xl p-1 transition-colors hover:bg-surface-secondary"
                data-testid="shelf-book"
              >
                <BookArt path={book.cover} alt="" className="transition-transform group-hover:scale-[1.02]" />
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-surface-elevated"
                  role="progressbar"
                  aria-label="Listened"
                  aria-valuenow={Math.round(done * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full rounded-full bg-brand-orange" style={{ width: `${String(done * 100)}%` }} />
                </div>
                <div className="px-1">
                  <div className="font-bold leading-tight">{book.title}</div>
                  <div className="text-sm text-text-secondary">{book.author}</div>
                  <div className="text-xs text-text-muted">{formatLength(length)}</div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
