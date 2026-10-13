import { useEffect, useRef } from "react";
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

/** Turns up a roll's parts in order over `seconds`: each die, then the
 *  total and what it means. The turning up is the roll's beat itself. */
function useTurnUp(seconds: number | null) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (seconds === null || !root) return;
    const parts = [...root.querySelectorAll<HTMLElement>("[data-turn-up]")];
    const step = (seconds * 1000) / Math.max(1, parts.length);
    const runs = parts.map((part, i) =>
      part.animate([{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "scale(1)" }], { duration: step, delay: i * step, fill: "backwards", easing: "ease-out" }),
    );
    return () => {
      for (const run of runs) run.finish();
    };
  }, [seconds]);
  return ref;
}

/** A roll's outcome in a line: the dice, the total, and what it means; with
 *  `turnUp`, its dice turn up one by one over that many seconds, then the rest. */
export function RollResult({ dice, bonus, total, meaning, turnUp = null }: { dice: readonly number[] | null; bonus: number; total: number; meaning: RollMeaning; turnUp?: number | null }) {
  const ref = useTurnUp(turnUp);
  return (
    <span ref={ref} className="inline-flex flex-wrap items-center gap-1.5">
      {dice && (
        <span aria-label="Dice" className="inline-flex flex-wrap gap-0.5">
          {dice.map((value, index) => (
            <span key={index} data-turn-up className="inline-flex">
              <DieFace value={value} label={`a die showing ${value}`} className="size-6" />
            </span>
          ))}
        </span>
      )}
      {bonus !== 0 && <span className="text-sm">{bonus > 0 ? `+${bonus}` : `−${-bonus}`}</span>}
      <span data-turn-up className="inline-flex items-center gap-1.5">
        <span aria-label={`total ${total}`} className="text-lg leading-none font-bold">
          = {total}
        </span>
        <Verdict verdict={meaning.verdict} target={meaning.target} />
        {meaning.damage && <DamageAmount kind={meaning.damage.kind} amount={meaning.damage.amount} />}
      </span>
      {meaning.note !== null && <span className="text-xs text-(--bt-muted)">{meaning.note}</span>}
    </span>
  );
}
