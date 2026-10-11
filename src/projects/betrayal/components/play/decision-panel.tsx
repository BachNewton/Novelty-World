"use client";

import { useState } from "react";
import type { RuleNotes } from "../../data/rule-notes";
import type { GameView, RuleView } from "../../engine/view";
import { ENGINE } from "../../game";
import type { InputKind } from "../../input/controls";
import { cardMood, consequence } from "../../play/cards";
import type { PanelChoice } from "../../play/choices";
import { damageTracks, landsAs, splitOf, type DamageKind } from "../../play/damage";
import { rerollCards, rerollChoice, rollShown, type RollParams } from "../../play/dice";
import type { BoxPart } from "../../play/panels";
import type { Action, FigureId, Json, Trait } from "../../types";
import { CardFace } from "./card-face";
import { MOOD_EDGE } from "./moods";
import { TrackRow } from "./trait-track";
import { DamageAmount, DiceFaces, RollResult, TraitValue, Verdict } from "./roll-result";
import { DamageIcon, DieFace, TraitIcon } from "../icons";

/*
 * The status box's part for a decision that isn't a place or the turn: a
 * roll (its dice, total and what it means, with the cards that can act on
 * it offered where they apply), damage (its stat tracks, with where it would
 * land), or any other question (its choices, under the card that asks it).
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

const cardOf = (choice: Json): string | null => (typeof choice === "object" && choice !== null && !Array.isArray(choice) && typeof choice.card === "string" ? choice.card : null);

function RollPart({ view, panel, act, notes, params, after }: DecisionPartProps & { params: RollParams; after: boolean }) {
  const shown = rollShown(view, notes, params, after);
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
            {keep.label}
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
          : panel.flatMap((choice) => {
              const card = cardOf(choice.choice);
              return card === null ? [] : [<Offer key={choice.id} choice={choice} card={card} act={act} notes={notes} />];
            })}
      </div>
    </div>
  );
}

/** A way to take damage, in icons: the points on each trait, or the kind it lands as and the card that turns it. */
function DamageChoice({ choice, damage, label, splitting }: { choice: Json; damage: DamageKind; label: string; splitting: boolean }) {
  if (!splitting) {
    const card = typeof choice === "string" ? choice : null;
    return (
      <span aria-label={label} className="inline-flex items-center gap-1">
        {card !== null && <span>{ENGINE.catalog.cards[card].name}:</span>}
        <DamageIcon kind={landsAs(damage, choice)} className="size-5" />
      </span>
    );
  }
  return (
    <span aria-label={label} className="inline-flex items-center gap-2">
      {Object.entries(splitOf(choice)).map(([trait, points]) => (
        <span key={trait} className="inline-flex items-center gap-0.5 font-semibold">
          −{points}
          <TraitIcon trait={trait as Trait} className="size-5" />
        </span>
      ))}
    </span>
  );
}

interface DamageParams {
  figure: FigureId;
  damage: DamageKind;
}

function DamagePart({ view, panel, act, input, params, kind }: DecisionPartProps & { kind: string; params: Json }) {
  const p = params as unknown as DamageParams & { amount?: number; points?: number };
  const [selected, setSelected] = useState<string | null>(null);
  const focused = panel.find((choice) => choice.id === selected) ?? null;
  const splitting = kind === "split-damage";
  const lands = splitting || focused === null ? p.damage : landsAs(p.damage, focused.choice);
  const tracks = damageTracks(ENGINE, view, p.figure, lands, splitting && focused ? splitOf(focused.choice) : null);
  const points = p.amount ?? p.points ?? 0;

  return (
    <div aria-label="Damage" className="flex flex-col gap-2 rounded border border-(--bt-line) bg-(--bt-bg) px-2 py-2">
      <p className="text-sm">
        <DamageAmount kind={lands} amount={points} />
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
              <DamageChoice choice={choice.choice} damage={p.damage} label={choice.label} splitting={splitting} />
            </button>
          );
        })}
      </div>
      {input === "touch" && <p className="text-xs text-(--bt-muted)">Tap to see where it lands; tap again to take it.</p>}
    </div>
  );
}

function ChoicesPart({ panel, act, notes, rule }: DecisionPartProps & { rule: RuleView }) {
  const card = rule.source === "card" ? rule.card : null;
  return (
    <>
      {card !== null && <CardFace card={card} notes={notes} />}
      <div className="flex flex-wrap gap-2">
        {panel.map((choice) => (
          <button
            key={choice.id}
            type="button"
            onClick={() => {
              act(choice.action);
            }}
            className={CHOICE}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </>
  );
}
