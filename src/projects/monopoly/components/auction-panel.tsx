"use client";

import type { CSSProperties } from "react";
import { SPACES } from "../data";
import { auctionBidCap, BID_INCREMENT } from "../engine";
import { ownablePrice } from "../logic";
import { useMonopolyStore } from "../store";
import { PLAYER_COLOR_VAR } from "../theme";
import type { GameState, Player } from "../types";
import { PositionChip } from "./holdings-grid";

interface Props {
  state: GameState;
}

/** The auction UI, shown to EVERY player while a property is up for bid — the
 *  auction lives in synced state, so this is a live view, not just the current
 *  bidder's. It takes over the prompt + log area (the footer hides the log to
 *  make room, like a trade), leaving the action bar in place.
 *
 *  Open-outcry, no turn order: any still-in player can tap Bid (raise the high by
 *  +$10) at any time — including the leader, to jam it up — or Drop out. The lot
 *  goes to the last bidder standing, or back to the bank if everyone drops
 *  without a bid. The bid chart grows a bar per player as they bid, so the room
 *  can read the standings — and where each player bailed — at a glance. */
export function AuctionPanel({ state }: Props) {
  const myPlayerId = useMonopolyStore((s) => s.myPlayerId);
  const submit = useMonopolyStore((s) => s.submit);

  const auction = state.turn.auction;
  if (!auction) return null;

  const space = SPACES[auction.position];
  const printed = ownablePrice(auction.position);
  const nextBid = auction.highBid + BID_INCREMENT;

  // Every non-bankrupt player is a participant; a bankrupt estate debtor is
  // already excluded. Shown in seat order with their standing.
  const participants = state.players.filter((p) => !p.bankrupt);

  // This client can act if it's still in the auction. Bid is gated on the next
  // +$10 staying within its cap (the leader may bid to jam); Drop is for anyone
  // but the standing leader (no retracting a winning bid).
  const stillIn = myPlayerId !== null && auction.active.includes(myPlayerId);
  const isLeader = myPlayerId !== null && auction.leaderId === myPlayerId;
  const myCap = myPlayerId !== null ? auctionBidCap(state, myPlayerId) : 0;
  const canBid = stillIn && nextBid <= myCap;
  const canDrop = stillIn && !isLeader;

  return (
    <div className="relative z-10 flex shrink-0 flex-col" style={SECTION_STYLE}>
      <div className="flex flex-col gap-2 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <PositionChip
              position={auction.position}
              mortgaged={state.mortgaged[auction.position] ?? false}
            />
            <span className="truncate font-semibold uppercase tracking-wide">
              {"name" in space ? space.name : "Auction"}
            </span>
            {printed !== null && (
              <span style={{ opacity: 0.5, fontVariantNumeric: "tabular-nums" }}>
                ${printed.toLocaleString("en-US")}
              </span>
            )}
          </span>
          <span
            className="shrink-0 font-semibold"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {auction.leaderId ? (
              <>
                <span style={{ opacity: 0.6 }}>High </span>
                <span style={{ color: "var(--mono-green)" }}>
                  ${auction.highBid.toLocaleString("en-US")}
                </span>
              </>
            ) : (
              <span style={{ opacity: 0.6 }}>No bids yet</span>
            )}
          </span>
        </div>

        <BidChart auction={auction} participants={participants} printed={printed} />
      </div>

      <div className="flex shrink-0">
        <AuctionButton
          label="Drop"
          onClick={() => {
            if (myPlayerId) submit({ kind: "pass-bid", playerId: myPlayerId });
          }}
          disabled={!canDrop}
        />
        <AuctionButton
          label={`Bid $${nextBid.toLocaleString("en-US")}`}
          onClick={() => {
            if (myPlayerId) submit({ kind: "bid", playerId: myPlayerId, amount: nextBid });
          }}
          disabled={!canBid}
          variant="primary"
        />
      </div>
    </div>
  );
}

type Standing = "leading" | "in" | "out";

function standingFor(
  auction: NonNullable<GameState["turn"]["auction"]>,
  id: string,
): Standing {
  if (auction.leaderId === id) return "leading";
  return auction.active.includes(id) ? "in" : "out";
}

/** A column chart of the live auction: one bar per player, its height scaled to
 *  the current high bid (with headroom). The dashed line marks the printed
 *  price. A dropped player's bar freezes at their last bid — `pass-bid` keeps
 *  their `bids` entry — so you can see exactly where each bailed. */
function BidChart({
  auction,
  participants,
  printed,
}: {
  auction: NonNullable<GameState["turn"]["auction"]>;
  participants: readonly Player[];
  printed: number | null;
}) {
  const priceLine = printed ?? 0;
  // Scale so the tallest of {high bid, printed price} sits below the top —
  // headroom keeps the leader's bar and the price marker from clipping.
  const peak = Math.max(auction.highBid, priceLine, BID_INCREMENT);
  const scaleMax = peak * 1.12;
  const pct = (value: number) => (scaleMax > 0 ? (value / scaleMax) * 100 : 0);

  return (
    <div className="flex flex-col gap-1">
      <div
        className="relative flex items-end gap-1"
        style={{ height: "clamp(84px, 15vh, 168px)" }}
      >
        {priceLine > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 flex items-center gap-1"
            style={{ bottom: `${pct(priceLine).toString()}%` }}
          >
            <div
              className="flex-1 border-t border-dashed"
              style={{ borderColor: "var(--mono-ink)", opacity: 0.3 }}
            />
            <span
              className="shrink-0 tabular-nums"
              style={{ fontSize: "0.6rem", opacity: 0.5 }}
            >
              ${priceLine.toLocaleString("en-US")}
            </span>
          </div>
        )}
        {participants.map((p) => (
          <BidBar
            key={p.id}
            player={p}
            bid={auction.bids[p.id] ?? 0}
            standing={standingFor(auction, p.id)}
            heightPct={pct(auction.bids[p.id] ?? 0)}
          />
        ))}
      </div>
      <div className="flex gap-1">
        {participants.map((p) => (
          <BidBase key={p.id} player={p} standing={standingFor(auction, p.id)} />
        ))}
      </div>
    </div>
  );
}

function BidBar({
  player,
  bid,
  standing,
  heightPct,
}: {
  player: Player;
  bid: number;
  standing: Standing;
  heightPct: number;
}) {
  const out = standing === "out";
  const leading = standing === "leading";
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-end">
      {bid > 0 && (
        <span
          className="mb-0.5 tabular-nums"
          style={{
            fontSize: "0.6rem",
            fontWeight: leading ? 700 : 500,
            opacity: out ? 0.5 : 1,
          }}
        >
          ${bid.toLocaleString("en-US")}
        </span>
      )}
      <div
        className="w-full rounded-t-sm transition-[height] duration-300 ease-out"
        style={{
          height: `${heightPct.toString()}%`,
          minHeight: bid > 0 ? "3px" : "0",
          backgroundColor: PLAYER_COLOR_VAR[player.color],
          opacity: out ? 0.3 : 1,
          boxShadow: leading
            ? "inset 0 0 0 1.5px var(--mono-ink)"
            : "inset 0 0 0 1px var(--mono-frame)",
        }}
      />
    </div>
  );
}

function BidBase({
  player,
  standing,
}: {
  player: Player;
  standing: Standing;
}) {
  const out = standing === "out";
  return (
    <div
      className="flex min-w-0 flex-1 flex-col items-center gap-0.5"
      style={{ opacity: out ? 0.45 : 1 }}
    >
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{
          backgroundColor: PLAYER_COLOR_VAR[player.color],
          boxShadow: "0 0 0 1px var(--mono-frame)",
        }}
      />
      <span
        className="max-w-full truncate"
        style={{
          fontSize: "0.6rem",
          fontWeight: standing === "leading" ? 700 : 500,
          textDecoration: out ? "line-through" : undefined,
        }}
      >
        {player.name}
      </span>
    </div>
  );
}

const SECTION_STYLE: CSSProperties = {
  backgroundColor: "var(--mono-card)",
  color: "var(--mono-ink)",
  boxShadow: "inset 0 1px 0 var(--mono-frame)",
};

function AuctionButton({
  label,
  onClick,
  disabled,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary";
}) {
  const background =
    variant === "primary" ? "var(--mono-green)" : "var(--mono-board)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-1 items-center justify-center px-3 py-3 font-semibold uppercase tracking-wide disabled:opacity-40"
      style={{
        backgroundColor: background,
        // Dark ink on the bright green primary (white-on-green is too low
        // contrast); near-white on the dark default. Matches the seat-room
        // Start button's green pairing.
        color: variant === "primary" ? "var(--mono-frame)" : "var(--mono-ink)",
        fontSize: "clamp(0.875rem, 2.5vmin, 1.125rem)",
        minHeight: "56px",
      }}
    >
      {label}
    </button>
  );
}
