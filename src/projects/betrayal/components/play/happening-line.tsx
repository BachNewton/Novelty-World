import type { RuleNotes } from "../../data/rule-notes";
import { rollName } from "../../engine/describe";
import type { RollSpec } from "../../engine/sources";
import type { GameView } from "../../engine/view";
import { rollMeaning } from "../../play/dice";
import type { Happening } from "../../play/status";
import type { FigureId, Trait } from "../../types";
import { DamageIcon, TraitIcon } from "../icons";
import { RollResult } from "./roll-result";

/*
 * A line of what happened, in icons where icons say it: a roll as its dice,
 * total and mark, damage and trait changes as icons and numbers. Every other
 * event is its words. The words stay with the icons for screen readers.
 */

interface Rolled {
  figure: FigureId;
  spec: RollSpec;
  dice: number[];
  named: number | null;
  bonus: number;
  result: number;
}

export function HappeningLine({ happening, view, notes }: { happening: Happening; view: GameView; notes: RuleNotes | null }) {
  const { event, text } = happening;
  const name = (figure: FigureId) => view.figures[figure].name;

  if (event.type === "rolled") {
    const d = event.data as unknown as Rolled;
    // A card's attacker's dice thrown for it read as the engine words them.
    if (d.spec.kind === "attack" && d.spec.dice !== null) return text;
    const meaning = rollMeaning(view, notes, { spec: d.spec, rule: event.rule, then: { kind: "rolled", params: {} } }, d.result);
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="sr-only">{text}</span>
        <span aria-hidden>
          {name(d.figure)}: {rollName(d.spec)}
        </span>
        {d.spec.kind === "trait" && <TraitIcon trait={d.spec.trait} />}
        <span aria-hidden className="contents">
          <RollResult dice={d.named === null ? d.dice : null} bonus={d.bonus} total={d.result} meaning={meaning} />
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
