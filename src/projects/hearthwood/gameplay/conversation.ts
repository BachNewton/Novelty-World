import type { Role } from "../engine/people";
import { storyOf } from "../stories/library";
import { KEEPSAKES, talksOf, TONES, type Gift, type Keepsake, type Page, type Parcel, type Story, type Tone } from "../stories/story";
import { canFulfil, takingFor, type Means, type Taking } from "./help";
import { isDish, isFood, RECIPE_IDS, type RecipeId } from "./recipes";

/*
 * Talking with people, as rules: what Elliott's acquaintance with each
 * person remembers (that they met, the tone Elliott took with them last,
 * how their help stands, what Elliott brought them and what they gave),
 * what Elliott carries for someone, and the gifts received (recipes hinted
 * in the book, keepsakes for camp, lost animals gone home). A meeting opens
 * the talk its story's kind and that memory call for; a talk is its pages,
 * each a line and maybe a choice of tone, whose reply shows before the next
 * page. Whatever a talk does (asking for help, taking what answers it, its
 * gifts) happens the moment it opens, so walking off halfway loses nothing.
 * Kept on the device under a key of its own, which names the shape it is
 * kept in; a person's id holds only as long as the people's placement does,
 * so a change to that starts a new key too.
 */

export type HelpState = "none" | "asked" | "delivered" | "given";

export interface Acquaintance {
  role: Role;
  seed: string;
  story: string;
  /** When they were first met, as a count: the journal's order. */
  order: number;
  /** How many talks Elliott has had with them. */
  talks: number;
  /** The tone Elliott took with them last, which their greeting answers. */
  tone: Tone | null;
  help: HelpState;
  /** What Elliott brought them: a dish or a kind of forage, by its id. */
  gave: string | null;
  /** What they gave Elliott. */
  received: Gift[];
}

export interface Carried {
  parcel: Parcel;
  from: string;
  to: string;
}

export interface FolkMemory {
  known: Record<string, Acquaintance>;
  carrying: Carried[];
  /** Recipes hinted in the book, with what goes into them. */
  hints: RecipeId[];
  keepsakes: Keepsake[];
  /** Lost animals gone home to their people, by the animal's id. */
  home: string[];
}

export const PEOPLE_KEY = "hearthwood/people/v1";

export function noAcquaintances(): FolkMemory {
  return { known: {}, carrying: [], hints: [], keepsakes: [], home: [] };
}

export type TalkName = "meet" | "friend" | "waiting" | "thanks" | "delivered";

/** Who is talked with: what the conversation needs of the person as the world placed them. */
export interface Speaker {
  id: string;
  role: Role;
  seed: string;
  story: string;
  /** The other one of a carried note, by id. */
  partner: string | null;
}

/** What Elliott has with them as they meet someone; whether a note they gave has arrived is the memory's to say. */
export type Having = Omit<Means, "delivered">;

/** The talk a meeting opens, from the story and what has been done. */
export function talkFor(story: Story, memory: FolkMemory, speaker: Speaker, means: Having): TalkName {
  const known = memory.known[speaker.id] as Acquaintance | undefined;
  switch (story.kind) {
    case "talk":
      return known ? "friend" : "meet";
    case "receive":
      if (memory.carrying.some((c) => c.to === speaker.id)) return "delivered";
      if (!known) return "meet";
      return known.help === "given" ? "friend" : "waiting";
    case "help":
      if (!known) return "meet";
      if (known.help === "given") return "friend";
      return canFulfil(story.request, { ...means, delivered: known.help === "delivered" }) ? "thanks" : "waiting";
  }
}

/** A talk's pages: a friend's greeting, by the tone Elliott took last, comes first. */
export function pagesOf(story: Story, talk: TalkName, tone: Tone | null): readonly Page[] {
  if (talk === "friend") return [{ say: story.friend.greet[tone ?? "warm"] }, ...story.friend.pages];
  const found = talksOf(story)[talk] as { pages: readonly Page[] } | undefined;
  if (!found) throw new Error(`Story ${story.id} has no ${talk} talk`);
  return found.pages;
}

export function giftsOf(story: Story, talk: TalkName): readonly Gift[] {
  return (talksOf(story)[talk] as { gifts?: readonly Gift[] } | undefined)?.gifts ?? [];
}

/** What opening a talk did: the memory after it, and what it took from Elliott, if anything. */
export interface Opened {
  memory: FolkMemory;
  talk: TalkName;
  taking: Taking | null;
  /** Whether a lost animal brought back stays with Elliott (true) or goes home (false); null where none was. */
  keepsPet: boolean | null;
}

const giftKey = (g: Gift) => (g.kind === "hint" ? `hint:${g.recipe}` : g.kind === "keepsake" ? `keepsake:${g.keepsake}` : "companion");

function receive(memory: FolkMemory, id: string, gifts: readonly Gift[]): FolkMemory {
  if (gifts.length === 0) return memory;
  const known = memory.known[id];
  const had = new Set(known.received.map(giftKey));
  const received = [...known.received, ...gifts.filter((g) => !had.has(giftKey(g)))];
  const hints = [...memory.hints];
  const keepsakes = [...memory.keepsakes];
  for (const gift of gifts) {
    if (gift.kind === "hint" && !hints.includes(gift.recipe)) hints.push(gift.recipe);
    if (gift.kind === "keepsake" && !keepsakes.includes(gift.keepsake)) keepsakes.push(gift.keepsake);
  }
  return { ...memory, hints, keepsakes, known: { ...memory.known, [id]: { ...known, received } } };
}

const withKnown = (memory: FolkMemory, id: string, change: Partial<Acquaintance>): FolkMemory => ({ ...memory, known: { ...memory.known, [id]: { ...memory.known[id], ...change } } });

/** Opens the talk a meeting calls for, and does what it does: meeting them, asking, thanking, a note arriving, and its gifts. */
export function openTalk(memory: FolkMemory, speaker: Speaker, means: Having): Opened {
  const story = storyOf(speaker.story);
  const talk = talkFor(story, memory, speaker, means);
  let out = memory;
  if (!(speaker.id in out.known)) {
    const order = Object.keys(out.known).length;
    out = { ...out, known: { ...out.known, [speaker.id]: { role: speaker.role, seed: speaker.seed, story: story.id, order, talks: 0, tone: null, help: "none", gave: null, received: [] } } };
  }
  out = withKnown(out, speaker.id, { talks: out.known[speaker.id].talks + 1 });
  let taking: Taking | null = null;
  let keepsPet: boolean | null = null;

  if (story.kind === "help" && talk === "meet") {
    out = withKnown(out, speaker.id, { help: "asked" });
    if (story.request.kind === "carry") {
      if (speaker.partner === null) throw new Error(`${speaker.id} gives a note to nobody`);
      out = { ...out, carrying: [...out.carrying, { parcel: story.request.parcel, from: speaker.id, to: speaker.partner }] };
    }
  }
  if (story.kind === "help" && talk === "thanks") {
    taking = takingFor(story.request, { ...means, delivered: out.known[speaker.id].help === "delivered" });
    const gave = taking.kind === "dish" ? taking.dish : taking.kind === "forage" ? taking.foods[0][0] : null;
    out = withKnown(out, speaker.id, { help: "given", gave });
    if (taking.kind === "pet") {
      keepsPet = story.thanks.gifts?.some((g) => g.kind === "companion") === true;
      if (!keepsPet) out = { ...out, home: [...out.home, `lost/${speaker.id}`] };
    }
  }
  if (talk === "delivered") {
    const carried = out.carrying.filter((c) => c.to === speaker.id);
    out = withKnown({ ...out, carrying: out.carrying.filter((c) => c.to !== speaker.id) }, speaker.id, { help: "given" });
    for (const c of carried) if (c.from in out.known) out = withKnown(out, c.from, { help: "delivered" });
  }
  out = receive(out, speaker.id, giftsOf(story, talk));
  return { memory: out, talk, taking, keepsPet };
}

/** Elliott took a tone with them: remembered for how they greet Elliott next. */
export function rememberTone(memory: FolkMemory, id: string, tone: Tone): FolkMemory {
  return withKnown(memory, id, { tone });
}

/** A talk under way: its page, and the tone Elliott chose there, while the reply shows. */
export interface Conversation {
  person: string;
  talk: TalkName;
  page: number;
  chose: Tone | null;
}

export function beginConversation(person: string, talk: TalkName): Conversation {
  return { person, talk, page: 0, chose: null };
}

/** Whether the page shown waits for a choice before it can go on. */
export function awaitsChoice(conversation: Conversation, pages: readonly Page[]): boolean {
  return conversation.chose === null && (pages[conversation.page].choices?.length ?? 0) > 0;
}

/** Chooses a tone on the page shown. */
export function choose(conversation: Conversation, pages: readonly Page[], tone: Tone): Conversation {
  if (!awaitsChoice(conversation, pages)) throw new Error(`Page ${conversation.page} of ${conversation.talk} has no choice to make`);
  if (!pages[conversation.page].choices?.some((c) => c.tone === tone)) throw new Error(`No ${tone} choice on page ${conversation.page}`);
  return { ...conversation, chose: tone };
}

/** On to the next page, or null when the talk is over. */
export function nextPage(conversation: Conversation, pages: readonly Page[]): Conversation | null {
  if (awaitsChoice(conversation, pages)) throw new Error("A choice is waiting to be made");
  const page = conversation.page + 1;
  return page < pages.length ? { ...conversation, page, chose: null } : null;
}

/** Whether a talk ending leads straight into another: help answered at once, as it was asked. */
export function followsOn(talk: TalkName, next: TalkName): boolean {
  return talk === "meet" && (next === "thanks" || next === "delivered");
}

/** A text with what the world decides put into its braces; a name for a thing is lowercased where it falls mid-sentence. */
export function fill(text: string, values: Partial<Record<"name" | "pet" | "way" | "partner" | "dish" | "gave", string>>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string, at: number) => {
    const value = values[key as keyof typeof values];
    if (value === undefined) throw new Error(`Nothing to put in ${whole} in "${text}"`);
    const startsSentence = at === 0 || /[.!?]\s$/.test(text.slice(0, at)) || /['"]$/.test(text.slice(0, at));
    return (key === "dish" || key === "gave") && !startsSentence ? value.charAt(0).toLowerCase() + value.slice(1) : value;
  });
}

export function serializeFolk(memory: FolkMemory): string {
  return JSON.stringify(memory);
}

const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const HELP: readonly HelpState[] = ["none", "asked", "delivered", "given"];

function parseGift(g: unknown): Gift {
  const { kind, recipe, keepsake } = (g ?? {}) as Record<string, unknown>;
  if (kind === "hint" && (RECIPE_IDS as readonly unknown[]).includes(recipe)) return { kind, recipe: recipe as RecipeId };
  if (kind === "keepsake" && (KEEPSAKES as readonly unknown[]).includes(keepsake)) return { kind, keepsake: keepsake as Keepsake };
  if (kind === "companion") return { kind };
  throw new Error(`A kept gift isn't one: ${JSON.stringify(g)}`);
}

/** A kept record read back. Anything but the shape this key holds is a bug in what wrote it, and says so. */
export function parseFolk(text: string): FolkMemory {
  const data = JSON.parse(text) as Record<string, unknown>;
  const { known, carrying, hints, keepsakes, home } = data;
  if (typeof known !== "object" || known === null || !Array.isArray(carrying) || !Array.isArray(hints) || !Array.isArray(keepsakes) || !Array.isArray(home)) {
    throw new Error(`The kept people under ${PEOPLE_KEY} aren't acquaintances and gifts: ${text}`);
  }
  const out = noAcquaintances();
  for (const [id, a] of Object.entries(known)) {
    const { role, seed, story, order, talks, tone, help, gave, received } = (a ?? {}) as Record<string, unknown>;
    if (!isText(role) || !isText(seed) || !isText(story) || typeof order !== "number" || typeof talks !== "number" || !(tone === null || (TONES as readonly unknown[]).includes(tone)) || !(HELP as readonly unknown[]).includes(help) || !(gave === null || (isText(gave) && (isDish(gave) || isFood(gave)))) || !Array.isArray(received)) {
      throw new Error(`A kept acquaintance isn't one: ${JSON.stringify(a)}`);
    }
    storyOf(story);
    out.known[id] = { role: role as Role, seed, story, order, talks, tone: tone as Tone | null, help: help as HelpState, gave: gave as string | null, received: received.map(parseGift) };
  }
  for (const c of carrying as unknown[]) {
    const { parcel, from, to } = (c ?? {}) as Record<string, unknown>;
    if (parcel !== "note" || !isText(from) || !isText(to)) throw new Error(`A kept parcel isn't one: ${JSON.stringify(c)}`);
    out.carrying.push({ parcel, from, to });
  }
  for (const h of hints as unknown[]) {
    if (!(RECIPE_IDS as readonly unknown[]).includes(h)) throw new Error(`A kept hint isn't a recipe: ${String(h)}`);
    out.hints.push(h as RecipeId);
  }
  for (const k of keepsakes as unknown[]) {
    if (!(KEEPSAKES as readonly unknown[]).includes(k)) throw new Error(`A kept keepsake isn't one: ${String(k)}`);
    out.keepsakes.push(k as Keepsake);
  }
  for (const h of home as unknown[]) {
    if (!isText(h)) throw new Error(`A kept animal gone home isn't one: ${String(h)}`);
    out.home.push(h);
  }
  return out;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** What was kept on this device, or nobody met yet where nothing was (or the device keeps nothing). */
export function loadFolk(): FolkMemory {
  let text: string | null = null;
  try {
    text = storage()?.getItem(PEOPLE_KEY) ?? null;
  } catch {
    // Storage that throws on reading keeps nothing: the walk goes on unsaved.
    return noAcquaintances();
  }
  return text === null ? noAcquaintances() : parseFolk(text);
}

export function saveFolk(memory: FolkMemory): void {
  try {
    storage()?.setItem(PEOPLE_KEY, serializeFolk(memory));
  } catch {
    // A full or refused storage keeps nothing; the people still remember Elliott for this visit.
  }
}
