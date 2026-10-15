"use client";

import { useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { usePadNavigation } from "@/shared/lib/gamepad";
import { cn } from "@/shared/lib/utils";
import { RiskOnline, type OnlineGameProps } from "../online/risk-online";
import { MAX_PLAYERS, MIN_PLAYERS } from "../online/table";
import { SEAT_LOOKS } from "../ui/seats";
import { SeatMark } from "./bits";
import { GameScreen } from "./game-screen";
import { BUTTON, DISPLAY, DISPLAY_FONT, PANEL, PRIMARY, RISK_THEME } from "./theme";
import { useLocalGame } from "./use-local-game";
import { useOnlineFeed } from "./use-online-feed";

const PLAYER_COUNTS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

function OnlineGame({ snapshot, act, onLeave }: OnlineGameProps) {
  const feed = useOnlineFeed(snapshot, act);
  return <GameScreen feed={feed} onLeave={onLeave} />;
}

function LocalGame({ players, onLeave }: { players: number; onLeave: () => void }) {
  const feed = useLocalGame(players);
  return <GameScreen feed={feed} onLeave={onLeave} />;
}

/** A game on this device for 3 to 6 players, passed round. */
function LocalStart({ onStart, onBack }: { onStart: (players: number) => void; onBack: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  usePadNavigation(root);
  const [players, setPlayers] = useState(4);
  const begin = () => onStart(players);

  return (
    <div style={RISK_THEME} className={cn(DISPLAY_FONT.variable, "min-h-dvh bg-(--rk-bg) text-[16px] text-(--rk-text) min-[1800px]:text-[24px]")}>
      <div ref={root} className="mx-auto flex max-w-[34em] flex-col gap-[1.2em] px-[1em] py-[2em]">
        <header className="space-y-[0.4em] text-center">
          <h1 className={cn(DISPLAY, "text-[3em] font-bold text-(--rk-brass)")}>Risk</h1>
          <p className="text-(--rk-muted)">The classic game of world domination.</p>
          <p className="flex justify-center gap-[0.3em] text-[1.4em]" aria-hidden>
            {SEAT_LOOKS.map((_, seat) => (
              <SeatMark key={seat} seat={seat} />
            ))}
          </p>
        </header>

        <section className={cn(PANEL, "space-y-[0.8em] p-[1em]")}>
          <h2 className={cn(DISPLAY, "text-[1.2em]")}>A game on this device</h2>
          <p className="text-[0.9em] text-(--rk-muted)">Pass it round: the screen shows whoever&apos;s turn it is, their cards included.</p>
          <div className="flex flex-wrap items-center gap-[0.4em]" role="group" aria-label="Players">
            <span className="mr-[0.4em]">Players</span>
            {PLAYER_COUNTS.map((n) => (
              <button key={n} type="button" aria-pressed={players === n} className={cn(BUTTON, "min-w-[2.6em]", players === n && "border-(--rk-brass) text-(--rk-brass-bright)")} onClick={() => setPlayers(n)}>
                {n}
              </button>
            ))}
          </div>
          <button type="button" data-pad-start className={cn(BUTTON, PRIMARY, "w-full text-[1.1em]")} onClick={begin}>
            To war
          </button>
        </section>

        <button type="button" data-pad-back className={cn(BUTTON, "self-center")} onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

/** Risk online (create or join a table by its code, with bots in any seat), or a game passed
 *  round this device. */
export function Risk() {
  const [local, setLocal] = useState<{ players: number } | "choosing" | null>(null);
  if (local === "choosing") return <LocalStart onStart={(players) => setLocal({ players })} onBack={() => setLocal(null)} />;
  if (local) return <LocalGame players={local.players} onLeave={() => setLocal(null)} />;
  return (
    <RiskOnline
      Game={OnlineGame}
      actions={
        <Button variant="ghost" onClick={() => setLocal("choosing")}>
          Play on this device
        </Button>
      }
    />
  );
}
