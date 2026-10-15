/*
 * The rules as the Why dialog shows them, read out of `RULES.md`: each rule's title and text,
 * and each note's text with its resolutions, by the ids events cite (`COMBAT-4`,
 * `defender-dice`). `rules-data.ts` holds them, written by `write-rules-data.ts`; a test holds it
 * equal to `RULES.md`, so the screen never explains a rule that has changed.
 */

export interface RuleText {
  title: string;
  /** Paragraphs, as plain text: citation tags and markdown emphasis taken out. */
  paragraphs: string[];
}

const HEADING = /^### ([A-Z]+-\d+) (.+)$/;
const NOTE = /^> Note \[([a-z0-9-]+)\]: (.*)$/;

const SOURCES: Record<string, string> = { R93: "the classic rulebook", H15: "the 2015 rulebook", FAQ: "the Risk FAQ", GD: "the official digital game" };
/** A run of source tags, "[R93], [H15]", marked off so it can be read as one. */
const TAGS = /\[(?:R93|H15|FAQ|GD)\](?:, \[(?:R93|H15|FAQ|GD)\])*/g;
/** A run citing the sentence before it: after its stop, at the end or before a new sentence. A
 *  run inside a sentence ("as [R93] does") is read as a source's name. */
const CITED_AFTER_STOP = /(?<=[.:)]) ?«[^»]*»\.?(?= [A-Z(]|$)/g;

function plain(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(TAGS, (run) => `«${run}»`)
    .replace(CITED_AFTER_STOP, "")
    .replace(/«([^»]*)»/g, (_, run: string) =>
      run
        .split(", ")
        .map((tag) => SOURCES[tag.slice(1, -1)])
        .join(" and "),
    )
    .replace(/\bthe\s+the\b/g, "the")
    .replace(/(^|[.!?] )the /g, "$1The ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

/** Every rule and note in the rules' markdown, by id. */
export function extractRules(markdown: string): Record<string, RuleText> {
  const rules: Record<string, RuleText> = {};
  let current: { id: string; text: RuleText; paragraph: string[] } | null = null;
  const flush = () => {
    if (current && current.paragraph.length > 0) current.text.paragraphs.push(plain(current.paragraph.join(" ")));
    if (current) current.paragraph = [];
  };
  const close = () => {
    flush();
    if (current) rules[current.id] = current.text;
    current = null;
  };
  let note: { id: string; text: RuleText; paragraph: string[] } | null = null;
  const closeNote = () => {
    if (note) {
      if (note.paragraph.length > 0) note.text.paragraphs.push(plain(note.paragraph.join(" ")));
      rules[note.id] = note.text;
    }
    note = null;
  };

  for (const line of markdown.split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    const noteStart = NOTE.exec(line);
    if (heading || line.startsWith("## ") || line.startsWith("---")) {
      closeNote();
      close();
      if (heading) current = { id: heading[1], text: { title: plain(heading[2]), paragraphs: [] }, paragraph: [] };
      continue;
    }
    if (noteStart) {
      closeNote();
      flush();
      note = { id: noteStart[1], text: { title: `Note: ${noteStart[1].replace(/-/g, " ")}`, paragraphs: [] }, paragraph: [noteStart[2]] };
      continue;
    }
    if (note && line.startsWith(">")) {
      const body = line.replace(/^>\s?/, "");
      if (body.startsWith("Resolution")) {
        note.text.paragraphs.push(plain(note.paragraph.join(" ")));
        note.paragraph = [body];
      } else note.paragraph.push(body);
      continue;
    }
    if (note) closeNote();
    if (!current) continue;
    if (line.trim() === "") flush();
    else if (line.startsWith("- ")) {
      flush();
      current.paragraph.push(line.replace(/^- /, "• "));
    } else if (!line.startsWith("|")) current.paragraph.push(line);
  }
  closeNote();
  close();
  return rules;
}
