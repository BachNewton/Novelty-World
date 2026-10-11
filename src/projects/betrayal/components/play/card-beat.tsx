"use client";

import { Suspense, use, useEffect, useRef } from "react";
import type { HouseScene } from "../../art/house-scene";
import { WALL_HEIGHT } from "../../art/room";
import type { EventView } from "../../engine/view";
import { ENGINE } from "../../game";
import type { InputKind } from "../../input/controls";
import { cardMood, cardTypeName, drawnCard, heldText } from "../../play/cards";
import type { Spots } from "../../play/spots";
import { ruleNotes } from "../why";
import { CardTypeIcon } from "../icons";
import { Prompt } from "../prompts";
import { MOOD_BORDER, MOOD_TEXT } from "./moods";
import type { Moment } from "./presenting";

/*
 * A card drawn, as a beat in the house: the card's name as a title over the
 * room it was drawn in, in its colour, with its type's icon, and the card's
 * own wording under it, waiting for a tap (or A, or Enter) to go on. The
 * title stays up while what the card set off plays, until the choice it led
 * to shows. The camera
 * pans to the room, keeping the player's angles and zoom. What the card does
 * then plays out in the status box and the house.
 */

export interface CardBeatProps {
  scene: HouseScene;
  moment: Moment | null;
  /** The events the status box tells, the moment's among them. */
  told: readonly EventView[];
  spots: Spots;
  input: InputKind;
  /** Beats are playing: a card drawn stays over its room until they are over and the choice it led to shows. */
  playing: boolean;
  goOn: () => void;
}

/** The room a card was drawn in: the one its drawer last entered before the
 *  draw, as the card may since have moved them (the title stays over the
 *  room it was drawn in, the cause, until the choice it leads to shows). */
function drawnIn(told: readonly EventView[], drawn: EventView, figure: string): string | null {
  const before = told.slice(0, told.indexOf(drawn));
  const entered = before.findLast((candidate) => (candidate.type === "entered" || candidate.type === "discovered") && (candidate.data as { figure?: string }).figure === figure);
  return entered ? (entered.data as { room: string }).room : null;
}

/** The card drawn to show: the one whose moment waits for a tap, or, while the beats after it play, the last one drawn before the moment playing. */
function shownDraw(told: readonly EventView[], moment: Moment | null, playing: boolean): { event: EventView; waits: boolean } | null {
  const at = moment === null ? -1 : told.findIndex((candidate) => candidate.id === moment.event);
  if (moment?.waits && at >= 0) return { event: told[at], waits: true };
  if (!playing) return null;
  const event = (at < 0 ? told : told.slice(0, at)).findLast((candidate) => candidate.type === "card-drawn");
  return event ? { event, waits: false } : null;
}

export function CardBeat({ scene, moment, told, spots, input, playing, goOn }: CardBeatProps) {
  const draw = shownDraw(told, moment, playing);
  const event = draw?.event;
  const drawn = event ? drawnCard(event) : null;
  const room = drawn && event ? drawnIn(told, event, drawn.figure) ?? spots[drawn.figure]?.room ?? null : null;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (room === null || !element) return;
    scene.setPins("card", [{ element, at: { room }, height: WALL_HEIGHT, lift: 1, clamp: true, apart: false }]);
    void scene.play({ kind: "frame", framing: { rooms: [room] } });
    return () => {
      scene.setPins("card", []);
    };
  }, [scene, room, event?.id]);

  if (!drawn || room === null || !event) return null;
  const mood = cardMood(ENGINE, drawn.card);
  return (
    <div ref={ref} className="pointer-events-none invisible absolute top-0 left-0 w-max max-w-[min(26rem,calc(100vw-1rem))]">
      <section
        role="dialog"
        aria-label={`Card drawn: ${ENGINE.catalog.cards[drawn.card].name}`}
        data-card-beat={drawn.card}
        className={`pointer-events-auto flex flex-col gap-1 rounded border-2 bg-(--bt-panel) px-3 py-2 ${MOOD_BORDER[mood]}`}
      >
        <h2 className={`flex items-center gap-2 text-xl leading-tight font-bold ${MOOD_TEXT[mood]}`}>
          <CardTypeIcon type={drawn.type} label={cardTypeName(ENGINE, drawn.card)} className="size-5" />
          {ENGINE.catalog.cards[drawn.card].name}
        </h2>
        {draw.waits && (
          <>
            <Suspense fallback={null}>
              <Text card={drawn.card} />
            </Suspense>
            <button type="button" onClick={goOn} className="mt-1 inline-flex min-h-10 items-center gap-1.5 self-end rounded border border-(--bt-line) px-3 text-sm hover:border-(--bt-accent)">
              Go on
              <Prompt meaning="confirm" input={input} size={16} />
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function Text({ card }: { card: string }) {
  const notes = use(ruleNotes());
  return (
    <ul aria-label="The card's text" className="flex max-h-[30vh] flex-col gap-0.5 overflow-y-auto text-xs">
      {heldText(notes, card).map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
