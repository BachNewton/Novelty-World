/**
 * Parallel audiobook generator with per-chapter caching. Writes each
 * synthesized chapter to scripts/.audiobook-cache/<hash>.mp3 (hashed from
 * the chapter text), then concatenates them all at the end. A second run
 * with unchanged content is nearly instant — only added/edited chapters
 * re-synthesize.
 *
 *   node scripts/generate-finland-audiobook.ts
 *
 * Runs CONCURRENCY workers, each holding its own MsEdgeTTS WebSocket. The
 * Edge TTS endpoint is community-reported to tolerate ~10 concurrent
 * connections from a single IP; 6 leaves comfortable headroom.
 *
 * Output: finland-catalogue-audiobook.mp3 at the repo root.
 */

import { writeFile, mkdir, readFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { IDEAS } from "../src/projects/finland-catalogue/ideas/index.ts";
import { TOPICS } from "../src/projects/finland-catalogue/topics/index.ts";
import type { Idea } from "../src/projects/finland-catalogue/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(
  __dirname,
  "..",
  "finland-catalogue-audiobook.mp3",
);
const CACHE_DIR = resolve(__dirname, ".audiobook-cache");

const VOICE = "en-US-AvaMultilingualNeural";
const CONCURRENCY = 6;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const COMPLEXITY_PHRASE: Record<Idea["accessFromLauttasaari"]["complexity"], string> = {
  simple: "a simple trip",
  moderate: "a moderate trip",
  complex: "a more involved trip",
};

function summarizeMonthsSpoken(months: readonly number[]): string {
  if (months.length >= 12) return "year-round";
  if (months.length === 0) return "anytime";
  const set = new Set(months);
  let start = -1;
  for (let m = 1; m <= 12; m++) {
    const prev = m === 1 ? 12 : m - 1;
    if (set.has(m) && !set.has(prev)) {
      start = m;
      break;
    }
  }
  if (start === -1) start = 1;
  const runs: number[][] = [];
  let current: number[] = [];
  let m = start;
  for (let i = 0; i < 12; i++) {
    if (set.has(m)) current.push(m);
    else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
    m = m === 12 ? 1 : m + 1;
  }
  if (current.length > 0) runs.push(current);
  return runs
    .map((run) =>
      run.length === 1
        ? MONTH_NAMES[run[0] - 1]
        : `${MONTH_NAMES[run[0] - 1]} through ${MONTH_NAMES[run[run.length - 1] - 1]}`,
    )
    .join(", and ");
}

function formatChildren(idea: Idea): string {
  if (!idea.suitableAgeRange) {
    return "Children-friendly: not particularly suited for kids.";
  }
  const { min, max } = idea.suitableAgeRange;
  if (max === undefined) {
    if (min === 0) return "Children-friendly: suitable for all ages.";
    return `Children-friendly: best for ages ${min} and up.`;
  }
  if (min === max) return `Children-friendly: best for age ${min}.`;
  return `Children-friendly: best for ages ${min} to ${max}.`;
}

function ideaScript(idea: Idea, index: number, total: number): string {
  const access = `Access from Lauttasaari: ${COMPLEXITY_PHRASE[idea.accessFromLauttasaari.complexity]}, about ${idea.accessFromLauttasaari.duration}.`;
  const when = `When to go: ${summarizeMonthsSpoken(idea.availability.suitableMonths)}.`;
  const kids = formatChildren(idea);
  return [
    `Idea ${index} of ${total}. ${idea.title}.`,
    idea.shortDescription,
    `${access} ${when} ${kids}`,
    ...idea.longDescription,
  ].join("\n\n");
}

function topicScript(
  topic: (typeof TOPICS)[number],
  index: number,
  total: number,
): string {
  return [
    `Topic ${index} of ${total}. ${topic.title}.`,
    topic.shortDescription,
    ...topic.longDescription,
  ].join("\n\n");
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function synthesize(tts: MsEdgeTTS, text: string): Promise<Buffer> {
  return new Promise((res, rej) => {
    const chunks: Buffer[] = [];
    const { audioStream } = tts.toStream(escapeXml(text));
    audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    audioStream.on("end", () => res(Buffer.concat(chunks)));
    audioStream.on("error", rej);
  });
}

async function synthesizeWithCache(
  tts: MsEdgeTTS,
  text: string,
): Promise<{ buf: Buffer; cached: boolean }> {
  const cachePath = join(CACHE_DIR, `${hashText(text)}.mp3`);
  if (await fileExists(cachePath)) {
    return { buf: await readFile(cachePath), cached: true };
  }
  const buf = await synthesize(tts, text);
  await writeFile(cachePath, buf);
  return { buf, cached: false };
}

async function main(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });

  console.log(
    `Generating audiobook (parallel, ${CONCURRENCY} workers): ${IDEAS.length} ideas + ${TOPICS.length} topics`,
  );
  console.log(`Cache: ${CACHE_DIR}`);
  console.log(`Output: ${OUT_PATH}\n`);

  const sections: { label: string; text: string }[] = [];

  sections.push({
    label: "Intro",
    text: `Welcome to the Finland Catalogue Audiobook. A hand-curated guide to ${IDEAS.length} things to do in and around Helsinki, followed by ${TOPICS.length} short explainers about Finland itself. Sit back, and let's begin.`,
  });
  sections.push({
    label: "Part 1",
    text: `Part One: Ideas. ${IDEAS.length} ideas for what to do.`,
  });
  IDEAS.forEach((idea, i) => {
    sections.push({
      label: `Idea ${i + 1}/${IDEAS.length}: ${idea.title}`,
      text: ideaScript(idea, i + 1, IDEAS.length),
    });
  });
  sections.push({
    label: "Part 2",
    text: `Part Two: Topics. ${TOPICS.length} short explainers about Finland.`,
  });
  TOPICS.forEach((topic, i) => {
    sections.push({
      label: `Topic ${i + 1}/${TOPICS.length}: ${topic.title}`,
      text: topicScript(topic, i + 1, TOPICS.length),
    });
  });
  sections.push({
    label: "Outro",
    text: "This was the Finland Catalogue Audiobook. Thanks for listening.",
  });

  const workers = await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      return tts;
    }),
  );

  const results: (Buffer | undefined)[] = new Array(sections.length);
  let nextIndex = 0;
  let completed = 0;
  const startedAt = Date.now();

  await Promise.all(
    workers.map(async (worker, workerId) => {
      while (true) {
        const i = nextIndex++;
        if (i >= sections.length) break;
        const s = sections[i];
        const t = Date.now();
        const { buf, cached } = await synthesizeWithCache(worker, s.text);
        results[i] = buf;
        completed++;
        const totalElapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
        const tag = cached ? "cached" : `${((Date.now() - t) / 1000).toFixed(1)}s`;
        console.log(
          `[${completed}/${sections.length}] (w${workerId}) ${s.label} — ${(buf.length / 1024).toFixed(0)} KB ${tag} (total ${totalElapsed}s)`,
        );
      }
    }),
  );

  workers.forEach((w) => w.close());

  const final = Buffer.concat(results.filter((b): b is Buffer => b !== undefined));
  await writeFile(OUT_PATH, final);
  console.log(
    `\nDone. ${(final.length / 1024 / 1024).toFixed(1)} MB written to ${OUT_PATH}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
