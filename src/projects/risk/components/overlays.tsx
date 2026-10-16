"use client";

import { X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { usePadNavigation } from "@/shared/lib/gamepad";
import type { InputKind } from "@/shared/lib/input";
import { cn } from "@/shared/lib/utils";
import { setValue } from "../cards";
import type { CardId, CardSymbol, GameEvent, GameView, Move, Options } from "../contract";
import { TERRITORIES, type TerritoryId } from "../map";
import { describeEvents, isWild, territoryName } from "../ui/describe";
import { CardChip, CardSymbolIcon, DiceRow, SeatName } from "./bits";
import { BUTTON, DISPLAY, PANEL, PRIMARY } from "./theme";

/** A panel over the game, holding a controller's focus while it is open: the d-pad moves round
 *  its buttons, A presses one, B closes it. */
function Dialog({ title, onClose, input, children, wide }: { title: string; onClose: () => void; input: InputKind; children: ReactNode; wide?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  usePadNavigation(root, { reveal: input === "pad" });
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-(--rk-bg)/70 p-[1em]" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={root} role="dialog" aria-label={title} className={cn(PANEL, "flex max-h-full w-full flex-col overflow-hidden shadow-2xl", wide ? "max-w-[46em]" : "max-w-[34em]")}>
        <header className="flex items-center justify-between gap-[0.5em] border-b border-(--rk-line) px-[1em] py-[0.6em]">
          <h2 className={cn(DISPLAY, "text-[1.25em] text-(--rk-brass)")}>{title}</h2>
          <button type="button" data-pad-back className={cn(BUTTON, "min-h-[max(2.2em,44px)] px-[0.5em]")} onClick={onClose} aria-label="Close">
            <X size="1.1em" />
          </button>
        </header>
        <div className="overflow-y-auto px-[1em] py-[0.8em]">{children}</div>
      </div>
    </div>
  );
}

/** The hand, the trades open to it, and what every player can see of the cards (note
 *  `public-cards`): each hand's size, what each kind of set is worth, the deck's size and every trade made. */

/** Each kind of set by symbol (`CARDS-6`), shown with real cards of those symbols. */
const SET_KINDS: readonly (readonly [CardId, CardId, CardId])[] = (() => {
  const of = (symbol: CardSymbol) => TERRITORIES.filter((t) => t.symbol === symbol).map((t) => t.id as CardId);
  const [inf, cav, art] = [of("infantry"), of("cavalry"), of("artillery")];
  return [
    [inf[0], inf[1], inf[2]],
    [cav[0], cav[1], cav[2]],
    [art[0], art[1], art[2]],
    [inf[0], cav[0], art[0]],
  ];
})();

const symbolName = (card: CardId) => TERRITORIES.find((t) => t.id === card)?.symbol ?? "wild";

export function CardsDialog({ view, options, act, onClose, input }: { view: GameView; options: Options | null; act: (move: Move) => void; onClose: () => void; input: InputKind }) {
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
    <Dialog title="Cards" onClose={onClose} input={input} wide>
      <div className="space-y-[1em]">
        {trading?.mustTrade && (
          <p className="rounded-[0.4em] border border-(--rk-danger) px-[0.7em] py-[0.4em] text-(--rk-danger)">
            You hold {hand.length} cards: you must trade a set before placing.
          </p>
        )}
        <section>
          <h3 className={cn(DISPLAY, "mb-[0.4em] text-(--rk-muted)")}>Your hand</h3>
          {hand.length === 0 ? <p className="text-(--rk-muted)">No cards yet. Capture a territory in a turn to earn one.</p> : (
            <ul className="flex flex-wrap gap-[0.4em]">
              {hand.map((card) => (
                <li key={card}>
                  <CardChip card={card} owned={owned(card)} />
                </li>
              ))}
            </ul>
          )}
        </section>
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
          trading && (
            <section>
              <h3 className={cn(DISPLAY, "mb-[0.4em] text-(--rk-muted)")}>Trade a set</h3>
              {trading.sets.length === 0 ? (
                <p className="text-(--rk-muted)">No set in your hand: three of a kind, one of each, or any two with a wild.</p>
              ) : (
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
              )}
            </section>
          )
        )}
        <section className="grid gap-[0.6em] sm:grid-cols-2">
          <div>
            <h3 className={cn(DISPLAY, "mb-[0.4em] text-(--rk-muted)")}>Hands</h3>
            <ul className="space-y-[0.2em]">
              {view.seats.map((seat) => (
                <li key={seat.seat} className={cn("flex justify-between", seat.eliminated && "opacity-50 line-through")}>
                  <SeatName seat={seat.seat} />
                  <span className="tabular-nums">{seat.handSize} {seat.handSize === 1 ? "card" : "cards"}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className={cn(DISPLAY, "mb-[0.4em] text-(--rk-muted)")}>Sets are worth</h3>
            <ul className="space-y-[0.2em]">
              {SET_KINDS.map((set) => (
                <li key={set.join()} className="flex items-center justify-between">
                  <span className="flex gap-[0.2em]" aria-label={set.map(symbolName).join(", ")}>
                    {set.map((card, i) => (
                      <CardSymbolIcon key={i} card={card} />
                    ))}
                  </span>
                  <span className="font-bold text-(--rk-brass) tabular-nums">{setValue(set)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-[0.4em] text-(--rk-muted) tabular-nums">Deck: {view.cards.deck}</p>
          </div>
        </section>
        <section>
          <h3 className={cn(DISPLAY, "mb-[0.4em] text-(--rk-muted)")}>Traded so far</h3>
          {view.cards.traded.length === 0 ? <p className="text-(--rk-muted)">Nothing yet.</p> : (
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
          )}
        </section>
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

export function MenuDialog({ onClose, onLog, onQuit, input }: { onClose: () => void; onLog: () => void; onQuit: () => void; input: InputKind }) {
  return (
    <Dialog title="War room" onClose={onClose} input={input}>
      <div className="flex flex-col gap-[0.5em]">
        <button type="button" data-pad-start className={cn(BUTTON, PRIMARY)} onClick={onClose}>
          Back to the game
        </button>
        <button type="button" className={BUTTON} onClick={onLog}>
          Battle log
        </button>
        <button type="button" className={BUTTON} onClick={onQuit}>
          Leave this game
        </button>
      </div>
    </Dialog>
  );
}
