"use client";

import { useId, useState } from "react";
import { Info, Minus, Plus, RotateCcw, ShieldOff, Skull, Snowflake, Zap, ZapOff } from "lucide-react";
import { useHydrated } from "@/shared/lib/use-hydrated";
import { cn } from "@/shared/lib/utils";
import { critPercent, MAX_SLOTS, predict, type Prediction } from "../logic";
import { DEFAULT_INPUTS, LIMITS, loadInputs, saveInputs, type Inputs } from "../saved-inputs";

/** Works out the odds of a For The King II attack: the chance it deals at
 *  least each amount of damage, such as an enemy's remaining HP.
 *  Built as a full-screen phone app, checked mid-fight next to the game: it
 *  fits one screen, nothing scrolls, and no tap ever moves the layout. */
export function ForTheStats2() {
  // The inputs are restored from the browser's storage, which the server
  // render can't read, so the calculator waits for the browser.
  const hydrated = useHydrated();
  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col gap-3 overflow-hidden px-4 py-4">
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
  const prediction = predict(counted, inputs.splash ? "splash" : "target");
  const number = (key: keyof typeof LIMITS) => ({
    value: inputs[key],
    onChange: (value: number) => change({ [key]: value }),
    ...LIMITS[key],
  });

  return (
    <>
      <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-2">
        <Stepper label="Min damage" {...number("minDamage")} />
        <Stepper label="Max damage" {...number("maxDamage")} />
        <SlotPicker
          slots={inputs.slots}
          focus={inputs.focus}
          shocked={inputs.shocked}
          onPickSlots={(slots) => change({ slots })}
          onFocus={(focus) => change({ focus })}
          shock={
            <Switch
              on={inputs.shocked}
              onToggle={() => change({ shocked: !inputs.shocked })}
              icon={<ZapOff size={18} />}
              name="Shock"
            />
          }
        />
        <Stepper
          label="Chance"
          note={
            prediction.focusedPercent === inputs.slotPercent ? (
              <span className="text-text-secondary">, no Focus</span>
            ) : (
              <span className="text-brand-orange"> → {prediction.focusedPercent}%</span>
            )
          }
          {...number("slotPercent")}
          suffix="%"
        />
        <Stepper label="Armor / Resist" {...number("armor")} />
        <Stepper
          label="Crit Chance"
          note={inputs.focus > 0 && <span className="text-brand-orange"> → {critPercent(inputs)}%</span>}
          {...number("critChance")}
          suffix="%"
        />
        <Stepper label="Crit Damage" {...number("critDamage")} suffix="%" />
        <div className="col-span-2 grid grid-cols-4 gap-1.5">
          <Switch
            on={inputs.ignoresArmor}
            onToggle={() => change({ ignoresArmor: !inputs.ignoresArmor })}
            icon={<ShieldOff size={18} />}
            name="Pierce"
          />
          <Switch
            on={inputs.poisoned}
            onToggle={() => change({ poisoned: !inputs.poisoned })}
            icon={<Skull size={18} />}
            name="Poison"
          />
          <Switch
            on={inputs.frozen}
            onToggle={() => change({ frozen: !inputs.frozen })}
            icon={<Snowflake size={18} />}
            name="Frozen"
          />
          <button
            type="button"
            aria-label="Reset crit to the base game's"
            onClick={() => change({ critChance: DEFAULT_INPUTS.critChance, critDamage: DEFAULT_INPUTS.critDamage })}
            disabled={inputs.critChance === DEFAULT_INPUTS.critChance && inputs.critDamage === DEFAULT_INPUTS.critDamage}
            className="flex h-11 min-w-0 touch-manipulation flex-col items-center justify-center rounded-md border border-border-default text-base leading-tight text-text-secondary active:bg-surface-elevated disabled:opacity-30"
          >
            <span className="flex items-center gap-1 font-semibold">
              <RotateCcw size={18} />
              Crit
            </span>
          </button>
        </div>
      </div>

      <Distribution
        prediction={prediction}
        slots={inputs.slots}
        splash={inputs.splash}
        onToggleSplash={() => change({ splash: !inputs.splash })}
        notes={<Notes prediction={prediction} />}
      />
    </>
  );
}

/** An on/off switch for the attack or a what-if, named in a word. */
function Switch({
  on,
  onToggle,
  icon,
  name,
}: {
  on: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  name: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        "flex h-11 min-w-0 touch-manipulation flex-col items-center justify-center rounded-md border text-base leading-tight",
        on ? "border-brand-blue bg-surface-elevated text-text-primary" : "border-border-default bg-surface-tertiary text-text-muted",
      )}
    >
      <span className="flex items-center gap-1 font-semibold">
        {icon}
        {name}
      </span>
    </button>
  );
}

/** A number typed on the phone keypad or nudged with −/+, which is quicker
 *  mid-fight than typing. The number box has a fixed width, so nothing moves as
 *  the digits change, and a tap anywhere between the buttons types into it. */
function Stepper({
  label,
  note,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label: string;
  /** Text after the label, styled by the caller. */
  note?: React.ReactNode;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, Math.round(next))));
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold whitespace-nowrap text-text-secondary">
      <label htmlFor={id} className="leading-none">
        {label}
        {note}
      </label>
      <div className="flex h-11.5 items-stretch overflow-hidden rounded-md border border-border-default bg-surface-tertiary focus-within:border-brand-blue">
        <StepButton label={`Decrease ${label}`} onClick={() => set(value - 1)} disabled={value <= min}>
          <Minus size={18} />
        </StepButton>
        <label htmlFor={id} className="flex min-w-0 flex-1 cursor-text items-center justify-center">
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={value}
            onFocus={(e) => e.target.select()}
            onChange={(e) => set(Number(e.target.value))}
            className={cn(
              "w-[3ch] min-w-0 [appearance:textfield] bg-transparent font-mono text-xl text-text-primary focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
              suffix ? "text-right" : "text-center",
            )}
          />
          {suffix && <span className="font-mono text-xl text-text-secondary">{suffix}</span>}
        </label>
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

/** The attack's slots as a row, as the game draws them, under the buttons
 *  that spend Focus: tap a slot to set how many the attack rolls; rolled slots
 *  fill in, focused ones light up, and a shock's failed slot is marked. Six
 *  slots big enough to tap leave no room beside them on a phone, so Focus
 *  sits on the line above, with Shock. Always six wide, so the row never
 *  changes size. */
function SlotPicker({
  slots,
  focus,
  shocked,
  onPickSlots,
  onFocus,
  shock,
}: {
  slots: number;
  focus: number;
  shocked: boolean;
  onPickSlots: (count: number) => void;
  onFocus: (focus: number) => void;
  /** The Shock switch, which fails the first slot. */
  shock: React.ReactNode;
}) {
  return (
    <div className="col-span-2 flex flex-col">
      <div className="flex items-center justify-between text-sm font-semibold text-text-secondary">
        <span className="grid w-20">{shock}</span>
        <span className="flex items-center gap-1.5">
          Focus
          <FocusButton label="Spend less Focus" onClick={() => onFocus(focus - 1)} disabled={focus <= 0}>
            <Minus size={16} />
          </FocusButton>
          <FocusButton label="Spend more Focus" onClick={() => onFocus(focus + 1)} disabled={focus >= slots}>
            <Plus size={16} />
          </FocusButton>
        </span>
      </div>
      <div className="flex" role="group" aria-label="Slots">
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
              className="flex h-11 min-w-11 flex-1 touch-manipulation items-center justify-center"
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
      className="flex h-11 w-20 shrink-0 touch-manipulation items-center justify-center gap-0.5 rounded-md border border-brand-orange text-brand-orange active:bg-surface-elevated disabled:opacity-30"
    >
      {children}
      <Zap size={16} fill="currentColor" />
    </button>
  );
}

/** One row per possible success count, from a perfect roll down to none, with
 *  a crit above them, each with the chance of dealing at least that row's
 *  damage: read the row for the HP an enemy has left. The splash switch shows
 *  the same for each neighbour of a Splash or Swipe. There are always eight
 *  rows, the most an attack can have, so nothing moves as slots change. */
function Distribution({
  prediction,
  slots,
  splash,
  onToggleSplash,
  notes,
}: {
  prediction: Prediction;
  slots: number;
  splash: boolean;
  onToggleSplash: () => void;
  notes: React.ReactNode;
}) {
  const { rows, crit, nothing } = prediction;
  const blanks = MAX_SLOTS + 1 - rows.length;
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2 border-t border-border-default pt-3">
      <div className="flex shrink-0 items-center gap-x-2 whitespace-nowrap">
        <h2 className="flex items-center gap-1.5 text-base font-semibold">
          Deal at least
          <button
            type="button"
            popoverTarget="fts-notes"
            aria-label="How these numbers work"
            className={cn(
              "relative z-10 -m-3.5 touch-manipulation p-3.5",
              prediction.matched ? "text-text-muted" : "text-brand-orange",
            )}
          >
            <Info size={18} />
          </button>
        </h2>
        <button
          type="button"
          aria-pressed={splash}
          onClick={onToggleSplash}
          className="relative z-10 -my-2.5 ml-1 flex h-11 touch-manipulation items-center px-1"
        >
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-sm font-semibold",
              splash ? "border-brand-blue bg-surface-elevated text-text-primary" : "border-border-default text-text-muted",
            )}
          >
            Splash
          </span>
        </button>
        <span className="ml-auto text-sm text-text-secondary">
          avg <span className="font-mono text-text-primary">{prediction.expected.toFixed(1)}</span> dmg
        </span>
      </div>
      <ol className="flex min-h-0 flex-1 flex-col justify-center gap-1">
        <ResultRow
          label="crit"
          damage={crit?.damage ?? null}
          beforeArmor={crit?.beforeArmor ?? null}
          chance={crit?.chance ?? null}
          nothing={null}
          tone="crit"
        />
        {rows.map((row) => (
          <ResultRow
            key={row.successes}
            label={`${String(row.successes)}/${String(slots)}`}
            damage={row.damage}
            beforeArmor={row.beforeArmor}
            chance={row.chance}
            nothing={nothing}
            tone={row.floored ? "floored" : "plain"}
          />
        ))}
        {Array.from({ length: blanks }, (_, index) => (
          <li key={`blank-${String(index)}`} aria-hidden className="max-h-10 min-h-4.5 flex-1" />
        ))}
      </ol>
      {notes}
    </section>
  );
}

/** A row's damage and its chance. No damage is a miss, or blocked when armor
 *  took it all, and a success count's chance is then the chance of dealing
 *  nothing. A row with no damage at all (a crit that can't happen) is a
 *  placeholder. */
function ResultRow({
  label,
  damage,
  beforeArmor,
  chance,
  nothing,
  tone,
}: {
  label: string;
  damage: number | null;
  beforeArmor: number | null;
  chance: number | null;
  /** The chance of dealing nothing, or null where it isn't this row's to show. */
  nothing: number | null;
  tone: "plain" | "floored" | "crit";
}) {
  const none = damage === 0;
  const shown = none ? nothing : chance;
  return (
    <li
      className={cn(
        "grid max-h-10 min-h-4.5 flex-1 grid-cols-[2.5rem_4rem_1fr_3.5rem] items-center gap-2 text-sm leading-none",
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
        {damage === null ? "—" : none ? (beforeArmor === 0 ? "miss" : "blocked") : damage}
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
      <span className="text-right font-mono text-text-primary">
        {shown === null ? "—" : formatPercent(shown, none ? "up" : "down")}
      </span>
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
      className="m-auto w-[min(22rem,calc(100vw-2rem))] space-y-2 rounded-lg border border-border-hover bg-surface-elevated p-4 text-base text-text-secondary backdrop:bg-surface-primary/70"
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
      <p>Splash: what each neighbour of a Splash or Swipe takes, if its armor is the same.</p>
      <p>Already poisoned or frozen? Leave the switch off: the screen counts it. The switches assume no bonus damage against this creature.</p>
      <p>Crit stats: your sheet&apos;s Modifiers. No Crit Damage listed? Enter 0.</p>
    </div>
  );
}

/** A probability as a percent to one decimal, rounded the cautious way: a
 *  chance of dealing damage down, a chance of dealing none up. */
function formatPercent(probability: number, rounding: "up" | "down"): string {
  const percent = probability * 100;
  if (percent > 0 && percent < 0.1) return "<0.1%";
  if (percent < 100 && percent > 99.9) return ">99.9%";
  // The binomial sums can land a hair off a whole tenth in floating point.
  const tenths = percent * 10;
  const rounded = rounding === "down" ? Math.floor(tenths + 1e-9) : Math.ceil(tenths - 1e-9);
  return `${(rounded / 10).toFixed(1)}%`;
}
