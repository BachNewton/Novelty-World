import type { Trait } from "../../types";
import { DamageIcon, DieFace, FailIcon, PassIcon, TraitIcon, traitLabel } from "../icons";
import type { RollMeaning } from "../../play/dice";

/*
 * A roll in icons: its dice as die faces, the total, and what it means as a
 * mark (a pass or fail against its target, the damage it deals), with a short
 * note only where an icon can't say it. The status box shows rolls this way,
 * those a player decides about and those the engine made by itself.
 */

/** A trait with its value: its icon and the number. */
export function TraitValue({ trait, value }: { trait: Trait; value: number | null }) {
  return (
    <span aria-label={`${traitLabel(trait)} ${value ?? "unknown"}`} className="inline-flex items-center gap-0.5 whitespace-nowrap">
      <TraitIcon trait={trait} />
      <span className="font-semibold">{value ?? "?"}</span>
    </span>
  );
}

/** A pass or a fail, as a mark in its colour. */
export function Verdict({ verdict, target }: { verdict: "pass" | "fail" | null; target: number | null }) {
  return (
    <>
      {target !== null && (
        <span aria-label={`needs ${target}`} className="rounded border border-(--bt-line) px-1 text-xs text-(--bt-muted)">
          {target}+
        </span>
      )}
      {verdict === "pass" && <PassIcon label="passed" className="size-5 text-(--bt-mood-supernatural)" />}
      {verdict === "fail" && <FailIcon label="failed" className="size-5 text-(--bt-danger)" />}
    </>
  );
}

/** Damage of a kind: its icon, and the points when they are known. */
export function DamageAmount({ kind, amount }: { kind: "physical" | "mental"; amount: number | null }) {
  return (
    <span aria-label={`${amount ?? ""} ${kind} damage`.trim()} className="inline-flex items-center gap-0.5 font-semibold whitespace-nowrap text-(--bt-danger)">
      {amount}
      <DamageIcon kind={kind} />
    </span>
  );
}

/** Dice as their faces. */
export function DiceFaces({ dice }: { dice: readonly number[] }) {
  return (
    <span aria-label="Dice" className="inline-flex flex-wrap gap-0.5">
      {dice.map((value, index) => (
        <DieFace key={index} value={value} label={`a die showing ${value}`} className="size-6" />
      ))}
    </span>
  );
}

/** A roll's outcome in a line: the dice, the total, and what it means. */
export function RollResult({ dice, bonus, total, meaning }: { dice: readonly number[] | null; bonus: number; total: number; meaning: RollMeaning }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {dice && <DiceFaces dice={dice} />}
      {bonus !== 0 && <span className="text-sm">{bonus > 0 ? `+${bonus}` : `−${-bonus}`}</span>}
      <span aria-label={`total ${total}`} className="text-lg leading-none font-bold">
        = {total}
      </span>
      <Verdict verdict={meaning.verdict} target={meaning.target} />
      {meaning.damage && <DamageAmount kind={meaning.damage.kind} amount={meaning.damage.amount} />}
      {meaning.note !== null && <span className="text-xs text-(--bt-muted)">{meaning.note}</span>}
    </span>
  );
}
