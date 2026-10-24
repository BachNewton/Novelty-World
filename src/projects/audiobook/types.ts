/** A file in the audiobooks bucket, by its path there. */
export type StoragePath = string;

/** A photo shown from the moment the narration reaches it until the next one. */
export interface Photo {
  /** Seconds into the chapter. */
  at: number;
  image: StoragePath;
  caption?: string;
}

export interface Chapter {
  title: string;
  audio: StoragePath;
  /** Shown in the player while this chapter plays, until its first photo; the book's cover otherwise. */
  image?: StoragePath;
  /** In order of `at`. */
  photos: Photo[];
  /** Seconds. */
  duration: number;
}

export interface Book {
  slug: string;
  title: string;
  author: string;
  narrator?: string;
  cover?: StoragePath;
  chapters: Chapter[];
}

/** Every book on the shelf: `catalog.json` at the bucket's root. */
export interface Catalog {
  books: Book[];
}

/** A place in a book. */
export interface Place {
  chapter: number;
  /** Seconds into the chapter. */
  position: number;
}

export interface Bookmark extends Place {
  id: string;
  createdAt: number;
}

/** What this browser remembers of one book. */
export interface BookProgress extends Place {
  bookmarks: Bookmark[];
  updatedAt: number;
}
