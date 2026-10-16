"use client";

import { useEffect, useReducer, useRef, useState, type CSSProperties } from "react";
import { Bot, Eye, Flag, Hourglass, Loader2, Play, Swords, Trash2, UserPlus, type LucideIcon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { usePadNavigation } from "@/shared/lib/gamepad";
import { useProfile } from "@/shared/lib/profile";
import { useHoldToActivate } from "@/shared/lib/use-hold-to-activate";
import { cn } from "@/shared/lib/utils";
import { SeatMark } from "../components/bits";
import { RISK_THEME } from "../components/theme";
import type { LobbyIo } from "./client";
import { applyLobbyChange, EMPTY_LOBBY, lobbyTables, openAction, type OpenAction, type TableSummary } from "./lobby";
import { botName } from "./seat-bots";
import { MAX_PLAYERS, type Controller, type Status } from "./table";

/** Every game, live: null while the first load is out. */
export function useLobbyTables(io: LobbyIo): { tables: TableSummary[] | null; problem: string | null } {
  const [state, dispatch] = useReducer(applyLobbyChange, EMPTY_LOBBY);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(
    () =>
      io.subscribe({
        onChange: dispatch,
        onConnected: () => {
          io.list()
            .then((tables) => {
              setProblem(null);
              dispatch({ kind: "loaded", tables });
            })
            .catch((error: unknown) => {
              console.error(error);
              setProblem("Couldn't load the games");
            });
        },
        onError: () => setProblem("Can't reach the game list right now"),
      }),
    [io],
  );

  return { tables: state.loaded ? lobbyTables(state) : null, problem };
}

// The seats' inks and the outline their marks are drawn with, from Risk's own palette.
const SEAT_INKS = Object.fromEntries(Object.entries(RISK_THEME).filter(([name]) => name.startsWith("--rk-seat-") || name === "--rk-ink")) as CSSProperties;

const STATUS: Record<Status, { icon: LucideIcon; name: string }> = {
  lobby: { icon: Hourglass, name: "Gathering players" },
  playing: { icon: Swords, name: "In play" },
  over: { icon: Flag, name: "Over" },
};

const ACTION: Record<OpenAction, { icon: LucideIcon; name: string }> = {
  join: { icon: UserPlus, name: "Take a seat" },
  rejoin: { icon: Play, name: "Back to your game" },
  watch: { icon: Eye, name: "Watch" },
};

const controllerName = (controller: Controller) => (controller.kind === "human" ? controller.profile.name : botName(controller.bot));

/** "Jun 14, 3:42 PM", in the viewer's locale and timezone. */
function lastActive(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Every game, most recently active first: tap one to open it, hold it (or its bin) to delete it. */
export function TableList({ tables, problem, onOpen, onDelete }: { tables: TableSummary[] | null; problem: string | null; onOpen: (table: TableSummary, action: OpenAction) => void; onDelete: (table: TableSummary) => void }) {
  return (
    <Card className="w-full max-w-lg space-y-3 p-4" style={SEAT_INKS}>
      <h2 className="font-medium text-text-primary">Games</h2>
      {problem && <p className="text-sm text-brand-pink">{problem}</p>}
      {tables === null ? (
        <Loader2 aria-label="Loading the games" className="mx-auto animate-spin text-text-muted" />
      ) : tables.length === 0 ? (
        <p className="text-sm text-text-muted">No games yet. Start one!</p>
      ) : (
        <ul aria-label="Games" className="space-y-2">
          {tables.map((table) => (
            <TableEntry key={table.id} table={table} onOpen={onOpen} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function TableEntry({ table, onOpen, onDelete }: { table: TableSummary; onOpen: (table: TableSummary, action: OpenAction) => void; onDelete: (table: TableSummary) => void }) {
  const profileId = useProfile((profile) => profile.id);
  const action = openAction(table, profileId);
  const status = STATUS[table.status];
  const act = ACTION[action];
  const when = lastActive(table.updatedAt);
  const { holding, fillDurationMs, handlers } = useHoldToActivate({ onActivate: () => onOpen(table, action), onHold: () => onDelete(table) });
  const open = table.status === "lobby" ? MAX_PLAYERS - table.seats.length : 0;
  const label = `${status.name}: ${table.seats.map(controllerName).join(", ")}. ${table.seats.length.toString()} of ${MAX_PLAYERS.toString()} seats. Last active ${when}. ${act.name}; hold to delete.`;

  return (
    <li className="flex items-stretch gap-2">
      <button
        type="button"
        {...handlers}
        aria-label={label}
        className="relative flex min-w-0 flex-1 select-none items-center gap-3 overflow-hidden rounded-md border border-border-default bg-surface-tertiary px-3 py-2 text-left transition-colors hover:border-border-hover"
        style={{ WebkitTouchCallout: "none", touchAction: "manipulation" }}
      >
        {/* The hold's wash sweeps across while the press is held, and snaps away on release. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 origin-left bg-brand-pink/35"
          style={{ transform: holding ? "scaleX(1)" : "scaleX(0)", transition: holding ? `transform ${fillDurationMs.toString()}ms linear` : "none" }}
        />
        <status.icon aria-hidden size={18} className="relative shrink-0 text-text-secondary" />
        <span className="relative flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {table.seats.map((controller, seat) => (
              <span key={seat} className={cn("flex min-w-0 items-center gap-1 text-sm", controller.kind === "human" && controller.profile.id === profileId && "font-bold text-brand-orange")}>
                <SeatMark seat={seat} />
                {controller.kind === "human" ? <span className="max-w-32 truncate">{controller.profile.name}</span> : <Bot aria-hidden size={16} className="text-text-secondary" />}
              </span>
            ))}
            {Array.from({ length: open }, (_, i) => (
              <span key={`open-${i.toString()}`} aria-hidden className="size-[1.1em] rounded-full border border-dashed border-text-muted" />
            ))}
          </span>
          <span className="text-xs text-text-muted">{when}</span>
        </span>
        <act.icon aria-hidden size={20} className="relative shrink-0 text-brand-orange" />
      </button>
      <button
        type="button"
        aria-label="Delete this game"
        title="Delete this game"
        onClick={() => onDelete(table)}
        className="shrink-0 rounded-md px-2 text-text-muted transition-colors hover:bg-surface-elevated hover:text-brand-pink"
      >
        <Trash2 aria-hidden size={18} />
      </button>
    </li>
  );
}

/** The confirm step before a game is deleted for everyone: its own screen, so a controller's
 *  focus can't wander to the list behind it. */
export function DeleteConfirm({ table, onDelete, onCancel }: { table: TableSummary; onDelete: () => Promise<string | null>; onCancel: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  usePadNavigation(root);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function confirm() {
    setBusy(true);
    onDelete()
      .then((reason) => {
        setProblem(reason);
        setBusy(false);
      })
      .catch((error: unknown) => {
        console.error(error);
        setProblem("Couldn't reach the server");
        setBusy(false);
      });
  }

  return (
    <div ref={root} role="alertdialog" aria-label="Delete this game?" className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12 text-center" style={SEAT_INKS}>
      <Trash2 aria-hidden size={32} className="text-brand-pink" />
      <h1 className="text-2xl font-bold">Delete this game?</h1>
      <p className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {table.seats.map((controller, seat) => (
          <span key={seat} className="flex items-center gap-1">
            <SeatMark seat={seat} />
            {controller.kind === "human" ? controller.profile.name : <Bot aria-label={controllerName(controller)} size={16} />}
          </span>
        ))}
      </p>
      <p className="max-w-sm text-sm text-text-secondary">It goes for everyone, and can&apos;t be undone.</p>
      {problem && <p className="text-sm text-brand-pink">{problem}</p>}
      <div className="flex gap-3">
        <Button variant="ghost" onClick={onCancel} disabled={busy} data-pad-back data-pad-start>
          Cancel
        </Button>
        <Button onClick={confirm} disabled={busy} className="bg-brand-pink hover:bg-brand-pink/90">
          {busy ? <Loader2 aria-hidden size={16} className="mr-2 animate-spin" /> : <Trash2 aria-hidden size={16} className="mr-2" />}
          Delete
        </Button>
      </div>
    </div>
  );
}
