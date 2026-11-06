import type { Point } from "./compass";
import { VALID, type Background } from "./background";
import { STATEMENTS, type Answer, type Answers, type Stakes } from "./quiz";

/** A result someone chose to share, as everyone sees it. */
export interface SharedResult extends Point {
  id: string;
  /** Stands for the profile that shared it, so one person's results join up
   *  into a trail without giving their profile id away: whoever holds a
   *  profile id can remove its results. */
  person: string;
  name: string;
  takenAt: string;
  background: Background;
  byStakes: Record<Stakes, Point>;
}

export interface Submission {
  profileId: string;
  name: string;
  answers: Answers;
  background: Background;
}

export const NAME_MAX = 20;

const PROFILE_ID = /^[A-Za-z0-9-]{1,64}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isProfileId(value: unknown): value is string {
  return typeof value === "string" && PROFILE_ID.test(value);
}

function isAnswer(value: unknown): value is Answer {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4;
}

/** Every statement answered once, and nothing else. */
function parseAnswers(value: unknown): Answers | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).length !== STATEMENTS.length) return null;
  const answers: Answers = {};
  for (const { id } of STATEMENTS) {
    const answer = value[id];
    if (!isAnswer(answer)) return null;
    answers[id] = answer;
  }
  return answers;
}

function parseChoices(value: unknown, valid: Set<string>): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > valid.size) return null;
  const choices = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || !valid.has(id)) return null;
    choices.add(id);
  }
  return [...choices];
}

/** The optional questions: each one left out, or answered from its own list. */
export function parseBackground(value: unknown): Background | null {
  if (!isRecord(value)) return null;
  const background: Background = {};
  if (value.since !== undefined) {
    if (typeof value.since !== "string" || !VALID.since.has(value.since)) return null;
    background.since = value.since;
  }
  for (const key of ["uses", "tools", "models"] as const) {
    const choices = parseChoices(value[key], VALID[key]);
    if (choices === null) return null;
    if (choices !== undefined && choices.length > 0) background[key] = choices;
  }
  return background;
}

export function parseSubmission(value: unknown): Submission | null {
  if (!isRecord(value) || !isProfileId(value.profileId) || typeof value.name !== "string") return null;
  const name = value.name.trim();
  if (name.length === 0 || name.length > NAME_MAX) return null;
  const answers = parseAnswers(value.answers);
  const background = parseBackground(value.background);
  if (answers === null || background === null) return null;
  return { profileId: value.profileId, name, answers, background };
}

function isPoint(value: unknown): value is Point {
  return isRecord(value) && typeof value.scope === "number" && typeof value.ownership === "number";
}

export function parseByStakes(value: unknown): Record<Stakes, Point> | null {
  if (!isRecord(value)) return null;
  const { low, mid, high } = value;
  if (!isPoint(low) || !isPoint(mid) || !isPoint(high)) return null;
  return { low, mid, high };
}

export async function personKey(profileId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(profileId));
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
