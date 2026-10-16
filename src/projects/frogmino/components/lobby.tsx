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
  endRound,
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
import { courseMusic } from "../audio/music/course-music";
import { usePreparedMusic } from "../audio/music/use-game-music";
import { DEFAULT_COOP_COURSE } from "../coop-courses";
import { useCoopStore } from "../coop-store";
import type { CourseSpec } from "../courses";
import { coopCourseParam } from "../view";
import { guestSession, hostSession, type OnlineEvents } from "../online";
import { CoopRoom } from "./coop-room";
import { OnlineGame } from "./online-game";

// Online co-op plays a designed co-op course, the host's pick.
function coopSpec(id: string): CourseSpec {
  return { kind: "coop", id };
}

// The co-op course a spec from the host names.
function coopId(spec: CourseSpec): string {
  return spec.id;
}

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
 * The screen before the game: play local co-op on this computer,
 * host an online co-op game, or join one from the live list of open games. A
 * hosted game is listed until it has a partner or starts. Start plays the
 * round over the room, on an online session on each side (`online.ts`).
 */
export function FrogminoLobby({ onLocalCoop }: { onLocalCoop: () => void }) {
  const profile = useProfile();
  const seat = useCoopStore((s) => s.seat);
  const notice = useCoopStore((s) => s.notice);
  const game = useCoopStore((s) => s.game);
  const course = useCoopStore((s) => s.course);

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
      sendToGuest(player.peerId, { kind: "course", course: coopSpec(hostCourse()) });
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
      if (message.kind === "room") backToRoom();
      else store.game.session.receive(message);
    },
    onHostMessage(raw) {
      const message = parseHostMessage(raw);
      const store = useCoopStore.getState();
      switch (message.kind) {
        case "course":
          store.setCourse(coopId(message.course));
          return;
        case "start":
          store.setCourse(coopId(message.course));
          store.setGame({ role: "guest", session: guestSession(message.course, (play) => room.sendToHost(play), OUT_OF_SYNC) });
          store.setSeat({ ...store.seat, phase: { kind: "started", course: message.course } });
          return;
        case "full":
          room.leave();
          store.reset("That game just filled up. Try another!");
          return;
        case "room":
          store.setGame(null);
          store.setSeat({ ...store.seat, phase: WAITING });
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

  // The theme the next game will play, rendered while the players are here:
  // the default course's in the lobby, the picked course's in a waiting room.
  usePreparedMusic(courseMusic(coopSpec(course ?? DEFAULT_COOP_COURSE)));

  // The store outlives the page; leaving it forgets the room.
  useEffect(() => () => useCoopStore.getState().reset(), []);

  function host() {
    const store = useCoopStore.getState();
    store.reset();
    store.setCourse(coopCourseParam(window.location.search));
    room.create();
  }

  // The host's pick; the host always has one.
  function hostCourse(): string {
    const { course } = useCoopStore.getState();
    if (course === null) throw new Error("frogmino co-op: the host has no course picked");
    return course;
  }

  // The host picks another course, and tells its partner.
  function pickCourse(id: string) {
    const store = useCoopStore.getState();
    store.setCourse(id);
    const partner = store.seat.partnerPeerId;
    if (partner !== null) sendToGuest(partner, { kind: "course", course: coopSpec(id) });
  }

  function join(code: string) {
    useCoopStore.getState().reset();
    room.join(code);
  }

  function leave() {
    room.leave();
    useCoopStore.getState().reset();
  }

  // The host ends the round and goes back to the waiting room with its
  // partner, who follows, for the host to pick the next course.
  function backToRoom() {
    const store = useCoopStore.getState();
    const partner = store.seat.partnerPeerId;
    if (partner === null) throw new Error("frogmino co-op: back to the room without a partner");
    store.setGame(null);
    store.setSeat(endRound(store.seat));
    sendToGuest(partner, { kind: "room" });
  }

  function sendToGuest(peerId: string, message: HostMessage) {
    room.sendTo(peerId, message);
  }

  function start() {
    const store = useCoopStore.getState();
    const partner = store.seat.partnerPeerId;
    if (partner === null) throw new Error("frogmino co-op: Start without a partner");
    const course = coopSpec(hostCourse());
    store.setSeat(startRound(store.seat, course));
    // The host's clock starts now, the guest's as the start reaches it.
    store.setGame({ role: "host", session: hostSession(course, (play) => sendToGuest(partner, play), OUT_OF_SYNC) });
    sendToGuest(partner, { kind: "start", course });
  }

  if (room.code === null || room.status === "not-found") {
    return (
      <GameLobby
        icon={<Blocks size={32} />}
        title="Frogmino"
        subtitle="Hop, turn and squeeze through the traffic with a friend"
        actions={
          <Button onClick={onLocalCoop} className="bg-brand-green hover:bg-brand-green/90">
            Local co-op
          </Button>
        }
        onCreate={host}
        createLabel="Host co-op"
        openRooms={{ list: openGames, onJoin: join }}
        notice={room.status === "not-found" ? "That game has closed. Pick another!" : notice}
      />
    );
  }

  if (seat.phase.kind === "started" && game !== null && room.status !== "disconnected" && room.status !== "offline") {
    return (
      <OnlineGame
        session={game.session}
        course={seat.phase.course}
        slot={game.role === "host" ? HOST_SLOT : GUEST_SLOT}
        toRoom={{
          label: "Course select",
          // The guest asks; the host decides, and takes both back.
          onExit: game.role === "host" ? backToRoom : () => room.sendToHost({ kind: "room" }),
        }}
        onLeave={leave}
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
      course={course}
      onCourse={pickCourse}
      notice={notice}
      onStart={start}
      onLeave={leave}
    />
  );
}
