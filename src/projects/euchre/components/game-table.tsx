"use client";

import { useCallback, useMemo } from "react";
import { useEuchreStore } from "../store";
import type { Card, PlayerIndex, BidAction, Team } from "../types";
import type { ConnectionState } from "@/shared/lib/multiplayer";
import {
  getTeam,
  getPartner,
  getValidPlays,
  getEffectiveSuit,
  countTricksByTeam,
  canPass,
} from "../logic";
import type { SeatPosition } from "./player-hand";
import { PlayerHand } from "./player-hand";
import { TrickArea } from "./trick-area";
import { ScoreBoard } from "./score-board";
import { BiddingControls } from "./bidding-controls";
import { HandResultDisplay } from "./hand-result";
import { GameOver } from "./game-over";

const DEFAULT_NAMES: Record<PlayerIndex, string> = {
  0: "Player 0",
  1: "Player 1",
  2: "Player 2",
  3: "Player 3",
};

export interface GameTableProps {
  /** Player display names by seat index. */
  playerNames?: Record<PlayerIndex, string>;
  /** Connection status per seat (multiplayer only). */
  playerStatuses?: Record<PlayerIndex, ConnectionState>;
  /** Whether this client is the game authority. Controls "Next Hand" button. */
  isAuthority?: boolean;
  /** Override callbacks for multiplayer routing. */
  onBid?: (action: BidAction) => void;
  onCardClick?: (card: Card) => void;
  onNextHand?: () => void;
  onPlayAgain?: () => void;
  onLeave?: () => void;
}

/** Map a game-table player to a screen seat relative to the local player. */
function getSeat(player: PlayerIndex, myPlayer: PlayerIndex): SeatPosition {
  const offset = ((player - myPlayer + 4) % 4) as 0 | 1 | 2 | 3;
  return (["bottom", "left", "top", "right"] as const)[offset];
}

/** Seat order for rendering: bottom (0), left (1), top (2), right (3). */
function seatOrder(myPlayer: PlayerIndex): PlayerIndex[] {
  return [0, 1, 2, 3].map(
    (offset) => ((myPlayer + offset) % 4) as PlayerIndex,
  );
}

export function GameTable(props: GameTableProps = {}) {
  const {
    playerNames = DEFAULT_NAMES,
    playerStatuses,
    isAuthority = true,
    onBid: onBidProp,
    onCardClick: onCardClickProp,
    onNextHand: onNextHandProp,
    onPlayAgain: onPlayAgainProp,
    onLeave: onLeaveProp,
  } = props;

  const myPlayer = useEuchreStore((s) => s.myPlayer);
  const game = useEuchreStore((s) => s.game);
  const bid = useEuchreStore((s) => s.bid);
  const dealerDiscard = useEuchreStore((s) => s.dealerDiscard);
  const playCard = useEuchreStore((s) => s.playCard);
  const nextHand = useEuchreStore((s) => s.nextHand);

  const me = myPlayer ?? (0 as PlayerIndex);
  const myTeam: Team = getTeam(me);

  const seatOf = useCallback(
    (p: PlayerIndex) => getSeat(p, me),
    [me],
  );

  const players = useMemo(() => seatOrder(me), [me]);

  // Trick counts for score board
  const trickCounts = useMemo((): [number, number] | undefined => {
    if (!game || game.completedTricks.length === 0) return undefined;
    return countTricksByTeam(game.completedTricks);
  }, [game]);

  // Valid plays for the local player
  const validPlays = useMemo((): Card[] | null => {
    if (
      !game ||
      game.phase !== "playing" ||
      game.currentPlayer !== me ||
      !game.trumpSuit
    )
      return null;
    const leadSuit =
      game.currentTrick.length > 0
        ? getEffectiveSuit(game.currentTrick[0].card, game.trumpSuit)
        : null;
    return getValidPlays(game.hands[me], leadSuit, game.trumpSuit);
  }, [game, me]);

  const handleBid = useCallback(
    (action: BidAction) => {
      if (onBidProp) {
        onBidProp(action);
      } else {
        bid(me, action);
      }
    },
    [bid, me, onBidProp],
  );

  const handleCardClick = useCallback(
    (card: Card) => {
      if (!game) return;

      if (onCardClickProp) {
        onCardClickProp(card);
      } else if (game.phase === "dealer-discard" && game.dealer === me) {
        dealerDiscard(card);
      } else if (game.phase === "playing" && game.currentPlayer === me) {
        playCard(me, card);
      }
    },
    [game, me, dealerDiscard, playCard, onCardClickProp],
  );

  if (!game) return null;

  const isBidding =
    game.phase === "bidding-round-1" || game.phase === "bidding-round-2";
  const isDiscarding = game.phase === "dealer-discard";
  const isHandOver = game.phase === "hand-over";
  const isGameOver = game.phase === "game-over";

  // Determine which cards the local player can interact with
  let myValidCards: Card[] | null = null;
  if (game.phase === "playing" && game.currentPlayer === me) {
    myValidCards = validPlays;
  } else if (isDiscarding && game.dealer === me) {
    myValidCards = game.hands[me];
  }

  // Show up card during bidding round 1 only
  const showUpCard = game.phase === "bidding-round-1" ? game.upCard : null;

  return (
    <div className="flex flex-col items-center gap-3 md:gap-4 w-full max-w-3xl mx-auto">
      {/* Score board */}
      <ScoreBoard
        scores={game.scores}
        trickCounts={trickCounts}
        myTeam={myTeam}
      />

      {/* Phase label */}
      <PhaseLabel game={game} me={me} />

      {/* ============================================ */}
      {/* TABLE AREA                                   */}
      {/* Mobile:  stacked — partner, [L | R], center  */}
      {/* Desktop: classic — partner, [L center R], me  */}
      {/* ============================================ */}
      <div className="flex flex-col items-center gap-2 md:gap-3 w-full">
        {/* Partner (top) — always a horizontal row */}
        <PlayerHand
          cards={game.hands[players[2]]}
          position="top"
          faceDown
          isActive={game.currentPlayer === players[2]}
          label={playerLabel(players[2], me, game.dealer, playerNames)}
          trickCount={trickCountForPlayer(players[2], game)}
          disconnected={playerStatuses?.[players[2]] === "disconnected" || playerStatuses?.[players[2]] === "failed"}
        />

        {/*
          Middle section — CSS grid handles both layouts:
          Mobile  (2 cols): [left, right] row 1 — [trick area spanning 2] row 2
          Desktop (3 cols): [left, trick area, right] single row
        */}
        <div
          className="grid w-full items-center justify-items-center gap-3 md:gap-6
            grid-cols-2
            md:grid-cols-[auto_1fr_auto] md:grid-rows-1"
        >
          {/* Left opponent */}
          <PlayerHand
            cards={game.hands[players[1]]}
            position="left"
            faceDown
            isActive={game.currentPlayer === players[1]}
            label={playerLabel(players[1], me, game.dealer, playerNames)}
            trickCount={trickCountForPlayer(players[1], game)}
            disconnected={playerStatuses?.[players[1]] === "disconnected" || playerStatuses?.[players[1]] === "failed"}
          />

          {/* Right opponent — col 2 on mobile, col 3 on desktop */}
          <div className="md:col-start-3 md:row-start-1">
            <PlayerHand
              cards={game.hands[players[3]]}
              position="right"
              faceDown
              isActive={game.currentPlayer === players[3]}
              label={playerLabel(players[3], me, game.dealer, playerNames)}
              trickCount={trickCountForPlayer(players[3], game)}
              disconnected={playerStatuses?.[players[3]] === "disconnected" || playerStatuses?.[players[3]] === "failed"}
            />
          </div>

          {/* Trick area — spans 2 cols on mobile, middle col on desktop */}
          <div className="col-span-2 md:col-span-1 md:col-start-2 md:row-start-1">
            <TrickArea
              currentTrick={game.currentTrick}
              trumpSuit={game.trumpSuit}
              upCard={showUpCard}
              seatOf={seatOf}
            />
          </div>
        </div>

        {/* My hand (bottom) */}
        <PlayerHand
          cards={game.hands[me]}
          position="bottom"
          validPlays={myValidCards}
          onCardClick={handleCardClick}
          isActive={game.currentPlayer === me}
          label={playerLabel(me, me, game.dealer, playerNames)}
          trickCount={trickCountForPlayer(me, game)}
        />
      </div>

      {/* Bidding controls */}
      {isBidding && (
        <BiddingControls
          round={game.phase === "bidding-round-1" ? 1 : 2}
          upCardSuit={game.upCard?.suit}
          turnedDownSuit={game.turnedDownSuit}
          canPass={canPass(game)}
          isMyTurn={game.currentPlayer === me}
          onBid={handleBid}
        />
      )}

      {/* Discard prompt */}
      {isDiscarding && game.dealer === me && (
        <div className="text-sm text-brand-orange text-center">
          Pick up the trump card &mdash; select a card to discard
        </div>
      )}
      {isDiscarding && game.dealer !== me && (
        <div className="text-sm text-text-muted animate-pulse">
          Dealer is discarding...
        </div>
      )}

      {/* Hand result */}
      {isHandOver && game.handResult && (
        <HandResultDisplay
          result={game.handResult}
          myTeam={myTeam}
          onNextHand={onNextHandProp ?? nextHand}
          isAuthority={isAuthority}
        />
      )}

      {/* Game over */}
      {isGameOver && (
        <GameOver
          scores={game.scores}
          myTeam={myTeam}
          onPlayAgain={onPlayAgainProp}
          onLeave={onLeaveProp}
        />
      )}
    </div>
  );
}

// --- Helpers ---

function playerLabel(
  player: PlayerIndex,
  me: PlayerIndex,
  dealer: PlayerIndex,
  names: Record<PlayerIndex, string>,
): string {
  const parts: string[] = [];
  if (player === me) parts.push("You");
  else parts.push(names[player]);

  if (player === getPartner(me) && player !== me) parts[0] += " (partner)";
  if (player === dealer) parts.push("D");

  return parts.join(" ");
}

function trickCountForPlayer(
  player: PlayerIndex,
  game: { completedTricks: { winner: PlayerIndex }[] },
): number {
  const team = getTeam(player);
  return game.completedTricks.filter((t) => getTeam(t.winner) === team).length;
}

/** Small text label showing current phase context. */
function PhaseLabel({
  game,
  me,
}: {
  game: { phase: string; currentPlayer: PlayerIndex; dealer: PlayerIndex };
  me: PlayerIndex;
}) {
  const isMyTurn = game.currentPlayer === me;

  let text = "";
  switch (game.phase) {
    case "bidding-round-1":
      text = isMyTurn ? "Your bid (round 1)" : "Bidding round 1";
      break;
    case "bidding-round-2":
      text = isMyTurn ? "Your bid (round 2)" : "Bidding round 2";
      break;
    case "dealer-discard":
      text = game.dealer === me ? "Discard a card" : "Dealer discarding";
      break;
    case "playing":
      text = isMyTurn ? "Your turn to play" : "Waiting for play...";
      break;
    case "hand-over":
      text = "Hand complete";
      break;
    case "game-over":
      text = "Game over";
      break;
  }

  return (
    <div className="text-sm text-text-secondary">
      {text}
    </div>
  );
}
