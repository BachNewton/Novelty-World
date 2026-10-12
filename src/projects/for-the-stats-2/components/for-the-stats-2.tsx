"use client";

import { useState } from "react";
import { Crown, Minus, Plus } from "lucide-react";
import { Card } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import {
  chanceOfAtLeast,
  expectedDamage,
  focusBonus,
  MAX_SLOT_PERCENT,
  outcomes,
  rangeMatchesChance,
  type Attack,
  type Outcome,
} from "../logic";

const SLOT_CHOICES = [1, 2, 3, 4, 5, 6];
const MAX_DAMAGE = 999;

/** Works out the odds of a For The King II attack: its expected damage and the
 *  chance it deals at least a target amount, such as an enemy's remaining HP.
 *  Built as a full-screen phone app: it's checked mid-fight, next to the game,
 *  so everything fits one screen and nothing scrolls. */
export function ForTheStats2() {
  const [minDamage, setMinDamage] = useState(4);
  const [maxDamage, setMaxDamage] = useState(11);
  const [slots, setSlots] = useState(3);
  const [slotPercent, setSlotPercent] = useState(80);
  const [target, setTarget] = useState(9);
  const [focus, setFocus] = useState(0);

  const attack: Attack = {
    minDamage,
    maxDamage: Math.max(minDamage, maxDamage),
    slots,
    slotPercent,
    focus,
  };

  const pickSlots = (count: number) => {
    setSlots(count);
    setFocus((spent) => Math.min(spent, count));
  };

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col gap-2 overflow-hidden px-4 py-3 sm:gap-4 sm:py-6 [@media(max-height:640px)]:gap-1.5 [@media(max-height:640px)]:py-2">
      <header className="flex shrink-0 items-center gap-3">
        <div className="rounded-md bg-surface-elevated p-2 text-brand-blue [@media(max-height:640px)]:p-1">
          <Crown size={22} />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl leading-tight font-bold sm:text-2xl">For The Stats 2</h1>
          <p className="text-xs leading-tight text-text-secondary sm:text-sm [@media(max-height:640px)]:hidden">Binomial distributions for people who just wanted to hit the goblin</p>
        </div>
      </header>

      <Card className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-2 p-3 [@media(max-height:640px)]:gap-y-1 [@media(max-height:640px)]:p-2">
        <Stepper label="Min damage" value={minDamage} onChange={setMinDamage} max={MAX_DAMAGE} />
        <Stepper label="Max damage" value={maxDamage} onChange={setMaxDamage} max={MAX_DAMAGE} />
        <ChoiceRow label="Slots" choices={SLOT_CHOICES} value={slots} onChange={pickSlots} />
        <ChoiceRow
          label="Focus"
          choices={Array.from({ length: slots + 1 }, (_, spent) => spent)}
          value={focus}
          onChange={setFocus}
          tone="focus"
        />
        <Stepper
          label="Chance per slot"
          note={focus > 0 ? `+${String(focusBonus(focus))}%` : undefined}
          value={slotPercent}
          onChange={setSlotPercent}
          max={MAX_SLOT_PERCENT}
          suffix="%"
        />
        <Stepper label="Damage needed" value={target} onChange={setTarget} max={MAX_DAMAGE} />
      </Card>

      <div className="grid shrink-0 grid-cols-2 gap-3 text-center">
        <Stat label={`Chance of ${target}+ damage`} value={formatPercent(chanceOfAtLeast(attack, target))} />
        <Stat label="Expected damage" value={expectedDamage(attack).toFixed(1)} />
      </div>

      <Distribution rows={outcomes(attack)} slots={slots} target={target} />

      <p
        className={cn(
          "shrink-0 text-center text-[10px] leading-tight sm:text-xs",
          rangeMatchesChance(attack) ? "text-text-muted" : "font-semibold text-brand-orange",
        )}
      >
        {rangeMatchesChance(attack)
          ? "Crits and armor aren't counted yet."
          : `A basic attack at ${String(slotPercent)}% can't have this range: check the numbers, or the lowest rolls may be off.`}
      </p>
    </div>
  );
}

/** A number typed on the phone keypad or nudged with −/+, which is quicker
 *  mid-fight than typing. */
function Stepper({
  label,
  note,
  value,
  onChange,
  max,
  suffix,
}: {
  label: string;
  note?: string;
  value: number;
  onChange: (value: number) => void;
  max: number;
  suffix?: string;
}) {
  const set = (next: number) => onChange(Math.min(max, Math.max(0, Math.round(next))));
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-text-secondary">
      <span>
        {label} {note && <span className="text-brand-orange">{note}</span>}
      </span>
      <div className="flex h-11 [@media(max-height:640px)]:h-10 items-stretch overflow-hidden rounded-md border border-border-default bg-surface-tertiary focus-within:border-brand-blue">
        <StepButton label={`Decrease ${label}`} onClick={() => set(value - 1)} disabled={value <= 0}>
          <Minus size={18} />
        </StepButton>
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            value={value}
            onFocus={(e) => e.target.select()}
            onChange={(e) => set(Number(e.target.value))}
            style={{ width: `calc(${String(value).length}ch + 0.5ch)` }}
            className="min-w-0 [appearance:textfield] bg-transparent text-center font-mono text-lg text-text-primary focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          {suffix && <span className="pr-1 font-mono text-lg text-text-secondary">{suffix}</span>}
        </div>
        <StepButton label={`Increase ${label}`} onClick={() => set(value + 1)} disabled={value >= max}>
          <Plus size={18} />
        </StepButton>
      </div>
    </label>
  );
}

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex w-11 shrink-0 touch-manipulation items-center justify-center text-text-secondary transition-colors active:bg-surface-elevated disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** A row of big tap targets for a small whole number, labelled inline to
 *  save height. */
function ChoiceRow({
  label,
  choices,
  value,
  onChange,
  tone = "slots",
}: {
  label: string;
  choices: readonly number[];
  value: number;
  onChange: (value: number) => void;
  tone?: "slots" | "focus";
}) {
  return (
    <div className="col-span-2 flex items-center gap-2" role="group" aria-label={label}>
      <span className="w-12 shrink-0 text-xs font-semibold text-text-secondary">{label}</span>
      <div className="flex flex-1 gap-1.5">
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => onChange(choice)}
            aria-pressed={value === choice}
            className={cn(
              "h-11 flex-1 touch-manipulation rounded-md border font-mono text-lg [@media(max-height:640px)]:h-10",
              value !== choice
                ? "border-border-default bg-surface-tertiary text-text-secondary"
                : tone === "focus"
                  ? "border-brand-orange bg-surface-elevated text-brand-orange"
                  : "border-brand-blue bg-surface-elevated text-text-primary",
            )}
          >
            {choice}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-2 py-1.5 [@media(max-height:640px)]:py-1">
      <p className="font-mono text-2xl font-bold text-text-primary sm:text-3xl [@media(max-height:640px)]:text-xl">{value}</p>
      <p className="text-xs text-text-secondary">{label}</p>
    </Card>
  );
}

function Distribution({ rows, slots, target }: { rows: readonly Outcome[]; slots: number; target: number }) {
  return (
    <Card className="flex min-h-0 flex-1 flex-col gap-2 p-3 [@media(max-height:640px)]:gap-1 [@media(max-height:640px)]:p-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2">
        <h2 className="text-sm font-semibold">Every possible roll</h2>
        <div className="flex gap-3 text-xs text-text-secondary">
          <LegendSwatch className="bg-brand-green" label={`${target}+ damage`} />
          <LegendSwatch className="bg-border-hover" label="Short" />
        </div>
      </div>
      <ol className="flex min-h-0 flex-1 flex-col justify-center gap-1 [@media(max-height:640px)]:gap-0.5">
        {rows.toReversed().map((row) => (
          <li
            key={row.successes}
            className="grid min-h-4 max-h-9 flex-1 grid-cols-[5.5rem_1fr_3.5rem] items-center gap-2 text-xs leading-none sm:text-sm"
          >
            <span className="text-text-secondary">
              {row.successes}/{slots} <span className="font-mono text-text-primary">{row.damage > 0 ? `${String(row.damage)} dmg` : "miss"}</span>
            </span>
            <div className="h-full max-h-5 rounded-sm bg-surface-tertiary">
              <div
                className={cn("h-full rounded-sm", row.damage >= target ? "bg-brand-green" : "bg-border-hover")}
                style={{ width: `${row.probability * 100}%` }}
              />
            </div>
            <span className="text-right font-mono text-text-primary">{formatPercent(row.probability)}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("size-3 rounded-sm", className)} />
      {label}
    </span>
  );
}

function formatPercent(probability: number): string {
  const percent = probability * 100;
  if (percent > 0 && percent < 0.1) return "<0.1%";
  if (percent < 100 && percent > 99.9) return ">99.9%";
  return `${percent.toFixed(1)}%`;
}
