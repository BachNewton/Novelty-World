import type { RuleNotes } from "../../data/rule-notes";
import { ENGINE } from "../../game";
import { cardMood, cardTypeName, heldText } from "../../play/cards";
import { MOOD_EDGE, MOOD_TEXT } from "./moods";
import type { RowSummary } from "../../engine/outcomes";
import { withoutTable } from "../../play/roll-table";
import { RollTable } from "./roll-table";

/** A card's name in its colour, and its text: the card asking the question. With `table`, its roll's table shows under the text, in place of the table's printed lines. */
export function CardFace({ card, notes, table = null, className = "" }: { card: string; notes: RuleNotes | null; table?: readonly RowSummary[] | null; className?: string }) {
  const mood = cardMood(ENGINE, card);
  return (
    <div className={`rounded border border-(--bt-line) bg-(--bt-bg) px-2 py-1.5 ${MOOD_EDGE[mood]} ${className}`}>
      <p className="text-sm">
        <span className={`font-semibold ${MOOD_TEXT[mood]}`}>{ENGINE.catalog.cards[card].name}</span>{" "}
        <span className="text-xs text-(--bt-muted)">{cardTypeName(ENGINE, card)}</span>
      </p>
      {notes !== null && (
        <ul className="mt-0.5 flex flex-col gap-0.5 text-xs">
          {(table === null ? heldText(notes, card) : withoutTable(heldText(notes, card), table)).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {table && <RollTable rows={table} className="mt-1" />}
    </div>
  );
}

