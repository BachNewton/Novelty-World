import { outcomeText, rangeText, rowText } from "../../engine/describe";
import type { RowOutcome, RowSummary } from "../../engine/outcomes";
import { ENGINE } from "../../game";
import { cardMood } from "../../play/cards";
import { percentText, printedOrder } from "../../play/roll-table";
import type { Trait } from "../../types";
import { AttackIcon, CardTypeIcon, DamageIcon, DieFace, FailIcon, MoveIcon, PassIcon, RollIcon, StopIcon, TraitIcon } from "../icons";
import { MOOD_TEXT } from "./moods";

/*
 * A roll's table, everywhere a roll's table shows: each row's results as a
 * chip, what it does in icons, and, before the roll, the odds of landing on
 * it. After the roll, the row it landed on is lit and the rest dimmed. A
 * card's beat and a reader show the card's table alone, with neither. It is
 * read-only: nothing in it takes the focus, and its words stay for screen
 * readers. Three columns fit the narrowest phone; a long table scrolls
 * inside itself.
 */

const GROUPS: Record<"physical" | "mental" | "choice", readonly Trait[]> = {
  physical: ["might", "speed"],
  mental: ["knowledge", "sanity"],
  choice: [],
};

const signed = (amount: number) => (amount < 0 ? `−${-amount}` : `+${amount}`);

/** One thing a row does, in icons. */
function Outcome({ outcome }: { outcome: RowOutcome }) {
  switch (outcome.kind) {
    case "gain": {
      const traits = outcome.trait in GROUPS ? GROUPS[outcome.trait as keyof typeof GROUPS] : [outcome.trait as Trait];
      return (
        <span className={`inline-flex items-center gap-0.5 font-semibold ${outcome.amount > 0 ? "text-(--bt-mood-supernatural)" : "text-(--bt-danger)"}`}>
          {signed(outcome.amount)}
          {outcome.trait === "choice" ? (
            <span className="text-xs font-normal">any</span>
          ) : (
            traits.map((trait, i) => (
              <span key={trait} className="inline-flex items-center">
                {i > 0 && <span className="px-px text-xs text-(--bt-muted)">/</span>}
                <TraitIcon trait={trait} />
              </span>
            ))
          )}
        </span>
      );
    }
    case "damage":
      return (
        <span className="inline-flex items-center gap-0.5 font-semibold text-(--bt-danger)">
          {outcome.dice !== null ? (
            <>
              {outcome.dice}
              <DieFace value={1} className="size-4" />
            </>
          ) : (
            outcome.points
          )}
          <DamageIcon kind={outcome.damage} />
        </span>
      );
    case "draw":
      return (
        <span className={`inline-flex items-center font-semibold ${MOOD_TEXT[outcome.type === "item" ? "human" : outcome.type === "omen" ? "magic" : "supernatural"]}`}>
          +<CardTypeIcon type={outcome.type} />
        </span>
      );
    case "keep":
    case "lose":
      return (
        <span className={`inline-flex items-center gap-0.5 text-xs ${MOOD_TEXT[cardMood(ENGINE, outcome.card)]}`}>
          {outcome.kind === "lose" && "−"}
          <CardTypeIcon type={ENGINE.catalog.cards[outcome.card].type} />
          {outcome.kind === "keep" ? "kept" : ENGINE.catalog.cards[outcome.card].name}
        </span>
      );
    case "move":
      return (
        <span className="inline-flex items-center gap-0.5 text-xs">
          <MoveIcon />
          {outcome.room !== null && ENGINE.catalog.rooms[outcome.room].name}
        </span>
      );
    case "stop":
      return <StopIcon />;
    case "roll":
      return <RollIcon />;
    case "attack":
      return <AttackIcon className="size-4 text-(--bt-danger)" />;
    case "pass":
      return <PassIcon className="size-4 text-(--bt-mood-supernatural)" />;
    case "fail":
      return <FailIcon className="size-4 text-(--bt-danger)" />;
    case "choice":
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          {outcome.options.map((option, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-xs text-(--bt-muted)">or</span>}
              <Outcomes outcomes={option} />
            </span>
          ))}
        </span>
      );
    case "note":
      // An attack has its icon, whoever's step makes it.
      if (outcome.note === "attack") return <AttackIcon className="size-4 text-(--bt-danger)" />;
      return <span className="text-xs">{outcomeText(ENGINE, outcome)}</span>;
  }
}

/** What a row does, in icons; nothing, as a dash. */
function Outcomes({ outcomes }: { outcomes: readonly RowOutcome[] }) {
  if (outcomes.length === 0) return <span className="text-(--bt-muted)">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {outcomes.map((outcome, i) => (
        <Outcome key={i} outcome={outcome} />
      ))}
    </span>
  );
}

export interface RollTableProps {
  rows: readonly RowSummary[];
  /** Each row's chance, in the rows' own order, before the roll; null to show none. */
  odds?: readonly number[] | null;
  /** The row the roll landed on, lit, with the rest dimmed; null before the roll or with no roll. */
  lit?: number | null;
  /** Its name for screen readers. */
  label?: string;
  className?: string;
}

export function RollTable({ rows, odds = null, lit = null, label = "Roll table", className = "" }: RollTableProps) {
  return (
    // A long table scrolls inside itself, but takes no focus: it is read, never pressed.
    <div tabIndex={-1} className={`max-h-40 overflow-y-auto rounded border border-(--bt-line) bg-(--bt-bg) ${className}`}>
      <table aria-label={label} className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-12" />
          <col />
          {odds && <col className="w-12" />}
        </colgroup>
        <tbody>
          {printedOrder(rows).map(({ row, index }) => {
            const hit = lit === index;
            const dim = lit !== null && !hit;
            return (
              <tr
                key={index}
                aria-current={hit || undefined}
                aria-label={`${rangeText(row)}: ${rowText(ENGINE, row.outcome)}${odds ? `, ${percentText(odds[index])}` : ""}`}
                className={`border-t border-(--bt-line) first:border-t-0 ${hit ? "bg-(--bt-room) outline-2 -outline-offset-2 outline-(--bt-accent)" : ""} ${dim ? "opacity-40" : ""}`}
              >
                <td aria-hidden className="px-1 py-0.5 text-center">
                  <span className="inline-block min-w-8 rounded border border-(--bt-line) px-1 text-xs font-semibold tabular-nums">{rangeText(row)}</span>
                </td>
                <td aria-hidden className="px-1 py-0.5">
                  <Outcomes outcomes={row.outcome} />
                </td>
                {odds && (
                  <td aria-hidden className="px-1 py-0.5 text-right text-xs text-(--bt-muted) tabular-nums">
                    {percentText(odds[index])}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
