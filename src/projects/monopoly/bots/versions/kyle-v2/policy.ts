// ===========================================================================
// kyle-v2 SNAPSHOT — the first KYLE version with real logic, branched from the
// kyle-v1 blank baseline (which deferred to engine defaults everywhere). The
// KYLE lineage is a bot family authored by Kyle, distinct from claude / jane /
// gemini and the paradigm lines (see EVOLUTION.md "Bot lineages"). Plain-language
// strategy is in this folder's PHILOSOPHY.md; this file is the wiring of that
// strategy into our `Bot` contract (see ../../decision.ts). Everything kyle-v2
// doesn't have an opinion on (jail, trades) returns `null`, which the pacer
// reads as "no improvement on the default" and fills with the engine's
// guaranteed-legal move.
// ===========================================================================
import { SPACES } from "../../../data";
import {
  builtLotsInGroup,
  colorAt,
  developmentLevel,
  groupPositions,
} from "../../../development";
import { auctionBidCap, BID_INCREMENT, firstNegativePlayer } from "../../../engine";
import {
  mortgageInterestAt,
  mortgageValueAt,
  ownablePrice,
} from "../../../logic";
import type { GameState, ManageStaged, PropertyColor } from "../../../types";
import type { Bot, BotDecision } from "../../decision";

// The two long-frozen color tables the whole archive shares (identical across
// every version, save a reverted dark-blue experiment in claude-v26/v27). Carried
// here verbatim — kyle-v2 only uses GROUP_WEIGHT so far, but both are kept because
// later versions will lean on them (build planning, trade valuation, …).

/** Relative VALUE of each color set (traffic / ROI weight). Higher = more prized. */
const GROUP_WEIGHT: Readonly<Record<PropertyColor, number>> = {
  orange: 1.0,
  red: 0.8,
  yellow: 0.6,
  green: 0.5,
  "dark-blue": 0.55,
  pink: 0.85,
  "light-blue": 1.0,
  brown: 0.7,
};

/** DEVELOP priority — the classic tier list (cheap high-traffic sets first).
 *  Used here only to break GROUP_WEIGHT ties deterministically (orange before
 *  light-blue at 1.0); kept in full for the build logic later versions will add. */
const COLORS_BY_WEIGHT: readonly PropertyColor[] = [
  "orange",
  "red",
  "light-blue",
  "pink",
  "yellow",
  "dark-blue",
  "green",
  "brown",
];

function myPositions(state: GameState, pid: string): number[] {
  const out: number[] = [];
  for (const posStr in state.ownership) {
    if (state.ownership[posStr] === pid) out.push(Number(posStr));
  }
  return out;
}

function railroadCount(state: GameState, pid: string): number {
  return myPositions(state, pid).filter((p) => SPACES[p].kind === "railroad")
    .length;
}

/** Would owning every member of `color` (treating `boughtPos` as already mine)
 *  give me the full set? True exactly when the only lot I'm missing is one I
 *  already own or am about to. */
function completesColor(
  state: GameState,
  pid: string,
  color: PropertyColor,
  boughtPos: number,
): boolean {
  return groupPositions(color).every(
    (p) => state.ownership[p] === pid || p === boughtPos,
  );
}

/** Does buying `pos` complete a set worth mortgaging for? A full color monopoly,
 *  or a 3rd-or-later railroad. Never a utility (their rent is too weak to chase). */
function completesSet(state: GameState, pid: string, pos: number): boolean {
  const space = SPACES[pos];
  if (space.kind === "railroad") return railroadCount(state, pid) + 1 >= 3;
  const color = colorAt(pos);
  return color !== null && completesColor(state, pid, color, pos);
}

/** A lot I can raise cash from right now: mine, not the one I'm buying, not
 *  already mortgaged, and bare (no building stands anywhere in its group — the
 *  official mortgage rule, and our "never sell houses" rule, both fall out of
 *  this since we never clear those buildings). */
function canMortgage(
  state: GameState,
  pid: string,
  buyingPos: number,
  pos: number,
): boolean {
  if (pos === buyingPos) return false;
  if (state.mortgaged[pos]) return false;
  if (builtLotsInGroup(pos, (p) => developmentLevel(state, p)).length > 0) {
    return false;
  }
  return mortgageValueAt(pos) !== null;
}

/** The order kyle-v2 mortgages its holdings to fund a set-completing buy,
 *  least-painful first (post-buy framing — `buyingPos` is treated as already
 *  mine, so the set being completed and a 3rd+ railroad count as protected):
 *    1. utilities          — worthless rent, shed first
 *    2. non-set color lots  — lowest GROUP_WEIGHT first (sacrifice weakest value)
 *    3. railroads, only if I hold < 2 (a lone rail is throwaway)
 *    4. set color lots      — lowest GROUP_WEIGHT first (eat into monopolies only here)
 *    5. railroads           — a 2+ railroad holding is the very last thing to go
 *  Color ties (orange vs light-blue at 1.0) break by COLORS_BY_WEIGHT order. */
function mortgageOrder(
  state: GameState,
  pid: string,
  buyingPos: number,
): number[] {
  const lots = myPositions(state, pid).filter((p) =>
    canMortgage(state, pid, buyingPos, p),
  );
  const rails = lots.filter((p) => SPACES[p].kind === "railroad");
  const utils = lots.filter((p) => SPACES[p].kind === "utility");

  const colorTier = (forSet: boolean): number[] =>
    lots
      .filter((p) => {
        const color = colorAt(p);
        return (
          color !== null && completesColor(state, pid, color, buyingPos) === forSet
        );
      })
      .sort((a, b) => {
        const ca = colorAt(a);
        const cb = colorAt(b);
        if (ca === null || cb === null) return a - b;
        return (
          GROUP_WEIGHT[ca] - GROUP_WEIGHT[cb] ||
          COLORS_BY_WEIGHT.indexOf(ca) - COLORS_BY_WEIGHT.indexOf(cb) ||
          a - b
        );
      });

  const railsEarly = railroadCount(state, pid) < 2;
  return [
    ...utils.sort((a, b) => a - b),
    ...colorTier(false),
    ...(railsEarly ? rails.sort((a, b) => a - b) : []),
    ...colorTier(true),
    ...(railsEarly ? [] : rails.sort((a, b) => a - b)),
  ];
}

function mortgageableTotal(order: readonly number[]): number {
  return order.reduce((sum, p) => sum + (mortgageValueAt(p) ?? 0), 0);
}

function buyDecision(state: GameState, pid: string): BotDecision | null {
  const { turn } = state;
  if (turn.playerId !== pid || turn.pendingBuy === undefined) return null;
  const pos = turn.pendingBuy;
  const price = ownablePrice(pos);
  const me = state.players.find((p) => p.id === pid);
  if (price === null || !me) return null;

  if (me.cash >= price) {
    return {
      intent: { kind: "buy", playerId: pid },
      note: `Landed on it — I always buy when I can afford it ($${price}).`,
    };
  }

  if (completesSet(state, pid, pos)) {
    const order = mortgageOrder(state, pid, pos);
    if (me.cash + mortgageableTotal(order) >= price) {
      return {
        intent: { kind: "raise-cash", playerId: pid },
        note: `This completes a set — mortgaging non-sets to afford the $${price}.`,
      };
    }
  }
  return {
    intent: { kind: "decline-buy", playerId: pid },
    note: `Can't afford $${price} without selling houses — passing.`,
  };
}

function sameMortgage(
  a: Readonly<Record<number, boolean>>,
  b: Readonly<Record<number, boolean>>,
): boolean {
  const keys = (o: Readonly<Record<number, boolean>>) =>
    Object.keys(o)
      .filter((k) => o[Number(k)])
      .sort()
      .join(",");
  return keys(a) === keys(b);
}

function raisingCash(state: GameState, pid: string): BotDecision | null {
  const { turn } = state;
  if (turn.playerId !== pid) return null;
  const pos = turn.pendingBuy;
  const me = state.players.find((p) => p.id === pid);
  const price = pos === undefined ? null : ownablePrice(pos);
  if (pos === undefined || price === null || !me) {
    return { intent: { kind: "cancel-manage", playerId: pid } };
  }

  const need = price - me.cash;
  const mortgage: Record<number, boolean> = {};
  let raised = 0;
  for (const lot of mortgageOrder(state, pid, pos)) {
    if (raised >= need) break;
    mortgage[lot] = true;
    raised += mortgageValueAt(lot) ?? 0;
  }
  if (raised < need) {
    return { intent: { kind: "cancel-manage", playerId: pid } };
  }

  const current = turn.manageStaged ?? { build: {}, mortgage: {} };
  if (sameMortgage(current.mortgage, mortgage)) {
    return {
      intent: { kind: "buy", playerId: pid },
      note: "Cash raised — completing the buy.",
    };
  }
  const staged: ManageStaged = { build: {}, mortgage };
  return { intent: { kind: "update-manage-staging", playerId: pid, staged } };
}

/** Auctions follow the same instinct as landing: I want the lot, and I'll bid up
 *  to list price + one increment ($10 over list), no more. I pay with the same
 *  capacity I'd use on landing — my cash, plus (only when winning it completes a
 *  set) the mortgage raise I'd take to buy it on the board. So a non-set lot is
 *  bid purely out of cash (I never mortgage for a non-set, exactly as on landing),
 *  while a set-completing lot can pull in the mortgage order. A still-mortgaged
 *  estate lot also costs its 10% interest up front, so that comes off my capacity. */
function auction(state: GameState, pid: string): BotDecision | null {
  const a = state.turn.auction;
  if (!a || !a.active.includes(pid) || a.leaderId === pid) return null;
  const me = state.players.find((p) => p.id === pid);
  const price = ownablePrice(a.position);
  if (!me || price === null) return null;

  const interest =
    a.resume.kind === "bank-estate" && state.mortgaged[a.position]
      ? (mortgageInterestAt(a.position) ?? 0)
      : 0;
  const raise = completesSet(state, pid, a.position)
    ? mortgageableTotal(mortgageOrder(state, pid, a.position))
    : 0;
  const capacity = me.cash - interest + raise;
  const cap = Math.min(
    price + BID_INCREMENT,
    capacity,
    auctionBidCap(state, pid),
  );
  const next = a.highBid + BID_INCREMENT;
  if (next <= cap) {
    return {
      intent: { kind: "bid", playerId: pid, amount: next },
      note: `Bidding $${next} on ${spaceName(a.position)} — I'll go up to $${cap}.`,
    };
  }
  return {
    intent: { kind: "pass-bid", playerId: pid },
    note: `Dropping out — won't pay over $${cap} for ${spaceName(a.position)}.`,
  };
}

function spaceName(pos: number): string {
  const s = SPACES[pos];
  return s.kind === "property" || s.kind === "railroad" || s.kind === "utility"
    ? s.name
    : "a property";
}

/** Forced debt settlement. Mortgage in the SAME escalating order as a voluntary
 *  raise — one lot per consult (the only shape the `mortgage` intent allows here);
 *  the engine re-checks solvency after each and leaves the phase the moment cash
 *  is back in the green. When every bare lot is mortgaged and we're still short,
 *  fall through to `null` so the engine's default can sell houses (the one place
 *  we let buildings go — there's nothing left to protect them with). The settler
 *  can be off-turn, so key off `firstNegativePlayer`, not `turn.playerId`. */
function mustRaiseCash(state: GameState, pid: string): BotDecision | null {
  if (firstNegativePlayer(state) !== pid) return null;
  const order = mortgageOrder(state, pid, -1);
  if (order.length === 0) return null;
  const lot = order[0];
  return {
    intent: { kind: "mortgage", playerId: pid, position: lot },
    note: `In the red — mortgaging ${spaceName(lot)} to cover it.`,
  };
}

export const policy: Bot = (state, playerId) => {
  switch (state.turn.phase) {
    case "buy-decision":
      return buyDecision(state, playerId);
    case "raising-cash":
      return raisingCash(state, playerId);
    case "auction":
      return auction(state, playerId);
    case "must-raise-cash":
      return mustRaiseCash(state, playerId);
    default:
      return null;
  }
};
