"use client";

import { useRoom } from "@/shared/lib/peer";
import { useProfile } from "@/shared/lib/profile";
import { seatTeams, welcomeFor } from "../logic";
import { useEuchreStore } from "../store";
import type {
  BidAction,
  Card,
  GuestMessage,
  HostMessage,
  PlayerIndex,
  Team,
} from "../types";
import { EuchreLobby } from "./lobby";
import { EuchreGameSession } from "./game-session";

function randomDealer(): PlayerIndex {
  return Math.floor(Math.random() * 4) as PlayerIndex;
}

/**
 * Four players in a star around the host. The host owns the teams, the
 * seats and the game: it applies every action, its own and the guests', and
 * broadcasts the result. A guest who drops out and rejoins with the same
 * profile gets their seat back.
 */
export function Euchre() {
  const profile = useProfile();

  const room = useRoom<HostMessage, GuestMessage>({
    game: "euchre",
    profile,
    onGuestJoined(player) {
      const welcome = welcomeFor(useEuchreStore.getState(), player.id);
      if (welcome !== null) room.sendTo(player.peerId, welcome);
    },
    onGuestLeft(player) {
      if (useEuchreStore.getState().seats !== null) return;
      useEuchreStore.getState().dropFromTeams(player.id);
      broadcastTeams();
    },
    onGuestMessage(from, message) {
      const store = useEuchreStore.getState();
      if (message.kind === "team") {
        if (store.seats !== null) return;
        store.setTeam(from.id, message.team);
        broadcastTeams();
        return;
      }
      const seat = store.seats?.find((s) => s.playerId === from.id)?.seatIndex;
      if (seat !== undefined) applyAction(seat, message);
    },
    onHostMessage(message) {
      const store = useEuchreStore.getState();
      switch (message.kind) {
        case "teams":
          store.setTeams(message.teams);
          break;
        case "start":
          store.seatPlayers(message.seats, profile.id);
          store.applyStateUpdate(message.gameState);
          break;
        case "state":
          store.applyStateUpdate(message.gameState);
          break;
      }
    },
  });

  function broadcastTeams() {
    room.broadcast({ kind: "teams", teams: useEuchreStore.getState().teams });
  }

  function broadcastState() {
    const game = useEuchreStore.getState().game;
    if (game === null) throw new Error("euchre: no game to broadcast");
    room.broadcast({ kind: "state", gameState: game });
  }

  /** Host: apply a seated player's action and share the result. */
  function applyAction(seat: PlayerIndex, action: Exclude<GuestMessage, { kind: "team" }>) {
    const store = useEuchreStore.getState();
    const game = store.game;
    if (game === null) return;
    let changed = false;
    switch (action.kind) {
      case "bid":
        changed = store.bid(seat, action.action);
        break;
      case "discard":
        changed = game.dealer === seat && store.dealerDiscard(action.card);
        break;
      case "play":
        changed = store.playCard(seat, action.card);
        break;
      case "next-hand":
        store.nextHand();
        changed = true;
        break;
      case "play-again":
        store.startGame(randomDealer());
        changed = true;
        break;
    }
    if (changed) broadcastState();
  }

  function act(action: Exclude<GuestMessage, { kind: "team" }>) {
    const seat = useEuchreStore.getState().myPlayer;
    if (seat === null) return;
    if (room.role === "host") applyAction(seat, action);
    else room.sendToHost(action);
  }

  function selectTeam(team: Team) {
    if (room.role === "host") {
      useEuchreStore.getState().setTeam(profile.id, team);
      broadcastTeams();
    } else {
      room.sendToHost({ kind: "team", team });
    }
  }

  function startGame() {
    const store = useEuchreStore.getState();
    const seats = seatTeams(store.teams, (playerId) => room.players.find((p) => p.id === playerId)?.name ?? "Player");
    if (seats === null) return;
    store.seatPlayers(seats, profile.id);
    store.startGame(randomDealer());
    const game = useEuchreStore.getState().game;
    if (game === null) throw new Error("euchre: startGame made no game");
    room.broadcast({ kind: "start", seats, gameState: game });
  }

  function handleCreate() {
    useEuchreStore.getState().reset();
    useEuchreStore.getState().setTeam(profile.id, "A");
    room.create();
  }

  function handleJoin(code: string) {
    useEuchreStore.getState().reset();
    room.join(code);
  }

  function handleLeave() {
    room.leave();
    useEuchreStore.getState().reset();
  }

  if (room.code === null || room.status === "not-found") {
    return (
      <EuchreLobby
        onCreate={handleCreate}
        onJoin={handleJoin}
        notice={room.status === "not-found" ? `No room with code ${room.code}` : null}
      />
    );
  }

  const code = room.code;
  return (
    <EuchreGameSession
      status={room.status}
      isHost={room.role === "host"}
      roomCode={code}
      players={room.players}
      myPlayerId={profile.id}
      onSelectTeam={selectTeam}
      onStart={startGame}
      onBid={(action: BidAction) => act({ kind: "bid", action })}
      onCardClick={(card: Card) => {
        const { game, myPlayer } = useEuchreStore.getState();
        if (game === null || myPlayer === null) return;
        if (game.phase === "dealer-discard" && game.dealer === myPlayer) act({ kind: "discard", card });
        else if (game.phase === "playing" && game.currentPlayer === myPlayer) act({ kind: "play", card });
      }}
      onNextHand={() => act({ kind: "next-hand" })}
      onPlayAgain={() => act({ kind: "play-again" })}
      onRejoin={() => handleJoin(code)}
      onLeave={handleLeave}
    />
  );
}
