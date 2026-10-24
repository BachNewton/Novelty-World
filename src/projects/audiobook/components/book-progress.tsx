import { bookLength, elapsedInBook, formatLength } from "../logic";
import type { Book, Place } from "../types";

/** The whole book as a row of its chapters, each as long as it plays, filled as far as the listener has got. */
export function BookProgress({ book, place }: { book: Book; place: Place }) {
  const total = bookLength(book);
  const elapsed = elapsedInBook(book, place);
  const left = formatLength(total - elapsed);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" title={`${left} left in the book`}>
      <div
        className="flex h-1.5 flex-1 gap-0.5"
        role="progressbar"
        aria-label="Through the book"
        aria-valuenow={Math.round((elapsed / total) * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {book.chapters.map((c, i) => {
          const filled = i < place.chapter ? 1 : i === place.chapter ? place.position / c.duration : 0;
          return (
            <div
              key={`${String(i)}-${c.audio}`}
              className="h-full min-w-1 basis-0 overflow-hidden rounded-full bg-surface-elevated"
              style={{ flexGrow: c.duration }}
            >
              <div className="h-full bg-brand-pink" style={{ width: `${String(filled * 100)}%` }} />
            </div>
          );
        })}
      </div>
      <span className="shrink-0 font-mono text-xs text-text-muted" aria-label="Left in the book">
        {left}
      </span>
    </div>
  );
}
