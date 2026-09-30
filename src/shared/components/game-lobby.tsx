"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { OpenRoomList } from "@/shared/components/open-room-list";
import { parseRoomCode } from "@/shared/lib/peer";
import type { RoomList } from "@/shared/lib/room-list";

interface GameLobbyProps {
  /** Icon element rendered above the title. */
  icon: ReactNode;
  /** Game title (e.g. "Euchre", "Tic Tac Toe"). */
  title: string;
  /** Subtitle shown below the title. */
  subtitle: string;
  onCreate: () => void;
  createLabel?: string;
  /** Join by typed code; omit for a game that lists its rooms instead. */
  onJoin?: (code: string) => void;
  /** The live list of open rooms, for a game that lists them. */
  openRooms?: { list: RoomList; onJoin: (code: string) => void };
  /** More buttons beside the create button, e.g. a solo mode. */
  actions?: ReactNode;
  /** Why the last attempt to join ended, when it did. */
  notice?: string | null;
}

export function GameLobby({
  icon,
  title,
  subtitle,
  onCreate,
  createLabel = "Create Room",
  onJoin,
  openRooms,
  actions,
  notice,
}: GameLobbyProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="text-center space-y-3">
        <div className="mx-auto w-fit rounded-md bg-surface-elevated p-3 text-brand-orange">
          {icon}
        </div>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-text-secondary">{subtitle}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {actions}
        <Button onClick={onCreate}>{createLabel}</Button>
      </div>

      {notice && !onJoin && <p className="text-sm text-brand-pink">{notice}</p>}
      {openRooms && <OpenRoomList list={openRooms.list} onJoin={openRooms.onJoin} />}

      {onJoin && <JoinByCode onJoin={onJoin} notice={notice} />}

      <Link href="/">
        <Button variant="ghost">Back to Novelty World</Button>
      </Link>
    </div>
  );
}

function JoinByCode({ onJoin, notice }: { onJoin: (code: string) => void; notice?: string | null }) {
  const [input, setInput] = useState("");
  const code = parseRoomCode(input);

  return (
    <Card className="w-full max-w-sm space-y-3 p-5">
      <h2 className="font-medium text-text-primary">Join a friend&apos;s room</h2>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (code !== null) onJoin(code);
        }}
      >
        <input
          aria-label="Room code"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="CODE"
          maxLength={4}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-border-default bg-surface-secondary px-3 py-2 font-mono text-lg tracking-widest text-brand-orange placeholder:text-text-muted focus:border-border-hover focus:outline-none"
        />
        <Button type="submit" disabled={code === null}>
          Join
        </Button>
      </form>
      {notice && <p className="text-sm text-brand-pink">{notice}</p>}
    </Card>
  );
}
