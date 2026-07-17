// ===========================================================================
// gemini-v1 SNAPSHOT — the first version of the GEMINI lineage (a bot family
// distinct from Claude and Jane; see METHOD.md "Bot lineages"). Authored by
// Gemini and wired into our `Bot` contract. Every change from the delivered
// source is WIRING or a BEHAVIOR-PRESERVING correction — Gemini's strategy (its
// valuations, priorities, thresholds, and per-phase decisions) is intact:
//   1. Imports added for the engine helpers it calls.
//   2. `MonopolyBot` -> our contract type `Bot`; export `myBot` -> `policy`.
//   3. Jail "stay" branch: the source's `{ intent: null as any } ? null : null`
//      written as the bare `return null` the contract prescribes (its own
//      comment said it intended to "pass null" there).
//   4. Dropped the invalid color "magenta" from both priority arrays. Our
//      `PropertyColor` has 8 groups, no separate magenta — the source listed
//      BOTH "pink" and "magenta", so magenta is a phantom duplicate of pink.
//      Removed it, leaving every VALID color Gemini wrote in its original
//      position (behavior-neutral: the pre-roll array only affects an arm's
//      note text, and a duplicate in the build array is a no-op once pink is
//      already developed).
//   5. `trade.approvals[playerId] !== undefined` -> `playerId in trade.approvals`
//      — the same membership test, in the idiom that compiles under our types
//      (index access is non-nullable here) without a no-op condition.
//   6. `let nextStaged` -> `const`; removed the dead `maxLvl` (assigned, never
//      read). Neither affects behavior.
// Exposed as `geminiV1Bot`.
// ===========================================================================
import { SPACES } from "../../../data";
import {
  bankSupply,
  colorAt,
  developmentLevel,
  groupPositions,
  houseCostAt,
} from "../../../development";
import { auctionBidCap, firstNegativePlayer } from "../../../engine";
import { hasMonopoly, heldJailCard, ownablePrice } from "../../../logic";
import type { PropertyColor } from "../../../types";
import type { Bot } from "../../decision";

export const policy: Bot = (state, playerId) => {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return null;

  const { turn } = state;
  const phase = turn.phase;

  // -- HELPER: GAME STAGE EVALUATION --
  // Count how many of the 28 ownable properties are currently owned.
  const ownedCount = Object.keys(state.ownership).length;
  const isEarlyGame = ownedCount < 20;

  // -- PHASE: JAIL DECISION --
  if (phase === "jail-decision" && turn.playerId === playerId) {
    // Early game: Get out immediately to buy unowned property.
    // Late game: Stay in jail to safely collect rent while avoiding opponents' monopolies.
    if (isEarlyGame) {
      const card = heldJailCard(state, playerId);
      if (card) {
        return {
          intent: { kind: "use-jail-card", playerId },
          note: "Early game: Using card to escape and maintain board velocity.",
        };
      }
      if (me.cash > 100) {
        return {
          intent: { kind: "pay-to-leave-jail", playerId },
          note: "Early game: Paying $50 to buy remaining properties.",
        };
      }
    }
    // Default to roll (staying in jail if we don't roll doubles).
    // Engine fallback handles roll automatically when we pass null.
    return null;
  }

  // -- PHASE: BUY DECISION --
  if (phase === "buy-decision" && turn.playerId === playerId && turn.pendingBuy !== undefined) {
    const pos = turn.pendingBuy;
    const price = ownablePrice(pos);
    const space = SPACES[pos];

    if (price && me.cash >= price) {
      // Pro Strategy: Buy practically everything you land on if you have the cash.
      // Even "bad" properties act as trade fodder or can be mortgaged for 50% of their cost.
      return {
        intent: { kind: "buy", playerId },
        note: `Purchasing ${space.kind === "property" ? space.name : "asset"} for $${price}.`,
      };
    }

    // If we can't afford it natively, checking if raising cash is worth it.
    // To keep the bot fast and avoid endless staging loops, we decline and let it hit auction
    // where we might snag it cheaper, or force opponents to pay up.
    return {
      intent: { kind: "decline-buy", playerId },
      note: `Insufficient liquid cash for $${price}. Pushing to auction.`,
    };
  }

  // -- PHASE: AUCTION --
  if (phase === "auction" && turn.auction) {
    const { position, highBid, active } = turn.auction;
    if (!active.includes(playerId)) return null;

    const price = ownablePrice(position) || 0;
    const space = SPACES[position];
    const color = colorAt(position);

    let maxValuation = price;

    // Calculate dynamic valuation
    if (color) {
      // Check if this completes OUR monopoly
      const myColorCount = groupPositions(color).filter(p => state.ownership[p] === playerId).length;
      const totalInColor = groupPositions(color).length;

      if (myColorCount === totalInColor - 1) {
        maxValuation = price * 2.5; // Worth massive premium to complete set
      }

      // Check if this blocks an OPPONENT'S monopoly
      const oppId = active.find(id => id !== playerId);
      if (oppId) {
        const oppColorCount = groupPositions(color).filter(p => state.ownership[p] === oppId).length;
        if (oppColorCount === totalInColor - 1) {
          maxValuation = price * 1.5; // Worth a premium to block
        }
      }

      // Oranges and Light Blues are statistically landed on most often (Jail exits)
      if (color === "orange" || color === "light-blue") {
        maxValuation *= 1.2;
      }
    } else if (space.kind === "railroad") {
      maxValuation = price * 1.2;
    }

    const maxBid = Math.min(maxValuation, auctionBidCap(state, playerId));

    // If we can outbid the current high by $10 and stay under our cap
    if (highBid + 10 <= maxBid) {
      return {
        intent: { kind: "bid", playerId, amount: highBid + 10 },
        note: `Bidding ${highBid + 10} (Cap: ${Math.floor(maxBid)}) on ${space.kind === "property" ? space.name : "asset"}.`,
      };
    }

    return {
      intent: { kind: "pass-bid", playerId },
      note: `Valuation exceeded. Dropping out of auction.`,
    };
  }

  // -- PHASE: MUST RAISE CASH (DEBT RESOLUTION) --
  if (phase === "must-raise-cash") {
    // We only act if we are the current debtor
    const debtorId = firstNegativePlayer(state);
    if (debtorId !== playerId) return null;

    // Priorities for raising cash:
    // 1. Mortgage Utilities
    // 2. Mortgage isolated properties (not part of a set we are trying to complete)
    // 3. Sell buildings (last resort, terrible ROI loss)

    const myProps = Object.entries(state.ownership)
      .filter(([_, owner]) => owner === playerId)
      .map(([pos]) => parseInt(pos, 10))
      .filter(pos => !state.mortgaged[pos]);

    // Try to find a utility or bare single property first
    for (const pos of myProps) {
      const isUtil = SPACES[pos].kind === "utility";
      const devLvl = developmentLevel(state, pos);
      if (devLvl === 0 && isUtil) {
        return {
          intent: { kind: "mortgage", playerId, position: pos },
          note: "Liquidating utilities to cover debt.",
        };
      }
    }

    for (const pos of myProps) {
      const color = colorAt(pos);
      const devLvl = developmentLevel(state, pos);
      const hasMonop = color ? hasMonopoly(state, color, playerId) : false;

      if (devLvl === 0 && !hasMonop) {
        return {
          intent: { kind: "mortgage", playerId, position: pos },
          note: `Mortgaging isolated property at position ${pos} to raise cash.`,
        };
      }
    }

    // If we get here, the engine's canonical default (selling buildings evenly)
    // will take over via the null fallback, which is mathematically sound.
    return null;
  }

  // -- PHASE: TRADE PENDING (VOTING) --
  if (phase === "trade-pending" && turn.pendingTrade) {
    const trade = turn.pendingTrade;
    if (playerId in trade.approvals && !trade.approvals[playerId]) {
      // Analyze if this trade is a trap.
      // Pro heuristic: NEVER give an opponent a monopoly unless you get a better one.
      let iCompleteMonopoly = false;
      let theyCompleteMonopoly = false;

      // Calculate what sets are being completed
      for (const [posStr, newOwner] of Object.entries(trade.propertyTo)) {
        const pos = parseInt(posStr, 10);
        const color = colorAt(pos);
        if (color) {
          // Check if this property completes the set for the receiver
          const currentOwned = groupPositions(color).filter(p =>
            state.ownership[p] === newOwner || (trade.propertyTo[p] === newOwner)
          ).length;

          if (currentOwned === groupPositions(color).length) {
            if (newOwner === playerId) iCompleteMonopoly = true;
            else theyCompleteMonopoly = true;
          }
        }
      }

      if (theyCompleteMonopoly && !iCompleteMonopoly) {
        return {
          intent: { kind: "decline-trade", playerId, tradeId: trade.id },
          note: "Vetoed: Trade grants an opponent a monopoly without granting me one.",
        };
      }

      // If we benefit more, or it's just cash for an isolated property we need:
      if (iCompleteMonopoly || trade.cashDelta[playerId] > 300) {
        return {
          intent: { kind: "accept-trade", playerId, tradeId: trade.id },
          note: "Accepting trade: EV is strictly positive for my board position.",
        };
      }

      // Default decline if it doesn't clearly advantage us
      return {
        intent: { kind: "decline-trade", playerId, tradeId: trade.id },
        note: "Vetoed: Marginal or negative tactical advantage.",
      };
    }
  }

  // -- PHASE: PRE-ROLL (PROACTIVE ACTIONS) --
  if (phase === "pre-roll" && turn.playerId === playerId) {
    // Check if we have an un-built monopoly and cash to build.
    // Target hitting 3 houses (the ROI spike).
    const colors: PropertyColor[] = ["orange", "light-blue", "red", "yellow", "pink", "green", "dark-blue", "brown"];

    for (const color of colors) {
      if (hasMonopoly(state, color, playerId)) {
        const group = groupPositions(color);
        const cost = houseCostAt(group[0]) || 0;

        // Find current lowest development level in this group
        const minLvl = Math.min(...group.map(p => developmentLevel(state, p)));

        // If we haven't hit the 3-house mark and have cash for at least 1 round of houses
        if (minLvl < 3 && me.cash >= (cost * group.length)) {
          // Ensure we haven't already armed a manage phase this turn
          const alreadyArmed = turn.boundaryServed?.some(b => b.playerId === playerId && b.kind === "manage");
          if (!alreadyArmed) {
            return {
              intent: { kind: "set-queue", playerId, queue: "manage", armed: true },
              note: `Arming build queue: Pushing ${color} towards 3-house ROI spike.`,
            };
          }
        }
      }
    }
    return null; // Proceed to roll
  }

  // -- PHASE: MANAGING (BUILDING INTERMISSION) --
  if (phase === "managing" && turn.managerId === playerId) {
    const stagedBuild = turn.manageStaged?.build || {};
    const nextStaged = { ...stagedBuild };
    let totalCost = 0;
    let madeChange = false;

    // Prioritize building on the highest ROI sets first
    const buildPriority: PropertyColor[] = [
      "orange", "light-blue", "red", "yellow", "pink", "green", "dark-blue", "brown"
    ];

    for (const color of buildPriority) {
      if (hasMonopoly(state, color, playerId)) {
        const group = groupPositions(color);
        // Only build if the whole set is unmortgaged
        if (group.some(p => state.mortgaged[p])) continue;

        const cost = houseCostAt(group[0]) || 0;
        const currentLevels = group.map(p => ({
          pos: p,
          lvl: nextStaged[p] ?? developmentLevel(state, p)
        }));

        let minLvl = Math.min(...currentLevels.map(l => l.lvl));

        // Build towards 3 or 4 houses (Squeeze strategy). Avoid hotels unless loaded.
        const targetLvl = me.cash > 1500 ? 5 : (bankSupply(state).houses < 5 ? 4 : 3);

        while (minLvl < targetLvl && (totalCost + cost) <= (me.cash - 200)) { // Keep $200 buffer
          // Find the property with the lowest level to maintain even building
          const propToUpgrade = currentLevels.find(l => l.lvl === minLvl);
          if (propToUpgrade) {
            propToUpgrade.lvl += 1;
            nextStaged[propToUpgrade.pos] = propToUpgrade.lvl;
            totalCost += cost;
            madeChange = true;
          }
          minLvl = Math.min(...currentLevels.map(l => l.lvl));
        }
      }
    }

    if (madeChange) {
      return {
        intent: { kind: "manage", playerId, build: nextStaged, mortgage: {} },
        note: "Executing optimal even-build development.",
      };
    } else {
      // Nothing more we can afford to build safely
      return {
        intent: { kind: "cancel-manage", playerId },
        note: "Concluding asset management.",
      };
    }
  }

  // Accept engine defaults for all other phases / waiting states
  return null;
};
