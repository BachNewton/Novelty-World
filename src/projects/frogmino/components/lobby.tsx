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
  drawCourseSeed,
  openListing,
  releaseGuest,
  startRound,
  type GuestMessage,
  type HostMessage,
} from "../coop";
import { useCoopStore } from "../coop-store";
import { CoopRoom } from "./coop-room";

/**
 * The screen before the game: play solo, play local co-op on this computer,
 * host an online co-op game, or join one from the live list of open games. A hosted game is listed until it has a
 * partner or starts; the host picks the course seed and sends it with Start.
 */
export function FrogminoLobby({ onPlaySolo, onLocalCoop }: { onPlaySolo: () => void; onLocalCoop: () => void }) {
  const profile = useProfile();
  const seat = useCoopStore((s) => s.seat);
  const notice = useCoopStore((s) => s.notice);

  const room = useRoom<HostMessage, GuestMessage>({
    game: COOP_GAME,
    profile,
    onGuestJoined(player) {
      const store = useCoopStore.getState();
      const { seat: next, admitted } = admitGuest(store.seat, player.peerId);
      if (!admitted) {
        room.sendTo(player.peerId, { kind: "full" });
        return;
      }
      store.setSeat(next);
      store.setNotice(null);
    },
    onGuestLeft(player) {
      const store = useCoopStore.getState();
      const { seat: next, partnerLeft } = releaseGuest(store.seat, player.peerId);
      if (!partnerLeft) return;
      store.setSeat(next);
      store.setNotice(`${player.name} left the game`);
    },
    onHostMessage(message) {
      const store = useCoopStore.getState();
      switch (message.kind) {
        case "start":
          store.setSeat({ ...store.seat, phase: { kind: "started", seed: message.seed } });
          break;
        case "full":
          room.leave();
          store.reset("That game just filled up. Try another!");
          break;
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

  function start() {
    const store = useCoopStore.getState();
    const partner = store.seat.partnerPeerId;
    if (partner === null) throw new Error("frogmino co-op: Start without a partner");
    const seed = drawCourseSeed();
    store.setSeat(startRound(store.seat, seed));
    room.sendTo(partner, { kind: "start", seed });
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
