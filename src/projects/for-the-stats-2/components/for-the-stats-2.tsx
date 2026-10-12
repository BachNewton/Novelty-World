"use client";

import { useId, useState } from "react";
import { Info, Minus, Plus, RotateCcw, ShieldOff, Skull, Snowflake, Zap, ZapOff } from "lucide-react";
import { Card } from "@/shared/components/ui/card";
import { useHydrated } from "@/shared/lib/use-hydrated";
import { cn } from "@/shared/lib/utils";
import { critPercent, MAX_SLOT_PERCENT, predict, type Prediction } from "../logic";
import { DEFAULT_INPUTS, loadInputs, saveInputs, type Inputs } from "../saved-inputs";

const MAX_SLOTS = 6;
const MAX_DAMAGE = 999;

/** Works out the odds of a For The King II attack: the chance it deals at
 *  least each amount of damage, such as an enemy's remaining HP.
 *  Built as a full-screen phone app, checked mid-fight next to the game: it
 *  fits one screen, nothing scrolls, and no tap ever moves the layout. */
export function ForTheStats2() {
  // The inputs are restored from the browser's storage, which the server
  // render can't read, so the calculator waits for the browser.
  const hydrated = useHydrated();
  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col gap-2 overflow-hidden px-4 py-3 sm:gap-4 sm:py-6 [@media(max-height:640px)]:gap-1.5 [@media(max-height:640px)]:py-2">
      <h1 className="sr-only">For The Stats 2</h1>
      {hydrated && <Calculator />}
    </div>
  );
}

/** The inputs and the results. Every change is saved, so closing the tab or
 *  the app picks up where the player left off. */
function Calculator() {
  const [inputs, setInputs] = useState(loadInputs);
  const change = (patch: Partial<Inputs>) => {
    const next = { ...inputs, ...patch };
    next.focus = Math.min(next.focus, next.slots);
    setInputs(next);
    saveInputs(next);
  };
  // The max can be typed below the min on the way to a new range.
  const counted = { ...inputs, maxDamage: Math.max(inputs.minDamage, inputs.maxDamage) };
  const prediction = predict(counted);

  return (
    <>
      <Card className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-2 p-3 [@media(max-height:640px)]:gap-y-1.5 [@media(max-height:640px)]:p-2">
        <Stepper
          label="Min damage"
          value={inputs.minDamage}
          onChange={(minDamage) => change({ minDamage })}
          max={MAX_DAMAGE}
        />
        <Stepper
          label="Max damage"
          value={inputs.maxDamage}
          onChange={(maxDamage) => change({ maxDamage })}
          max={MAX_DAMAGE}
        />
        <SlotPicker
          slots={inputs.slots}
          focus={inputs.focus}
          shocked={inputs.shocked}
          onPickSlots={(slots) => change({ slots })}
          onFocus={(focus) => change({ focus })}
        />
        <Stepper
          label="Chance, no Focus"
          note={prediction.rolledPercent === inputs.slotPercent ? undefined : `→ ${String(prediction.rolledPercent)}%`}
          value={inputs.slotPercent}
          onChange={(slotPercent) => change({ slotPercent })}
          max={MAX_SLOT_PERCENT}
          suffix="%"
        />
        <Stepper label="Armor / Resist" value={inputs.armor} onChange={(armor) => change({ armor })} max={MAX_DAMAGE} />
        <Stepper
          label="Crit Chance"
          note={inputs.focus > 0 ? `→ ${String(critPercent(inputs))}%` : undefined}
          value={inputs.critChance}
          onChange={(critChance) => change({ critChance })}
          max={100}
          suffix="%"
          tall
        />
        <Stepper
          label="Crit Damage"
          value={inputs.critDamage}
          onChange={(critDamage) => change({ critDamage })}
          max={MAX_DAMAGE}
          suffix="%"
          tall
          action={
            <button
              type="button"
              aria-label="Reset crit to the base game's"
              onClick={() => change({ critChance: DEFAULT_INPUTS.critChance, critDamage: DEFAULT_INPUTS.critDamage })}
              disabled={
                inputs.critChance === DEFAULT_INPUTS.critChance && inputs.critDamage === DEFAULT_INPUTS.critDamage
              }
              className="flex size-11 touch-manipulation items-center justify-center text-text-muted disabled:opacity-30"
            >
              <RotateCcw size={14} />
            </button>
          }
        />
        <div className="col-span-2 grid grid-cols-4 gap-1.5">
          <Switch
            on={inputs.ignoresArmor}
            onToggle={() => change({ ignoresArmor: !inputs.ignoresArmor })}
            icon={<ShieldOff size={14} />}
            name="Pierce"
            detail="perfect"
          />
          <Switch
            on={inputs.shocked}
            onToggle={() => change({ shocked: !inputs.shocked })}
            icon={<ZapOff size={14} />}
            name="Shock"
            detail="you"
          />
          <Switch
            on={inputs.poisoned}
            onToggle={() => change({ poisoned: !inputs.poisoned })}
            icon={<Skull size={14} />}
            name="Poison"
            detail="you"
          />
          <Switch
            on={inputs.frozen}
            onToggle={() => change({ frozen: !inputs.frozen })}
            icon={<Snowflake size={14} />}
            name="Frozen"
            detail="target"
          />
        </div>
      </Card>

      <Distribution
        prediction={prediction}
        slots={inputs.slots}
        notes={<Notes prediction={prediction} />}
      />
    </>
  );
}

/** An on/off switch for the attack or a what-if, named in two short lines so
 *  four fit across a phone. */
function Switch({
  on,
  onToggle,
  icon,
  name,
  detail,
}: {
  on: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  name: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        "flex h-11 min-w-0 touch-manipulation flex-col items-center justify-center rounded-md border text-xs leading-tight",
        on ? "border-brand-blue bg-surface-elevated text-text-primary" : "border-border-default bg-surface-tertiary text-text-muted",
      )}
    >
      <span className="flex items-center gap-1 font-semibold">
        {icon}
        {name}
      </span>
      <span className={cn("truncate", on ? "text-text-secondary" : "text-text-muted")}>{detail}</span>
    </button>
  );
}

/** A number typed on the phone keypad or nudged with −/+, which is quicker
 *  mid-fight than typing. The number box has a fixed width, so nothing moves as
 *  the digits change. */
function Stepper({
  label,
  note,
  action,
  tall = false,
  value,
  onChange,
  max,
  suffix,
}: {
  label: string;
  note?: string;
  /** A button at the end of the label's line, which then needs `tall`. */
  action?: React.ReactNode;
  /** A label line tall enough for a full-size button, kept on both steppers
   *  of a row so their boxes line up. */
  tall?: boolean;
  value: number;
  onChange: (value: number) => void;
  max: number;
  suffix?: string;
}) {
  const set = (next: number) => onChange(Math.min(max, Math.max(0, Math.round(next))));
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs font-semibold whitespace-nowrap text-text-secondary">
      <span className={cn("flex items-center justify-between", tall && "-mr-3 h-11 items-end")}>
        <label htmlFor={id} className="flex-1">
          {label} {note && <span className="text-brand-orange">{note}</span>}
        </label>
        {action}
      </span>
      <div className="flex h-12 items-stretch overflow-hidden rounded-md border border-border-default bg-surface-tertiary focus-within:border-brand-blue">
        <StepButton label={`Decrease ${label}`} onClick={() => set(value - 1)} disabled={value <= 0}>
          <Minus size={18} />
        </StepButton>
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <input
            id={id}
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
    </div>
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
 *  fill in, focused ones light up, and a shock's failed slot is marked. Always
 *  six wide, so the row never changes size. */
function SlotPicker({
  slots,
  focus,
  shocked,
  onPickSlots,
  onFocus,
}: {
  slots: number;
  focus: number;
  shocked: boolean;
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
          const state =
            index < focus
              ? "focused"
              : shocked && focus === 0 && index === 0
                ? "shocked"
                : index < slots
                  ? "rolled"
                  : "unused";
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
                  state === "shocked" && "border-brand-pink bg-brand-pink/25 text-brand-pink",
                  state === "unused" && "border-dashed border-border-hover",
                )}
              >
                {state === "focused" && <Zap size={16} fill="currentColor" />}
                {state === "shocked" && <ZapOff size={16} />}
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

/** One row per possible success count, from a perfect roll down to none, with
 *  a crit above them, each with the chance of dealing at least that row's
 *  damage: read the row for the HP an enemy has left. There are always eight
 *  rows, the most an attack can have, so nothing moves as slots change. */
function Distribution({ prediction, slots, notes }: { prediction: Prediction; slots: number; notes: React.ReactNode }) {
  const { rows, crit, nothing } = prediction;
  const blanks = MAX_SLOTS + 1 - rows.length;
  return (
    <Card className="flex min-h-0 flex-1 flex-col gap-2 p-3 [@media(max-height:640px)]:gap-1 [@media(max-height:640px)]:p-2">
      <div className="flex shrink-0 items-center justify-between gap-x-2 whitespace-nowrap">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          Chance to deal at least
          <button
            type="button"
            popoverTarget="fts-notes"
            aria-label="How these numbers work"
            className={cn(
              "-m-3.5 touch-manipulation p-3.5",
              prediction.matched ? "text-text-muted" : "text-brand-orange",
            )}
          >
            <Info size={16} />
          </button>
        </h2>
        <span className="text-xs text-text-secondary">
          avg <span className="font-mono text-text-primary">{prediction.expected.toFixed(1)}</span> dmg
        </span>
      </div>
      <ol className="flex min-h-0 flex-1 flex-col justify-center gap-1 [@media(max-height:640px)]:gap-0.5">
        <ResultRow
          label="crit"
          damage={crit?.damage ?? null}
          rolled={crit?.damage ?? null}
          chance={crit?.chance ?? null}
          nothing={nothing}
          tone="crit"
        />
        {rows.map((row) => (
          <ResultRow
            key={row.successes}
            label={`${String(row.successes)}/${String(slots)}`}
            damage={row.damage}
            rolled={row.rolled}
            chance={row.chance}
            nothing={nothing}
            tone={row.floored ? "floored" : "plain"}
          />
        ))}
        {Array.from({ length: blanks }, (_, index) => (
          <li key={`blank-${String(index)}`} aria-hidden className="max-h-10 min-h-4 flex-1" />
        ))}
      </ol>
      {notes}
    </Card>
  );
}

/** A row's damage and its chance. No damage is a miss, or blocked when armor
 *  took it all, and its chance is then the chance of dealing nothing. A row
 *  with no damage at all (a crit that can't happen) is a placeholder. */
function ResultRow({
  label,
  damage,
  rolled,
  chance,
  nothing,
  tone,
}: {
  label: string;
  damage: number | null;
  rolled: number | null;
  chance: number | null;
  nothing: number;
  tone: "plain" | "floored" | "crit";
}) {
  const none = damage === 0;
  const shown = none ? nothing : chance;
  return (
    <li
      className={cn(
        "grid max-h-10 min-h-4 flex-1 grid-cols-[2.5rem_4rem_1fr_3.5rem] items-center gap-2 text-xs leading-none sm:text-sm",
        damage === null && "opacity-30",
      )}
    >
      <span className={cn("whitespace-nowrap", tone === "crit" ? "font-semibold text-brand-orange" : "text-text-muted")}>
        {label}
      </span>
      <span
        className={cn(
          "font-mono font-bold whitespace-nowrap",
          none
            ? "text-brand-pink"
            : tone === "floored"
              ? "text-brand-green"
              : tone === "crit"
                ? "text-brand-orange"
                : "text-text-primary",
        )}
      >
        {damage === null ? "—" : none ? (rolled === 0 ? "miss" : "blocked") : damage}
      </span>
      <div className="h-full max-h-5 rounded-sm bg-surface-tertiary">
        {shown !== null && (
          <div
            className={cn(
              "h-full rounded-sm",
              none ? "bg-brand-pink" : tone === "crit" ? "bg-brand-orange" : "bg-brand-blue",
            )}
            style={{ width: `${String(shown * 100)}%` }}
          />
        )}
      </div>
      <span className="text-right font-mono text-text-primary">{shown === null ? "—" : formatPercent(shown)}</span>
    </li>
  );
}

/** How to read the numbers, in a popover so it costs no room on screen: a
 *  few short lines, the ones that apply to these inputs. */
function Notes({ prediction }: { prediction: Prediction }) {
  return (
    <div
      id="fts-notes"
      popover="auto"
      className="m-auto w-[min(22rem,calc(100vw-2rem))] space-y-2 rounded-lg border border-border-hover bg-surface-elevated p-4 text-sm text-text-secondary backdrop:bg-surface-primary/70"
    >
      <p>Each row: the chance to deal at least that much.</p>
      {!prediction.matched && (
        <p className="font-semibold text-brand-orange">No attack in the game has this range at this chance. Check it.</p>
      )}
      {prediction.rows.some((row) => row.floored) && (
        <p>
          <span className="font-semibold text-brand-green">Green</span>: the game lifts weak rolls above the min.
        </p>
      )}
      <p>Already poisoned or frozen? Leave the switch off: the screen counts it.</p>
      <p>Crit stats: your sheet&apos;s Modifiers. No Crit Damage listed? Enter 0.</p>
    </div>
  );
}

function formatPercent(probability: number): string {
  const percent = probability * 100;
  if (percent > 0 && percent < 0.1) return "<0.1%";
  if (percent < 100 && percent > 99.9) return ">99.9%";
  return `${percent.toFixed(1)}%`;
}
