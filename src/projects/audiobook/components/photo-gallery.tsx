"use client";

import { Images } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { formatTime } from "../logic";
import type { Book, Chapter, Photo } from "../types";
import { BookArt } from "./book-art";

export function photoAlt(chapter: Chapter, photo: Photo): string {
  return photo.caption ?? `${chapter.title}, photo ${String(chapter.photos.indexOf(photo) + 1)}`;
}

/** Every photo in the book, by chapter; picking one plays from the moment it's described. */
export function PhotoGallery({
  book,
  showing,
  onPick,
}: {
  book: Book;
  showing: Photo | undefined;
  onPick: (chapter: number, at: number) => void;
}) {
  const count = book.chapters.reduce((sum, c) => sum + c.photos.length, 0);
  if (count === 0) return null;

  return (
    <details className="group flex flex-col gap-2" aria-label="Photos">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-pink">
        <Images size={16} aria-hidden />
        Photos
        <span className="font-mono text-text-muted">{count}</span>
      </summary>
      <div className="mt-2 flex flex-col gap-4">
        {book.chapters.map((chapter, i) =>
          chapter.photos.length === 0 ? null : (
            <div key={`${String(i)}-${chapter.audio}`} className="flex flex-col gap-2">
              <h4 className="truncate text-xs text-text-secondary">{chapter.title}</h4>
              <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {chapter.photos.map((photo) => (
                  <li key={`${String(photo.at)}-${photo.image}`}>
                    <button
                      type="button"
                      title={formatTime(photo.at)}
                      aria-label={`${photoAlt(chapter, photo)}, at ${formatTime(photo.at)}`}
                      aria-current={photo === showing}
                      data-testid="gallery-photo"
                      onClick={() => onPick(i, photo.at)}
                      className={cn(
                        "block w-full rounded-lg ring-offset-2 ring-offset-surface-primary transition-transform hover:scale-105",
                        photo === showing && "ring-2 ring-brand-pink",
                      )}
                    >
                      <BookArt path={photo.image} alt="" sizes="6rem" className="rounded-lg" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </div>
    </details>
  );
}
