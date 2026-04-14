"use client";

import type { ReactNode } from "react";
import { Button } from "@/shared/components/ui/button";

interface TriviaLobbyProps {
  /** Icon element (e.g. a lucide icon pre-styled with color). */
  icon: ReactNode;
  title: string;
  description: string;
  /** Flavor line under the description; should mention the lives count. */
  tagline: ReactNode;
  /** Filter UI slot — the per-game options selector. */
  children: ReactNode;
  onStart: () => void;
  startDisabled: boolean;
}

export function TriviaLobby({
  icon,
  title,
  description,
  tagline,
  children,
  onStart,
  startDisabled,
}: TriviaLobbyProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 py-8 text-center">
      <div className="rounded-full bg-surface-elevated p-4">{icon}</div>

      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-text-secondary">{description}</p>
        <p className="mt-1 text-xs text-text-muted">{tagline}</p>
      </div>

      {children}

      <Button onClick={onStart} disabled={startDisabled} className="px-8">
        Start Game
      </Button>
    </div>
  );
}
