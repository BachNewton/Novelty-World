import { readFileSync } from "node:fs";
import path from "node:path";

// Test-side reader for the regular fields of content/. The typed data is
// hand-written; tests read these facts back out of the prose and compare.

export interface Section {
  heading: string;
  body: string;
}

export function readContent(file: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-only reader; the path is this project's content/ folder joined with a file name the tests hardcode, never external input
  return readFileSync(path.join(__dirname, "..", "content", file), "utf8");
}

/** The level-2 sections of a content file. */
export function sections(text: string): Section[] {
  return text
    .split(/^## /m)
    .slice(1)
    .map((chunk) => {
      const newline = chunk.indexOf("\n");
      return {
        heading: chunk.slice(0, newline).trim(),
        body: chunk.slice(newline + 1),
      };
    });
}

/** A `- Key: value` field, or null when the section has none. */
export function field(section: Section, key: string): string | null {
  const line = section.body.split("\n").find((l) => l.startsWith(`- ${key}:`));
  return line === undefined ? null : line.slice(key.length + 3).trim();
}

export function requiredField(section: Section, key: string): string {
  const value = field(section, key);
  if (value === null) throw new Error(`${section.heading} has no ${key} field`);
  return value;
}

/** The rows of the markdown table whose header row starts with these cells. */
export function table(text: string, ...header: string[]): string[][] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => {
    const cells = cellsOf(line);
    return header.every((h, i) => cells[i] === h);
  });
  if (start < 0) throw new Error(`No table headed ${header.join(" | ")}`);
  const rows: string[][] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    rows.push(cellsOf(line));
  }
  return rows;
}

function cellsOf(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** "a, b, c (prose)" or "a, b; prose": the leading list, before any prose. */
export function leadingList(value: string): string[] {
  if (value.startsWith("none")) return [];
  return value
    .split(/[(;]/)[0]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
