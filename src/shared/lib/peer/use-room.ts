"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { PlayerProfile } from "@/shared/lib/profile";
import {
  createRoom,
  peerOptionsFromSearch,
  stopOnPageHide,
  type Player,
  type Room,
  type RoomRole,
  type RoomState,
  type RoomStatus,
  type RoomTarget,
} from "./room";

const NO_PLAYERS: readonly Player[] = [];

export interface UseRoomOptions<HostMessage, GuestMessage> {
  game: string;
  profile: PlayerProfile;
  onGuestJoined?(player: Player): void;
  onGuestLeft?(player: Player): void;
  onHostMessage?(message: HostMessage): void;
  onGuestMessage?(from: Player, message: GuestMessage): void;
}

export interface RoomHandle<HostMessage, GuestMessage> {
  status: RoomStatus;
  role: RoomRole | null;
  /** The room's code while in one; null in the lobby. */
  code: string | null;
  selfId: string | null;
  players: readonly Player[];
  create(): void;
  join(code: string): void;
  leave(): void;
  sendToHost(message: GuestMessage): void;
  sendTo(peerId: string, message: HostMessage): void;
  broadcast(message: HostMessage, exceptPeerId?: string): void;
}

/**
 * A star room as React state. `create` hosts a fresh room, `join` enters one
 * by code, `leave` tears it down; unmounting leaves too. The room lives in
 * an effect, so StrictMode's double mount just leaves and re-enters.
 * Handlers always see the latest render's props.
 */
export function useRoom<HostMessage, GuestMessage>(
  options: UseRoomOptions<HostMessage, GuestMessage>,
): RoomHandle<HostMessage, GuestMessage> {
  const { game } = options;
  const [target, setTarget] = useState<RoomTarget | null>(null);
  const [latest, setLatest] = useState<{ target: RoomTarget; state: RoomState } | null>(null);
  const roomRef = useRef<Room<HostMessage, GuestMessage> | null>(null);

  const profile = useEffectEvent((): PlayerProfile => options.profile);
  const guestJoined = useEffectEvent((player: Player) => options.onGuestJoined?.(player));
  const guestLeft = useEffectEvent((player: Player) => options.onGuestLeft?.(player));
  const hostMessage = useEffectEvent((message: HostMessage) => options.onHostMessage?.(message));
  const guestMessage = useEffectEvent((from: Player, message: GuestMessage) =>
    options.onGuestMessage?.(from, message),
  );

  useEffect(() => {
    if (target === null) return;
    const room = createRoom<HostMessage, GuestMessage>({
      game,
      target,
      profile: profile(),
      peerOptions: peerOptionsFromSearch(window.location.search),
      events: {
        onState: (state) => setLatest({ target, state }),
        onGuestJoined: (player) => guestJoined(player),
        onGuestLeft: (player) => guestLeft(player),
        onHostMessage: (message) => hostMessage(message),
        onGuestMessage: (from, message) => guestMessage(from, message),
      },
    });
    roomRef.current = room;
    room.start();
    const unbindPage = stopOnPageHide(room);
    return () => {
      unbindPage();
      roomRef.current = null;
      room.stop();
    };
  }, [game, target]);

  const requireRoom = useCallback((): Room<HostMessage, GuestMessage> => {
    const room = roomRef.current;
    if (room === null) throw new Error("peer room: not in a room");
    return room;
  }, []);

  const create = useCallback(() => setTarget({ mode: "host" }), []);
  const join = useCallback((joinCode: string) => setTarget({ mode: "join", code: joinCode }), []);
  const leave = useCallback(() => setTarget(null), []);
  const sendToHost = useCallback((message: GuestMessage) => requireRoom().sendToHost(message), [requireRoom]);
  const sendTo = useCallback(
    (peerId: string, message: HostMessage) => requireRoom().sendTo(peerId, message),
    [requireRoom],
  );
  const broadcast = useCallback(
    (message: HostMessage, exceptPeerId?: string) => requireRoom().broadcast(message, exceptPeerId),
    [requireRoom],
  );

  // Only the current room's state counts: a room that was left still
  // publishes its final idle state.
  const state = latest !== null && latest.target === target ? latest.state : null;
  return {
    status: state?.status ?? "idle",
    role: state?.role ?? null,
    code: state?.code ?? null,
    selfId: state?.selfId ?? null,
    players: state?.players ?? NO_PLAYERS,
    create,
    join,
    leave,
    sendToHost,
    sendTo,
    broadcast,
  };
}
