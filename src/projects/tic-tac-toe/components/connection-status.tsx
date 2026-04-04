"use client";

import { cn } from "@/shared/lib/utils";
import type { ConnectionState } from "@/shared/lib/webrtc";

interface ConnectionStatusProps {
  state: ConnectionState;
}

const LABELS: Record<ConnectionState, string> = {
  new: "Initializing...",
  connecting: "Connecting...",
  connected: "Connected",
  disconnected: "Disconnected",
  failed: "Connection failed",
};

export function ConnectionStatus({ state }: ConnectionStatusProps) {
  if (state === "connected") return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full px-3 py-1 text-xs",
        state === "failed" && "bg-red-900/30 text-red-400",
        state === "disconnected" && "bg-yellow-900/30 text-yellow-400",
        (state === "connecting" || state === "new") &&
          "bg-surface-elevated text-text-muted",
      )}
    >
      <div
        className={cn(
          "h-2 w-2 rounded-full",
          state === "failed" && "bg-red-500",
          state === "disconnected" && "bg-yellow-500",
          (state === "connecting" || state === "new") &&
            "bg-text-muted animate-pulse",
        )}
      />
      {LABELS[state]}
    </div>
  );
}
