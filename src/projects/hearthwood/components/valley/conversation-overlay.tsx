"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, BookOpenText, ChevronRight, Hand, Heart, Laugh, Lightbulb, Mail, MessageCircleHeart, PawPrint, Plus, Search, Sparkles, X } from "lucide-react";
import { Prompt, PromptButton, type Binding } from "@/shared/components/prompts";
import { usePadNavigation } from "@/shared/lib/gamepad";
import type { InputKind } from "@/shared/lib/input";
import { isTextEntryTarget } from "@/shared/lib/utils";
import type { Gift, Tone } from "../../stories/story";
import { isDish } from "../../gameplay/recipes";
import { CompanionPortrait } from "./companion-portrait";
import { DishIcon, dishName } from "./cooking-icons";
import { BrewIcon, brewName } from "./brewing-icons";
import { FolkPortrait } from "./folk-portrait";
import { ForageIcon, FORAGE_NAMES } from "./forage-icons";
import { KeepsakeIcon, KEEPSAKE_NAMES } from "./keepsake-icons";
import { chooseTone, goOn, leaveTalk, subscribePeople, talkWith, type Given, type People, type Talking } from "./people";

/*
 * Talking over the scene: the prompt to talk with the person offered (a
 * button of its own on touch), and while a conversation is on, the
 * storybook panel along the bottom of the view: their face and name, their
 * line, what Elliott said when they chose, and then either Elliott's three
 * choices of tone (warm, curious, playful, each with its own mark and
 * colour) or the way on; what Elliott gave as the talk opened, the clues
 * it told noted in the casebook, and on its last page what they were
 * given. In a mystery's reveal Elliott speaks first on each page, laying
 * out the reasoning, with a magnifying glass for a mark.
 *
 * While a conversation is on the panel has the keys and buttons (the rest
 * of what Elliott can use waits): F, Enter or Space (the controller's X)
 * goes on, 1, 2 and 3 choose a tone (a pad moves its focus round the
 * choices and presses one with A), and Esc (the controller's B) walks off.
 */

const TALK: Binding = { pad: "X", key: "F", fills: false };
const ON: Binding = { pad: "X", key: "F", fills: false };
const LEAVE: Binding = { pad: "B", key: "Esc", fills: false };
const TONE_KEYS: Record<Tone, Binding> = {
  warm: { pad: null, key: "1", fills: false },
  curious: { pad: null, key: "2", fills: false },
  playful: { pad: null, key: "3", fills: false },
};
const TONE_CODES: Record<string, Tone> = { Digit1: "warm", Digit2: "curious", Digit3: "playful" };

const INK = "text-(--color-hearthwood-valley-ui-ink)";
const PANEL = "rounded-2xl bg-(--color-hearthwood-valley-ui-shade)/70 backdrop-blur-sm";
const PAGE_INK = { "--prompt-body": "var(--color-hearthwood-folk-ink)", "--prompt-ink": "var(--color-hearthwood-folk-page)" } as CSSProperties;

export const TONE_NAMES: Record<Tone, string> = { warm: "Warmly", curious: "Curious", playful: "Playful" };

export function ToneMark({ tone, className = "size-5" }: { tone: Tone; className?: string }) {
  const style = { color: `var(--color-hearthwood-folk-${tone})` };
  if (tone === "warm") return <Heart aria-hidden className={className} style={style} fill="currentColor" />;
  if (tone === "curious") return <Search aria-hidden className={className} style={style} strokeWidth={2.6} />;
  return <Laugh aria-hidden className={className} style={style} strokeWidth={2.4} />;
}

/** A gift as a small drawing: a recipe or a brew hinted (in shadow, lit), a keepsake, an animal to keep. */
export function GiftMark({ gift, className = "size-9" }: { gift: Gift; className?: string }) {
  if (gift.kind === "brew-hint") {
    return (
      <span className="relative inline-flex" role="img" aria-label={`A brew for the brew book: ${brewName(gift.brew)}`} title={`A brew for the brew book: ${brewName(gift.brew)}`}>
        <BrewIcon brew={gift.brew} unknown className={className} />
        <Lightbulb aria-hidden className="absolute -top-1 -right-1 size-4 text-(--color-hearthwood-folk-playful)" fill="currentColor" />
      </span>
    );
  }
  if (gift.kind === "hint") {
    return (
      <span className="relative inline-flex" role="img" aria-label={`A recipe for the book: ${dishName(gift.recipe)}`} title={`A recipe for the book: ${dishName(gift.recipe)}`}>
        <DishIcon dish={gift.recipe} unknown className={className} />
        <Lightbulb aria-hidden className="absolute -top-1 -right-1 size-4 text-(--color-hearthwood-folk-playful)" fill="currentColor" />
      </span>
    );
  }
  if (gift.kind === "keepsake") {
    return (
      <span title={KEEPSAKE_NAMES[gift.keepsake]} className="inline-flex">
        <KeepsakeIcon keepsake={gift.keepsake} className={className} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center" role="img" aria-label="A companion to keep" title="A companion to keep">
      <PawPrint aria-hidden className="size-6 text-(--color-hearthwood-folk-ink)" fill="currentColor" />
      <Heart aria-hidden className="size-4 text-(--color-hearthwood-companion-heart)" fill="currentColor" />
    </span>
  );
}

function GivenRow({ given }: { given: Given }) {
  let thing: ReactNode;
  let label: string;
  switch (given.kind) {
    case "dish":
      thing = isDish(given.dish) ? <DishIcon dish={given.dish} className="size-9" /> : null;
      label = isDish(given.dish) ? dishName(given.dish) : given.dish;
      break;
    case "forage":
      thing = given.foods.map(([food, n]) => (
        <span key={food} className="flex items-center">
          <ForageIcon kind={food} className="size-7" />
          <span className="text-sm font-bold tabular-nums">{n}</span>
        </span>
      ));
      label = given.foods.map(([food, n]) => `${n} ${FORAGE_NAMES[food].toLowerCase()}`).join(", ");
      break;
    case "pet":
      thing = <CompanionPortrait portrait={given.portrait} className="size-9" />;
      label = given.home ? `${given.name}, home again` : `${given.name}, brought back`;
      break;
    case "note":
      thing = <Mail aria-hidden className="size-7" />;
      label = "The note";
  }
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={`Given: ${label}`} title={label}>
      {thing}
      <ArrowRight aria-hidden className="size-4 opacity-60" />
      <Heart aria-hidden className="size-5 text-(--color-hearthwood-companion-heart)" fill="currentColor" />
    </div>
  );
}

function Panel({ people, talking, input }: { people: People; talking: Talking; input: InputKind }) {
  const root = useRef<HTMLDivElement>(null);
  const [openedOn] = useState(input);

  useEffect(() => {
    // Choosing with the mouse needs the pointer back from looking round.
    if (document.pointerLockElement !== null) document.exitPointerLock();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTextEntryTarget(event.target)) return;
      const now = people.shown.talking;
      if (!now) return;
      if (event.code === "Escape") leaveTalk(people);
      const tone = TONE_CODES[event.code] as Tone | undefined;
      if (tone && now.choices) chooseTone(people, tone);
      if ((event.code === "KeyF" || event.code === "Enter" || event.code === "Space") && !now.choices) {
        // Enter or Space would otherwise press the button the mouse last pressed as well.
        event.preventDefault();
        goOn(people);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [people]);

  usePadNavigation(root, {
    reveal: openedOn === "pad",
    intercept: (edge) => {
      if (edge.name !== "X") return false;
      if (!people.shown.talking?.choices) goOn(people);
      return true;
    },
  });

  const first = talking.conversation.page === 0 && talking.conversation.chose === null;
  return (
    <div className="absolute inset-x-0 bottom-3 flex justify-center px-3">
      <div
        ref={root}
        role="dialog"
        aria-label={`Talking with ${talking.name}`}
        className="flex w-full max-w-2xl flex-col gap-2 rounded-2xl bg-(--color-hearthwood-folk-page) px-4 py-3 text-(--color-hearthwood-folk-ink) shadow-xl"
        style={PAGE_INK}
      >
        <div className="flex items-start gap-3">
          <span key={talking.opened} className="inline-flex animate-[hearthwood-forage-pop_500ms_ease-out] flex-col items-center gap-0.5">
            <span className="rounded-full bg-(--color-hearthwood-folk-ink)/8 p-0.5 ring-2 ring-(--color-hearthwood-folk-ink)/25">
              <FolkPortrait look={talking.look} className="size-14 sm:size-16" />
            </span>
            <span className="text-sm font-bold tracking-wide">{talking.name}</span>
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
            {talking.lead && (
              <p key={`lead/${talking.conversation.page}`} className="flex animate-[hearthwood-talk-line_350ms_ease-out] items-start gap-1.5 text-sm font-semibold italic sm:text-base" aria-label={`Elliott: ${talking.lead}`}>
                <Search aria-hidden className="mt-0.5 size-4 shrink-0 text-(--color-hearthwood-folk-curious)" strokeWidth={2.6} />
                {talking.lead}
              </p>
            )}
            {talking.said && (
              <p className="flex items-start gap-1.5 text-sm italic opacity-80" aria-label={`Elliott: ${talking.said.text}`}>
                <ToneMark tone={talking.said.tone} className="mt-0.5 size-4 shrink-0" />
                {talking.said.text}
              </p>
            )}
            <p key={`${talking.conversation.page}/${talking.conversation.chose ?? ""}`} className="animate-[hearthwood-talk-line_350ms_ease-out] text-base leading-snug sm:text-lg">
              {talking.line}
            </p>
            {first && talking.given && <GivenRow given={talking.given} />}
            {first && talking.noted > 0 && (
              <span className="flex animate-[hearthwood-forage-pop_600ms_ease-out] items-center gap-0.5 self-start" role="img" aria-label={`${talking.noted} noted in the casebook`} title="Noted in the casebook">
                <BookOpenText aria-hidden className="size-6 text-(--color-hearthwood-folk-curious)" />
                <Plus aria-hidden className="size-3.5" strokeWidth={3} />
                <span className="text-sm font-bold tabular-nums">{talking.noted}</span>
              </span>
            )}
            {talking.last && talking.gifts.length > 0 && (
              <div className="flex flex-wrap items-center gap-2" aria-label="Given to Elliott">
                <Sparkles aria-hidden className="size-5 text-(--color-hearthwood-folk-playful)" />
                {talking.gifts.map((gift, i) => (
                  <span key={i} className="inline-flex animate-[hearthwood-forage-pop_600ms_ease-out]">
                    <GiftMark gift={gift} />
                  </span>
                ))}
              </div>
            )}
          </div>
          <PromptButton binding={LEAVE} input={input} data-pad-back="" aria-label="Walk on" title="Walk on" onClick={() => leaveTalk(people)} className="-mt-1 -mr-2 rounded-xl px-2 py-1.5">
            <X aria-hidden className="size-5" />
          </PromptButton>
        </div>
        {talking.choices ? (
          <div role="group" aria-label="Answer" className="flex flex-col gap-1.5 sm:flex-row">
            {talking.choices.map((choice, i) => (
              <PromptButton
                key={choice.tone}
                binding={TONE_KEYS[choice.tone]}
                input={input}
                data-pad-start={i === 0 ? "" : undefined}
                aria-label={`${TONE_NAMES[choice.tone]}: ${choice.text}`}
                title={TONE_NAMES[choice.tone]}
                onClick={() => chooseTone(people, choice.tone)}
                className="flex flex-1 items-center justify-start gap-2 rounded-xl bg-(--color-hearthwood-folk-ink)/8 px-3 py-2 text-left text-sm leading-tight sm:text-base"
              >
                <ToneMark tone={choice.tone} className="size-5 shrink-0" />
                <span>{choice.text}</span>
              </PromptButton>
            ))}
          </div>
        ) : (
          <div className="flex justify-end">
            <PromptButton
              binding={ON}
              input={input}
              data-pad-start=""
              aria-label={talking.last ? "Goodbye" : "Go on"}
              title={talking.last ? "Goodbye" : "Go on"}
              onClick={() => goOn(people)}
              className="rounded-xl bg-(--color-hearthwood-folk-ink)/12 px-4 py-2 text-base"
            >
              {talking.last ? <Hand aria-hidden className="size-5" /> : <ChevronRight aria-hidden className="size-5" />}
            </PromptButton>
          </div>
        )}
      </div>
    </div>
  );
}

/** Whether a conversation is on: walking's hints and buttons step aside while it is. */
export function useTalkingOn(people: People): boolean {
  const subscribe = useCallback((listener: () => void) => subscribePeople(people, listener), [people]);
  return useSyncExternalStore(subscribe, () => people.shown.talking !== null);
}

export function ConversationOverlay({ people, input }: { people: People; input: InputKind }) {
  const subscribe = useCallback((listener: () => void) => subscribePeople(people, listener), [people]);
  const { offer, talking } = useSyncExternalStore(subscribe, () => people.shown);
  return (
    <>
      {offer &&
        !talking &&
        (input === "touch" ? (
          <button
            type="button"
            onClick={() => talkWith(people, offer.id)}
            aria-label={`Talk with ${offer.name}`}
            title={`Talk with ${offer.name}`}
            className={`absolute top-[62%] left-1/2 flex -translate-x-1/2 items-center gap-2 px-4 py-2.5 ${PANEL} ${INK}`}
          >
            <MessageCircleHeart aria-hidden className="size-6" />
            <FolkPortrait look={offer.look} className="size-9" />
          </button>
        ) : (
          <div className="pointer-events-none absolute inset-x-0 top-[60%] flex justify-center">
            <div aria-label={`Talk with ${offer.name}`} title={`Talk with ${offer.name}`} className={`flex items-center gap-2 px-3 py-2 text-base ${PANEL} ${INK}`}>
              <Prompt binding={TALK} input={input} />
              <MessageCircleHeart aria-hidden className="size-6" />
              <FolkPortrait look={offer.look} className="size-9" />
              <span className="font-semibold">{offer.name}</span>
            </div>
          </div>
        ))}
      {talking && <Panel key={talking.opened} people={people} talking={talking} input={input} />}
    </>
  );
}
