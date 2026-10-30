"use client";

import { useEffect, useRef, useState } from "react";
import { BookmarkPlus, ListOrdered, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward } from "lucide-react";
import { fileUrl } from "../catalog";
import {
  bookPhotos,
  chapterArt,
  clampPlace,
  formatTime,
  nextPhoto,
  nextRate,
  photoAt,
  previousChapterTarget,
  SKIP_BACK_SECONDS,
  SKIP_FORWARD_SECONDS,
} from "../logic";
import { logPlayback, playbackLogText } from "../playback-log";
import { useListening } from "../store";
import type { Book, Bookmark, Photo } from "../types";
import { BookArt } from "./book-art";
import { BookPanel, type PanelTab } from "./book-panel";
import { BookProgress } from "./book-progress";
import { photoAlt } from "./photo-gallery";
import { PhotoViewer, type ViewerItem } from "./photo-viewer";

const NO_BOOKMARKS: Bookmark[] = [];

/** Where the next load of the audio element starts, and whether it plays from there. */
interface PendingLoad {
  position: number;
  play: boolean;
}

/** One screen, never scrolled: the art takes the height the controls leave, and the
 *  chapters, bookmarks and photos scroll inside their own panel. */
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
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>("chapters");
  // What the full-screen viewer shows, while it's open.
  const [viewing, setViewing] = useState<{ items: ViewerItem[]; index: number } | null>(null);
  // Set until the chapter's audio has loaded and been moved to its starting place.
  const pending = useRef<PendingLoad | null>({ position: start.position, play: false });
  // Chapters' audio downloaded whole (path to object URL): the next one, fetched while this one plays, so it starts
  // the moment this one ends, with no wait on the network, even with the phone locked.
  const downloads = useRef(new Map<string, string>());
  // Picked when the chapter changes, never during it: a download finishing mid-chapter mustn't reload the audio.
  const [source, setSource] = useState(() => fileUrl(book.chapters[start.chapter].audio));
  const [started, setStarted] = useState(false);
  const [downloaded, setDownloaded] = useState<string | null>(null);
  // Set while a pause is the listener's own, so a pause nobody asked for can be told apart (ideas/lock-screen-stop.md).
  const listenerPaused = useRef(false);
  const [unaskedStop, setUnaskedStop] = useState<string | null>(null);
  const [logCopied, setLogCopied] = useState(false);

  const chapter = book.chapters[chapterIndex];
  const nextAudio = chapterIndex < book.chapters.length - 1 ? book.chapters[chapterIndex + 1].audio : undefined;
  const photo = photoAt(chapter, time);
  const art = photo?.image ?? chapterArt(book, chapter);
  const upcoming = nextPhoto(chapter, time)?.image;
  const artAlt = photo ? photoAlt(chapter, photo) : chapter.image === undefined ? `${book.title} cover` : chapter.title;

  const photoItems = (): ViewerItem[] =>
    bookPhotos(book).map(({ chapter: c, photo: p }) => ({
      image: p.image,
      alt: photoAlt(book.chapters[c], p),
      moment: { chapter: c, chapterTitle: book.chapters[c].title, at: p.at },
    }));

  function viewPhoto(target: Photo) {
    setViewing({ items: photoItems(), index: bookPhotos(book).findIndex((e) => e.photo === target) });
  }

  /** The big picture opens full screen: among the book's photos when it's one, or alone when it's a cover. */
  function viewArt() {
    if (photo) viewPhoto(photo);
    else if (art !== undefined) setViewing({ items: [{ image: art, alt: artAlt }], index: 0 });
  }

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
      if (index !== chapterIndex) {
        const path = book.chapters[index].audio;
        setSource(downloads.current.get(path) ?? fileUrl(path));
      }
      setChapterIndex(index);
    }
  }

  function seek(position: number) {
    const el = audio.current;
    if (!el) return;
    goTo(chapterIndex, Math.min(Math.max(0, position), el.duration || chapter.duration), !el.paused);
  }

  function play() {
    void audio.current?.play();
  }

  function pause() {
    listenerPaused.current = true;
    audio.current?.pause();
  }

  function togglePlay() {
    if (audio.current?.paused) play();
    else pause();
  }

  function previousChapter() {
    goTo(previousChapterTarget({ chapter: chapterIndex, position: time }), 0, playing);
  }

  function nextChapter() {
    if (chapterIndex < book.chapters.length - 1) goTo(chapterIndex + 1, 0, playing);
  }

  // The lock screen's and headphones' controls call whatever this render's handlers are.
  const actions = useRef({ play, pause, togglePlay, seek, time, previousChapter, nextChapter });
  useEffect(() => {
    actions.current = { play, pause, togglePlay, seek, time, previousChapter, nextChapter };
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

  // Only once the listener has pressed play: opening a book to look at it downloads nothing.
  useEffect(() => {
    const kept = downloads.current;
    for (const [path, url] of kept) {
      if (path === chapter.audio || path === nextAudio) continue;
      URL.revokeObjectURL(url);
      kept.delete(path);
    }
    if (!started || nextAudio === undefined || kept.has(nextAudio)) return;
    const controller = new AbortController();
    fetch(fileUrl(nextAudio), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`${nextAudio} didn't download (HTTP ${String(response.status)})`);
        return response.blob();
      })
      .then(
        (blob) => {
          kept.set(nextAudio, URL.createObjectURL(blob));
          setDownloaded(nextAudio);
        },
        (error: unknown) => {
          // Moving on before it finished cancels it. Any other failure only means the next chapter streams instead.
          if (!controller.signal.aborted) console.error(error);
        },
      );
    return () => controller.abort();
  }, [started, chapter.audio, nextAudio]);

  useEffect(() => {
    const kept = downloads.current;
    return () => {
      for (const url of kept.values()) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      [
        "play",
        () => {
          logPlayback("lock screen: play", audio.current);
          actions.current.play();
        },
      ],
      [
        "pause",
        () => {
          logPlayback("lock screen: pause", audio.current);
          actions.current.pause();
        },
      ],
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

  // Everything the audio and the page do that could stop playback, logged for ideas/lock-screen-stop.md.
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const log = (e: Event) => logPlayback(e.type, el);
    const onError = (e: Event) => {
      log(e);
      setUnaskedStop(`playback error ${el.error ? String(el.error.code) : "?"}`);
    };
    const mediaEvents = ["playing", "waiting", "stalled", "emptied", "abort", "ended", "loadstart", "canplay"];
    const pageEvents = ["visibilitychange", "freeze", "resume", "pagehide", "pageshow"];
    const networkEvents = ["online", "offline"];
    for (const type of mediaEvents) el.addEventListener(type, log);
    el.addEventListener("error", onError);
    for (const type of pageEvents) document.addEventListener(type, log);
    for (const type of networkEvents) window.addEventListener(type, log);
    const worker = "serviceWorker" in navigator ? navigator.serviceWorker.controller : null;
    logPlayback("player opened", el, worker ? `service worker ${worker.scriptURL}` : "no service worker");
    return () => {
      for (const type of mediaEvents) el.removeEventListener(type, log);
      el.removeEventListener("error", onError);
      for (const type of pageEvents) document.removeEventListener(type, log);
      for (const type of networkEvents) window.removeEventListener(type, log);
    };
  }, []);

  function onPause() {
    const el = audio.current;
    setPlaying(false);
    const asked = listenerPaused.current;
    listenerPaused.current = false;
    // A chapter's end, or the load of another chapter, stops the audio on its way to the next.
    if (!el || el.ended || pending.current !== null) return;
    logPlayback(asked ? "pause (listener)" : "pause (not the listener)", el);
    if (!asked) setUnaskedStop(`paused at ${formatTime(el.currentTime)}, not by you`);
  }

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

  return (
    <div className="mx-auto flex h-dvh max-w-6xl flex-col gap-3 overflow-hidden px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <header className="shrink-0">
        <h1 className="text-lg leading-tight font-bold text-balance break-words sm:text-xl">{book.title}</h1>
        <p className="text-sm break-words text-text-secondary">{book.author}</p>
        {book.narrator !== undefined && <p className="text-xs break-words text-text-muted">Read by {book.narrator}</p>}
      </header>

      <audio
        ref={audio}
        src={source}
        data-next-downloaded={nextAudio !== undefined && downloaded === nextAudio}
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => {
          logPlayback("play", audio.current);
          setPlaying(true);
          setStarted(true);
          setUnaskedStop(null);
        }}
        onPause={onPause}
        onEnded={onEnded}
      />

      <div className="flex min-h-0 flex-1 gap-10">
        {/* A short screen (a phone on its side) puts the art beside the controls rather than above them. */}
        <section
          className="mx-auto flex min-h-0 w-full max-w-md flex-col gap-3 [@media(max-height:31rem)]:max-w-none [@media(max-height:31rem)]:flex-row [@media(max-height:31rem)]:items-center [@media(max-height:31rem)]:gap-6 [@media(min-width:48rem)_and_(min-height:31rem)]:mx-0 [@media(min-width:48rem)_and_(min-height:31rem)]:w-md [@media(min-width:48rem)_and_(min-height:31rem)]:shrink-0"
          aria-label="Player"
        >
          {/* The largest square that fits the space the controls leave. */}
          <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size] [@media(max-height:31rem)]:aspect-square [@media(max-height:31rem)]:h-full [@media(max-height:31rem)]:max-w-[45%] [@media(max-height:31rem)]:flex-none">
            <button
              type="button"
              aria-label={`View ${artAlt}`}
              onClick={viewArt}
              disabled={art === undefined}
              className="size-[min(100cqw,100cqh)] cursor-zoom-in rounded-lg disabled:cursor-default"
            >
              <BookArt path={art} alt={artAlt} fit={photo ? "contain" : "cover"} raised className="size-full" />
            </button>
          </div>
          <div className="flex shrink-0 flex-col gap-3 [@media(max-height:31rem)]:min-w-0 [@media(max-height:31rem)]:flex-1">
            {photo?.caption !== undefined && (
              <p className="shrink-0 text-center text-sm break-words text-text-secondary" data-testid="photo-caption">
                {photo.caption}
              </p>
            )}

            {unaskedStop !== null && (
              <div
                role="status"
                className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-brand-pink/50 bg-surface-elevated px-3 py-2 text-sm"
              >
                <span className="min-w-0 break-words">Stopped: {unaskedStop}</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(playbackLogText()).then(() => setLogCopied(true));
                  }}
                  className="shrink-0 rounded-full bg-brand-pink px-3 py-1 font-bold text-surface-primary"
                >
                  {logCopied ? "Copied" : "Copy log"}
                </button>
              </div>
            )}

            <div className="flex shrink-0 items-baseline justify-between gap-3">
              <h2 className="min-w-0 text-xl leading-tight font-bold break-words sm:text-2xl" data-testid="chapter-title">
                {chapter.title}
              </h2>
              <span
                className="shrink-0 font-mono text-sm text-text-muted"
                aria-label={`Chapter ${String(chapterIndex + 1)} of ${String(book.chapters.length)}`}
              >
                {chapterIndex + 1}/{book.chapters.length}
              </span>
            </div>

            <div className="flex shrink-0 flex-col gap-1">
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

            <div className="flex shrink-0 items-center justify-between">
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
                className="flex size-16 items-center justify-center rounded-full bg-brand-orange text-surface-primary shadow-lg transition-transform hover:scale-105 active:scale-95"
              >
                {playing ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" className="translate-x-0.5" />}
              </button>
              <IconButton label={`Forward ${String(SKIP_FORWARD_SECONDS)} seconds`} onClick={() => seek(time + SKIP_FORWARD_SECONDS)}>
                <SkipIcon icon={RotateCw} seconds={SKIP_FORWARD_SECONDS} />
              </IconButton>
              <IconButton label="Next chapter" onClick={nextChapter} disabled={chapterIndex === book.chapters.length - 1}>
                <SkipForward size={24} />
              </IconButton>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                aria-label="Playback speed"
                title="Playback speed"
                onClick={() => setRate(nextRate(rate))}
                className="min-w-14 rounded-full border border-border-default bg-surface-elevated px-2.5 py-1.5 font-mono text-sm font-bold text-brand-blue transition-colors hover:border-border-hover"
              >
                {rate}×
              </button>
              <BookProgress book={book} place={{ chapter: chapterIndex, position: time }} />
              <button
                type="button"
                aria-label="Add bookmark"
                title="Add bookmark"
                onClick={() => {
                  addBookmark(book.slug, { chapter: chapterIndex, position: time });
                  setTab("bookmarks");
                }}
                className="rounded-full border border-border-default bg-surface-elevated p-2 text-brand-green transition-colors hover:border-border-hover"
              >
                <BookmarkPlus size={20} />
              </button>
              <button
                type="button"
                aria-label="Chapters, bookmarks and photos"
                title="Chapters, bookmarks and photos"
                onClick={() => setPanelOpen(true)}
                className="rounded-full border border-border-default bg-surface-elevated p-2 text-text-primary transition-colors hover:border-border-hover [@media(min-width:48rem)_and_(min-height:31rem)]:hidden"
              >
                <ListOrdered size={20} />
              </button>
            </div>
          </div>
        </section>

        <BookPanel
          book={book}
          chapter={chapterIndex}
          playing={playing}
          bookmarks={bookmarks}
          showing={photo}
          open={panelOpen}
          tab={tab}
          onTab={setTab}
          onClose={() => setPanelOpen(false)}
          onGo={(to, position) => goTo(to, position, true)}
          onRemoveBookmark={(id) => removeBookmark(book.slug, id)}
          onViewPhoto={viewPhoto}
        />
      </div>

      {viewing && (
        <PhotoViewer
          items={viewing.items}
          index={viewing.index}
          onIndex={(index) => setViewing({ ...viewing, index })}
          onClose={() => setViewing(null)}
          onPlayFrom={(to, at) => {
            setViewing(null);
            setPanelOpen(false);
            goTo(to, at, true);
          }}
        />
      )}
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
      className="rounded-full p-2.5 text-text-primary transition-colors hover:bg-surface-elevated disabled:opacity-30"
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
