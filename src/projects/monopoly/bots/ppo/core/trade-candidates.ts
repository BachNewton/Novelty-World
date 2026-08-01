import { SPACES } from "../../../data";
import {
  builtLotsInGroup,
  colorAt,
  developmentLevel,
  groupPositions,
} from "../../../development";
import { validateTradeProposal } from "../../../engine";
import { ownablePrice } from "../../../logic";
import type { CardSource, GameState, TradeTerms } from "../../../types";
import {
  GOJF_ROWS,
  MAX_SEATS,
  NUM_ASSETS,
  seatOrder,
} from "./action-space";
import { completedSets, tradeValuation } from "./encode-rl";

/** Every ownable board position (properties + railroads + utilities). */
const OWNABLE_POSITIONS: readonly number[] = SPACES.reduce<number[]>((acc, s, i) => {
  if (s.kind === "property" || s.kind === "railroad" || s.kind === "utility") acc.push(i);
  return acc;
}, []);

/** Every position `ownerId` could legally move in a trade right now: owned by
 *  them AND its whole color set building-free — the engine's own
 *  `builtLotsInGroup` guard (official rule: sell the set's buildings before any
 *  lot of it trades; railroads/utilities have no set, so only ownership gates
 *  them). MORTGAGED lots ARE tradable — they transfer still-mortgaged and the
 *  receiver owes the bank 10% interest at execution, which the engine's own
 *  affordability gate vets at propose time. Board order (deterministic for the
 *  seeded sampler). */
function tradablePositions(state: GameState, ownerId: string): number[] {
  const levelAt = (pos: number): number => developmentLevel(state, pos);
  return OWNABLE_POSITIONS.filter(
    (pos) =>
      state.ownership[pos] === ownerId &&
      builtLotsInGroup(pos, levelAt).length === 0,
  );
}

// ---------------------------------------------------------------------------
// Candidate-scoring trade head (`--trade-candidates K`). Instead of the joint
// per-asset trade action, the env enumerates up to K legal candidate offers at
// each trade decision; the policy picks one (or cancel). Every candidate is
// vetted by the engine's own `validateTradeProposal` — the validator is the
// arbiter of legality (mortgaged lots ARE tradeable, built sets are NOT), never
// a re-derived rule. K = 0 (default) leaves the legacy head + injection path
// byte-identical.
// ---------------------------------------------------------------------------

/** The 8 trailing scalars of a candidate vector (wire contract order). */
export const TRADE_CAND_SCALARS = 8;
/** Candidate vector float layout, D = 2A + S + 8 (SHARED WIRE CONTRACT with the
 *  Python side): give multi-hot [0, A), get multi-hot [A, 2A), counterparty
 *  seat one-hot [2A, 2A+S) (seat-relative slot, same ordering `trade_dest`
 *  uses; NO_TRADE never appears), then the 8 scalars. A = NUM_ASSETS rows in
 *  the canonical asset-row order, S = MAX_SEATS. */
export const TRADE_CAND_DIM = 2 * NUM_ASSETS + MAX_SEATS + TRADE_CAND_SCALARS;

/** GOJF card face value for candidate pricing and the face-sum scalars. */
const GOJF_FACE = 50;

/** Cash multipliers for the set-completing acquisition/sale templates,
 *  ascending (price ascending within a template). */
const CAND_PRICE_MULTS: readonly number[] = [1.0, 1.5, 2.0];

/** One enumerated candidate offer: the engine terms index k decodes to
 *  (proposer = the acting seat) plus its D = `TRADE_CAND_DIM` wire floats. */
export interface TradeCandidate {
  terms: TradeTerms;
  vec: number[];
}

/** Whether acquiring `pos` completes a color group for `id` (every OTHER lot of
 *  the group already theirs). Railroads/utilities have no group — never true. */
function completesGroupFor(state: GameState, pos: number, id: string): boolean {
  const color = colorAt(pos);
  if (color === null) return false;
  return groupPositions(color).every((p) => p === pos || state.ownership[p] === id);
}

/** Build a candidate's wire vector (layout: `TRADE_CAND_DIM`). Set deltas come
 *  from the ownership projection alone — cards and cash never touch a color
 *  group — clamped to [−2, 2] before the /2 normalization. */
function candidateVec(
  state: GameState,
  seatId: string,
  opp: { id: string; slot: number },
  terms: TradeTerms,
): number[] {
  const vec = new Array<number>(TRADE_CAND_DIM).fill(0);
  // Shared valuation (give/get faces, counts, set deltas, mortgage) — the SAME
  // arithmetic the responder-perspective pending-trade obs block uses.
  const v = tradeValuation(state, seatId, opp.id, terms);
  for (const row of v.getRows) vec[NUM_ASSETS + row] = 1;
  for (const row of v.giveRows) vec[row] = 1;
  vec[2 * NUM_ASSETS + opp.slot] = 1;
  const clamp2 = (d: number): number => Math.max(-2, Math.min(2, d));
  const base = 2 * NUM_ASSETS + MAX_SEATS;
  vec[base] = v.cashToMe / 1500; // cash RECEIVED (negative = pays)
  vec[base + 1] = v.giveCount / 4;
  vec[base + 2] = v.getCount / 4;
  vec[base + 3] = v.giveFace / 1500;
  vec[base + 4] = v.getFace / 1500;
  vec[base + 5] = clamp2(v.mySetsDelta) / 2;
  vec[base + 6] = clamp2(v.otherSetsDelta) / 2;
  vec[base + 7] = v.anyMortgaged;
  return vec;
}

/** Enumerate up to `k` legal candidate offers for `seatId`, DETERMINISTIC (no
 *  RNG): template tiers in priority order a > b > c > d > e, each generated per
 *  opponent in seat order, board order within an opponent, price ascending
 *  within a template:
 *    (a) set-completing acquisitions (their lot completes MY group) at
 *        {1, 1.5, 2}× face, cash from me;
 *    (b) set-completing sales (my lot completes THEIR group), cash to me;
 *    (c) 1:1 lot swaps set-completing for at least one side, cash 0;
 *    (d) plain single-lot buy then sell at 1× face (every tradeable lot);
 *    (e) GOJF card buy/sell at $50.
 *  Dedup key (counterparty, give-set, get-set, cash) keeps the first (highest
 *  priority) instance; every survivor passes `validateTradeProposal` against
 *  `state`. Generation is priority-ordered, so stopping at `k` is an exact
 *  truncation. */
export function generateTradeCandidates(
  state: GameState,
  seatId: string,
  k: number,
): TradeCandidate[] {
  const out: TradeCandidate[] = [];
  if (k <= 0) return out;
  const seen = new Set<string>();
  const order = seatOrder(state, seatId);
  const opponents: { id: string; slot: number }[] = [];
  for (let slot = 1; slot < MAX_SEATS; slot++) {
    const id = order[slot];
    if (id === undefined) continue;
    const p = state.players.find((pl) => pl.id === id);
    if (p !== undefined && !p.bankrupt) opponents.push({ id, slot });
  }
  const myLots = tradablePositions(state, seatId);
  const lotsOf = new Map(
    opponents.map((o) => [o.id, tradablePositions(state, o.id)]),
  );

  const push = (opp: { id: string; slot: number }, terms: TradeTerms): void => {
    if (out.length >= k) return;
    const key = [
      opp.id,
      Object.entries(terms.propertyTo)
        .map(([p, o]) => `${p}>${o}`)
        .sort()
        .join(","),
      Object.entries(terms.gojfTo)
        .map(([s, o]) => `${s}>${String(o)}`)
        .sort()
        .join(","),
      (terms.cashDelta[seatId] ?? 0).toString(),
    ].join("|");
    if (seen.has(key)) return;
    if (validateTradeProposal(state, terms) !== null) return;
    seen.add(key);
    out.push({ terms, vec: candidateVec(state, seatId, opp, terms) });
  };

  // (a) set-completing acquisitions: their lot that completes my group, I pay
  // {1, 1.5, 2}× face.
  for (const opp of opponents) {
    for (const pos of lotsOf.get(opp.id) ?? []) {
      if (!completesGroupFor(state, pos, seatId)) continue;
      const face = ownablePrice(pos) ?? 0;
      for (const m of CAND_PRICE_MULTS) {
        const cash = Math.round(face * m);
        push(opp, {
          propertyTo: { [pos]: seatId },
          gojfTo: {},
          cashDelta: { [seatId]: -cash, [opp.id]: cash },
        });
      }
    }
  }
  // (b) set-completing sales: my lot that completes their group, I receive
  // {1, 1.5, 2}× face.
  for (const opp of opponents) {
    for (const pos of myLots) {
      if (!completesGroupFor(state, pos, opp.id)) continue;
      const face = ownablePrice(pos) ?? 0;
      for (const m of CAND_PRICE_MULTS) {
        const cash = Math.round(face * m);
        push(opp, {
          propertyTo: { [pos]: opp.id },
          gojfTo: {},
          cashDelta: { [opp.id]: -cash, [seatId]: cash },
        });
      }
    }
  }
  // (c) 1:1 swaps set-completing for at least one side, cash 0.
  for (const opp of opponents) {
    const theirs = lotsOf.get(opp.id) ?? [];
    for (const mine of myLots) {
      for (const theirPos of theirs) {
        const own2: Record<number, string> = {
          ...state.ownership,
          [mine]: opp.id,
          [theirPos]: seatId,
        };
        const completing =
          completedSets(own2, seatId) > completedSets(state.ownership, seatId) ||
          completedSets(own2, opp.id) > completedSets(state.ownership, opp.id);
        if (!completing) continue;
        push(opp, {
          propertyTo: { [mine]: opp.id, [theirPos]: seatId },
          gojfTo: {},
          cashDelta: {},
        });
      }
    }
  }
  // (d) plain single-lot buy then sell at 1× face.
  for (const opp of opponents) {
    for (const pos of lotsOf.get(opp.id) ?? []) {
      const face = ownablePrice(pos) ?? 0;
      push(opp, {
        propertyTo: { [pos]: seatId },
        gojfTo: {},
        cashDelta: { [seatId]: -face, [opp.id]: face },
      });
    }
    for (const pos of myLots) {
      const face = ownablePrice(pos) ?? 0;
      push(opp, {
        propertyTo: { [pos]: opp.id },
        gojfTo: {},
        cashDelta: { [opp.id]: -face, [seatId]: face },
      });
    }
  }
  // (e) GOJF card buy/sell at $50.
  for (const opp of opponents) {
    for (const { source } of GOJF_ROWS) {
      const holder = state.jailFreeCards[source];
      const gojfTo: Partial<Record<CardSource, string>> = {};
      if (holder === opp.id) {
        gojfTo[source] = seatId;
        push(opp, {
          propertyTo: {},
          gojfTo,
          cashDelta: { [seatId]: -GOJF_FACE, [opp.id]: GOJF_FACE },
        });
      } else if (holder === seatId) {
        gojfTo[source] = opp.id;
        push(opp, {
          propertyTo: {},
          gojfTo,
          cashDelta: { [opp.id]: -GOJF_FACE, [seatId]: GOJF_FACE },
        });
      }
    }
  }
  return out;
}
