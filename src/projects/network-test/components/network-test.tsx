"use client";

import { useGameRoom } from "@/shared/lib/multiplayer";
import { useNetworkTestStore } from "../store";
import { Lobby } from "./lobby";
import { WaitingRoom } from "./waiting-room";
import { TestSession } from "./test-session";

export function NetworkTest() {
  const room = useGameRoom({ game: "network-test" });
  const reset = useNetworkTestStore((s) => s.reset);

  function handleLeave() {
    room.leave();
    reset();
  }

  if (room.phase === "lobby") {
    return <Lobby room={room} />;
  }

  if (room.phase === "waiting") {
    return <WaitingRoom room={room} onLeave={handleLeave} />;
  }

  // connecting, ready, disconnected, failed — all handled by TestSession
  return <TestSession room={room} onLeave={handleLeave} />;
}
