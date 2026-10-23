import { extname } from "node:path";

/** `book.json`, in a folder beside the files it names. */
export interface BookFolder {
  slug?: string;
  title: string;
  author: string;
  narrator?: string;
  cover?: string;
  chapters: {
    title: string;
    audio: string;
    image?: string;
    photos?: { at: number; image: string; caption?: string }[];
  }[];
}

const CONTENT_TYPES: Partial<Record<string, string>> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".m4b": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function contentTypeFor(file: string): string {
  const type = CONTENT_TYPES[extname(file).toLowerCase()];
  if (type === undefined) throw new Error(`${file}: not an audio or image type the player knows`);
  return type;
}

export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Where a file lives in the bucket: named by its content, so a path never
 *  changes what it serves and can be cached for good. */
export function objectPath(slug: string, sha256: string, file: string): string {
  return `${slug}/${sha256.slice(0, 16)}${extname(file).toLowerCase()}`;
}
