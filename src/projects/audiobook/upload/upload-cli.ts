/**
 * Puts a book on the Audiobook shelf: uploads its chapter audio and art to the
 * public `audiobooks` bucket and adds it to the catalog (or replaces the book
 * with its slug, so a rerun after an edit updates it in place).
 *
 *   npx tsx src/projects/audiobook/upload/upload-cli.ts <folder>
 *
 * The folder holds the files and a `book.json` naming them:
 *
 *   { "title": "…", "author": "…", "narrator": "…", "cover": "cover.jpg",
 *     "chapters": [{ "title": "Chapter 1", "audio": "01.mp3", "image": "01.jpg",
 *                    "photos": [{ "at": 41.2, "image": "photos/a.jpg", "caption": "…" }, …] }, …] }
 *
 * `slug` (the book's URL) defaults to the title's; `narrator`, `cover`, each
 * chapter's `image` and `photos`, and each photo's `caption` are optional. A
 * photo shows from `at` (seconds into the chapter) until the next one. Chapter lengths are read with ffprobe, so it
 * must be on the PATH. Needs NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in `.env.local`, and the bucket from
 * `supabase/audiobook.sql`.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import { createAdminClient } from "@/shared/lib/supabase/server-admin";
import { BUCKET, CATALOG_PATH, parseCatalog, upsertBook } from "../logic";
import type { Book, Catalog } from "../types";
import { contentTypeFor, objectPath, slugify, type BookFolder } from "./book-folder";

const ONE_YEAR_SECONDS = "31536000";
// Short, so a newly uploaded book reaches the shelf within a minute through the CDN.
const CATALOG_CACHE_SECONDS = "60";

const folder = process.argv[2];
if (!folder) {
  console.error("Usage: npx tsx src/projects/audiobook/upload/upload-cli.ts <folder with book.json>");
  process.exit(1);
}
process.loadEnvFile(resolve(import.meta.dirname, "../../../../.env.local"));

const storage = createAdminClient().storage.from(BUCKET);

function duration(file: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
    encoding: "utf8",
  });
  const seconds = Number(out.trim());
  if (!(seconds > 0)) throw new Error(`${file}: ffprobe gave no duration (${out.trim()})`);
  return seconds;
}

async function upload(slug: string, name: string): Promise<string> {
  const file = join(folder, name);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the files the owner named in book.json, in the folder they gave on the command line
  const body = await readFile(file);
  const path = objectPath(slug, createHash("sha256").update(body).digest("hex"), name);
  const { error } = await storage.upload(path, body, { contentType: contentTypeFor(name), cacheControl: ONE_YEAR_SECONDS });
  // The path is the file's hash, so a file already there is this one.
  if (error && !/exists/i.test(error.message)) throw new Error(`${name}: ${error.message}`);
  console.log(`  ${error ? "kept    " : "uploaded"} ${name} → ${path}`);
  return path;
}

async function currentCatalog(): Promise<Catalog> {
  const { data: found, error: listError } = await storage.list("", { search: CATALOG_PATH });
  if (listError) throw new Error(`Listing the bucket: ${listError.message}`);
  if (!found.some((f) => f.name === CATALOG_PATH)) return { books: [] };
  const { data, error } = await storage.download(CATALOG_PATH);
  if (error) throw new Error(`Reading the catalog: ${error.message}`);
  return parseCatalog(JSON.parse(await data.text()));
}

// eslint-disable-next-line security/detect-non-literal-fs-filename -- book.json in the folder the owner gave on the command line
const spec = JSON.parse(await readFile(join(folder, "book.json"), "utf8")) as BookFolder;
const slug = spec.slug ?? slugify(spec.title);
console.log(`${spec.title} (${slug})`);

const chapters: Book["chapters"] = [];
for (const chapter of spec.chapters) {
  const image = chapter.image === undefined ? undefined : await upload(slug, chapter.image);
  const photos = [];
  for (const photo of chapter.photos ?? []) photos.push({ ...photo, image: await upload(slug, photo.image) });
  chapters.push({
    title: chapter.title,
    audio: await upload(slug, chapter.audio),
    ...(image === undefined ? {} : { image }),
    photos,
    duration: duration(join(folder, chapter.audio)),
  });
}
const cover = spec.cover === undefined ? undefined : await upload(slug, spec.cover);
const book: Book = {
  slug,
  title: spec.title,
  author: spec.author,
  ...(spec.narrator === undefined ? {} : { narrator: spec.narrator }),
  ...(cover === undefined ? {} : { cover }),
  chapters,
};

// Parsed as the player will parse it, so a bad book.json fails here rather than on the shelf.
const catalog = parseCatalog(upsertBook(await currentCatalog(), book));
const { error } = await storage.upload(CATALOG_PATH, JSON.stringify(catalog, null, 2), {
  contentType: "application/json",
  cacheControl: CATALOG_CACHE_SECONDS,
  upsert: true,
});
if (error) throw new Error(`Writing the catalog: ${error.message}`);
console.log(`On the shelf: ${String(catalog.books.length)} book(s).`);
