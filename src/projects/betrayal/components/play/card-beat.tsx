"use client";

import { Suspense, use, useEffect, useRef, type ReactNode } from "react";
import type { HouseScene } from "../../art/house-scene";
import { WALL_HEIGHT } from "../../art/room";
import type { EventView, GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import { cardMood, cardTypeName, heldText } from "../../play/cards";
import type { PanelChoice } from "../../play/choices";
import type { Action } from "../../types";
import { ruleNotes } from "../why";
import { CardTypeIcon } from "../icons";
import type { RowSummary } from "../../engine/outcomes";
import { RollTable } from "./roll-table";
import { withoutTable } from "../../play/roll-table";
import { MOOD_BORDER, MOOD_TEXT } from "./moods";
import { ChoiceButtons } from "./decision-panel";
import { claimFocus } from "./pad-focus";

/*
 * A card over the room, the one place a card is shown and answered: its name
 * as a title, in its colour, with its type's icon, and the card's own wording
 * under it (its roll's table drawn as the status box draws it, without
 * odds). A card drawn that asks nothing waits for a press (A, a click, a tap
 * anywhere), a small mark showing it waits, then gets out of the way. A card
 * that asks a question shows the question and its choices on the card, and
 * takes the controller's focus, on its first choice, so A picks it at once
 * and the d-pad goes along the row. The camera pans to the room, keeping the
 * player's angles and zoom. What the card does then plays out in the status
 * box and the house.
 */

/** A card to show over its room. */
export interface ShownCard {
  card: string;
  room: string;
  /** Drawn just now, rather than a card held asking a question as it is used. */
  drawn: boolean;
  /** The table its roll goes by, shown in place of its printed lines, or null. */
  table: readonly RowSummary[] | null;
  /** Its question, answered on the card: the decision, its words and its
   *  choices; null for a card that asks nothing, waiting for a press. */
  question: { decision: string; view: GameView; prompt: ReactNode; panel: readonly PanelChoice[] } | null;
}

export interface CardBeatProps {
  scene: HouseScene;
  card: ShownCard | null;
  /** Goes on from a card waiting for its press. */
  goOn: () => void;
  act: (action: Action) => void;
}

/** The room a card was drawn in: the one its drawer last entered before the
 *  draw, as the card may since have moved them (the card stays over the room
 *  it was drawn in, the cause). */
export function drawnIn(told: readonly EventView[], drawn: EventView, figure: string): string | null {
  const before = told.slice(0, told.indexOf(drawn));
  const entered = before.findLast((candidate) => (candidate.type === "entered" || candidate.type === "discovered") && candidate.data.figure === figure);
  return entered?.type === "entered" || entered?.type === "discovered" ? entered.data.room : null;
}

export function CardBeat({ scene, card: shown, goOn, act }: CardBeatProps) {
  const ref = useRef<HTMLDivElement>(null);
  const face = useRef<HTMLElement>(null);
  const room = shown?.room ?? null;
  const question = shown?.question ?? null;
  const asks = question !== null && question.panel.length > 0;
  // A new card, or a new question on it, is pinned afresh, so the focus lands on its first choice again.
  const key = shown === null ? null : `${shown.card}:${question?.decision ?? "waits"}`;

  useEffect(() => {
    const element = ref.current;
    if (room === null || key === null || !element) return;
    scene.setPins("card", [
      {
        element,
        at: { room },
        height: WALL_HEIGHT,
        lift: 1,
        clamp: true,
        apart: false,
        // Its choices can take the focus only once the card shows.
        shown: () => {
          if (asks && face.current) claimFocus(face.current);
        },
      },
    ]);
    void scene.play({ kind: "frame", framing: { rooms: [room] } });
    return () => {
      scene.setPins("card", []);
    };
  }, [scene, room, key, asks]);

  if (!shown || room === null) return null;
  const name = ENGINE.catalog.cards[shown.card].name;
  const mood = cardMood(ENGINE, shown.card);
  return (
    <div ref={ref} className="pointer-events-none invisible absolute top-0 left-0 w-max max-w-[min(26rem,calc(100vw-1rem))]">
      <section
        ref={face}
        role="dialog"
        aria-label={`${shown.drawn ? "Card drawn" : "Card"}: ${name}`}
        data-card-beat={shown.card}
        data-pad-layer={asks ? "1" : undefined}
        onClick={question === null ? goOn : undefined}
        className={`pointer-events-auto flex flex-col gap-1 rounded border-2 bg-(--bt-panel) px-3 py-2 ${MOOD_BORDER[mood]} ${question === null ? "cursor-pointer" : ""}`}
      >
        <h2 className={`flex items-center gap-2 text-xl leading-tight font-bold ${MOOD_TEXT[mood]}`}>
          <CardTypeIcon type={ENGINE.catalog.cards[shown.card].type} label={cardTypeName(ENGINE, shown.card)} className="size-5" />
          {name}
        </h2>
        <Suspense fallback={null}>
          <Text card={shown.card} table={shown.table} />
        </Suspense>
        {shown.table && <RollTable rows={shown.table} label={`${name}: its table`} />}
        {question === null ? (
          <button type="button" data-continue className="mt-0.5 self-end text-xs text-(--bt-muted)">
            continue ▸
          </button>
        ) : (
          <>
            <p className="mt-1 text-sm font-semibold">{question.prompt}</p>
            <ChoiceButtons view={question.view} panel={question.panel} act={act} />
          </>
        )}
      </section>
    </div>
  );
}

/** The card's text, less the lines of its table when the table shows beside it. */
function Text({ card, table }: { card: string; table: readonly RowSummary[] | null }) {
  const notes = use(ruleNotes());
  const lines = heldText(notes, card);
  return (
    <ul aria-label="The card's text" className="flex max-h-[30vh] flex-col gap-0.5 overflow-y-auto text-xs">
      {(table === null ? lines : withoutTable(lines, table)).map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
