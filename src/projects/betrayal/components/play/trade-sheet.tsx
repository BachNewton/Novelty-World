"use client";

import { useEffect, useRef, useState } from "react";
import type { GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import { cardMood } from "../../play/cards";
import { tradeOffer, tradeSides, type TradeRow } from "../../play/sheet";
import type { Action } from "../../types";
import { MOOD_TEXT } from "./moods";
import { enterLayer } from "./pad-focus";

/*
 * Building a trade with one explorer: what you give and what you take, a
 * card at most each way, either side empty, and the offer, previewed as it is
 * built. Offering it puts the question to the other explorer's seat, which
 * answers Accept or Decline in the status box.
 */

function Column({ label, cards, marked, mark }: { label: string; cards: string[]; marked: string | null; mark: (card: string | null) => void }) {
  return (
    <fieldset className="flex min-w-0 flex-1 flex-col gap-1">
      <legend className="mb-1 text-sm font-semibold">{label}</legend>
      {cards.length === 0 && <p className="text-xs text-(--bt-muted)">Nothing to trade.</p>}
      {cards.map((card) => (
        <button
          key={card}
          type="button"
          aria-pressed={marked === card}
          onClick={() => {
            mark(marked === card ? null : card);
          }}
          className={`min-h-10 rounded border border-(--bt-line) bg-(--bt-bg) px-2 py-1 text-left text-sm aria-pressed:border-(--bt-accent) aria-pressed:bg-(--bt-room) aria-pressed:font-semibold ${MOOD_TEXT[cardMood(ENGINE, card)]}`}
        >
          {ENGINE.catalog.cards[card].name}
        </button>
      ))}
    </fieldset>
  );
}

export function TradeSheet({ view, row, act, close }: { view: GameView; row: TradeRow; act: (action: Action) => void; close: () => void }) {
  const [give, setGive] = useState<string | null>(null);
  const [take, setTake] = useState<string | null>(null);
  const { gives, takes } = tradeSides(row);
  const offer = tradeOffer(row, give, take);
  const name = view.figures[row.with].name;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ref.current) enterLayer(ref.current);
  }, []);
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-(--bt-bg)/60 p-3">
      <section ref={ref} role="dialog" aria-label={`Trade with ${name}`} data-pad-layer="1" className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto rounded border border-(--bt-accent) bg-(--bt-panel) p-3">
        <h2 className="font-semibold">Trade with {name}</h2>
        <div className="flex gap-3">
          <Column label="You give" cards={gives} marked={give} mark={setGive} />
          <Column label="You take" cards={takes} marked={take} mark={setTake} />
        </div>
        <p aria-label="The offer" className="min-h-5 text-sm text-(--bt-muted)">
          {offer ? offer.label : "Mark a card to give, a card to take, or both."}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" data-pad-back onClick={close} className="inline-flex min-h-11 items-center gap-1.5 rounded border border-(--bt-line) px-3 hover:border-(--bt-accent)">
            Cancel
          </button>
          <button
            type="button"
            disabled={offer === null}
            onClick={() => {
              if (offer) act(offer.action);
            }}
            className="min-h-11 rounded bg-(--bt-accent) px-4 py-1 font-semibold text-(--bt-bg) disabled:opacity-40"
          >
            Offer
          </button>
        </div>
      </section>
    </div>
  );
}
