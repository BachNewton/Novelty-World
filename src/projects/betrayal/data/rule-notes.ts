import type { RuleRef } from "../types";

// The rule text and rulings behind each rule source, so a log line can say
// "why?". They are read out of content/ into rule-notes.json, which a test
// keeps in step with content/ (run `npx vitest run -u` on the Betrayal tests
// after editing content/). It is large, so the UI loads it only when asked.

/** A `> Note:` in content/ and the `> Resolution (authority):` under it. */
export interface Ruling {
  /** The note's id, written `> Note [id]:`, for the rules that cite it. */
  id?: string;
  note: string;
  /** official, designer, community, project or unresolved. */
  authority: string | null;
  resolution: string | null;
}

/** One entry of content/: a room, card or token, or a rulebook section. */
export interface RuleText {
  title: string;
  /** The rule as content/ restates it, one line per bullet or table row. */
  lines: string[];
  rulings: Ruling[];
}

export interface RuleNotes {
  rooms: Record<string, RuleText>;
  cards: Record<string, RuleText>;
  tokens: Record<string, RuleText>;
  /** Rulebook sections by page. */
  pages: Partial<Record<string, RuleText[]>>;
}

/** What content/ says about a rule source. A haunt's own text isn't read yet,
 *  and a scenario is no rule at all. */
export function ruleTexts(notes: RuleNotes, rule: RuleRef): RuleText[] {
  const one = (entry: RuleText | undefined) => (entry ? [entry] : []);
  switch (rule.source) {
    case "rulebook":
      return notes.pages[rule.page] ?? [];
    case "room":
      return one(notes.rooms[rule.room]);
    case "card":
      return one(notes.cards[rule.card]);
    case "token":
      return one(notes.tokens[rule.token]);
    case "haunt":
    case "scenario":
      return [];
  }
}

/** What to show for "why?": the rule's texts, or, for a reference naming a
 *  ruling, only the entry holding that ruling and only that ruling. A ruling
 *  the source doesn't have is a broken reference, so it throws. */
export function ruleDetail(notes: RuleNotes, rule: RuleRef): RuleText[] {
  const texts = ruleTexts(notes, rule);
  const id = rule.ruling;
  if (id === undefined) return texts;
  for (const text of texts) {
    const ruling = text.rulings.find((r) => r.id === id);
    if (ruling) return [{ ...text, rulings: [ruling] }];
  }
  throw new Error(`No ruling ${id} in ${JSON.stringify(rule)}`);
}

export async function loadRuleNotes(): Promise<RuleNotes> {
  return (await import("./rule-notes.json")).default as RuleNotes;
}
