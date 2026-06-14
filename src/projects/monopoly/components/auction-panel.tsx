"use client";

import type { CSSProperties } from "react";
import { SPACES } from "../data";
import { auctionBidCap, BID_INCREMENT } from "../engine";
import { ownablePrice } from "../logic";
import { useMonopolyStore } from "../store";
import { PLAYER_COLOR_VAR, PROPERTY_COLOR_VAR } from "../theme";
import type { GameState, Player } from "../types";

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
 *  without a bid. */
export function AuctionPanel({ state }: Props) {
  const myPlayerId = useMonopolyStore((s) => s.myPlayerId);
  const submit = useMonopolyStore((s) => s.submit);

  const auction = state.turn.auction;
  if (!auction) return null;

  const space = SPACES[auction.position];
  const printed = ownablePrice(auction.position);
  const nextBid = auction.highBid + BID_INCREMENT;
  const leader = auction.leaderId
    ? (state.players.find((p) => p.id === auction.leaderId) ?? null)
    : null;

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
            {space.kind === "property" && (
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-sm"
                style={{
                  backgroundColor: PROPERTY_COLOR_VAR[space.color],
                  boxShadow: "0 0 0 1px var(--mono-frame)",
                }}
              />
            )}
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
            {leader ? (
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

        <div className="flex flex-wrap gap-x-3 gap-y-1" style={{ fontSize: "0.8rem" }}>
          {participants.map((p) => (
            <BidderTag
              key={p.id}
              player={p}
              standing={standingFor(auction, p.id)}
              bid={auction.bids[p.id]}
            />
          ))}
        </div>
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
            if (myPlayerId) submit({ kind: "bid", playerId: myPlayerId });
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

function BidderTag({
  player,
  standing,
  bid,
}: {
  player: Player;
  standing: Standing;
  bid: number | undefined;
}) {
  const out = standing === "out";
  const note =
    standing === "leading"
      ? "leads"
      : standing === "out"
        ? "out"
        : bid !== undefined
          ? `$${bid.toLocaleString("en-US")}`
          : "in";
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{
        opacity: out ? 0.4 : 1,
        fontWeight: standing === "leading" ? 700 : 500,
      }}
    >
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{
          backgroundColor: PLAYER_COLOR_VAR[player.color],
          boxShadow: "0 0 0 1px var(--mono-frame)",
        }}
      />
      <span className="font-semibold">{player.name}</span>
      <span
        style={{
          opacity: 0.7,
          fontVariantNumeric: "tabular-nums",
          color: standing === "leading" ? "var(--mono-green)" : undefined,
          textDecoration: out ? "line-through" : undefined,
        }}
      >
        {note}
      </span>
    </span>
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
        color: "var(--mono-ink)",
        fontSize: "clamp(0.875rem, 2.5vmin, 1.125rem)",
        minHeight: "56px",
      }}
    >
      {label}
    </button>
  );
}
