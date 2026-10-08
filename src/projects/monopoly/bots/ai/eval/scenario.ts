import { SPACES } from "../../../data";
import { projectTrade } from "../../../engine";
import { hasMonopoly } from "../../../logic";
import type { AiDecision, GameState, Intent, PropertyColor, TradeTerms } from "../../../types";
import type { Settled } from "../decide";
import type { AiResolution } from "../spec";

// A scenario is one hand-made position where an AI seat owes one decision.
//
// Scenarios are a TOOL, not the truth: the suite finds errors fast, but only
// real games decide whether a version plays better. So a scenario never grades
// a choice strong players could reasonably differ on. Each one is one of two
// kinds:
//
// - `error`: an objective mistake is possible here, and `error` names it when it
//   happens: a move no strong player would make (selling below what a mortgage
//   pays, terms whose cash runs the wrong way, breaking up houses when spare lots
//   cover the debt). These are gated: a version should make none.
// - `judgment`: strong players could differ. The scenario only RECORDS what the
//   seat chose (`choose`), and the scoreboard reports the spread across
//   repetitions. It is never pass or fail.
//
// Either kind counts an unusable answer (one the settle step rejects) as an
// error, since that is never a matter of taste, and so are four mistakes that
// are objective in any position (`SHARED_CHECKS`): a proposal or counter whose
// terms contradict the seat's own message, a note or plan that claims control
// over where the seat lands, a pitch that credits the other side with sets or
// building it doesn't have, and an auction note shown while the auction runs
// that gives the seat's maximum away. Checks read the decision as
// intents, never a version's own answer fields, so one scenario measures every
// version. Error scenarios come with disguised variants (other sets, seats and
// cash), so a fix that only learned the original position shows up.

export type Phase = "early" | "mid" | "late";
export type ScenarioKind = "error" | "judgment";

/** What one answer amounted to: the state the model was asked about, its
 *  parsed answer, the version's reading of it, and the shared settle step's
 *  outcome (the state it left, when it committed). */
export interface Outcome {
  asked: GameState;
  seat: string;
  answer: Record<string, unknown>;
  resolution: AiResolution | null;
  settled: Settled;
}

export interface Scenario {
  id: string;
  kind: ScenarioKind;
  phase: Phase;
  decision: AiDecision;
  /** What the position tests, and, for an error scenario, why its error is
   *  objective. */
  tests: string;
  /** The position, with every seat played by `strategy`. */
  build: (strategy: string) => GameState;
  /** A short label for what the seat chose ("buy", "max $450", "decline"),
   *  so choices tally across repetitions. */
  choose: (outcome: Outcome) => string;
  /** For an error scenario: the objective mistake in this answer, or null. */
  error?: (outcome: Outcome) => string | null;
  /** A turn start that a version's gate may skip: llm-v8's skips a seat that
   *  can't build or lift a mortgage and shares no set, or whose board hasn't
   *  changed since it was last asked. A version that skips it makes no call
   *  (the seat just rolls), which is recorded as "not asked", never an error. */
  gated?: boolean;
}

/** A scenario's verdict on one answer. Only `error` counts against a version. */
export interface Judged {
  kind: ScenarioKind;
  choice: string;
  error: string | null;
}

/** Judge one answer: an unusable answer is an error in any scenario, and so is
 *  any of the shared mistakes; otherwise record the choice, and run the error
 *  check if the scenario has one. */
export function judge(scenario: Scenario, o: Outcome): Judged {
  if (o.settled.kind === "fail") {
    return { kind: scenario.kind, choice: "unusable", error: `unusable answer: ${o.settled.reason}` };
  }
  if (o.settled.kind === "stale") {
    return { kind: scenario.kind, choice: "stale", error: "the answer went stale against its own position" };
  }
  return { kind: scenario.kind, choice: scenario.choose(o), error: scenario.error?.(o) ?? sharedError(o) };
}

/** The first shared mistake in an answer, or null. */
export function sharedError(o: Outcome): string | null {
  for (const check of SHARED_CHECKS) {
    const error = check(o);
    if (error !== null) return error;
  }
  return null;
}

// --- A trade's terms against its message ---------------------------------------
//
// On a proposal or a counter the public note is the seat's message to the other
// side, so the terms that go out must be the ones it states. Gemma 4 12B wrote
// "I'd like $600 for New York Avenue" and its terms handed New York over for
// the rival's two oranges and $0. A mismatch is objective whatever the
// position, so every scenario checks it, judgment ones included. The check is
// deliberately loose about wording (a lot counts as named by any distinctive
// word of its name, its square number, or its group: "the railroad", "your
// oranges") and only reads dollar amounts the message states.

const GENERIC_WORDS = new Set(["avenue", "place", "railroad", "company", "gardens", "works", "line"]);

/** Whether the message names the lot, loosely. */
function mentions(message: string, position: number): boolean {
  const space = SPACES[position];
  if (!("name" in space)) return false;
  const text = message.toLowerCase();
  if (text.includes(`#${String(position)}`) || text.includes(space.name.toLowerCase())) return true;
  const words = space.name.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/);
  if (words.some((w) => w.length >= 4 && !GENERIC_WORDS.has(w) && text.includes(w))) return true;
  if (space.kind === "railroad") return /\brail/.test(text);
  if (space.kind === "utility") return /utilit/.test(text);
  if (space.kind === "property") return text.includes(space.color.replace("-", " "));
  return false;
}

/** The dollar amounts a message states. */
function amountsIn(message: string): number[] {
  return [...message.matchAll(/\$\s?(\d[\d,]*)/g)].map((m) => Number(m[1].replace(/,/g, "")));
}

/** How the terms the seat put on the table contradict its own message, or null.
 *  For a counter, what it keeps from the offer it answers needn't be restated:
 *  lots moving as the offer had them, and the offer's own cash figure. */
export function termsContradictMessage(o: Outcome): string | null {
  const terms = proposedTerms(o);
  const message = o.resolution?.publicNote ?? "";
  if (!terms) return null;
  const seat = o.seat;
  const offer = o.asked.turn.phase === "trade-pending" ? (o.asked.turn.pendingTrade ?? null) : null;
  const handsOver =
    Object.entries(terms.propertyTo).some(([pos, to]) => to !== seat && o.asked.ownership[Number(pos)] === seat) ||
    Object.entries(terms.gojfTo).some(([source, to]) => to !== seat && o.asked.jailFreeCards[source as keyof typeof o.asked.jailFreeCards] === seat);
  const cash = cashIn(o);
  if (!handsOver && cash > 0) return `the terms ask $${String(cash)} and hand nothing over ("${message}")`;

  const offered = offer ? Math.abs(offer.cashDelta[seat] ?? 0) : null;
  const named = amountsIn(message);
  const asked = named.filter((amount) => amount !== offered);
  if (asked.length > 0 && !named.includes(Math.abs(cash))) {
    const moved = cash === 0 ? "no cash" : `$${String(Math.abs(cash))}`;
    return `the message names ${asked.map((a) => `$${String(a)}`).join(", ")} but the terms move ${moved} ("${message}")`;
  }
  const unnamed = Object.entries(terms.propertyTo)
    .map(([pos, to]) => [Number(pos), to] as const)
    .filter(([pos, to]) => offer?.propertyTo[pos] !== to && !mentions(message, pos))
    .map(([pos]) => nameOf(pos));
  return unnamed.length > 0 ? `the terms move ${unnamed.join(" + ")}, which the message never mentions ("${message}")` : null;
}

// --- A plan or note that claims control over movement --------------------------
//
// Where a player lands is the dice. A live seat's plan said "avoid Väinö's
// reds", and once in the plan it was fed forward into 12 of the seat's next 13
// plans, displacing a real one (a cash reserve, a mortgage order). Any note or
// plan that tells the seat to avoid, stay off, steer clear of, keep away from
// or dodge a board place states a choice the rules don't offer. The object
// must be a place: "avoid trades that complete a set" and "avoid mortgaging"
// are choices. Staying in jail to stay off the board is a real choice, so a
// seat in jail, or a sentence about jail, passes.

const MOVEMENT_VERB = /\b(?:avoid(?:ing)?|stay(?:ing)?\s+off|steer(?:ing)?\s+clear\s+of|keep(?:ing)?\s+away\s+from|dodg(?:e|ing))\s+/giu;

/** A board place as one word, plural "s" dropped: a color group, the
 *  railroads, utilities or hotels, or a distinctive word of a lot's name. */
const PLACES = new Set([
  ...["brown", "pink", "orange", "red", "yellow", "green", "blue", "railroad", "rail", "utility", "utilitie", "hotel"],
  ...["mediterranean", "baltic", "oriental", "vermont", "connecticut", "charle", "virginia", "jame", "tennessee", "york"],
  ...["kentucky", "indiana", "illinoi", "atlantic", "ventnor", "marvin", "pacific", "carolina", "pennsylvania", "park"],
  ...["boardwalk", "reading", "short", "electric", "water"],
]);
const OWNERS = new Set(["the", "his", "her", "their", "your", "my"]);

/** Whether the words after a movement verb name a board place: optionally
 *  "landing on", then an owner ("the", "his", "Väinö's", "Bot Killer's"),
 *  then the place ("reds", "light blues", "Boardwalk"). */
function namesPlace(rest: string): boolean {
  const words = rest.toLowerCase().replace(/’/g, "'").split(/[^\p{L}']+/u).filter((w) => w !== "");
  let i = words[0] === "landing" && words[1] === "on" ? 2 : 0;
  if (OWNERS.has(words[i] ?? "")) i += 1;
  else if (words[i]?.endsWith("'s")) i += 1;
  else if (words[i + 1]?.endsWith("'s")) i += 2;
  const word = words[i] ?? "";
  if (word === "light" || word === "dark") return (words[i + 1] ?? "").startsWith("blue");
  return PLACES.has(word.replace(/s$/, ""));
}

/** The sentence of a note or plan that claims control over where the seat
 *  lands, or null. */
export function movementClaim(text: string): string | null {
  for (const sentence of text.split(/(?<=[.;!?])\s+/)) {
    if (/\bjail\b/i.test(sentence)) continue;
    for (const verb of sentence.matchAll(MOVEMENT_VERB)) {
      if (namesPlace(sentence.slice(verb.index + verb[0].length))) return sentence.trim();
    }
  }
  return null;
}

/** A note or plan in the answer that claims control over movement, or null. */
export function claimsMovement(o: Outcome): string | null {
  if (!o.resolution) return null;
  const me = o.asked.players.find((p) => p.id === o.seat);
  if (me?.inJail) return null;
  const { publicNote, privateNote, plan } = o.resolution;
  for (const [field, text] of [["plan", plan], ["public note", publicNote], ["private note", privateNote]] as const) {
    const claim = movementClaim(text);
    if (claim !== null) return `its ${field} claims control over where it lands ("${claim}")`;
  }
  return null;
}

// --- A pitch that credits the other side with what it doesn't have -------------
//
// A live seat pitched "$620 for Tennessee... funds your builds elsewhere" to a
// player holding no full set, so nothing to build. On a proposal or counter,
// the public note is the seat's message to the other side; telling them about
// their own building, houses or monopoly when they hold no full set, and the
// terms don't complete one for them, is a fact the board contradicts. A
// negated sentence ("two greens you can't build on") is true and passes.

const CREDITS_BUILDING =
  /\b(?:your\s+(?:builds?|building|houses|hotels|monopoly|monopolies|full\s+sets?)|build(?:ing)?\s+(?:on|up)\s+your|funds?\s+your\s+(?:build|houses|hotels)|develop(?:ing)?\s+your)\b/i;
const NEGATED = /\b(?:not|no|nothing|never|without|cannot)\b|n['’]t\b/i;

const PROPERTY_COLORS: readonly PropertyColor[] = [...new Set(SPACES.flatMap((space) => (space.kind === "property" ? [space.color] : [])))];

/** Whether `player` holds a full color set under `ownership`. */
function holdsFullSet(state: GameState, ownership: GameState["ownership"], player: string): boolean {
  return PROPERTY_COLORS.some((color) => hasMonopoly({ ...state, ownership }, color, player));
}

/** A pitch that credits the other side with building it can't do, or null. */
export function pitchCreditsMissingSet(o: Outcome): string | null {
  const terms = proposedTerms(o);
  if (!terms || !o.resolution) return null;
  const claim = o.resolution.publicNote.split(/(?<=[.;!?])\s+/).find((s) => CREDITS_BUILDING.test(s) && !NEGATED.test(s));
  if (claim === undefined) return null;
  const others = new Set([
    ...Object.keys(terms.cashDelta),
    ...Object.values(terms.propertyTo),
    ...Object.keys(terms.propertyTo).map((pos) => o.asked.ownership[Number(pos)]),
  ]);
  others.delete(o.seat);
  const afterTrade = projectTrade(o.asked, terms).ownership;
  const builds = [...others].some((id) => holdsFullSet(o.asked, o.asked.ownership, id) || holdsFullSet(o.asked, afterTrade, id));
  return builds ? null : `its pitch credits the other side with building it can't do ("${claim.trim()}")`;
}

// --- An auction note that gives the maximum away --------------------------------
//
// A seat answers an auction with the most it will pay, and the pacer bids for
// it in $10 steps up to that. A public note the table reads while the auction
// is still running, naming that maximum, lets every rival bid it up to the
// last dollar or stop just short. A version that holds its auction notes until
// the close can't leak this way, so only a note the game shows at once is
// checked. A note naming another figure (the lot's price, a bluff) passes.

/** How close a stated amount may come to the maximum before it gives it away:
 *  two of the pacer's $10 steps. */
const LEAK_MARGIN = 20;

/** An auction note shown while the auction runs that names the seat's
 *  maximum, or null. */
export function leaksAuctionMax(o: Outcome): string | null {
  const max = o.resolution?.auctionMax ?? null;
  const state = after(o);
  if (max === null || max === 0 || !state) return null;
  const note = state.turns.at(-1)?.events.findLast((e) => e.kind === "bot-note" && e.playerId === o.seat);
  if (note?.kind !== "bot-note" || note.heldForAuction !== undefined) return null;
  const named = amountsIn(note.text).find((amount) => Math.abs(amount - max) <= LEAK_MARGIN);
  return named === undefined ? null : `its public note, shown while the auction runs, gives away its $${String(max)} maximum ("${note.text}")`;
}

/** The mistakes every scenario checks, judgment ones included. */
const SHARED_CHECKS: readonly ((o: Outcome) => string | null)[] = [termsContradictMessage, claimsMovement, pitchCreditsMissingSet, leaksAuctionMax];

/** The intents the answer became, in order. */
export function intentsOf(o: Outcome): Intent[] {
  return (o.resolution?.ops ?? []).flatMap((op) => (op.kind === "intent" ? [op.intent] : []));
}

export function did(o: Outcome, kind: Intent["kind"]): boolean {
  return intentsOf(o).some((i) => i.kind === kind);
}

/** The state the answer left, or null when it didn't commit. */
export function after(o: Outcome): GameState | null {
  return o.settled.kind === "commit" ? o.settled.state : null;
}

export function cashOf(state: GameState, seat: string): number {
  const player = state.players.find((p) => p.id === seat);
  if (!player) throw new Error(`no seat ${seat}`);
  return player.cash;
}

/** The seat's cash after the answer (its cash before, if it didn't commit). */
export function cashAfter(o: Outcome): number {
  return cashOf(after(o) ?? o.asked, o.seat);
}

/** The trade the answer put on the table (a proposal or a counter), or null. */
export function proposedTerms(o: Outcome): TradeTerms | null {
  const state = after(o);
  return state?.turn.phase === "trade-pending" && state.turn.pendingTrade?.proposerId === o.seat
    ? state.turn.pendingTrade
    : null;
}

/** Cash the seat receives under the terms it put on the table (negative = it
 *  pays). */
export function cashIn(o: Outcome): number {
  return proposedTerms(o)?.cashDelta[o.seat] ?? 0;
}

/** Whether the terms the seat put on the table give `position` away. */
export function gives(o: Outcome, position: number): boolean {
  const terms = proposedTerms(o);
  return terms !== null && position in terms.propertyTo && terms.propertyTo[position] !== o.seat;
}

/** Whether the terms bring `position` to the seat. */
export function takes(o: Outcome, position: number): boolean {
  return proposedTerms(o)?.propertyTo[position] === o.seat;
}

/** Houses added across `positions` (a hotel counts as five; negative = sold). */
export function housesAdded(o: Outcome, positions: readonly number[]): number {
  const state = after(o);
  if (!state) return 0;
  return positions.reduce((sum, pos) => sum + (state.houses[pos] ?? 0) - (o.asked.houses[pos] ?? 0), 0);
}

/** A square's name, for choice labels. */
export function nameOf(position: number): string {
  const space = SPACES[position];
  return "name" in space ? space.name : `#${String(position)}`;
}

/** Terms in a few words, from the seat's side: what it gives, what it takes,
 *  and the cash it receives or pays. */
export function describeTerms(o: Outcome): string {
  const terms = proposedTerms(o);
  if (!terms) return "nothing";
  const entries = Object.entries(terms.propertyTo).map(([pos, to]) => [Number(pos), to] as const);
  const giving = entries.filter(([pos, to]) => to !== o.seat && o.asked.ownership[pos] === o.seat).map(([pos]) => nameOf(pos));
  const taking = entries.filter(([, to]) => to === o.seat).map(([pos]) => nameOf(pos));
  const cash = cashIn(o);
  const parts = [
    giving.length > 0 ? `gives ${giving.join(" + ")}` : null,
    taking.length > 0 ? `takes ${taking.join(" + ")}` : null,
    cash > 0 ? `gets $${String(cash)}` : cash < 0 ? `pays $${String(-cash)}` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(", ") : "an empty trade";
}

/** What a turn-start answer did: houses built, mortgages lifted, a proposal. */
export function describeTurnStart(o: Outcome): string {
  const state = after(o);
  if (!state) return "nothing";
  const mine = Object.entries(o.asked.ownership).filter(([, owner]) => owner === o.seat).map(([pos]) => Number(pos));
  const houses = housesAdded(o, mine);
  const lifted = mine.filter((pos) => o.asked.mortgaged[pos] && !state.mortgaged[pos]).length;
  const mortgaged = mine.filter((pos) => !o.asked.mortgaged[pos] && state.mortgaged[pos]).length;
  const parts = [
    houses !== 0 ? `${houses > 0 ? "builds" : "sells"} ${String(Math.abs(houses))}` : null,
    lifted > 0 ? `lifts ${String(lifted)}` : null,
    mortgaged > 0 ? `mortgages ${String(mortgaged)}` : null,
    proposedTerms(o) ? `proposes (${describeTerms(o)})` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? `${parts.join(", ")}; keeps $${String(cashAfter(o))}` : "nothing";
}
