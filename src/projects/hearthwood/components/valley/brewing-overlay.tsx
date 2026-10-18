"use client";

import { useCallback, useRef, useSyncExternalStore, type CSSProperties } from "react";
import { BookOpen, Lightbulb, RotateCcw, ShoppingBasket, Sparkles, X } from "lucide-react";
import { PromptButton, type Binding } from "@/shared/components/prompts";
import { usePadNavigation } from "@/shared/lib/gamepad";
import type { InputKind } from "@/shared/lib/input";
import { FORAGE_KINDS } from "../../engine/regions";
import { BREWING_SECONDS, brewToHand, charmStrength, type BrewSession } from "../../gameplay/brewing";
import { ALL_BREWS, BREW_FORMS, BREW_STAPLES, BREWS, charmOf, CHARMS, fitsForm, humbleBrewOf, isForageKind, MOST_IN_A_BREW, type BrewIngredient, type RecipeBrewId } from "../../gameplay/brews";
import { BrewFormIcon, BrewIcon, BrewIngredientIcon, brewIngredientName, brewLore, brewName, BREW_FORM_NAMES, CauldronIcon, CharmIcon, CHARM_NAMES, FullMoonIcon } from "./brewing-icons";
import type { Foraging } from "./foraging";
import { brew, brewMore, chooseBrewForm, chooseBrewIngredient, readyToBrew, setBookOpen, subscribeHearth, type Hearth } from "./hearth";

/*
 * Brewing on the card at the fire, beside cooking: what the basket and the
 * witch's staples hold to choose from (anything the forest gave, the herbs
 * and the fly agaric among it; whatever doesn't suit the way chosen is
 * dimmed, as the fly agaric is for a tea), the few chosen, the tea, the
 * salve or the charm, and the cauldron to brew in, with the full moon's
 * mark lit while it is up; then only what is brewing while it brews; then
 * the brew made, new ones marked as found and moon-blessed ones with the
 * moon, a charm with what it now brings about. The brew book shows every
 * brew as a drawing, the found ones with what goes in and how, the rest in
 * shadow with only their way and how many things go in (or, hinted by
 * someone Elliott met, what goes in too), the humble brews found, and the
 * charms at work.
 */

const BREW: Binding = { pad: "X", key: "F", fills: false };
const LEAVE: Binding = { pad: "B", key: "Esc", fills: false };

const CHIP = "rounded-xl bg-(--color-hearthwood-valley-ui-ink)/10";
const CHOSEN = "bg-(--color-hearthwood-valley-ui-ink)/30 ring-2 ring-(--color-hearthwood-valley-ui-ink) -translate-y-0.5";
const MOON_UP = "A full moon is up: what is brewed now is moon-blessed, and a charm works twice as long";
const MOON_DOWN = "Brewed under a full moon, a charm works twice as long";

type Basket = Foraging["foraged"]["basket"];

function BrewTray({ hearth, session, basket }: { hearth: Hearth; session: BrewSession; basket: Basket }) {
  const kinds = FORAGE_KINDS.filter((k) => basket[k] > 0);
  const full = session.chosen.length >= MOST_IN_A_BREW;
  const item = (ingredient: BrewIngredient, first: boolean) => {
    const chosen = session.chosen.includes(ingredient);
    const suits = fitsForm(ingredient, session.form);
    const able = chosen || (!full && suits && brewToHand(ingredient, basket));
    const name = suits ? brewIngredientName(ingredient) : `${brewIngredientName(ingredient)}: never in a ${session.form}`;
    return (
      <button
        key={ingredient}
        type="button"
        data-pad-start={first ? "" : undefined}
        aria-pressed={chosen}
        disabled={!able}
        title={name}
        aria-label={name}
        onClick={() => {
          chooseBrewIngredient(hearth, ingredient);
        }}
        className={`relative flex size-12 shrink-0 items-center justify-center transition-transform ${CHIP} ${chosen ? CHOSEN : ""} ${able ? "" : "opacity-35"}`}
      >
        <BrewIngredientIcon ingredient={ingredient} className="size-9" />
        {isForageKind(ingredient) && <span className="absolute right-0.5 bottom-0 text-xs font-bold tabular-nums">{basket[ingredient]}</span>}
      </button>
    );
  };
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {kinds.length === 0 && (
        <span aria-label="The basket holds nothing from the forest" title="The basket holds nothing from the forest" className={`flex size-12 items-center justify-center opacity-40 ${CHIP}`}>
          <ShoppingBasket aria-hidden className="size-7" />
        </span>
      )}
      {kinds.map((k, i) => item(k, i === 0))}
      <span aria-hidden className="mx-1 h-8 w-px bg-(--color-hearthwood-valley-ui-ink)/30" />
      {BREW_STAPLES.map((s, i) => item(s, kinds.length === 0 && i === 0))}
    </div>
  );
}

export function BrewChoosing({ hearth, session, basket, input, fullMoon }: { hearth: Hearth; session: BrewSession; basket: Basket; input: InputKind; fullMoon: boolean }) {
  const ready = readyToBrew(hearth);
  return (
    <>
      <BrewTray hearth={hearth} session={session} basket={basket} />
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1" aria-label="Chosen">
          {Array.from({ length: MOST_IN_A_BREW }, (_, i) => {
            const ingredient = session.chosen[i] as BrewIngredient | undefined;
            return (
              <span key={i} className={`flex size-10 items-center justify-center rounded-full ${ingredient ? "bg-(--color-hearthwood-valley-ui-ink)/20" : "border-2 border-dashed border-(--color-hearthwood-valley-ui-ink)/35"}`}>
                {ingredient && <BrewIngredientIcon ingredient={ingredient} className="size-8" />}
              </span>
            );
          })}
        </div>
        <div role="radiogroup" aria-label="What to brew" className="flex items-center gap-1">
          {BREW_FORMS.map((form) => (
            <button
              key={form}
              type="button"
              role="radio"
              aria-checked={session.form === form}
              title={BREW_FORM_NAMES[form]}
              aria-label={BREW_FORM_NAMES[form]}
              onClick={() => {
                chooseBrewForm(hearth, form);
              }}
              className={`flex size-11 items-center justify-center transition-transform ${CHIP} ${session.form === form ? CHOSEN : "opacity-70"}`}
            >
              <BrewFormIcon form={form} className="size-8" />
            </button>
          ))}
        </div>
        <PromptButton
          binding={BREW}
          input={input}
          disabled={!ready}
          aria-label="Brew"
          title="Brew"
          onClick={() => {
            brew(hearth);
          }}
          className={`rounded-xl px-4 py-2 text-base font-semibold ${ready ? "bg-(--color-hearthwood-valley-ui-ink)/25" : "opacity-40"}`}
        >
          <CauldronIcon className="size-7" />
          {fullMoon && <FullMoonIcon up className="size-5" label={MOON_UP} />}
        </PromptButton>
      </div>
    </>
  );
}

export function BrewBrewing({ session }: { session: Extract<BrewSession, { phase: "brewing" }> }) {
  return (
    <div className="flex flex-col items-center gap-2" aria-label="Brewing">
      <div className="flex items-center gap-2">
        {session.chosen.map((i) => (
          <BrewIngredientIcon key={i} ingredient={i} className="size-8" />
        ))}
        <span aria-hidden className="text-xl opacity-60">
          →
        </span>
        <CauldronIcon className="size-9" />
        <BrewFormIcon form={session.form} className="size-8" />
        {session.moonlit && <FullMoonIcon up className="size-5" label={MOON_UP} />}
      </div>
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-(--color-hearthwood-valley-ui-ink)/20">
        {/* How long a brew takes is the feature itself: the bar fills over it. */}
        <div className="h-full origin-left rounded-full bg-(--color-hearthwood-brewing-glow-violet)" style={{ animation: `hearthwood-cook-fill ${BREWING_SECONDS}s linear forwards` }} />
      </div>
    </div>
  );
}

export function BrewMade({ hearth, session, input }: { hearth: Hearth; session: Extract<BrewSession, { phase: "brewed" }>; input: InputKind }) {
  const charm = charmOf(session.brew);
  const worked = session.form === "charm";
  return (
    <div className="flex flex-col items-center gap-2" aria-label={`Brewed: ${brewName(session.brew)}`}>
      <div className="flex items-center gap-3">
        <span className="inline-flex animate-[hearthwood-forage-pop_600ms_ease-out]">
          <BrewIcon brew={session.brew} className="size-20" />
        </span>
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5 text-lg font-semibold" title={brewLore(session.brew)}>
            {brewName(session.brew)}
            {session.discovered && (
              <span aria-label="New in the brew book" title="New in the brew book" className="flex items-center text-(--color-hearthwood-cooking-sizzle)">
                <BookOpen aria-hidden className="size-5" />
                <Sparkles aria-hidden className="size-4" />
              </span>
            )}
            {session.moonlit && <FullMoonIcon up className="size-5" label="Moon-blessed: brewed under a full moon" />}
          </span>
          <span className="mt-1 flex items-center gap-1" aria-label="Made from">
            {session.chosen.map((i) => (
              <BrewIngredientIcon key={i} ingredient={i} className="size-6" />
            ))}
            <BrewFormIcon form={session.form} className="size-6" />
            <span aria-hidden className="opacity-60">
              →
            </span>
            {charm ? <CharmIcon charm={charm} className="size-7" /> : worked ? <Sparkles aria-label="Hung up at camp" className="size-5" /> : <ShoppingBasket aria-label="Into the basket" className="size-5" />}
          </span>
        </div>
      </div>
      <PromptButton
        binding={BREW}
        input={input}
        data-pad-start=""
        aria-label="Brew another"
        title="Brew another"
        onClick={() => {
          brewMore(hearth);
        }}
        className="rounded-xl bg-(--color-hearthwood-valley-ui-ink)/20 px-4 py-2 text-base"
      >
        <RotateCcw aria-hidden className="size-5" />
        <CauldronIcon className="size-6" />
      </PromptButton>
    </div>
  );
}

/** The brews someone has hinted at, read as the book opens. */
export type HintedBrews = () => readonly RecipeBrewId[];

/** The time left on a charm at work, as a bar: full when just worked, empty when spent. */
function CharmAtWork({ hearth, charm }: { hearth: Hearth; charm: (typeof CHARMS)[number] }) {
  const working = hearth.shown.satchel.charms[charm];
  if (working === undefined) return null;
  const left = Math.min(1, Math.max(0, (working.until - hearth.days) / (working.until - working.from)));
  return (
    <li className="flex items-center gap-1" title={CHARM_NAMES[charm]}>
      <CharmIcon charm={charm} className="size-7" />
      <span aria-label={`${Math.round(left * 100)}% left`} className="h-1.5 w-10 overflow-hidden rounded-full bg-(--color-hearthwood-brewing-ink)/20">
        <span className="block h-full rounded-full bg-(--color-hearthwood-brewing-ink)/70" style={{ width: `${left * 100}%` }} />
      </span>
      {working.moonlit && <FullMoonIcon up className="size-4" label="Moon-blessed" />}
    </li>
  );
}

export function BrewBook({ hearth, input, hinted }: { hearth: Hearth; input: InputKind; hinted: HintedBrews }) {
  const root = useRef<HTMLDivElement>(null);
  const subscribe = useCallback((listener: () => void) => subscribeHearth(hearth, listener), [hearth]);
  const { satchel, fullMoon } = useSyncExternalStore(subscribe, () => hearth.shown);
  usePadNavigation(root, {
    reveal: input === "pad",
    intercept: (edge) => {
      if (edge.name !== "Y") return false;
      setBookOpen(hearth, false);
      return true;
    },
  });
  const found = BREWS.filter((b) => satchel.known.includes(b.id)).length;
  const hints = hinted();
  const humble = ALL_BREWS.filter((b) => humbleBrewOf(b) !== null && satchel.known.includes(b));
  const atWork = CHARMS.filter((c) => charmStrength(satchel, c, hearth.days) > 0);
  return (
    <div className="absolute inset-0 flex items-start justify-center overflow-y-auto px-3 pt-14 pb-4 sm:items-center sm:pt-4">
      <div
        ref={root}
        role="dialog"
        aria-label="Brew book"
        className="w-full max-w-3xl rounded-2xl bg-(--color-hearthwood-brewing-page) px-4 py-3 text-(--color-hearthwood-brewing-ink) shadow-xl"
        style={{ "--prompt-body": "var(--color-hearthwood-brewing-ink)", "--prompt-ink": "var(--color-hearthwood-brewing-page)" } as CSSProperties}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-lg font-semibold" aria-label={`${found} of ${BREWS.length} brews found`}>
            <CauldronIcon className="size-7" />
            <span className="tabular-nums">
              {found}/{BREWS.length}
            </span>
            <FullMoonIcon up={fullMoon} className="size-6" label={fullMoon ? MOON_UP : MOON_DOWN} />
          </span>
          {atWork.length > 0 && (
            <ul aria-label="Charms at work" className="flex flex-wrap items-center gap-3">
              {atWork.map((c) => (
                <CharmAtWork key={c} hearth={hearth} charm={c} />
              ))}
            </ul>
          )}
          <PromptButton
            binding={LEAVE}
            input={input}
            data-pad-back=""
            aria-label="Close the book"
            title="Close the book"
            onClick={() => {
              setBookOpen(hearth, false);
            }}
            className="rounded-xl px-3 py-1.5"
          >
            <X aria-hidden className="size-5" />
          </PromptButton>
        </div>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {BREWS.map((b) => {
            const known = satchel.known.includes(b.id);
            const hint = !known && hints.includes(b.id);
            const charm = charmOf(b.id);
            return (
              <li key={b.id} className="flex flex-col items-center gap-1 rounded-xl bg-(--color-hearthwood-brewing-ink)/8 px-1 py-2 text-center" title={known ? b.lore : hint ? "Hinted: what goes in is known" : "Not yet found"}>
                <span className="relative inline-flex">
                  <BrewIcon brew={b.id} unknown={!known} className="size-14" />
                  {hint && <Lightbulb aria-label="Hinted" className="absolute -top-1 -right-1 size-4 text-(--color-hearthwood-folk-playful)" fill="currentColor" />}
                  {known && satchel.moonlit.includes(b.id) && (
                    <span className="absolute -top-1 -left-1">
                      <FullMoonIcon up className="size-4" label="Moon-blessed" />
                    </span>
                  )}
                  {known && charm && (
                    <span className="absolute -right-1 -bottom-1">
                      <CharmIcon charm={charm} className="size-5" />
                    </span>
                  )}
                </span>
                {known && <span className="text-xs leading-tight font-semibold">{b.name}</span>}
                <span className="flex flex-wrap items-center justify-center gap-0.5">
                  {known || hint
                    ? b.ingredients.map((i) => <BrewIngredientIcon key={i} ingredient={i} className="size-5" />)
                    : b.ingredients.map((i) => <span key={i} aria-hidden className="size-3.5 rounded-full border border-dashed border-(--color-hearthwood-brewing-ink)/50" />)}
                  <span aria-hidden className="mx-0.5 opacity-50">
                    ·
                  </span>
                  <BrewFormIcon form={b.form} className="size-5" />
                </span>
              </li>
            );
          })}
        </ul>
        {humble.length > 0 && (
          <ul aria-label="Humble brews found" className="mt-3 flex flex-wrap items-center justify-center gap-1 border-t border-(--color-hearthwood-brewing-ink)/20 pt-2">
            {humble.map((b) => (
              <li key={b}>
                <BrewIcon brew={b} className="size-9" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
