import { rollName } from "../../engine/describe";
import type { RowSummary } from "../../engine/outcomes";
import type { RollSpec } from "../../engine/sources";
import type { EventView, GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import { rollMeaning } from "../../play/dice";
import { rowOdds } from "../../play/roll-table";
import type { FigureId, Trait } from "../../types";
import { DamageIcon, DieFace, TraitIcon } from "../icons";
import { RollResult } from "./roll-result";
import { RollTable } from "./roll-table";

/*
 * The status box's line for the beat playing, in icons where icons say it: a
 * roll as its dice, total and mark, its dice turning up as its beat plays;
 * damage and trait changes as icons and numbers; a discovery as the room's
 * name, large, since a haunt names rooms and players learn each name with
 * its look as they walk in, and a room's own roll after it led by the same
 * name, so the line goes on from it. Every other event is its words. The words stay with the icons for screen readers. A roll with a
 * table shows the table under the line: before a roll made at once, each
 * row with its odds; once rolled, the row it landed on lit.
 */

interface Coming {
  figure: FigureId;
  spec: RollSpec;
  pool: number;
  bonus: number;
  rows: RowSummary[] | null;
}

interface TableRowData {
  figure: FigureId;
  rows: RowSummary[];
  index: number;
}

/** The table under a beat's line: a roll's coming, with each row's odds, or its result, with its row lit. Null for a beat with none. */
export function HappeningTable({ event, events }: { event: EventView; events: readonly EventView[] }) {
  if (event.type === "roll-coming") {
    const d = event.data as unknown as Coming;
    if (d.rows === null) return null;
    return <RollTable rows={d.rows} odds={rowOdds(d.rows, d.pool, d.bonus)} />;
  }
  if (event.type === "rolled") {
    const row = events.find((other) => other.type === "table-row");
    if (!row) return null;
    const d = row.data as unknown as TableRowData;
    return <RollTable rows={d.rows} lit={d.index} />;
  }
  return null;
}

interface Rolled {
  figure: FigureId;
  spec: RollSpec;
  dice: number[];
  named: number | null;
  bonus: number;
  result: number;
}

/** A room's name, as large as a discovery shows it. */
function RoomName({ room }: { room: string }) {
  return (
    <span aria-hidden data-room-name={room} className="text-lg leading-tight font-bold">
      {ENGINE.catalog.rooms[room].name}
    </span>
  );
}

/** The room whose own rule an event is, leading its line, or null. */
const roomLead = (event: EventView) => (event.rule.source === "room" ? <RoomName room={event.rule.room} /> : null);

/** `turnUp`: seconds for a roll's dice to turn up, while its beat plays, or null once it has. */
export function HappeningLine({ event, events, text, view, turnUp }: { event: EventView; events: readonly EventView[]; text: string; view: GameView; turnUp: number | null }) {
  const name = (figure: FigureId) => view.figures[figure].name;

  if (event.type === "discovered") {
    const d = event.data as { figure: FigureId; room: string };
    return (
      <span className="inline-flex flex-wrap items-baseline gap-1.5">
        <span className="sr-only">{text}</span>
        <RoomName room={d.room} />
        <span aria-hidden className="text-(--bt-muted)">
          {name(d.figure)} discovers it
        </span>
      </span>
    );
  }

  if (event.type === "roll-coming") {
    const d = event.data as unknown as Coming;
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="sr-only">{text}</span>
        {roomLead(event)}
        <span aria-hidden>
          {name(d.figure)}: {rollName(d.spec)}
        </span>
        {d.spec.kind === "trait" && <TraitIcon trait={d.spec.trait} />}
        <span aria-hidden className="inline-flex items-center gap-0.5">
          <DieFace value={0} className="size-4" />×{d.pool}
        </span>
      </span>
    );
  }

  if (event.type === "rolled") {
    const d = event.data as unknown as Rolled;
    // A card's attacker's dice thrown for it read as the engine words them.
    if (d.spec.kind === "attack" && d.spec.dice !== null) return text;
    // A roll with a table says what it means by the row lit under the line.
    const tabled = events.some((other) => other.type === "table-row");
    const meaning = tabled ? { target: null, verdict: null, damage: null, note: null } : rollMeaning(view, { spec: d.spec, then: { kind: "rolled", params: {} } }, d.result);
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="sr-only">{text}</span>
        {roomLead(event)}
        <span aria-hidden>
          {name(d.figure)}: {rollName(d.spec)}
        </span>
        {d.spec.kind === "trait" && <TraitIcon trait={d.spec.trait} />}
        <span aria-hidden className="contents">
          <RollResult dice={d.named === null ? d.dice : null} bonus={d.bonus} total={d.result} meaning={meaning} turnUp={turnUp} />
        </span>
      </span>
    );
  }

  if (event.type === "damaged" || event.type === "trait-changed") {
    const d = event.data as { figure: FigureId; damage?: "physical" | "mental"; split?: Partial<Record<Trait, number>>; trait?: Trait; spaces?: number };
    const changes = d.split ? Object.entries(d.split).flatMap(([trait, n]) => (n > 0 ? [[trait as Trait, -n] as const] : [])) : d.trait && d.spaces ? [[d.trait, d.spaces] as const] : [];
    if (changes.length === 0) return text;
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="sr-only">{text}</span>
        <span aria-hidden>{name(d.figure)}</span>
        {d.damage && <DamageIcon kind={d.damage} className="size-4 text-(--bt-danger)" />}
        {changes.map(([trait, spaces]) => (
          <span key={trait} aria-hidden className={`inline-flex items-center gap-0.5 font-semibold ${spaces > 0 ? "text-(--bt-mood-supernatural)" : "text-(--bt-danger)"}`}>
            {spaces > 0 ? "+" : "−"}
            {Math.abs(spaces)}
            <TraitIcon trait={trait} />
          </span>
        ))}
      </span>
    );
  }

  return text;
}
