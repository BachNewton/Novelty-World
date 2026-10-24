"use client";

import { cn } from "@/shared/lib/utils";
import { formatTime } from "../logic";
import type { Book, Chapter, Photo } from "../types";
import { BookArt } from "./book-art";

export function photoAlt(chapter: Chapter, photo: Photo): string {
  return photo.caption ?? `${chapter.title}, photo ${String(chapter.photos.indexOf(photo) + 1)}`;
}

export function photoCount(book: Book): number {
  return book.chapters.reduce((sum, c) => sum + c.photos.length, 0);
}

/** Every photo in the book, by chapter; picking one opens it in the viewer. */
export function PhotoGallery({
  book,
  showing,
  onView,
}: {
  book: Book;
  showing: Photo | undefined;
  onView: (photo: Photo) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {book.chapters.map((chapter, i) =>
        chapter.photos.length === 0 ? null : (
          <div key={`${String(i)}-${chapter.audio}`} className="flex flex-col gap-2">
            <h4 className="break-words text-xs text-text-secondary">{chapter.title}</h4>
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {chapter.photos.map((photo) => (
                <li key={`${String(photo.at)}-${photo.image}`}>
                  <button
                    type="button"
                    title={formatTime(photo.at)}
                    aria-label={`View ${photoAlt(chapter, photo)}`}
                    aria-current={photo === showing}
                    data-testid="gallery-photo"
                    onClick={() => onView(photo)}
                    className={cn(
                      "block w-full rounded-lg ring-offset-2 ring-offset-surface-primary transition-transform hover:scale-105",
                      photo === showing && "ring-2 ring-brand-pink",
                    )}
                  >
                    <BookArt path={photo.image} alt="" sizes="6rem" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}
