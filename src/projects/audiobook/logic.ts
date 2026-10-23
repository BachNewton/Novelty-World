import type { Book, Bookmark, Catalog, Chapter, Photo, Place } from "./types";

export const BUCKET = "audiobooks";
export const CATALOG_PATH = "catalog.json";

export const SKIP_BACK_SECONDS = 15;
export const SKIP_FORWARD_SECONDS = 30;
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

/** "Previous chapter" restarts the current one when it's further in than this. */
const RESTART_THRESHOLD_SECONDS = 3;

/** The public URL of a file in the audiobooks bucket. */
export function storageUrl(supabaseUrl: string, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${encoded}`;
}

/** "4:05", or "1:02:03" past the hour. */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${String(h)}:${String(m).padStart(2, "0")}:${s}` : `${String(m)}:${s}`;
}

/** "5h 12m", or "12m" under the hour. */
export function formatLength(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${String(h)}h ${String(m)}m` : `${String(m)}m`;
}

export function bookLength(book: Book): number {
  return book.chapters.reduce((sum, c) => sum + c.duration, 0);
}

/** Seconds from the book's start to a place in it. */
export function elapsedInBook(book: Book, place: Place): number {
  const before = book.chapters.slice(0, place.chapter).reduce((sum, c) => sum + c.duration, 0);
  return before + place.position;
}

/** A place clamped into the book, for progress saved against a book that has since changed. */
export function clampPlace(book: Book, place: Place): Place {
  const chapter = Math.min(Math.max(0, place.chapter), book.chapters.length - 1);
  const position = Math.min(Math.max(0, place.position), book.chapters[chapter].duration);
  return { chapter, position };
}

export function nextRate(rate: PlaybackRate): PlaybackRate {
  const i = PLAYBACK_RATES.indexOf(rate);
  return PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length];
}

/** Where "previous chapter" goes: the start of this one if it's under way, else the one before. */
export function previousChapterTarget(place: Place): number {
  return place.position > RESTART_THRESHOLD_SECONDS ? place.chapter : Math.max(0, place.chapter - 1);
}

export function sortBookmarks(bookmarks: readonly Bookmark[]): Bookmark[] {
  return [...bookmarks].sort((a, b) => a.chapter - b.chapter || a.position - b.position);
}

/** The image the player shows for a chapter before its first photo: its own, else the book's cover. */
export function chapterArt(book: Book, chapter: Chapter): string | undefined {
  return chapter.image ?? book.cover;
}

/** The photo showing at a position in a chapter: the last one the narration has reached. */
export function photoAt(chapter: Chapter, position: number): Photo | undefined {
  return chapter.photos.findLast((p) => p.at <= position);
}

/** The photo after the one showing, to load before it's needed. */
export function nextPhoto(chapter: Chapter, position: number): Photo | undefined {
  return chapter.photos.find((p) => p.at > position);
}

// ---- Reading catalog.json. It's written by the upload tool, but it comes over
// the network, so it's checked field by field and a bad one fails loudly.

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(obj: Json, key: string, where: string): string {
  const value = obj[key];
  if (typeof value !== "string" || value === "") throw new Error(`${where}: "${key}" must be a non-empty string`);
  return value;
}

function optionalStr(obj: Json, key: string, where: string): string | undefined {
  return obj[key] === undefined ? undefined : str(obj, key, where);
}

function parsePhoto(value: unknown, duration: number, where: string): Photo {
  if (!isObject(value)) throw new Error(`${where}: must be an object`);
  const at = value.at;
  if (typeof at !== "number" || !(at >= 0 && at <= duration)) throw new Error(`${where}: "at" must be a time within the chapter`);
  const caption = optionalStr(value, "caption", where);
  return { at, image: str(value, "image", where), ...(caption === undefined ? {} : { caption }) };
}

function parseChapter(value: unknown, where: string): Chapter {
  if (!isObject(value)) throw new Error(`${where}: must be an object`);
  const duration = value.duration;
  if (typeof duration !== "number" || !(duration > 0)) throw new Error(`${where}: "duration" must be a positive number`);
  const photos = value.photos ?? [];
  if (!Array.isArray(photos)) throw new Error(`${where}: "photos" must be an array`);
  const image = optionalStr(value, "image", where);
  return {
    title: str(value, "title", where),
    audio: str(value, "audio", where),
    ...(image === undefined ? {} : { image }),
    photos: photos.map((p, i) => parsePhoto(p, duration, `${where} photo ${String(i + 1)}`)).sort((a, b) => a.at - b.at),
    duration,
  };
}

function parseBook(value: unknown, where: string): Book {
  if (!isObject(value)) throw new Error(`${where}: must be an object`);
  const slug = str(value, "slug", where);
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`${where}: "slug" must be lowercase letters, digits and hyphens`);
  const chapters = value.chapters;
  if (!Array.isArray(chapters) || chapters.length === 0) throw new Error(`${where}: "chapters" must be a non-empty array`);
  const narrator = optionalStr(value, "narrator", where);
  const cover = optionalStr(value, "cover", where);
  return {
    slug,
    title: str(value, "title", where),
    author: str(value, "author", where),
    ...(narrator === undefined ? {} : { narrator }),
    ...(cover === undefined ? {} : { cover }),
    chapters: chapters.map((c, i) => parseChapter(c, `${slug} chapter ${String(i + 1)}`)),
  };
}

export function parseCatalog(value: unknown): Catalog {
  if (!isObject(value) || !Array.isArray(value.books)) throw new Error('catalog: must be an object with a "books" array');
  const books = value.books.map((b, i) => parseBook(b, `catalog book ${String(i + 1)}`));
  const slugs = new Set<string>();
  for (const book of books) {
    if (slugs.has(book.slug)) throw new Error(`catalog: two books have the slug "${book.slug}"`);
    slugs.add(book.slug);
  }
  return { books };
}

/** The catalog with a book added, or replacing the one with its slug in place. */
export function upsertBook(catalog: Catalog, book: Book): Catalog {
  const i = catalog.books.findIndex((b) => b.slug === book.slug);
  if (i === -1) return { books: [...catalog.books, book] };
  return { books: catalog.books.map((b, j) => (j === i ? book : b)) };
}
