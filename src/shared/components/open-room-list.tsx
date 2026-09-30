"use client";

import { Users } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import type { RoomList } from "@/shared/lib/room-list";

interface OpenRoomListProps {
  list: RoomList;
  onJoin: (code: string) => void;
}

/** The live list of rooms waiting for players; one click joins. */
export function OpenRoomList({ list, onJoin }: OpenRoomListProps) {
  return (
    <Card className="w-full max-w-sm space-y-3 p-5">
      <h2 className="font-medium text-text-primary">Open games</h2>
      {list.status === "error" ? (
        <p className="text-sm text-brand-pink">Can&apos;t reach the game list right now.</p>
      ) : list.status === "connecting" ? (
        <p className="animate-pulse text-sm text-text-muted">Looking for games…</p>
      ) : list.rooms.length === 0 ? (
        <p className="text-sm text-text-muted">No open games yet. Host one!</p>
      ) : (
        <ul aria-label="Open games" className="space-y-2">
          {list.rooms.map((room) => (
            <li
              key={room.code}
              className="flex items-center gap-3 rounded-md border border-border-default bg-surface-tertiary px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-text-primary">{room.hostName}&apos;s game</p>
                <p className="flex items-center gap-1 text-xs text-text-secondary">
                  <Users size={12} aria-hidden />
                  {room.players}/{room.capacity} players
                </p>
              </div>
              <Button onClick={() => onJoin(room.code)} aria-label={`Join ${room.hostName}'s game`}>
                Join
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
