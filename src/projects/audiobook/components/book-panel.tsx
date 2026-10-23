"use client";

import { AudioLines, Bookmark as BookmarkIcon, Images, ListOrdered, X, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { clampPlace, formatTime, sortBookmarks } from "../logic";
import type { Book, Bookmark, Photo } from "../types";
import { PhotoGallery, photoCount } from "./photo-gallery";

export type PanelTab = "chapters" | "bookmarks" | "photos";

/**
 * The book's chapters, bookmarks and photos, a tab each. Beside the player on
 * a wide screen; on a narrow one, a sheet over it that `open` shows, and that
 * closes on a pick so the listener is back at the player.
 */
export function BookPanel({
  book,
  chapter,
  playing,
  bookmarks,
  showing,
  open,
  tab,
  onTab,
  onClose,
  onGo,
  onRemoveBookmark,
  onViewPhoto,
}: {
  book: Book;
  chapter: number;
  playing: boolean;
  bookmarks: Bookmark[];
  showing: Photo | undefined;
  open: boolean;
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  onClose: () => void;
  onGo: (chapter: number, position: number) => void;
  onRemoveBookmark: (id: string) => void;
  onViewPhoto: (photo: Photo) => void;
}) {
  const photos = photoCount(book);
  const go = (to: number, position: number) => {
    onGo(to, position);
    onClose();
  };

  return (
    <section
      aria-label="Chapters, bookmarks and photos"
      className={cn(
        "fixed inset-0 z-20 flex-col gap-3 bg-surface-primary px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        "[@media(min-width:48rem)_and_(min-height:31rem)]:static [@media(min-width:48rem)_and_(min-height:31rem)]:z-auto [@media(min-width:48rem)_and_(min-height:31rem)]:flex [@media(min-width:48rem)_and_(min-height:31rem)]:min-h-0 [@media(min-width:48rem)_and_(min-height:31rem)]:min-w-0 [@media(min-width:48rem)_and_(min-height:31rem)]:flex-1 [@media(min-width:48rem)_and_(min-height:31rem)]:p-0",
        open ? "flex" : "hidden",
      )}
    >
      <div className="flex shrink-0 items-center gap-1" role="tablist">
        <TabButton tab="chapters" current={tab} onTab={onTab} icon={ListOrdered} label="Chapters" count={book.chapters.length} tone="text-brand-blue" />
        <TabButton tab="bookmarks" current={tab} onTab={onTab} icon={BookmarkIcon} label="Bookmarks" count={bookmarks.length} tone="text-brand-green" />
        {photos > 0 && <TabButton tab="photos" current={tab} onTab={onTab} icon={Images} label="Photos" count={photos} tone="text-brand-pink" />}
        <button
          type="button"
          aria-label="Back to the player"
          onClick={onClose}
          className="ml-auto rounded-md p-2 text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary [@media(min-width:48rem)_and_(min-height:31rem)]:hidden"
        >
          <X size={22} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="tabpanel">
        {tab === "chapters" && <Chapters book={book} current={chapter} playing={playing} onGo={go} />}
        {tab === "bookmarks" && <Bookmarks book={book} bookmarks={bookmarks} onGo={go} onRemove={onRemoveBookmark} />}
        {tab === "photos" && <PhotoGallery book={book} showing={showing} onView={onViewPhoto} />}
      </div>
    </section>
  );
}


function TabButton({
  tab,
  current,
  onTab,
  icon: Icon,
  label,
  count,
  tone,
}: {
  tab: PanelTab;
  current: PanelTab;
  onTab: (tab: PanelTab) => void;
  icon: LucideIcon;
  label: string;
  count: number;
  tone: string;
}) {
  const selected = tab === current;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      aria-label={label}
      title={label}
      onClick={() => onTab(tab)}
      className={cn(
        "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold transition-colors",
        selected ? cn("bg-surface-elevated", tone) : "text-text-muted hover:text-text-primary",
      )}
    >
      <Icon size={16} aria-hidden />
      <span className="font-mono">{count}</span>
    </button>
  );
}

function Chapters({ book, current, playing, onGo }: { book: Book; current: number; playing: boolean; onGo: (chapter: number, position: number) => void }) {
  return (
    <ol className="flex flex-col gap-1">
      {book.chapters.map((c, i) => {
        const isCurrent = i === current;
        return (
          <li key={`${String(i)}-${c.audio}`}>
            <button
              type="button"
              data-testid="chapter-row"
              aria-current={isCurrent}
              onClick={() => onGo(i, 0)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-elevated",
                isCurrent ? "bg-surface-elevated" : "bg-surface-secondary",
              )}
            >
              <span className={cn("w-6 shrink-0 text-right font-mono text-sm", isCurrent ? "text-brand-orange" : "text-text-muted")}>
                {isCurrent && playing ? <AudioLines size={16} className="ml-auto animate-pulse" aria-hidden /> : i + 1}
              </span>
              <span className={cn("min-w-0 flex-1 break-words", isCurrent && "font-bold text-brand-orange")}>{c.title}</span>
              <span className="shrink-0 font-mono text-xs text-text-muted">{formatTime(c.duration)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Bookmarks({
  book,
  bookmarks,
  onGo,
  onRemove,
}: {
  book: Book;
  bookmarks: Bookmark[];
  onGo: (chapter: number, position: number) => void;
  onRemove: (id: string) => void;
}) {
  if (bookmarks.length === 0) {
    return (
      <p className="flex items-center justify-center gap-2 py-12 text-sm text-text-muted">
        <BookmarkIcon size={16} aria-hidden /> None yet
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {sortBookmarks(bookmarks).map((mark) => {
        const place = clampPlace(book, mark);
        return (
          <li key={mark.id} data-testid="bookmark-row" className="flex items-center gap-1 rounded-lg bg-surface-secondary">
            <button
              type="button"
              onClick={() => onGo(place.chapter, place.position)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-elevated"
            >
              <span className="font-mono text-sm text-brand-green">{formatTime(place.position)}</span>
              <span className="min-w-0 break-words text-sm">{book.chapters[place.chapter].title}</span>
            </button>
            <button
              type="button"
              aria-label="Remove bookmark"
              onClick={() => onRemove(mark.id)}
              className="rounded-md p-2 text-text-muted transition-colors hover:text-brand-pink"
            >
              <X size={16} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
