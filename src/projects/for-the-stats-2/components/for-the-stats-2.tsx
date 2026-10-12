"use client";

import { useState } from "react";
import { Crown, Info, Minus, Plus, Zap } from "lucide-react";
import { Card } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import {
  chanceOfAtLeast,
  damageForSuccesses,
  expectedDamage,
  floorPercent,
  floorRaises,
  focusBonus,
  MAX_SLOT_PERCENT,
  outcomes,
  type Attack,
} from "../logic";

const MAX_SLOTS = 6;
const MAX_DAMAGE = 999;

/** Works out the odds of a For The King II attack: its expected damage and the
 *  chance it deals at least a target amount, such as an enemy's remaining HP.
 *  Built as a full-screen phone app, checked mid-fight next to the game: it
 *  fits one screen, nothing scrolls, and no tap ever moves the layout. */
export function ForTheStats2() {
  const [minDamage, setMinDamage] = useState(4);
  const [maxDamage, setMaxDamage] = useState(11);
  const [slots, setSlots] = useState(3);
  const [slotPercent, setSlotPercent] = useState(80);
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
          <p className="text-xs leading-tight text-text-secondary sm:text-sm [@media(max-height:640px)]:hidden">
            Binomial distributions for people who just wanted to hit the goblin
          </p>
        </div>
      </header>

      <Card className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-2 p-3 [@media(max-height:640px)]:gap-y-1.5 [@media(max-height:640px)]:p-2">
        <Stepper label="Min damage" value={minDamage} onChange={setMinDamage} max={MAX_DAMAGE} />
        <Stepper label="Max damage" value={maxDamage} onChange={setMaxDamage} max={MAX_DAMAGE} />
        <SlotPicker slots={slots} focus={focus} onPickSlots={pickSlots} onFocus={setFocus} />
        <Stepper
          label="Chance, no Focus"
          note={focus > 0 ? `+${String(focusBonus(focus))}%` : undefined}
          value={slotPercent}
          onChange={setSlotPercent}
          max={MAX_SLOT_PERCENT}
          suffix="%"
        />
        <div className="flex h-12 flex-col items-center justify-center self-end rounded-md bg-surface-tertiary leading-none">
          <span className="font-mono text-lg font-bold text-text-primary">{expectedDamage(attack).toFixed(1)}</span>
          <span className="text-xs text-text-secondary">avg dmg</span>
        </div>
      </Card>

      <Distribution attack={attack} />
    </div>
  );
}

/** A number typed on the phone keypad or nudged with −/+, which is quicker
 *  mid-fight than typing. The number box has a fixed width, so nothing moves as
 *  the digits change. */
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
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold whitespace-nowrap text-text-secondary">
      <span>
        {label} {note && <span className="text-brand-orange">{note}</span>}
      </span>
      <div className="flex h-12 items-stretch overflow-hidden rounded-md border border-border-default bg-surface-tertiary focus-within:border-brand-blue">
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
            className={cn(
              "w-[3ch] min-w-0 [appearance:textfield] bg-transparent font-mono text-lg text-text-primary focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
              suffix ? "text-right" : "text-center",
            )}
          />
          {suffix && <span className="font-mono text-lg text-text-secondary">{suffix}</span>}
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
      className="flex w-11 shrink-0 touch-manipulation items-center justify-center text-text-secondary active:bg-surface-elevated disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** The attack's slots as a row, as the game draws them, between the buttons
 *  that spend Focus: tap a slot to set how many the attack rolls; rolled slots
 *  fill in and focused ones light up. Always six wide, so the row never
 *  changes size. */
function SlotPicker({
  slots,
  focus,
  onPickSlots,
  onFocus,
}: {
  slots: number;
  focus: number;
  onPickSlots: (count: number) => void;
  onFocus: (focus: number) => void;
}) {
  return (
    <div className="col-span-2 flex items-center gap-1">
      <FocusButton label="Spend less Focus" onClick={() => onFocus(focus - 1)} disabled={focus <= 0}>
        <Minus size={16} />
      </FocusButton>
      <div className="flex min-w-0 flex-1" role="group" aria-label="Slots">
        {Array.from({ length: MAX_SLOTS }, (_, index) => {
          const count = index + 1;
          const state = index < focus ? "focused" : index < slots ? "rolled" : "unused";
          return (
            <button
              key={count}
              type="button"
              onClick={() => onPickSlots(count)}
              aria-label={`${String(count)} slot${count === 1 ? "" : "s"}`}
              aria-pressed={slots === count}
              className="flex h-11 min-w-0 flex-1 touch-manipulation items-center justify-center"
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border-2",
                  state === "focused" && "border-brand-orange bg-brand-orange text-surface-primary",
                  state === "rolled" && "border-brand-blue bg-brand-blue/25",
                  state === "unused" && "border-dashed border-border-hover",
                )}
              >
                {state === "focused" && <Zap size={16} fill="currentColor" />}
              </span>
            </button>
          );
        })}
      </div>
      <FocusButton label="Spend more Focus" onClick={() => onFocus(focus + 1)} disabled={focus >= slots}>
        <Plus size={16} />
      </FocusButton>
    </div>
  );
}

function FocusButton({
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
      className="flex size-11 shrink-0 touch-manipulation items-center justify-center gap-0.5 rounded-md border border-brand-orange text-brand-orange active:bg-surface-elevated disabled:opacity-30"
    >
      {children}
      <Zap size={14} fill="currentColor" />
    </button>
  );
}

/** One row per possible success count, from a perfect roll down to none, each
 *  with the chance of dealing at least that row's damage: read the row for the
 *  HP an enemy has left. There are always seven rows, the most an attack can
 *  have, so they keep their place as slots change. */
function Distribution({ attack }: { attack: Attack }) {
  const rows = Array.from({ length: MAX_SLOTS + 1 }, (_, index) => MAX_SLOTS - index);
  return (
    <Card className="flex min-h-0 flex-1 flex-col gap-2 p-3 [@media(max-height:640px)]:gap-1 [@media(max-height:640px)]:p-2">
      <div className="flex shrink-0 items-baseline justify-between gap-x-2 whitespace-nowrap">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          Chance to deal at least
          <button
            type="button"
            popoverTarget="fts-notes"
            aria-label="How these numbers work"
            className="-m-3.5 touch-manipulation p-3.5 text-text-muted"
          >
            <Info size={16} />
          </button>
        </h2>
      </div>
      <ol className="flex min-h-0 flex-1 flex-col justify-center gap-1 [@media(max-height:640px)]:gap-0.5">
        {rows.map((successes) => {
          if (successes > attack.slots) return <li key={successes} aria-hidden className="max-h-10 min-h-4 flex-1" />;
          const damage = damageForSuccesses(attack, successes);
          const miss = damage === 0;
          const chance = miss ? (outcomes(attack).find((o) => o.successes === 0)?.probability ?? 0) : chanceOfAtLeast(attack, damage);
          return (
            <li
              key={successes}
              className="grid max-h-10 min-h-4 flex-1 grid-cols-[2.5rem_3.5rem_1fr_3.5rem] items-center gap-2 text-xs leading-none sm:text-sm"
            >
              <span className="whitespace-nowrap text-text-muted">
                {successes}/{attack.slots}
              </span>
              <span
                className={cn(
                  "font-mono font-bold whitespace-nowrap",
                  miss ? "text-brand-pink" : floorRaises(attack, successes) ? "text-brand-green" : "text-text-primary",
                )}
              >
                {miss ? "miss" : damage}
              </span>
              <div className="h-full max-h-5 rounded-sm bg-surface-tertiary">
                <div
                  className={cn("h-full rounded-sm", miss ? "bg-brand-pink" : "bg-brand-blue")}
                  style={{ width: `${String(chance * 100)}%` }}
                />
              </div>
              <span className="text-right font-mono text-text-primary">{formatPercent(chance)}</span>
            </li>
          );
        })}
      </ol>
      <Notes attack={attack} />
    </Card>
  );
}

/** How to read the numbers, in a popover so it costs no room on screen. What
 *  it says about the floor depends on the range entered. */
function Notes({ attack }: { attack: Attack }) {
  const floored = Array.from({ length: attack.slots + 1 }, (_, hits) => hits).some((hits) => floorRaises(attack, hits));
  return (
    <div
      id="fts-notes"
      popover="auto"
      className="m-auto w-[min(22rem,calc(100vw-2rem))] space-y-2 rounded-lg border border-border-hover bg-surface-elevated p-4 text-sm text-text-secondary backdrop:bg-surface-primary/70"
    >
      <p>Each row is the chance this attack deals at least that much damage. Read the row for the HP the enemy has left.</p>
      {floored && (
        <p>
          <span className="font-semibold text-brand-green">Green damage</span> is raised by the game: a range above 0
          counts every roll as at least {floorPercent(attack)}% of the way from min to max (half your chance before Focus),
          so weak rolls deal more than the shown min.
        </p>
      )}
      {attack.minDamage === 0 && <p>A range from 0 misses when every slot fails.</p>}
      <p className="text-text-muted">Before crits and armor.</p>
    </div>
  );
}

function formatPercent(probability: number): string {
  const percent = probability * 100;
  if (percent > 0 && percent < 0.1) return "<0.1%";
  if (percent < 100 && percent > 99.9) return ">99.9%";
  return `${percent.toFixed(1)}%`;
}
