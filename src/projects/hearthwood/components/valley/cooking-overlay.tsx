"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { BookOpen, Check, Flame, Hand, RotateCcw, ShoppingBasket, Sparkles, X } from "lucide-react";
import { Prompt, PromptButton, type Binding } from "@/shared/components/prompts";
import { usePadNavigation } from "@/shared/lib/gamepad";
import type { InputKind } from "@/shared/lib/input";
import { isTextEntryTarget } from "@/shared/lib/utils";
import { COOKING_SECONDS, toHand, type Session } from "../../gameplay/cooking";
import { COOKWARE, DISHES, FOODS, humbleOf, isFood, MOST_INGREDIENTS, recipeOf, RECIPES, STAPLES, type Ingredient } from "../../gameplay/recipes";
import { CookwareIcon, COOKWARE_NAMES, DishIcon, dishName, IngredientIcon, ingredientName } from "./cooking-icons";
import { subscribeForaging, type Foraging } from "./foraging";
import { chooseIngredient, chooseWay, closeCooking, cook, cookMore, openCooking, readyToCook, setBookOpen, subscribeHearth, type Hearth } from "./hearth";

/*
 * Cooking over the scene: the prompt to cook when the fire is offered (a
 * button of its own on touch), and while Elliott sits at the fire, the
 * card at the bottom of the view: what the basket and the staples hold to
 * choose from, the few chosen, the pan, the pot or the stick, and the fire
 * to cook on; then only what is cooking while it cooks; then the dish
 * served, new ones marked as found, to cook again or get up. The recipe
 * book shows every recipe as a drawing, the found ones with what goes into
 * them and how, the rest in shadow with only how they are cooked and how
 * many things go in, and the humble dishes found besides.
 *
 * While a turn is on the card has the keys and buttons (the rest of what
 * Elliott can use waits): F or Enter (the controller's X) cooks or cooks
 * again, Esc (B) gets up or closes the book, B (Y) opens the book; a pad
 * moves round the card's buttons and A presses one.
 */

const INTERACT: Binding = { pad: "X", key: "F", fills: false };
const COOK: Binding = { pad: "X", key: "F", fills: false };
const LEAVE: Binding = { pad: "B", key: "Esc", fills: false };
const BOOK: Binding = { pad: "Y", key: "B", fills: false };

const INK = "text-(--color-hearthwood-valley-ui-ink)";
const PANEL = "rounded-2xl bg-(--color-hearthwood-valley-ui-shade)/70 backdrop-blur-sm";
const CHIP = "rounded-xl bg-(--color-hearthwood-valley-ui-ink)/10";
const CHOSEN = "bg-(--color-hearthwood-valley-ui-ink)/30 ring-2 ring-(--color-hearthwood-valley-ui-ink) -translate-y-0.5";
const FLAME = "text-(--color-hearthwood-valley-fire-flame)";

function Tray({ hearth, session, basket }: { hearth: Hearth; session: Session; basket: Foraging["foraged"]["basket"] }) {
  const foods = FOODS.filter((f) => basket[f] > 0);
  const full = session.chosen.length >= MOST_INGREDIENTS;
  const item = (ingredient: Ingredient, first: boolean) => {
    const chosen = session.chosen.includes(ingredient);
    const able = chosen || (!full && toHand(ingredient, basket));
    return (
      <button
        key={ingredient}
        type="button"
        data-pad-start={first ? "" : undefined}
        aria-pressed={chosen}
        disabled={!able}
        title={ingredientName(ingredient)}
        aria-label={ingredientName(ingredient)}
        onClick={() => {
          chooseIngredient(hearth, ingredient);
        }}
        className={`relative flex size-12 shrink-0 items-center justify-center transition-transform ${CHIP} ${chosen ? CHOSEN : ""} ${able ? "" : "opacity-35"}`}
      >
        <IngredientIcon ingredient={ingredient} className="size-9" />
        {isFood(ingredient) && <span className="absolute right-0.5 bottom-0 text-xs font-bold tabular-nums">{basket[ingredient]}</span>}
      </button>
    );
  };
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {foods.length === 0 && (
        <span aria-label="The basket holds nothing from the forest" title="The basket holds nothing from the forest" className={`flex size-12 items-center justify-center opacity-40 ${CHIP}`}>
          <ShoppingBasket aria-hidden className="size-7" />
        </span>
      )}
      {foods.map((f, i) => item(f, i === 0))}
      <span aria-hidden className="mx-1 h-8 w-px bg-(--color-hearthwood-valley-ui-ink)/30" />
      {STAPLES.map((s, i) => item(s, foods.length === 0 && i === 0))}
    </div>
  );
}

function Choosing({ hearth, session, basket, input }: { hearth: Hearth; session: Session; basket: Foraging["foraged"]["basket"]; input: InputKind }) {
  const ready = readyToCook(hearth);
  return (
    <>
      <Tray hearth={hearth} session={session} basket={basket} />
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1" aria-label="Chosen">
          {Array.from({ length: MOST_INGREDIENTS }, (_, i) => {
            const ingredient = session.chosen[i] as Ingredient | undefined;
            return (
              <span key={i} className={`flex size-10 items-center justify-center rounded-full ${ingredient ? "bg-(--color-hearthwood-valley-ui-ink)/20" : "border-2 border-dashed border-(--color-hearthwood-valley-ui-ink)/35"}`}>
                {ingredient && <IngredientIcon ingredient={ingredient} className="size-8" />}
              </span>
            );
          })}
        </div>
        <div role="radiogroup" aria-label="How to cook it" className="flex items-center gap-1">
          {COOKWARE.map((way) => (
            <button
              key={way}
              type="button"
              role="radio"
              aria-checked={session.cookware === way}
              title={COOKWARE_NAMES[way]}
              aria-label={COOKWARE_NAMES[way]}
              onClick={() => {
                chooseWay(hearth, way);
              }}
              className={`flex size-11 items-center justify-center transition-transform ${CHIP} ${session.cookware === way ? CHOSEN : "opacity-70"}`}
            >
              <CookwareIcon cookware={way} className="size-8" />
            </button>
          ))}
        </div>
        <PromptButton
          binding={COOK}
          input={input}
          disabled={!ready}
          aria-label="Cook"
          title="Cook"
          onClick={() => {
            cook(hearth);
          }}
          className={`rounded-xl px-4 py-2.5 text-base font-semibold ${ready ? "bg-(--color-hearthwood-valley-ui-ink)/25" : "opacity-40"}`}
        >
          <Flame aria-hidden className={`size-6 ${FLAME}`} fill="currentColor" />
        </PromptButton>
      </div>
    </>
  );
}

function Cooking({ session }: { session: Session }) {
  return (
    <div className="flex flex-col items-center gap-2" aria-label="Cooking">
      <div className="flex items-center gap-2">
        {session.chosen.map((i) => (
          <IngredientIcon key={i} ingredient={i} className="size-8" />
        ))}
        <span aria-hidden className="text-xl opacity-60">
          →
        </span>
        <CookwareIcon cookware={session.cookware} className="size-9" />
      </div>
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-(--color-hearthwood-valley-ui-ink)/20">
        {/* How long a dish cooks is the feature itself: the bar fills over it. */}
        <div className="h-full origin-left rounded-full bg-(--color-hearthwood-valley-fire-flame)" style={{ animation: `hearthwood-cook-fill ${COOKING_SECONDS}s linear forwards` }} />
      </div>
    </div>
  );
}

function Served({ hearth, session, input }: { hearth: Hearth; session: Extract<Session, { phase: "served" }>; input: InputKind }) {
  const recipe = recipeOf(session.dish);
  return (
    <div className="flex flex-col items-center gap-2" aria-label={`Served: ${dishName(session.dish)}`}>
      <div className="flex items-center gap-3">
        <span className="inline-flex animate-[hearthwood-forage-pop_600ms_ease-out]">
          <DishIcon dish={session.dish} className="size-20" />
        </span>
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5 text-lg font-semibold">
            {dishName(session.dish)}
            {session.discovered && (
              <span aria-label="New in the recipe book" title="New in the recipe book" className="flex items-center text-(--color-hearthwood-cooking-sizzle)">
                <BookOpen aria-hidden className="size-5" />
                <Sparkles aria-hidden className="size-4" />
              </span>
            )}
          </span>
          {recipe && <span className="text-sm italic opacity-75">{recipe.native}</span>}
          <span className="mt-1 flex items-center gap-1" aria-label="Made from">
            {session.chosen.map((i) => (
              <IngredientIcon key={i} ingredient={i} className="size-6" />
            ))}
            <CookwareIcon cookware={session.cookware} className="size-6" />
            <span aria-hidden className="opacity-60">
              →
            </span>
            <ShoppingBasket aria-label="Into the basket" className="size-5" />
          </span>
        </div>
      </div>
      <div className="flex gap-3">
        <PromptButton
          binding={COOK}
          input={input}
          data-pad-start=""
          aria-label="Cook another"
          title="Cook another"
          onClick={() => {
            cookMore(hearth);
          }}
          className="rounded-xl bg-(--color-hearthwood-valley-ui-ink)/20 px-4 py-2 text-base"
        >
          <RotateCcw aria-hidden className="size-5" />
          <Flame aria-hidden className={`size-5 ${FLAME}`} fill="currentColor" />
        </PromptButton>
      </div>
    </div>
  );
}

function RecipeBook({ hearth, input }: { hearth: Hearth; input: InputKind }) {
  const root = useRef<HTMLDivElement>(null);
  const subscribe = useCallback((listener: () => void) => subscribeHearth(hearth, listener), [hearth]);
  const { larder } = useSyncExternalStore(subscribe, () => hearth.shown);
  usePadNavigation(root, {
    reveal: input === "pad",
    intercept: (edge) => {
      if (edge.name !== "Y") return false;
      setBookOpen(hearth, false);
      return true;
    },
  });
  const found = RECIPES.filter((r) => larder.known.includes(r.id)).length;
  const humble = DISHES.filter((d) => humbleOf(d) !== null && larder.known.includes(d));
  return (
    <div className="absolute inset-0 flex items-start justify-center overflow-y-auto px-3 pt-14 pb-4 sm:items-center sm:pt-4">
      <div
        ref={root}
        role="dialog"
        aria-label="Recipe book"
        className="w-full max-w-3xl rounded-2xl bg-(--color-hearthwood-cooking-page) px-4 py-3 text-(--color-hearthwood-cooking-ink) shadow-xl"
        style={{ "--prompt-body": "var(--color-hearthwood-cooking-ink)", "--prompt-ink": "var(--color-hearthwood-cooking-page)" } as CSSProperties}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg font-semibold" aria-label={`${found} of ${RECIPES.length} recipes found`}>
            <BookOpen aria-hidden className="size-6" />
            <span className="tabular-nums">
              {found}/{RECIPES.length}
            </span>
          </span>
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
          {RECIPES.map((recipe) => {
            const known = larder.known.includes(recipe.id);
            return (
              <li key={recipe.id} className="flex flex-col items-center gap-1 rounded-xl bg-(--color-hearthwood-cooking-ink)/8 px-1 py-2 text-center" title={known ? `${recipe.name} (${recipe.native})` : "Not yet found"}>
                <DishIcon dish={recipe.id} unknown={!known} className="size-14" />
                {known && <span className="text-xs leading-tight font-semibold">{recipe.name}</span>}
                <span className="flex flex-wrap items-center justify-center gap-0.5">
                  {known
                    ? recipe.ingredients.map((i) => <IngredientIcon key={i} ingredient={i} className="size-5" />)
                    : recipe.ingredients.map((i) => <span key={i} aria-hidden className="size-3.5 rounded-full border border-dashed border-(--color-hearthwood-cooking-ink)/50" />)}
                  <span aria-hidden className="mx-0.5 opacity-50">
                    ·
                  </span>
                  {recipe.cookware.map((c) => (
                    <CookwareIcon key={c} cookware={c} className="size-5" />
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
        {humble.length > 0 && (
          <ul aria-label="Humble dishes found" className="mt-3 flex flex-wrap items-center justify-center gap-1 border-t border-(--color-hearthwood-cooking-ink)/20 pt-2">
            {humble.map((d) => (
              <li key={d}>
                <DishIcon dish={d} className="size-9" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AtTheFire({ hearth, foraging, session, input }: { hearth: Hearth; foraging: Foraging; session: Session; input: InputKind }) {
  const root = useRef<HTMLDivElement>(null);
  const subscribeBasket = useCallback((listener: () => void) => subscribeForaging(foraging, listener), [foraging]);
  const { basket } = useSyncExternalStore(subscribeBasket, () => foraging.shown);
  const subscribe = useCallback((listener: () => void) => subscribeHearth(hearth, listener), [hearth]);
  const { book } = useSyncExternalStore(subscribe, () => hearth.shown);
  // The input the card opened on decides whether a pad's focus shows as it opens; the input used later doesn't.
  const [openedOn] = useState(input);

  useEffect(() => {
    // Choosing with the mouse needs the pointer back from looking round.
    if (document.pointerLockElement !== null) document.exitPointerLock();
  }, []);

  // The card's own keys: cook, cook again, the book, and getting up.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTextEntryTarget(event.target)) return;
      const s = hearth.shown.session;
      if (s === null) return;
      if (hearth.shown.book) {
        if (event.code === "Escape" || event.code === "KeyB") setBookOpen(hearth, false);
        return;
      }
      if (event.code === "KeyF" || event.code === "Enter") {
        // Enter would otherwise press the button the mouse last pressed as well.
        event.preventDefault();
        if (s.phase === "choosing" && readyToCook(hearth)) cook(hearth);
        else if (s.phase === "served") cookMore(hearth);
      }
      if (event.code === "KeyB" && s.phase !== "cooking") setBookOpen(hearth, true);
      if (event.code === "Escape") closeCooking(hearth);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [hearth]);

  usePadNavigation(root, {
    enabled: !book,
    reveal: openedOn === "pad",
    intercept: (edge) => {
      const s = hearth.shown.session;
      if (s === null) return false;
      if (edge.name === "X") {
        if (s.phase === "choosing" && readyToCook(hearth)) cook(hearth);
        else if (s.phase === "served") cookMore(hearth);
        return true;
      }
      if (edge.name === "Y" && s.phase !== "cooking") {
        setBookOpen(hearth, true);
        return true;
      }
      return false;
    },
  });

  return (
    <>
      <div className="absolute inset-x-0 bottom-3 flex justify-center px-3">
        <div ref={root} role="dialog" aria-label="Cooking at the fire" className={`flex w-full max-w-3xl flex-col items-stretch gap-3 px-3 py-3 ${PANEL} ${INK}`}>
          {session.phase === "choosing" && <Choosing hearth={hearth} session={session} basket={basket} input={input} />}
          {session.phase === "cooking" && <Cooking key={session.since} session={session} />}
          {session.phase === "served" && <Served hearth={hearth} session={session} input={input} />}
          <div className="flex items-center justify-between">
            {session.phase !== "cooking" ? (
              <PromptButton
                binding={BOOK}
                input={input}
                aria-label="Recipe book"
                title="Recipe book"
                onClick={() => {
                  setBookOpen(hearth, true);
                }}
                className={`px-3 py-1.5 text-base ${CHIP}`}
              >
                <BookOpen aria-hidden className="size-5" />
              </PromptButton>
            ) : (
              <span />
            )}
            <PromptButton
              binding={LEAVE}
              input={input}
              data-pad-back=""
              aria-label="Get up from the fire"
              title="Get up from the fire"
              onClick={() => {
                closeCooking(hearth);
              }}
              className={`px-3 py-1.5 text-base ${CHIP}`}
            >
              <Check aria-hidden className="size-5" />
            </PromptButton>
          </div>
        </div>
      </div>
      {book && <RecipeBook hearth={hearth} input={input} />}
    </>
  );
}

/** Whether Elliott sits cooking at the fire: walking's hints and buttons step aside while they do. */
export function useCookingOn(hearth: Hearth): boolean {
  const subscribe = useCallback((listener: () => void) => subscribeHearth(hearth, listener), [hearth]);
  return useSyncExternalStore(subscribe, () => hearth.shown.session !== null);
}

export function CookingOverlay({ hearth, foraging, input }: { hearth: Hearth; foraging: Foraging; input: InputKind }) {
  const subscribe = useCallback((listener: () => void) => subscribeHearth(hearth, listener), [hearth]);
  const shown = useSyncExternalStore(subscribe, () => hearth.shown);
  const { session, offered } = shown;
  return (
    <>
      {offered &&
        session === null &&
        (input === "touch" ? (
          <button
            type="button"
            onClick={() => {
              openCooking(hearth);
            }}
            aria-label="Cook at the fire"
            title="Cook at the fire"
            className={`absolute top-[60%] left-1/2 flex -translate-x-1/2 items-center gap-2 px-4 py-2.5 ${PANEL} ${INK}`}
          >
            <Hand aria-hidden className="size-6" />
            <CookwareIcon cookware="pot" className="size-8" />
          </button>
        ) : (
          <div className="pointer-events-none absolute inset-x-0 top-[58%] flex justify-center">
            <div aria-label="Cook at the fire" title="Cook at the fire" className={`flex items-center gap-2 px-3 py-2 text-base ${PANEL} ${INK}`}>
              <Prompt binding={INTERACT} input={input} />
              <Hand aria-hidden className="size-6" />
              <CookwareIcon cookware="pot" className="size-8" />
            </div>
          </div>
        ))}
      {session && <AtTheFire hearth={hearth} foraging={foraging} session={session} input={input} />}
    </>
  );
}
