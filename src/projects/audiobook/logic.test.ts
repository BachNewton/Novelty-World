import { describe, expect, it } from "vitest";
import {
  bookLength,
  clampPlace,
  elapsedInBook,
  formatLength,
  formatTime,
  bookPhotos,
  nextPhoto,
  nextRate,
  photoAt,
  parseCatalog,
  previousChapterTarget,
  sortBookmarks,
  storageUrl,
  upsertBook,
} from "./logic";
import type { Book, Bookmark } from "./types";
import { contentTypeFor, objectPath, slugify } from "./upload/book-folder";

const BOOK: Book = {
  slug: "the-book",
  title: "The Book",
  author: "A. Writer",
  chapters: [
    { title: "One", audio: "the-book/a.mp3", photos: [], duration: 100 },
    {
      title: "Two",
      audio: "the-book/b.mp3",
      image: "the-book/b.jpg",
      photos: [
        { at: 20, image: "the-book/p1.jpg", caption: "First" },
        { at: 90, image: "the-book/p2.jpg" },
      ],
      duration: 200,
    },
    { title: "Three", audio: "the-book/c.mp3", photos: [], duration: 50 },
  ],
};

describe("times", () => {
  it("formats a clock time, with hours only past the hour", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65.9)).toBe("1:05");
    expect(formatTime(3723)).toBe("1:02:03");
    expect(formatTime(-4)).toBe("0:00");
  });

  it("formats a length in hours and minutes", () => {
    expect(formatLength(12 * 60)).toBe("12m");
    expect(formatLength(5 * 3600 + 12 * 60)).toBe("5h 12m");
  });
});

describe("places in a book", () => {
  it("measures the book and how far a place is into it", () => {
    expect(bookLength(BOOK)).toBe(350);
    expect(elapsedInBook(BOOK, { chapter: 0, position: 30 })).toBe(30);
    expect(elapsedInBook(BOOK, { chapter: 2, position: 10 })).toBe(310);
  });

  it("clamps a place saved against a book that has since changed", () => {
    expect(clampPlace(BOOK, { chapter: 7, position: 999 })).toEqual({ chapter: 2, position: 50 });
    expect(clampPlace(BOOK, { chapter: 1, position: -3 })).toEqual({ chapter: 1, position: 0 });
  });

  it("restarts a chapter under way, and steps back from the start of one", () => {
    expect(previousChapterTarget({ chapter: 1, position: 40 })).toBe(1);
    expect(previousChapterTarget({ chapter: 1, position: 1 })).toBe(0);
    expect(previousChapterTarget({ chapter: 0, position: 1 })).toBe(0);
  });

  it("orders bookmarks by where they are in the book", () => {
    const mark = (chapter: number, position: number): Bookmark => ({ id: `${String(chapter)}:${String(position)}`, chapter, position, createdAt: 0 });
    expect(sortBookmarks([mark(2, 5), mark(0, 50), mark(0, 10)]).map((b) => b.id)).toEqual(["0:10", "0:50", "2:5"]);
  });
});

describe("photos", () => {
  const chapter = BOOK.chapters[1];

  it("shows each photo from the moment the narration reaches it until the next", () => {
    expect(photoAt(chapter, 19.9)).toBeUndefined();
    expect(photoAt(chapter, 20)?.caption).toBe("First");
    expect(photoAt(chapter, 89)?.caption).toBe("First");
    expect(photoAt(chapter, 150)?.image).toBe("the-book/p2.jpg");
  });

  it("lists every photo in the book in the order they're described", () => {
    expect(bookPhotos(BOOK).map(({ chapter: c, photo }) => [c, photo.at])).toEqual([
      [1, 20],
      [1, 90],
    ]);
  });

  it("knows the photo coming next", () => {
    expect(nextPhoto(chapter, 0)?.caption).toBe("First");
    expect(nextPhoto(chapter, 20)?.image).toBe("the-book/p2.jpg");
    expect(nextPhoto(chapter, 90)).toBeUndefined();
  });
});

it("cycles the playback speed round its steps", () => {
  expect(nextRate(1)).toBe(1.25);
  expect(nextRate(2)).toBe(0.75);
});

it("builds a public URL for a file in the bucket", () => {
  expect(storageUrl("https://x.supabase.co", "a book/ch 1.mp3")).toBe(
    "https://x.supabase.co/storage/v1/object/public/audiobooks/a%20book/ch%201.mp3",
  );
});

describe("the catalog", () => {
  it("reads a well-formed catalog", () => {
    expect(parseCatalog(JSON.parse(JSON.stringify({ books: [BOOK] })))).toEqual({ books: [BOOK] });
  });

  it("puts a chapter's photos in order, and gives a chapter without any none", () => {
    const { photos, ...bare } = BOOK.chapters[1];
    const shuffled = { ...BOOK, chapters: [{ ...bare, photos: [...photos].reverse() }, BOOK.chapters[0]] };
    const [two, one] = parseCatalog({ books: [shuffled] }).books[0].chapters;
    expect(two.photos.map((p) => p.at)).toEqual([20, 90]);
    const { photos: _none, ...withoutPhotos } = BOOK.chapters[0];
    expect(parseCatalog({ books: [{ ...BOOK, chapters: [withoutPhotos] }] }).books[0].chapters[0].photos).toEqual([]);
    expect(one.photos).toEqual([]);
  });

  it("fails loudly on a malformed one", () => {
    expect(() => parseCatalog({})).toThrow(/books/);
    expect(() => parseCatalog({ books: [{ ...BOOK, chapters: [] }] })).toThrow(/chapters/);
    expect(() => parseCatalog({ books: [{ ...BOOK, chapters: [{ title: "x", audio: "a" }] }] })).toThrow(/duration/);
    expect(() => parseCatalog({ books: [{ ...BOOK, slug: "Not A Slug" }] })).toThrow(/slug/);
    expect(() => parseCatalog({ books: [BOOK, BOOK] })).toThrow(/two books/);
    const late = { ...BOOK.chapters[0], photos: [{ at: 101, image: "x.jpg" }] };
    expect(() => parseCatalog({ books: [{ ...BOOK, chapters: [late] }] })).toThrow(/"at"/);
  });

  it("adds a new book, and replaces one with the same slug in place", () => {
    const other: Book = { ...BOOK, slug: "other" };
    const renamed: Book = { ...BOOK, title: "Renamed" };
    expect(upsertBook({ books: [BOOK] }, other).books.map((b) => b.slug)).toEqual(["the-book", "other"]);
    expect(upsertBook({ books: [BOOK, other] }, renamed).books.map((b) => b.title)).toEqual(["Renamed", "The Book"]);
  });
});

describe("uploading a book folder", () => {
  it("names each file by its content", () => {
    expect(objectPath("the-book", "0123456789abcdef0123", "Chapter 01.MP3")).toBe("the-book/0123456789abcdef.mp3");
  });

  it("knows the types the player plays and shows, and refuses others", () => {
    expect(contentTypeFor("01.mp3")).toBe("audio/mpeg");
    expect(contentTypeFor("cover.JPG")).toBe("image/jpeg");
    expect(() => contentTypeFor("notes.txt")).toThrow();
  });

  it("makes a slug from a title", () => {
    expect(slugify("Ronja Rövardotter: The Robber's Daughter!")).toBe("ronja-rovardotter-the-robber-s-daughter");
  });
});
