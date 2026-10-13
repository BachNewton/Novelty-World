"use client";

import { useState } from "react";
import type { RuleNotes } from "../../data/rule-notes";
import type { GameView, RuleView } from "../../engine/view";
import { ENGINE } from "../../game";
import type { InputKind } from "../../input/controls";
import { cardMood, consequence } from "../../play/cards";
import type { PanelChoice } from "../../play/choices";
import { DAMAGE_TRAITS, damageTracks, evenStop, landsAs, splitOf, splitStops, type DamageKind } from "../../play/damage";
import { rerollCards, rerollChoice, rollMeaning, rollOffers, rollShown, type RollParams } from "../../play/dice";
import type { BoxPart } from "../../play/panels";
import type { Action, FigureId, Json } from "../../types";
import { CardFace } from "./card-face";
import { SplitControl } from "./damage-split";
import { MOOD_EDGE } from "./moods";
import { TrackRow } from "./trait-track";
import { DamageAmount, DiceFaces, RollResult, TraitValue, Verdict } from "./roll-result";
import { DamageIcon, DieFace } from "../icons";
import { RollTable } from "./roll-table";
import { rowFor } from "../../engine/effects";
import { rangeText } from "../../engine/describe";
import { optionRolls, percentText, printedOrder } from "../../play/roll-table";

/*
 * The status box's part for a decision that isn't a place or the turn: a
 * roll (its table with each row's odds, then its dice, total and the row it
 * landed on, with the cards that can act on it offered where they apply), damage (its stat tracks, with where it would
 * land, split on one control between them), or any other question (its choices, under the card that asks it).
 */

export interface DecisionPartProps {
  part: Exclude<BoxPart, "turn" | "ghost" | "debug">;
  view: GameView;
  /** The decision's choices, each with the action that answers it. */
  panel: PanelChoice[];
  act: (action: Action) => void;
  input: InputKind;
  notes: RuleNotes | null;
}

const CHOICE = "min-h-11 rounded border border-(--bt-line) bg-(--bt-room) px-3 py-1.5 text-left text-sm hover:border-(--bt-accent) disabled:opacity-50 disabled:hover:border-(--bt-line)";

export function DecisionPart(props: DecisionPartProps) {
  const pending = props.view.pending;
  if (pending?.type !== "decision" || pending.detail === null) throw new Error("A decision part with no decision put to the holder");
  // Keyed by the decision, so what was picked or previewed for one never carries to the next.
  switch (props.part) {
    case "roll":
      return <RollPart key={pending.id} {...props} params={pending.detail.params as unknown as RollParams} after={pending.kind === "roll-after"} />;
    case "damage":
      return <DamagePart key={pending.id} {...props} kind={pending.kind} params={pending.detail.params} />;
    case "choices":
      return <ChoicesPart {...props} rule={pending.rule} />;
  }
}

const DIE = "inline-flex shrink-0 rounded-md text-(--bt-ink)";

/** The dice of a roll as their faces; pickable, as toggles, when a card can reroll some of them. */
function DiceRow({ dice, picked, pick }: { dice: number[]; picked: ReadonlySet<number> | null; pick: (index: number) => void }) {
  if (picked === null) return <DiceFaces dice={dice} />;
  return (
    <span aria-label="Dice" className="inline-flex flex-wrap gap-1">
      {dice.map((value, index) => (
        <button
          key={index}
          type="button"
          aria-label={`A die showing ${value}`}
          aria-pressed={picked.has(index)}
          onClick={() => {
            pick(index);
          }}
          className={`${DIE} min-h-11 min-w-11 items-center justify-center border-2 border-transparent aria-pressed:border-(--bt-accent) aria-pressed:text-(--bt-accent)`}
        >
          <DieFace value={value} className="size-9" />
        </button>
      ))}
    </span>
  );
}

/** A card offered where it applies: what using it does, and its cost in a line, in its colour. */
function Offer({ choice, card, act, notes }: { choice: PanelChoice; card: string; act: (action: Action) => void; notes: RuleNotes | null }) {
  const line = notes === null ? null : consequence(notes, card);
  return (
    <button
      type="button"
      onClick={() => {
        act(choice.action);
      }}
      className={`${CHOICE} ${MOOD_EDGE[cardMood(ENGINE, card)]}`}
    >
      {choice.label}
      {line !== null && <span className="block text-xs text-(--bt-muted)">{line}</span>}
    </button>
  );
}

/** A card whose uses differ only by the number they name: one offer, its
 *  consequence said once, opening a row of the numbers, each previewing what
 *  it would mean (a pass or fail, the damage). */
function PickOffer({ card, picks, act, notes, preview, aim, setAim }: { card: string; picks: { value: number; choice: PanelChoice }[]; act: (action: Action) => void; notes: RuleNotes | null; preview: (value: number) => ReturnType<typeof rollMeaning>; aim: number | null; setAim: (value: number | null) => void }) {
  const [open, setOpen] = useState(false);
  const line = notes === null ? null : consequence(notes, card);
  const name = ENGINE.catalog.cards[card].name;
  const aimed = aim === null ? null : preview(aim);
  return (
    <div className="flex basis-full flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setAim(null);
        }}
        className={`${CHOICE} ${MOOD_EDGE[cardMood(ENGINE, card)]}`}
      >
        Use {name}: pick the result
        {line !== null && <span className="block text-xs text-(--bt-muted)">{line}</span>}
      </button>
      {open && (
        <div role="group" aria-label={`${name}: the result`} className="flex gap-1">
          {picks.map(({ value, choice }) => {
            const meaning = preview(value);
            return (
              <button
                key={choice.id}
                type="button"
                aria-label={choice.label}
                onClick={() => {
                  act(choice.action);
                }}
                onFocus={() => {
                  setAim(value);
                }}
                onMouseEnter={() => {
                  setAim(value);
                }}
                className="inline-flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center rounded border border-(--bt-line) bg-(--bt-room) py-0.5 hover:border-(--bt-accent) focus-visible:border-(--bt-accent)"
              >
                <span className="text-base leading-none font-bold">{value}</span>
                {meaning.verdict !== null && <Verdict verdict={meaning.verdict} target={null} />}
                {meaning.damage && <DamageAmount kind={meaning.damage.kind} amount={meaning.damage.amount} />}
              </button>
            );
          })}
        </div>
      )}
      {open && aimed?.note != null && <p className="text-xs text-(--bt-muted)">{aimed.note}</p>}
    </div>
  );
}

const cardOf = (choice: Json): string | null => (typeof choice === "object" && choice !== null && !Array.isArray(choice) && typeof choice.card === "string" ? choice.card : null);

function RollPart({ view, panel, act, notes, params, after }: DecisionPartProps & { params: RollParams; after: boolean }) {
  const shown = rollShown(view, params, after);
  /** The number pointed at in a picker, whose row of the table lights as a preview. */
  const [aim, setAim] = useState<number | null>(null);
  const table = shown.table;
  const lit = table === null ? null : aim !== null ? rowFor(table.rows, aim + params.bonus) : table.lit;
  const cards = after ? rerollCards(panel) : [];
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const keep = panel.find((choice) => cardOf(choice.choice) === null);
  const pickedFaces = shown.dice ? [...picked].map((index) => shown.dice?.[index] ?? 0) : [];

  return (
    <div aria-label="The roll" className="flex flex-col gap-2 rounded border border-(--bt-line) bg-(--bt-bg) px-2 py-2">
      <p className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="font-semibold">{shown.name}</span>
        {shown.trait && <TraitValue trait={shown.trait.trait} value={shown.trait.value} />}
        <span aria-label={`${shown.pool} ${shown.pool === 1 ? "die" : "dice"}`} className="inline-flex items-center gap-0.5">
          <DieFace value={0} className="size-4" />×{shown.pool}
        </span>
        {shown.total === null && (
          <>
            <Verdict verdict={null} target={shown.target} />
            {shown.damage && <DamageAmount kind={shown.damage.kind} amount={null} />}
            {shown.note !== null && <span className="text-xs text-(--bt-muted)">{shown.note}</span>}
          </>
        )}
      </p>
      {table && <RollTable rows={table.rows} odds={shown.total === null ? table.odds : null} lit={lit} />}
      {shown.total !== null && (
        <div aria-label="Result" className="flex flex-wrap items-center gap-1.5">
          {shown.dice && (
            <DiceRow
              dice={shown.dice}
              picked={cards.length > 0 ? picked : null}
              pick={(index) => {
                const next = new Set(picked);
                if (!next.delete(index)) next.add(index);
                setPicked(next);
              }}
            />
          )}
          <RollResult dice={null} bonus={shown.bonus} total={shown.total} meaning={shown} />
        </div>
      )}
      {cards.length > 0 && <p className="text-xs text-(--bt-muted)">Pick dice to reroll, then the card.</p>}
      <div className="flex flex-wrap gap-2">
        {keep && (
          <button
            type="button"
            onClick={() => {
              act(keep.action);
            }}
            className={CHOICE}
          >
            {after ? keep.label : "Roll"}
          </button>
        )}
        {after
          ? cards.map((card) => {
              const choice = rerollChoice(panel, card, pickedFaces);
              const name = ENGINE.catalog.cards[card].name;
              const dice = picked.size === 1 ? "the picked die" : `the ${picked.size} picked dice`;
              const line = notes === null ? null : consequence(notes, card);
              return (
                <button
                  key={card}
                  type="button"
                  disabled={choice === null}
                  onClick={() => {
                    if (choice) act(choice.action);
                  }}
                  className={`${CHOICE} ${MOOD_EDGE[cardMood(ENGINE, card)]}`}
                >
                  {picked.size === 0 ? `${name}: pick dice to reroll` : `Use ${name}: reroll ${dice}`}
                  {line !== null && <span className="block text-xs text-(--bt-muted)">{line}</span>}
                </button>
              );
            })
          : rollOffers(panel).map((offer) =>
              offer.picks === null ? (
                <Offer key={offer.card} choice={offer.choice} card={offer.card} act={act} notes={notes} />
              ) : (
                <PickOffer key={offer.card} card={offer.card} picks={offer.picks} act={act} notes={notes} preview={(value) => rollMeaning(view, params, value + params.bonus)} aim={aim} setAim={setAim} />
              ),
            )}
      </div>
    </div>
  );
}

/** A kind to take damage as, in icons: as it is, or as the other kind and the card that turns it. */
function DamageKindChoice({ choice, damage, label }: { choice: Json; damage: DamageKind; label: string }) {
  const card = typeof choice === "string" ? choice : null;
  return (
    <span aria-label={label} className="inline-flex items-center gap-1">
      {card !== null && <span>{ENGINE.catalog.cards[card].name}:</span>}
      <DamageIcon kind={landsAs(damage, choice)} className="size-5" />
    </span>
  );
}

interface DamageParams {
  figure: FigureId;
  damage: DamageKind;
}

function DamagePart(props: DecisionPartProps & { kind: string; params: Json }) {
  // Before its choices appear (the beats leading to it still playing), a split shows its tracks as they are.
  return props.kind === "split-damage" && props.panel.length > 0 ? <SplitPart {...props} /> : <DamageKindPart {...props} />;
}

/** Damage to split: its two tracks with one control between them, the tracks showing where the split on it would leave each clip. */
function SplitPart({ view, panel, act, input, params }: DecisionPartProps & { params: Json }) {
  const p = params as unknown as DamageParams & { amount: number };
  const stops = splitStops(p.damage, panel.map((choice) => choice.choice));
  const [at, setAt] = useState(() => evenStop(stops, p.amount));
  const chosen = panel[stops[at].choice];
  const [first, second] = damageTracks(ENGINE, view, p.figure, p.damage, splitOf(chosen.choice));
  const [onFirst, onSecond] = DAMAGE_TRAITS[p.damage];

  return (
    <div aria-label="Damage" className="flex flex-col gap-2 rounded border border-(--bt-line) bg-(--bt-bg) px-2 py-2">
      <p className="text-sm">
        <DamageAmount kind={p.damage} amount={p.amount} />
      </p>
      <TrackRow track={first} />
      <SplitControl
        traits={[onFirst, onSecond]}
        points={p.amount}
        stops={stops}
        at={at}
        move={setAt}
        take={() => {
          act(chosen.action);
        }}
        label={chosen.label}
        input={input}
      />
      <TrackRow track={second} />
      <button
        type="button"
        onClick={() => {
          act(chosen.action);
        }}
        className={`${CHOICE} text-center`}
      >
        {chosen.label}
      </button>
    </div>
  );
}

/** Damage with its kinds to take it as, each previewing the tracks it lands on (or a split, before its choices appear). */
function DamageKindPart({ view, panel, act, input, params }: DecisionPartProps & { params: Json }) {
  const p = params as unknown as DamageParams & { points?: number; amount?: number };
  const [selected, setSelected] = useState<string | null>(null);
  const focused = panel.find((choice) => choice.id === selected) ?? null;
  const lands = focused === null ? p.damage : landsAs(p.damage, focused.choice);
  const tracks = damageTracks(ENGINE, view, p.figure, lands, null);

  return (
    <div aria-label="Damage" className="flex flex-col gap-2 rounded border border-(--bt-line) bg-(--bt-bg) px-2 py-2">
      <p className="text-sm">
        <DamageAmount kind={lands} amount={p.points ?? p.amount ?? 0} />
      </p>
      {tracks.map((track) => (
        <TrackRow key={track.trait} track={track} />
      ))}
      <div className="flex flex-wrap gap-2">
        {panel.map((choice) => {
          // A card that turns the damage is offered by its id.
          const card = typeof choice.choice === "string" ? choice.choice : null;
          return (
            <button
              key={choice.id}
              type="button"
              aria-pressed={choice.id === selected}
              onMouseEnter={() => {
                setSelected(choice.id);
              }}
              onFocus={() => {
                setSelected(choice.id);
              }}
              onClick={() => {
                // Touch previews on the first tap and takes it on the second, as places in the house do.
                if (input === "touch" && selected !== choice.id) setSelected(choice.id);
                else act(choice.action);
              }}
              className={`${CHOICE} aria-pressed:border-(--bt-accent) ${card === null ? "" : `${MOOD_EDGE[cardMood(ENGINE, card)]}`}`}
            >
              <DamageKindChoice choice={choice.choice} damage={p.damage} label={choice.label} />
            </button>
          );
        })}
      </div>
      {input === "touch" && panel.length > 0 && <p className="text-xs text-(--bt-muted)">Tap to see where it lands; tap again to take it.</p>}
    </div>
  );
}

function ChoicesPart({ view, panel, act, notes, rule }: DecisionPartProps & { rule: RuleView }) {
  const card = rule.source === "card" ? rule.card : null;
  const pending = view.pending;
  // A trait chosen before its roll: each option shows its odds on each row.
  const rolls = pending?.type === "decision" && pending.detail !== null && pending.kind === "choose-one" ? optionRolls(view, pending.detail.params) : [];
  const table = rolls.find((roll) => roll !== null) ?? null;
  return (
    <>
      {card !== null ? <CardFace card={card} notes={notes} table={table?.rows ?? null} /> : table && <RollTable rows={table.rows} />}
      <div className="flex flex-wrap gap-2">
        {panel.map((choice) => {
          const odds = typeof choice.choice === "number" ? rolls[choice.choice] : null;
          return (
            <button
              key={choice.id}
              type="button"
              onClick={() => {
                act(choice.action);
              }}
              className={CHOICE}
            >
              {choice.label}
              {odds && (
                <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-(--bt-muted) tabular-nums">
                  {printedOrder(odds.rows).map(({ row, index }) => (
                    <span key={index}>
                      {rangeText(row)} {percentText(odds.odds[index])}
                    </span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
