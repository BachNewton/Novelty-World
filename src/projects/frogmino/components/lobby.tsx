"use client";

import { useEffect } from "react";
import { Blocks } from "lucide-react";
import { GameLobby } from "@/shared/components/game-lobby";
import { Button } from "@/shared/components/ui/button";
import { useRoom } from "@/shared/lib/peer";
import { useProfile } from "@/shared/lib/profile";
import { useRoomList } from "@/shared/lib/room-list";
import {
  admitGuest,
  COOP_GAME,
  GUEST_SLOT,
  HOST_SLOT,
  openListing,
  parseGuestMessage,
  parseHostMessage,
  releaseGuest,
  startRound,
  WAITING,
  type HostMessage,
} from "../coop";
import { useCoopStore } from "../coop-store";
import type { CourseSpec } from "../courses";
import { guestSession, hostSession, type OnlineEvents } from "../online";
import { CoopRoom } from "./coop-room";
import { OnlineGame } from "./online-game";

// Online co-op plays the co-op course.
const COOP_COURSE: CourseSpec = { kind: "coop" };

// A round whose two runs fell out of sync stops for both players, back in
// the waiting room, where the host can start another.
const OUT_OF_SYNC: OnlineEvents = {
  onDesync: () => {
    const store = useCoopStore.getState();
    store.setGame(null);
    store.setSeat({ ...store.seat, phase: WAITING });
    store.setNotice("Your games fell out of sync, so the round stopped. Its log is in the browser's console.");
  },
};

/**
 * The screen before the game: play solo, play local co-op on this computer,
 * host an online co-op game, or join one from the live list of open games. A
 * hosted game is listed until it has a partner or starts. Start plays the
 * round over the room, on an online session on each side (`online.ts`).
 */
export function FrogminoLobby({ onPlaySolo, onLocalCoop }: { onPlaySolo: () => void; onLocalCoop: () => void }) {
  const profile = useProfile();
  const seat = useCoopStore((s) => s.seat);
  const notice = useCoopStore((s) => s.notice);
  const game = useCoopStore((s) => s.game);

  // What arrives is checked as the protocol's before anything reads it.
  const room = useRoom<unknown, unknown>({
    game: COOP_GAME,
    profile,
    onGuestJoined(player) {
      const store = useCoopStore.getState();
      const { seat: next, admitted } = admitGuest(store.seat, player.peerId);
      if (!admitted) {
        sendToGuest(player.peerId, { kind: "full" });
        return;
      }
      store.setSeat(next);
      store.setNotice(null);
    },
    onGuestLeft(player) {
      const store = useCoopStore.getState();
      const { seat: next, partnerLeft } = releaseGuest(store.seat, player.peerId);
      if (!partnerLeft) return;
      store.setGame(null);
      store.setSeat(next);
      store.setNotice(`${player.name} left the game`);
    },
    onGuestMessage(from, raw) {
      const message = parseGuestMessage(raw);
      const store = useCoopStore.getState();
      if (from.peerId !== store.seat.partnerPeerId) {
        throw new Error(`frogmino co-op: a message from ${from.name}, who isn't the partner`);
      }
      // What the partner sent before it learned the round had stopped.
      if (store.game === null) return;
      if (store.game.role !== "host") throw new Error("frogmino co-op: a guest's message reached a guest");
      store.game.session.receive(message);
    },
    onHostMessage(raw) {
      const message = parseHostMessage(raw);
      const store = useCoopStore.getState();
      switch (message.kind) {
        case "start":
          store.setGame({ role: "guest", session: guestSession(message.course, (play) => room.sendToHost(play), OUT_OF_SYNC) });
          store.setSeat({ ...store.seat, phase: { kind: "started", course: message.course } });
          return;
        case "full":
          room.leave();
          store.reset("That game just filled up. Try another!");
          return;
        default:
          // What the host sent before it learned the round had stopped.
          if (store.game === null) return;
          if (store.game.role !== "guest") throw new Error("frogmino co-op: a host's message reached the host");
          store.game.session.receive(message);
      }
    },
  });

  const openGames = useRoomList({
    game: COOP_GAME,
    listing: openListing({
      role: room.role,
      status: room.status,
      code: room.code,
      hostName: profile.name,
      seat,
    }),
  });

  // The store outlives the page; leaving it forgets the room.
  useEffect(() => () => useCoopStore.getState().reset(), []);

  function host() {
    useCoopStore.getState().reset();
    room.create();
  }

  function join(code: string) {
    useCoopStore.getState().reset();
    room.join(code);
  }

  function leave() {
    room.leave();
    useCoopStore.getState().reset();
  }

  function sendToGuest(peerId: string, message: HostMessage) {
    room.sendTo(peerId, message);
  }

  function start() {
    const store = useCoopStore.getState();
    const partner = store.seat.partnerPeerId;
    if (partner === null) throw new Error("frogmino co-op: Start without a partner");
    store.setSeat(startRound(store.seat, COOP_COURSE));
    // The host's clock starts now, the guest's as the start reaches it.
    store.setGame({ role: "host", session: hostSession(COOP_COURSE, (play) => sendToGuest(partner, play), OUT_OF_SYNC) });
    sendToGuest(partner, { kind: "start", course: COOP_COURSE });
  }

  if (room.code === null || room.status === "not-found") {
    return (
      <GameLobby
        icon={<Blocks size={32} />}
        title="Frogmino"
        subtitle="Hop, turn and squeeze through the traffic, alone or with a friend"
        actions={
          <>
            <Button onClick={onPlaySolo} className="bg-brand-green hover:bg-brand-green/90">
              Play solo
            </Button>
            <Button onClick={onLocalCoop} className="bg-brand-blue hover:bg-brand-blue/90">
              Local co-op
            </Button>
          </>
        }
        onCreate={host}
        createLabel="Host co-op"
        openRooms={{ list: openGames, onJoin: join }}
        notice={room.status === "not-found" ? "That game has closed. Pick another!" : notice}
      />
    );
  }

  if (seat.phase.kind === "started" && game !== null && room.status !== "disconnected" && room.status !== "offline") {
    return <OnlineGame session={game.session} slot={game.role === "host" ? HOST_SLOT : GUEST_SLOT} onLeave={leave} />;
  }

  return (
    <CoopRoom
      status={room.status}
      isHost={room.role === "host"}
      selfId={room.selfId}
      players={room.players}
      seat={seat}
      notice={notice}
      onStart={start}
      onLeave={leave}
    />
  );
}
