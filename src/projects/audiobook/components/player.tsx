"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AudioLines,
  BookmarkPlus,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { fileUrl } from "../catalog";
import {
  bookLength,
  chapterArt,
  nextPhoto,
  photoAt,
  clampPlace,
  elapsedInBook,
  formatLength,
  formatTime,
  nextRate,
  previousChapterTarget,
  SKIP_BACK_SECONDS,
  SKIP_FORWARD_SECONDS,
  sortBookmarks,
} from "../logic";
import { AUDIOBOOK_PATH } from "../paths";
import { useListening } from "../store";
import type { Book, Bookmark } from "../types";
import { BookArt } from "./book-art";
import { PhotoGallery, photoAlt } from "./photo-gallery";

const NO_BOOKMARKS: Bookmark[] = [];

/** Where the next load of the audio element starts, and whether it plays from there. */
interface PendingLoad {
  position: number;
  play: boolean;
}

export function Player({ book }: { book: Book }) {
  const audio = useRef<HTMLAudioElement>(null);
  const setPlace = useListening((s) => s.setPlace);
  const addBookmark = useListening((s) => s.addBookmark);
  const removeBookmark = useListening((s) => s.removeBookmark);
  const bookmarks = useListening((s) => s.books[book.slug]?.bookmarks ?? NO_BOOKMARKS);
  const rate = useListening((s) => s.rate);
  const setRate = useListening((s) => s.setRate);

  const [start] = useState(() => clampPlace(book, useListening.getState().books[book.slug] ?? { chapter: 0, position: 0 }));
  const [chapterIndex, setChapterIndex] = useState(start.chapter);
  const [time, setTime] = useState(start.position);
  const [playing, setPlaying] = useState(false);
  // Set until the chapter's audio has loaded and been moved to its starting place.
  const pending = useRef<PendingLoad | null>({ position: start.position, play: false });

  const chapter = book.chapters[chapterIndex];
  const photo = photoAt(chapter, time);
  const art = photo?.image ?? chapterArt(book, chapter);
  const upcoming = nextPhoto(chapter, time)?.image;
  const total = bookLength(book);
  const elapsed = elapsedInBook(book, { chapter: chapterIndex, position: time });

  function goTo(index: number, position: number, play: boolean) {
    const el = audio.current;
    if (!el) return;
    setPlace(book.slug, { chapter: index, position });
    setTime(position);
    if (index === chapterIndex && pending.current === null) {
      el.currentTime = position;
      if (play) void el.play();
    } else {
      pending.current = { position, play };
      setChapterIndex(index);
    }
  }

  function seek(position: number) {
    const el = audio.current;
    if (!el) return;
    goTo(chapterIndex, Math.min(Math.max(0, position), el.duration || chapter.duration), !el.paused);
  }

  function togglePlay() {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }

  function previousChapter() {
    goTo(previousChapterTarget({ chapter: chapterIndex, position: time }), 0, playing);
  }

  function nextChapter() {
    if (chapterIndex < book.chapters.length - 1) goTo(chapterIndex + 1, 0, playing);
  }

  // The lock screen's and headphones' controls call whatever this render's handlers are.
  const actions = useRef({ togglePlay, seek, time, previousChapter, nextChapter });
  useEffect(() => {
    actions.current = { togglePlay, seek, time, previousChapter, nextChapter };
  });

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    el.defaultPlaybackRate = rate;
    el.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    showOnLockScreen({
      title: chapter.title,
      artist: book.author,
      album: book.title,
      artwork: art === undefined ? [] : [{ src: fileUrl(art) }],
    });
  }, [book, chapter, art]);

  // Fetched ahead, so the photo is on screen the moment the narration reaches it.
  useEffect(() => {
    if (upcoming === undefined) return;
    const preload = new Image();
    preload.src = fileUrl(upcoming);
  }, [upcoming]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => actions.current.togglePlay()],
      ["pause", () => actions.current.togglePlay()],
      ["seekbackward", (d) => actions.current.seek(actions.current.time - (d.seekOffset ?? SKIP_BACK_SECONDS))],
      ["seekforward", (d) => actions.current.seek(actions.current.time + (d.seekOffset ?? SKIP_FORWARD_SECONDS))],
      ["seekto", (d) => actions.current.seek(d.seekTime ?? actions.current.time)],
      ["previoustrack", () => actions.current.previousChapter()],
      ["nexttrack", () => actions.current.nextChapter()],
    ];
    for (const [action, handler] of handlers) session.setActionHandler(action, handler);
    return () => {
      for (const [action] of handlers) session.setActionHandler(action, null);
      session.metadata = null;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Only keys pressed on the page itself: a focused button's own Space is its click.
      if (e.target !== document.body) return;
      if (e.key === " ") actions.current.togglePlay();
      else if (e.key === "ArrowLeft") actions.current.seek(actions.current.time - SKIP_BACK_SECONDS);
      else if (e.key === "ArrowRight") actions.current.seek(actions.current.time + SKIP_FORWARD_SECONDS);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onLoadedMetadata() {
    const el = audio.current;
    const load = pending.current;
    if (!el || !load) return;
    el.playbackRate = rate;
    el.currentTime = load.position;
    pending.current = null;
    if (load.play) void el.play();
  }

  function onTimeUpdate() {
    const el = audio.current;
    // Before the load has moved to its starting place, the element still reports the old or zero time.
    if (!el || pending.current !== null) return;
    setTime(el.currentTime);
    setPlace(book.slug, { chapter: chapterIndex, position: el.currentTime });
    if ("mediaSession" in navigator && Number.isFinite(el.duration)) {
      navigator.mediaSession.setPositionState({ duration: el.duration, position: el.currentTime, playbackRate: el.playbackRate });
    }
  }

  function onEnded() {
    if (chapterIndex < book.chapters.length - 1) goTo(chapterIndex + 1, 0, true);
  }

  const duration = chapter.duration;
  const sorted = sortBookmarks(bookmarks);

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link
          href={AUDIOBOOK_PATH}
          aria-label="Back to the shelf"
          className="rounded-md p-2 text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
        >
          <ArrowLeft size={22} aria-hidden />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{book.title}</h1>
          <p className="truncate text-sm text-text-secondary">
            {book.author}
            {book.narrator !== undefined && <span className="text-text-muted"> · read by {book.narrator}</span>}
          </p>
        </div>
      </header>

      <audio
        ref={audio}
        src={fileUrl(chapter.audio)}
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={onEnded}
      />

      <div className="grid gap-8 md:grid-cols-[minmax(0,26rem)_1fr]">
        <section className="flex flex-col gap-5" aria-label="Player">
          <figure className="flex flex-col gap-2">
            <BookArt
              path={art}
              alt={photo ? photoAlt(chapter, photo) : chapter.image === undefined ? `${book.title} cover` : chapter.title}
              fit={photo ? "contain" : "cover"}
              className="mx-auto w-full max-w-[45svh] shadow-lg"
            />
            {photo?.caption !== undefined && (
              <figcaption className="text-center text-sm text-text-secondary" data-testid="photo-caption">
                {photo.caption}
              </figcaption>
            )}
          </figure>

          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-2xl font-bold leading-tight" data-testid="chapter-title">
                {chapter.title}
              </h2>
              <span className="shrink-0 font-mono text-sm text-text-muted" aria-label={`Chapter ${String(chapterIndex + 1)} of ${String(book.chapters.length)}`}>
                {chapterIndex + 1}/{book.chapters.length}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <input
              type="range"
              aria-label="Position in chapter"
              min={0}
              max={duration}
              step={1}
              value={Math.min(time, duration)}
              onChange={(e) => seek(Number(e.target.value))}
              className="w-full accent-brand-orange"
            />
            <div className="flex justify-between font-mono text-xs text-text-secondary">
              <span data-testid="elapsed">{formatTime(time)}</span>
              <span>-{formatTime(duration - time)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <IconButton label="Previous chapter" onClick={previousChapter}>
              <SkipBack size={24} />
            </IconButton>
            <IconButton label={`Back ${String(SKIP_BACK_SECONDS)} seconds`} onClick={() => seek(time - SKIP_BACK_SECONDS)}>
              <SkipIcon icon={RotateCcw} seconds={SKIP_BACK_SECONDS} />
            </IconButton>
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={togglePlay}
              className="flex size-18 items-center justify-center rounded-full bg-brand-orange text-surface-primary shadow-lg transition-transform hover:scale-105 active:scale-95"
            >
              {playing ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" className="translate-x-0.5" />}
            </button>
            <IconButton label={`Forward ${String(SKIP_FORWARD_SECONDS)} seconds`} onClick={() => seek(time + SKIP_FORWARD_SECONDS)}>
              <SkipIcon icon={RotateCw} seconds={SKIP_FORWARD_SECONDS} />
            </IconButton>
            <IconButton label="Next chapter" onClick={nextChapter} disabled={chapterIndex === book.chapters.length - 1}>
              <SkipForward size={24} />
            </IconButton>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              aria-label="Playback speed"
              title="Playback speed"
              onClick={() => setRate(nextRate(rate))}
              className="min-w-16 rounded-full border border-border-default bg-surface-elevated px-3 py-1.5 font-mono text-sm font-bold text-brand-blue transition-colors hover:border-border-hover"
            >
              {rate}×
            </button>
            <div className="flex flex-1 flex-col gap-1" title={`${formatLength(total - elapsed)} left in the book`}>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                <div className="h-full rounded-full bg-brand-pink" style={{ width: `${String((elapsed / total) * 100)}%` }} />
              </div>
              <span className="text-right text-xs text-text-muted" aria-label="Left in the book">
                {formatLength(total - elapsed)}
              </span>
            </div>
            <button
              type="button"
              aria-label="Add bookmark"
              title="Add bookmark"
              onClick={() => addBookmark(book.slug, { chapter: chapterIndex, position: time })}
              className="rounded-full border border-border-default bg-surface-elevated p-2 text-brand-green transition-colors hover:border-border-hover"
            >
              <BookmarkPlus size={20} />
            </button>
          </div>
        </section>

        <div className="flex flex-col gap-6">
          {sorted.length > 0 && (
            <section aria-label="Bookmarks" className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-green">Bookmarks</h3>
              <ul className="flex flex-col gap-1">
                {sorted.map((mark) => {
                  const place = clampPlace(book, mark);
                  return (
                  <li key={mark.id} data-testid="bookmark-row" className="flex items-center gap-1 rounded-lg bg-surface-secondary">
                    <button
                      type="button"
                      onClick={() => goTo(place.chapter, place.position, true)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-elevated"
                    >
                      <span className="font-mono text-sm text-brand-green">{formatTime(place.position)}</span>
                      <span className="truncate text-sm">{book.chapters[place.chapter].title}</span>
                    </button>
                    <button
                      type="button"
                      aria-label="Remove bookmark"
                      onClick={() => removeBookmark(book.slug, mark.id)}
                      className="rounded-md p-2 text-text-muted transition-colors hover:text-brand-pink"
                    >
                      <X size={16} />
                    </button>
                  </li>
                  );
                })}
              </ul>
            </section>
          )}

          <PhotoGallery book={book} showing={photo} onPick={(chapterAt, at) => goTo(chapterAt, at, true)} />

          <section aria-label="Chapters" className="flex flex-col gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-brand-blue">Chapters</h3>
            <ol className="flex flex-col gap-1">
              {book.chapters.map((c, i) => {
                const current = i === chapterIndex;
                return (
                  <li key={`${String(i)}-${c.audio}`}>
                    <button
                      type="button"
                      data-testid="chapter-row"
                      aria-current={current}
                      onClick={() => goTo(i, 0, true)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-elevated",
                        current ? "bg-surface-elevated" : "bg-surface-secondary",
                      )}
                    >
                      <span className={cn("w-6 shrink-0 text-right font-mono text-sm", current ? "text-brand-orange" : "text-text-muted")}>
                        {current && playing ? <AudioLines size={16} className="ml-auto animate-pulse" aria-hidden /> : i + 1}
                      </span>
                      <span className={cn("min-w-0 flex-1 truncate", current && "font-bold text-brand-orange")}>{c.title}</span>
                      <span className="shrink-0 font-mono text-xs text-text-muted">{formatTime(c.duration)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

/** What the phone's lock screen and the OS's media controls show as playing. */
function showOnLockScreen(metadata: MediaMetadataInit) {
  if ("mediaSession" in navigator) navigator.mediaSession.metadata = new MediaMetadata(metadata);
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-full p-3 text-text-primary transition-colors hover:bg-surface-elevated disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function SkipIcon({ icon: Icon, seconds }: { icon: typeof RotateCcw; seconds: number }) {
  return (
    <span className="relative flex size-8 items-center justify-center">
      <Icon size={32} strokeWidth={1.75} />
      <span className="absolute pt-0.5 text-[10px] font-bold">{seconds}</span>
    </span>
  );
}
