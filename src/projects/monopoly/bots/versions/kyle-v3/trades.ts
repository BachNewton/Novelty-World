// ===========================================================================
// kyle-v3 TRADE ENGINE. See PHILOSOPHY.md for the plain-language rules. In short:
//   - A "match" = completing a color monopoly or reaching a railroad rung; value
//     is its MATCH_VALUE rank (lower = better). Utilities are never a match.
//   - ACCEPT an incoming trade iff Kyle completes a match, no OTHER completer's
//     match is more than (completers - 1) ranks ABOVE his, he doesn't break a
//     completed set (a full monopoly or any railroad rung he holds), and his
//     cash delta is >= 0 (he never pays a player; bank mortgage interest is fine).
//   - PROPOSE the BEST valid mutual-completion trade — an N-way cycle where every
//     party completes a match — only if it passes Kyle's accept rules for HIM and,
//     by the same rules from their seat, for EVERY other party (so he never pitches
//     a deal that would just stall), AND Kyle isn't the lowest-value match in it.
// Rails resolve out of proposals on their own: giving any railroad breaks the
// giver's rung, so under Kyle's own model nobody ever gives one — Kyle accepts a
// railroad trade if offered, but never constructs one. Trades only move
// UNMORTGAGED lots, so there's no inherited-interest affordability to stall on.
// ===========================================================================
import { SPACES } from "../../../data";
import {
  builtLotsInGroup,
  developmentLevel,
  groupPositions,
} from "../../../development";
import type { GameState, PropertyColor, TradeTerms } from "../../../types";
import { rankOfColor, rankOfRail } from "./match-value";

type Ownership = Readonly<Record<number, string>>;

const COLORS: readonly PropertyColor[] = [
  "brown",
  "light-blue",
  "pink",
  "orange",
  "red",
  "yellow",
  "green",
  "dark-blue",
];

function activeIds(state: GameState): string[] {
  return state.players.filter((p) => !p.bankrupt).map((p) => p.id);
}

function isActive(state: GameState, id: string): boolean {
  const p = state.players.find((q) => q.id === id);
  return p !== undefined && !p.bankrupt;
}

/** Ownership map after applying a trade's property reassignments. */
function applyTrade(own: Ownership, propertyTo: Readonly<Record<number, string>>): Ownership {
  const next: Record<number, string> = { ...own };
  for (const k in propertyTo) next[Number(k)] = propertyTo[Number(k)];
  return next;
}

function railCount(own: Ownership, pid: string): number {
  let n = 0;
  for (const k in own) {
    if (own[k] === pid && SPACES[Number(k)].kind === "railroad") n += 1;
  }
  return n;
}

function ownsMonopoly(own: Ownership, color: PropertyColor, pid: string): boolean {
  return groupPositions(color).every((p) => own[p] === pid);
}

/** The best NEW match a player completes going from `before` to `after` — the
 *  lowest (most valuable) MATCH_VALUE rank they newly hold, or null for none. A
 *  color counts only at the full monopoly; railroads at the new count reached. */
function bestMatchGained(before: Ownership, after: Ownership, pid: string): number | null {
  let best: number | null = null;
  const consider = (rank: number): void => {
    if (best === null || rank < best) best = rank;
  };
  for (const color of COLORS) {
    if (!ownsMonopoly(before, color, pid) && ownsMonopoly(after, color, pid)) {
      consider(rankOfColor(color));
    }
  }
  const railsAfter = railCount(after, pid);
  if (railsAfter > railCount(before, pid)) consider(rankOfRail(railsAfter));
  return best;
}

/** Did `pid` break a COMPLETED set — lose a full color monopoly, or give up any
 *  railroad rung he held? Both are protected; loose lots and near-sets are not. */
function brokeCompletedSet(before: Ownership, after: Ownership, pid: string): boolean {
  for (const color of COLORS) {
    if (ownsMonopoly(before, color, pid) && !ownsMonopoly(after, color, pid)) return true;
  }
  return railCount(after, pid) < railCount(before, pid);
}

/** Every active player who completes a NEW match in this trade, mapped to its rank. */
function completerRanks(
  before: Ownership,
  after: Ownership,
  state: GameState,
): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const id of activeIds(state)) {
    const r = bestMatchGained(before, after, id);
    if (r !== null) ranks.set(id, r);
  }
  return ranks;
}

/** Kyle's accept test, applied to any party `pid` (used both for Kyle's own
 *  acceptance and, during proposal, to model whether each counterparty would
 *  accept). True iff `pid` completes a match, no other completer's match is more
 *  than (completers - 1) ranks above his, he breaks no completed set, and his
 *  cash delta is non-negative. */
function wouldAccept(
  before: Ownership,
  after: Ownership,
  terms: TradeTerms,
  pid: string,
  ranks: Map<string, number>,
): boolean {
  const mine = ranks.get(pid);
  if (mine === undefined) return false;
  if (brokeCompletedSet(before, after, pid)) return false;
  if ((terms.cashDelta[pid] ?? 0) < 0) return false;
  const window = ranks.size - 1;
  for (const [other, r] of ranks) {
    if (other !== pid && r < mine && mine - r > window) return false;
  }
  return true;
}

/** Should Kyle accept this incoming pending trade? */
export function acceptsTrade(state: GameState, pid: string, terms: TradeTerms): boolean {
  const before = state.ownership;
  const after = applyTrade(before, terms.propertyTo);
  return wouldAccept(before, after, terms, pid, completerRanks(before, after, state));
}

// --- proactive proposal: N-way mutual-completion cycle search ----------------

/** A one-away completion: `player` needs the unmortgaged, building-free lot
 *  `need` (held by `from`) to finish a color set worth `rank`. */
interface Opportunity {
  readonly player: string;
  readonly need: number;
  readonly from: string;
  readonly rank: number;
}

/** Every player who is exactly one lot short of a color monopoly, where the
 *  missing lot is an unmortgaged, building-free property held by another active
 *  player (so it can be traded for). Railroads are intentionally excluded — see
 *  the file header. */
function oneAwayOpportunities(state: GameState): Opportunity[] {
  const own = state.ownership;
  const opps: Opportunity[] = [];
  for (const player of activeIds(state)) {
    for (const color of COLORS) {
      const positions = groupPositions(color);
      const mine = positions.filter((p) => own[p] === player);
      if (mine.length !== positions.length - 1) continue;
      const need = positions.find((p) => own[p] !== player);
      if (need === undefined || !(need in own)) continue;
      const from = own[need];
      if (from === player || !isActive(state, from)) continue;
      if (state.mortgaged[need]) continue;
      if (builtLotsInGroup(need, (q) => developmentLevel(state, q)).length > 0) continue;
      opps.push({ player, need, from, rank: rankOfColor(color) });
    }
  }
  return opps;
}

/** Simple directed cycles through `kyle`: Kyle needs from q, q needs from r, …,
 *  back to Kyle. Each player gives the previous one their missing lot, so every
 *  player in the cycle completes a set. */
function cyclesThrough(opps: readonly Opportunity[], kyle: string): Opportunity[][] {
  const byPlayer = new Map<string, Opportunity[]>();
  for (const o of opps) {
    const list = byPlayer.get(o.player);
    if (list) list.push(o);
    else byPlayer.set(o.player, [o]);
  }
  const cycles: Opportunity[][] = [];
  const walk = (current: string, path: Opportunity[], visited: Set<string>): void => {
    for (const o of byPlayer.get(current) ?? []) {
      if (o.from === kyle) {
        cycles.push([...path, o]);
      } else if (!visited.has(o.from)) {
        visited.add(o.from);
        walk(o.from, [...path, o], visited);
        visited.delete(o.from);
      }
    }
  };
  walk(kyle, [], new Set([kyle]));
  return cycles;
}

function cycleToTerms(cycle: readonly Opportunity[]): TradeTerms {
  const propertyTo: Record<number, string> = {};
  for (const o of cycle) propertyTo[o.need] = o.player;
  return { propertyTo, gojfTo: {}, cashDelta: {} };
}

function partiesOf(state: GameState, terms: TradeTerms): Set<string> {
  const parties = new Set<string>();
  for (const k in terms.propertyTo) {
    parties.add(state.ownership[Number(k)]);
    parties.add(terms.propertyTo[Number(k)]);
  }
  return parties;
}

/** Mirror the engine's propose-trade gate (plus the stricter "no one ends up in
 *  the red") so a built draft is never rejected — a rejection would stall the
 *  trade window. Cycles are constructed legally, but this guards the invariants. */
function isProposable(state: GameState, terms: TradeTerms): boolean {
  let moved = false;
  for (const k in terms.propertyTo) {
    const pos = Number(k);
    const to = terms.propertyTo[pos];
    if (!(pos in state.ownership)) return false;
    const owner = state.ownership[pos];
    if (owner === to || !isActive(state, to)) return false;
    if (state.mortgaged[pos]) return false;
    if (builtLotsInGroup(pos, (q) => developmentLevel(state, q)).length > 0) return false;
    moved = true;
  }
  return moved && partiesOf(state, terms).size >= 2;
}

/** A valid proposal for Kyle: he completes a match and would accept it; every
 *  other party would accept it under his own rules; he isn't the lowest match;
 *  and it's structurally proposable. */
function proposeValid(state: GameState, terms: TradeTerms, kyle: string): boolean {
  const before = state.ownership;
  const after = applyTrade(before, terms.propertyTo);
  const ranks = completerRanks(before, after, state);
  const mine = ranks.get(kyle);
  if (mine === undefined) return false;
  if (!wouldAccept(before, after, terms, kyle, ranks)) return false;
  let someoneLower = false;
  for (const [id, r] of ranks) {
    if (id === kyle) continue;
    if (r > mine) someoneLower = true;
    if (!wouldAccept(before, after, terms, id, ranks)) return false;
  }
  return someoneLower && isProposable(state, terms);
}

/** Sort key for "best deal first": Kyle's match value (best first), then fewer
 *  parties, then fewer properties Kyle gives away. */
function scoreFor(state: GameState, terms: TradeTerms, kyle: string): [number, number, number] {
  const after = applyTrade(state.ownership, terms.propertyTo);
  const rank = bestMatchGained(state.ownership, after, kyle) ?? Number.MAX_SAFE_INTEGER;
  const given = Object.keys(terms.propertyTo).filter(
    (k) => state.ownership[Number(k)] === kyle,
  ).length;
  return [rank, partiesOf(state, terms).size, given];
}

function lessThan(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/** Stable signature of a trade's property moves — used to remember declines. */
function signature(propertyTo: Readonly<Record<number, string>>): string {
  return Object.keys(propertyTo)
    .map(Number)
    .sort((a, b) => a - b)
    .map((p) => `${p.toString()}:${propertyTo[p]}`)
    .join(",");
}

/** Property-move signatures of every trade that's been declined this game, so
 *  Kyle steps to the next-best deal instead of re-pitching a dead one. */
function declinedSignatures(state: GameState): Set<string> {
  const declined = new Set<string>();
  for (const turn of state.turns) {
    for (const ev of turn.events) {
      if (ev.kind === "trade-declined") declined.add(signature(ev.propertyTo));
    }
  }
  return declined;
}

function colorOfMatch(state: GameState, terms: TradeTerms, kyle: string): PropertyColor | null {
  const after = applyTrade(state.ownership, terms.propertyTo);
  let best: { color: PropertyColor; rank: number } | null = null;
  for (const color of COLORS) {
    if (!ownsMonopoly(state.ownership, color, kyle) && ownsMonopoly(after, color, kyle)) {
      const rank = rankOfColor(color);
      if (best === null || rank < best.rank) best = { color, rank };
    }
  }
  return best?.color ?? null;
}

/** The best trade Kyle should propose right now, or null if none qualifies. */
export function bestProposal(
  state: GameState,
  pid: string,
): { terms: TradeTerms; note: string } | null {
  const declined = declinedSignatures(state);
  const cycles = cyclesThrough(oneAwayOpportunities(state), pid);
  let best: { terms: TradeTerms; score: [number, number, number] } | null = null;
  for (const cycle of cycles) {
    const terms = cycleToTerms(cycle);
    if (declined.has(signature(terms.propertyTo))) continue;
    if (!proposeValid(state, terms, pid)) continue;
    const score = scoreFor(state, terms, pid);
    if (best === null || lessThan(score, best.score)) best = { terms, score };
  }
  if (best === null) return null;
  const ways = partiesOf(state, best.terms).size;
  const color = colorOfMatch(state, best.terms, pid);
  const note = `Proposing a ${ways.toString()}-way trade${
    color ? ` to complete my ${color} set` : ""
  } — everyone in it finishes a set.`;
  return { terms: best.terms, note };
}

/** Do two drafts move exactly the same properties? (Kyle's trades carry no cards
 *  or cash, so the property signature settles it.) */
export function sameTerms(a: TradeTerms, b: TradeTerms): boolean {
  return signature(a.propertyTo) === signature(b.propertyTo);
}
