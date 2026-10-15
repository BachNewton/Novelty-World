"use client";

import { useRef, useState } from "react";
import { usePadNavigation } from "@/shared/lib/gamepad";
import { cn } from "@/shared/lib/utils";
import type { GameEvent, GameState } from "../contract";
import { LOCAL } from "../local-engine";
import { SEAT_LOOKS } from "../ui/seats";
import { SeatMark } from "./bits";
import { GameScreen } from "./game-screen";
import { BUTTON, DISPLAY, DISPLAY_FONT, PANEL, PRIMARY, RISK_THEME } from "./theme";
import { useLocalGame } from "./use-local-game";

type Start = () => { state: GameState; events: readonly GameEvent[] };

function LocalGame({ start, onLeave }: { start: Start; onLeave: () => void }) {
  const feed = useLocalGame(start);
  return <GameScreen feed={feed} onLeave={onLeave} />;
}

/** The war room's door: a local game for 3 to 6 players on this device, passed round. */
function StartScreen({ onStart }: { onStart: (start: Start) => void }) {
  const root = useRef<HTMLDivElement>(null);
  usePadNavigation(root);
  const [players, setPlayers] = useState(4);
  const begin = () => onStart(() => LOCAL.engine.newGame({ players }, crypto.randomUUID()));

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
            {[3, 4, 5, 6].map((n) => (
              <button key={n} type="button" aria-pressed={players === n} className={cn(BUTTON, "min-w-[2.6em]", players === n && "border-(--rk-brass) text-(--rk-brass-bright)")} onClick={() => setPlayers(n)}>
                {n}
              </button>
            ))}
          </div>
          <button type="button" data-pad-start className={cn(BUTTON, PRIMARY, "w-full text-[1.1em]")} onClick={begin}>
            To war
          </button>
        </section>

        {LOCAL.scenes.length > 0 && (
          <section className={cn(PANEL, "space-y-[0.6em] p-[1em]")}>
            <h2 className={cn(DISPLAY, "text-[1.1em]")}>Jump to a moment</h2>
            <p className="text-[0.85em] text-(--rk-muted)">Hand-made positions on the stand-in engine, for trying each screen.</p>
            <ul className="grid gap-[0.4em] sm:grid-cols-2">
              {LOCAL.scenes.map((scene) => (
                <li key={scene.id}>
                  <button type="button" className={cn(BUTTON, "w-full justify-start text-left text-[0.9em]")} onClick={() => onStart(scene.start)} data-scene={scene.id}>
                    {scene.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

export function Risk() {
  const [game, setGame] = useState<{ id: number; start: Start } | null>(null);
  if (game) return <LocalGame key={game.id} start={game.start} onLeave={() => setGame(null)} />;
  return <StartScreen onStart={(start) => setGame({ id: Date.now(), start })} />;
}
