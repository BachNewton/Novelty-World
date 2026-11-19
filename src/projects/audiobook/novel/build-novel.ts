/**
 * Builds a drama story's manuscript as a novel: a PDF typeset with Typst and `novel.typ` beside
 * this file, for reading, or an EPUB (`epub.ts`), for reading apps and text-to-speech readers
 * such as ElevenReader. The output file's extension picks which. The chapters are `stories/<slug>/chapters/<nn>/chapter.md` in folder order, each
 * opening with `# Chapter N: Title`; the title and author come from `book/book.json`, and its
 * `cover` image, when it names one, is the first page. Nothing else in the story is read.
 *
 *   node src/projects/audiobook/novel/build-novel.ts <slug> <out.pdf|out.epub>
 *   node src/projects/audiobook/novel/build-novel.ts --list     the slugs of stories with chapters
 *
 * The PDF needs `typst` on the PATH, or its path in the TYPST environment variable. The GitHub
 * workflow `novel-pdf.yml` runs it on every push to main that touches a story's chapters or
 * book, and publishes each story's PDF and EPUB to its own release.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, resolve } from "node:path";
import process from "node:process";
import { writeEpub } from "./epub.ts";

const HERE = import.meta.dirname;
const STORIES = resolve(HERE, "../drama/stories");
const TEMPLATE = join(HERE, "novel.typ");

interface Chapter {
  number: number;
  title: string;
  body: string;
}

interface Novel {
  title: string;
  author: string;
  cover: string | null;
  /** Height over width, so the cover gets a page of its own shape. */
  "cover-aspect": number | null;
  edition: string;
  chapters: Chapter[];
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function show(path: string): string {
  return relative(process.cwd(), path).replaceAll("\\", "/");
}

function chapterFiles(slug: string): string[] {
  const dir = join(STORIES, slug, "chapters");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => Number(a) - Number(b))
    .map((name) => join(dir, name, "chapter.md"))
    .filter((file) => existsSync(file));
}

function storiesWithChapters(): string[] {
  return readdirSync(STORIES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && chapterFiles(entry.name).length > 0)
    .map((entry) => entry.name)
    .sort();
}

/** A chapter's number must be its place in the book, and its only heading the first line:
 *  anything else would typeset a different book from the one the files describe. */
function readChapter(file: string, place: number): Chapter {
  const lines = readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n");
  const heading = /^# Chapter (\d+): (.+)$/.exec(lines[0]);
  if (!heading) fail(`${show(file)}: the first line must be "# Chapter N: Title", not "${lines[0]}".`);
  const number = Number(heading[1]);
  if (number !== place) fail(`${show(file)} is chapter ${place} in folder order but calls itself chapter ${number}.`);
  const body = lines.slice(1);
  body.forEach((line, i) => {
    const where = `${show(file)}:${i + 2}`;
    if (/^#{1,6}\s/.test(line)) fail(`${where}: a chapter has one heading, its first line.`);
    // In Markdown a `---` straight under a line of text underlines it as a heading.
    if (/^\s*(-{3,}|={3,})\s*$/.test(line) && i > 0 && body[i - 1].trim() !== "") {
      fail(`${where}: a scene break needs a blank line above it.`);
    }
  });
  return { number, title: heading[2].trim(), body: body.join("\n") };
}

function readBook(slug: string): { title: string; author: string; cover: string | null } {
  const file = join(STORIES, slug, "book", "book.json");
  if (!existsSync(file)) fail(`${show(file)} is missing: it gives the book's title and author.`);
  const book = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  const { title, author, cover } = book;
  if (typeof title !== "string" || typeof author !== "string") fail(`${show(file)} needs a "title" and an "author".`);
  if (cover === undefined) return { title, author, cover: null };
  if (typeof cover !== "string") fail(`${show(file)}: "cover" must be a file name.`);
  const coverFile = join(STORIES, slug, "book", cover);
  if (!existsSync(coverFile)) fail(`${show(file)} names a cover, ${cover}, that isn't there.`);
  return { title, author, cover: coverFile };
}

/** A PNG's height over its width, from its header. */
function pngAspect(file: string): number {
  const bytes = readFileSync(file);
  if (bytes.toString("latin1", 1, 4) !== "PNG") fail(`${show(file)}: the cover must be a PNG.`);
  return bytes.readUInt32BE(20) / bytes.readUInt32BE(16);
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: HERE, encoding: "utf8" }).trim();
}

/** Which draft this is, since the book keeps changing: the commit, and whether the story had
 *  changes not yet committed when it was built. */
function edition(slug: string): string {
  const commit = git("rev-parse", "--short", "HEAD");
  const date = new Date(git("log", "-1", "--format=%cI")).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const dirty = git("status", "--porcelain", "--", join(STORIES, slug)) !== "";
  return `Draft of ${date}, from commit ${commit}${dirty ? " with uncommitted changes" : ""}.`;
}

function build(slug: string, out: string): void {
  const files = chapterFiles(slug);
  if (files.length === 0) fail(`stories/${slug} has no chapters/<nn>/chapter.md.`);
  const book = readBook(slug);
  const chapters = files.map((file, i) => readChapter(file, i + 1));

  const format = extname(out).toLowerCase();
  if (format === ".epub") {
    if (book.cover) pngAspect(book.cover);
    const cover = book.cover ? readFileSync(book.cover) : null;
    try {
      writeEpub({ slug, title: book.title, author: book.author, edition: edition(slug), cover, chapters }, resolve(out));
    } catch (error) {
      fail((error as Error).message);
    }
  } else if (format === ".pdf") {
    typeset(book, chapters, slug, out);
  } else {
    fail(`${out}: the output must be a .pdf or an .epub.`);
  }
  console.log(`${book.title}: ${chapters.length} chapters -> ${basename(out)}`);
}

function typeset(book: ReturnType<typeof readBook>, chapters: Chapter[], slug: string, out: string): void {
  const work = mkdtempSync(join(tmpdir(), "novel-"));
  try {
    copyFileSync(TEMPLATE, join(work, "novel.typ"));
    let cover: string | null = null;
    let coverAspect: number | null = null;
    if (book.cover) {
      cover = `cover${extname(book.cover)}`;
      coverAspect = pngAspect(book.cover);
      copyFileSync(book.cover, join(work, cover));
    }
    const novel: Novel = {
      title: book.title,
      author: book.author,
      cover,
      "cover-aspect": coverAspect,
      edition: edition(slug),
      chapters,
    };
    writeFileSync(join(work, "novel.json"), JSON.stringify(novel));

    const typst = process.env.TYPST ?? "typst";
    // Typst's own fonts only, so a build here and on GitHub's runner typeset the same pages.
    const args = ["compile", "--ignore-system-fonts", join(work, "novel.typ"), resolve(out)];
    const run = spawnSync(typst, args, { encoding: "utf8" });
    if (run.error) fail(`Couldn't run Typst (${typst}): ${run.error.message}`);
    if (run.status !== 0) fail(`Typst failed:\n${run.stderr}`);
    // A warning is usually a glyph the fonts lack, drawn from a fallback: a flaw to fix, not to ship.
    if (run.stderr.includes("warning")) fail(`Typst warned:\n${run.stderr}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const [first, second] = process.argv.slice(2);
if (first === "--list") {
  console.log(storiesWithChapters().join("\n"));
} else if (first && second) {
  build(first, second);
} else {
  fail("Usage: build-novel.ts <slug> <out.pdf|out.epub>  |  build-novel.ts --list");
}
