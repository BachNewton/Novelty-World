"use client";

import { LogOut, Rabbit, ScrollText, Turtle, X, Zap } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { usePadNavigation } from "@/shared/lib/gamepad";
import type { InputKind } from "@/shared/lib/input";
import { cn } from "@/shared/lib/utils";
import { setValue } from "../cards";
import type { CardId, GameEvent, GameView, Move, Options } from "../contract";
import type { TerritoryId } from "../map";
import { describeEvents, isWild, territoryName } from "../ui/describe";
import { SPEEDS } from "../ui/playback";
import { CardChip, CardPips, DiceRow, SeatMark, SeatName, Slider } from "./bits";
import { BUTTON, DISPLAY, PANEL, PRIMARY } from "./theme";

/** A panel over the game, holding a controller's focus while it is open: the d-pad moves round
 *  its buttons, A presses one, B closes it. `actions` sit in its header, beside closing it. */
function Dialog({ title, onClose, input, children, wide, actions }: { title: string; onClose: () => void; input: InputKind; children: ReactNode; wide?: boolean; actions?: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  usePadNavigation(root, { reveal: input === "pad" });
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-(--rk-bg)/70 p-[1em]" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={root} role="dialog" aria-label={title} className={cn(PANEL, "flex max-h-full w-full flex-col overflow-hidden shadow-2xl", wide ? "max-w-[46em]" : "max-w-[34em]")}>
        <header className="flex items-center justify-between gap-[0.5em] border-b border-(--rk-line) px-[1em] py-[0.6em]">
          <h2 className={cn(DISPLAY, "mr-auto text-[1.25em] text-(--rk-brass)")}>{title}</h2>
          {actions}
          <button type="button" data-pad-back className={cn(BUTTON, "min-h-[max(2.2em,44px)] px-[0.5em]")} onClick={onClose} aria-label="Close">
            <X size="1.1em" />
          </button>
        </header>
        <div className="overflow-y-auto px-[1em] py-[0.8em]">{children}</div>
      </div>
    </div>
  );
}

const HEADER_BUTTON = cn(BUTTON, "min-h-[max(2.2em,44px)] px-[0.5em]");

/** How fast other seats' moves play out: a slider from the tortoise's pace to the hare's, the last
 *  step playing them as fast as they arrive. LB / RB step it while the war room is open. */
function SpeedControl({ speed, setSpeed, input }: { speed: number; setSpeed: (speed: number) => void; input: InputKind }) {
  const { name, scale } = SPEEDS[speed];
  return (
    <Slider
      value={speed + 1}
      min={1}
      max={SPEEDS.length}
      onChange={(value) => setSpeed(value - 1)}
      input={input}
      label="Playback speed"
      valueText={name}
      thumb={scale === 0 ? <Zap size="1em" aria-hidden /> : undefined}
      ends={[<Turtle key="slow" size="1.3em" aria-hidden className="shrink-0 text-(--rk-muted)" />, <Rabbit key="fast" size="1.3em" aria-hidden className="shrink-0 text-(--rk-muted)" />]}
    />
  );
}

/** The war room, the game's one menu: the hand, the trades open to it (each with what it is
 *  worth), what every player can see of the cards (note `public-cards`: each hand's size, the
 *  deck's size and every trade made), the playback speed, and the way to the battle
 *  log and out of the game. */
export function WarRoom({ view, options, act, onClose, onLog, onQuit, input, speed, setSpeed }: { view: GameView; options: Options | null; act: (move: Move) => void; onClose: () => void; onLog: () => void; onQuit: () => void; input: InputKind; speed: number; setSpeed: (speed: number) => void }) {
  const hand = view.cards.hand ?? [];
  const owned = (card: CardId) => !isWild(card) && view.territories[card as TerritoryId].owner === view.viewer;
  const trading = options?.kind === "reinforce" ? options : null;
  const [bonusFor, setBonusFor] = useState<readonly [CardId, CardId, CardId] | null>(null);

  const bonusOf = (cards: readonly CardId[]) => (trading ? trading.bonusTerritories.filter((territory) => cards.includes(territory)) : []);
  const trade = (cards: readonly [CardId, CardId, CardId]) => {
    if (bonusOf(cards).length > 1) {
      setBonusFor(cards);
      return;
    }
    act({ kind: "trade", cards });
    onClose();
  };

  return (
    <Dialog
      title="War room"
      onClose={onClose}
      input={input}
      wide
      actions={
        <>
          <button type="button" className={HEADER_BUTTON} onClick={onLog} aria-label="Battle log" title="Battle log">
            <ScrollText size="1.1em" />
          </button>
          <button type="button" className={HEADER_BUTTON} onClick={onQuit} aria-label="Leave this game" title="Leave this game">
            <LogOut size="1.1em" />
          </button>
        </>
      }
    >
      <div className="space-y-[1em]">
        {trading?.mustTrade && (
          <p className="rounded-[0.4em] border border-(--rk-danger) px-[0.7em] py-[0.4em] text-(--rk-danger)">
            You hold {hand.length} cards: you must trade a set before placing.
          </p>
        )}
        {hand.length > 0 && (
          <ul className="flex flex-wrap gap-[0.4em]" aria-label="Your hand">
            {hand.map((card) => (
              <li key={card}>
                <CardChip card={card} owned={owned(card)} />
              </li>
            ))}
          </ul>
        )}
        {bonusFor ? (
          <section>
            <h3 className={cn(DISPLAY, "mb-[0.4em] text-(--rk-muted)")}>Where do the 2 extra armies go?</h3>
            <div className="flex flex-wrap gap-[0.4em]">
              {bonusOf(bonusFor).map((territory, i) => (
                <button
                  key={territory}
                  type="button"
                  data-pad-start={i === 0 ? "" : undefined}
                  className={cn(BUTTON, PRIMARY)}
                  onClick={() => {
                    act({ kind: "trade", cards: bonusFor, bonusTerritory: territory });
                    onClose();
                  }}
                >
                  {territoryName(territory)}
                </button>
              ))}
              <button type="button" className={BUTTON} onClick={() => setBonusFor(null)}>
                Back
              </button>
            </div>
          </section>
        ) : (
          trading &&
          trading.sets.length > 0 && (
            <section>
              <h3 className={cn(DISPLAY, "mb-[0.4em] text-(--rk-muted)")}>Trade a set</h3>
              <ul className="space-y-[0.4em]">
                  {trading.sets.map((set, i) => (
                    <li key={set.join()}>
                      <button type="button" data-pad-start={i === 0 ? "" : undefined} className={cn(BUTTON, "w-full justify-between")} onClick={() => trade(set)}>
                        <span className="flex flex-wrap gap-[0.3em]">
                          {set.map((card) => (
                            <CardChip key={card} card={card} owned={owned(card)} className="text-[0.85em]" />
                          ))}
                        </span>
                        <span className="font-bold text-(--rk-brass)">+{setValue(set)}{bonusOf(set).length > 0 ? " +2" : ""}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          )
        )}
        <section className="flex flex-wrap items-center gap-x-[1em] gap-y-[0.4em]" aria-label="Every hand">
          {view.seats.map((seat) => (
            <span key={seat.seat} className={cn("inline-flex items-center gap-[0.3em]", seat.eliminated && "opacity-40")}>
              <SeatMark seat={seat.seat} />
              <CardPips count={seat.handSize} />
            </span>
          ))}
          <span className="ml-auto text-(--rk-muted) tabular-nums">Deck {view.cards.deck}</span>
        </section>
        {view.cards.traded.length > 0 && (
          <section>
            <h3 className={cn(DISPLAY, "mb-[0.4em] text-(--rk-muted)")}>Traded so far</h3>
            <ul className="space-y-[0.3em]">
              {view.cards.traded.map((trade, i) => (
                <li key={i} className="flex flex-wrap items-center gap-[0.3em]">
                  <SeatName seat={trade.seat} className="mr-[0.3em]" />
                  {trade.cards.map((card) => (
                    <CardChip key={card} card={card} className="text-[0.8em] opacity-80" />
                  ))}
                  <span className="ml-auto font-bold text-(--rk-brass) tabular-nums">+{setValue(trade.cards)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <SpeedControl speed={speed} setSpeed={setSpeed} input={input} />
      </div>
    </Dialog>
  );
}

/** Everything that has happened, newest first. */
export function LogDialog({ log, onClose, input }: { log: readonly GameEvent[]; onClose: () => void; input: InputKind }) {
  const lines = describeEvents(log).reverse().slice(0, 200);
  return (
    <Dialog title="Battle log" onClose={onClose} input={input} wide>
      <ol className="space-y-[0.35em]">
        {lines.map((line, i) => (
          <li key={i} className="flex items-start justify-between gap-[0.6em] border-b border-(--rk-line) pb-[0.35em]">
            <span className="space-y-[0.2em]">
              <span className="block">{line.text}</span>
              {line.dice && <DiceRow attacker={line.dice.attacker} defender={line.dice.defender} />}
            </span>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
