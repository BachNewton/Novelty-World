"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Dices, Flame, Hand, Heart, PawPrint } from "lucide-react";
import { Prompt, PromptButton, type Binding } from "@/shared/components/prompts";
import { subscribeGamepads } from "@/shared/lib/gamepad";
import type { InputKind } from "@/shared/lib/input";
import { NAME_LENGTH } from "../../gameplay/names";
import { CompanionPortrait } from "./companion-portrait";
import { anotherName, keepName, petAnimal, setCompanionsOpen, subscribeCompanionship, treatAnimal, type Companionship, type Naming } from "./companionship";
import { TreatIcon, treatName } from "./cooking-icons";

/*
 * The companions over the scene: the prompt to pet the animal offered or
 * hold out a treat (buttons of their own on touch), the companions' row in
 * the corner (each a portrait in its own coat with its name; one waiting at
 * camp by a little flame), which shows for a while when one joins and
 * whenever it is opened, the naming card when one is won, and the names and
 * hearts that the scene moves over the animals each frame.
 */

const INTERACT: Binding = { pad: "X", key: "F", fills: false };
const TREAT: Binding = { pad: "B", key: "R", fills: false };
const COMPANIONS: Binding = { pad: "LB", key: "C", fills: false };
const ANOTHER: Binding = { pad: "DpadLeftRight", key: null, fills: false };
const KEEP: Binding = { pad: "X", key: "Enter", fills: false };

/** How long the row stays up after one joins, in ms. */
const SHOWN_AFTER_JOIN = 4500;

const INK = "text-(--color-hearthwood-valley-ui-ink)";
const PANEL = "rounded-2xl bg-(--color-hearthwood-valley-ui-shade)/60 backdrop-blur-sm";
const HEART = "text-(--color-hearthwood-companion-heart)";

function NamingCard({ companionship, naming, input }: { companionship: Companionship; naming: Naming; input: InputKind }) {
  const suggestion = naming.suggestions[naming.index];
  const [draft, setDraft] = useState({ from: suggestion, text: suggestion });
  const field = useRef<HTMLInputElement>(null);
  // A new suggestion replaces whatever was typed, as asking for another means.
  const text = draft.from === suggestion ? draft.text : suggestion;
  const keep = useCallback(() => {
    keepName(companionship, text.trim().length > 0 ? text : suggestion);
  }, [companionship, text, suggestion]);
  const latestKeep = useRef(keep);
  useEffect(() => {
    latestKeep.current = keep;
  });
  // The input the card opened on decides where the focus goes as it opens; the input used later doesn't move it.
  const openedOn = useRef(input);

  useEffect(() => {
    // Typing a name needs the pointer and the keys back from looking round.
    if (document.pointerLockElement !== null) document.exitPointerLock();
    if (openedOn.current === "keyboard-mouse") {
      field.current?.focus();
      field.current?.select();
    }
    // Opened by a pad or not, the card is the pads' while it is up: the d-pad steps through the names and X keeps one.
    return subscribeGamepads({
      onButton(edge) {
        if (!edge.pressed) return;
        if (edge.name === "DpadRight") anotherName(companionship, 1);
        if (edge.name === "DpadLeft") anotherName(companionship, -1);
        if (edge.name === "X") latestKeep.current();
      },
    });
  }, [companionship]);

  return (
    <div className="absolute inset-x-0 top-[16%] flex justify-center px-4">
      <div role="dialog" aria-label="Name your companion" className={`flex w-full max-w-sm flex-col items-center gap-3 px-5 py-4 ${PANEL} ${INK}`}>
        <div className="flex items-center gap-2">
          <Heart aria-hidden className={`size-6 ${HEART}`} fill="currentColor" />
          <CompanionPortrait portrait={naming.portrait} className="size-16" />
          <Heart aria-hidden className={`size-6 ${HEART}`} fill="currentColor" />
        </div>
        <input
          ref={field}
          value={text}
          maxLength={NAME_LENGTH}
          readOnly={input === "pad"}
          aria-label="Name"
          enterKeyHint="done"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setDraft({ from: suggestion, text: event.target.value });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") keep();
          }}
          className="w-full rounded-xl bg-(--color-hearthwood-valley-ui-shade)/70 px-3 py-2 text-center text-2xl font-semibold tracking-wide outline-none"
        />
        <div className="flex w-full justify-between gap-3">
          <PromptButton
            binding={ANOTHER}
            input={input}
            aria-label="Another name"
            title="Another name"
            onClick={() => {
              anotherName(companionship, 1);
            }}
            className="rounded-xl px-4 py-2.5 text-base"
          >
            <Dices aria-hidden className="size-6" />
          </PromptButton>
          <PromptButton binding={KEEP} input={input} aria-label="Keep this name" title="Keep this name" onClick={keep} className="rounded-xl bg-(--color-hearthwood-valley-ui-ink)/15 px-5 py-2.5 text-base">
            <Check aria-hidden className="size-6" />
          </PromptButton>
        </div>
      </div>
    </div>
  );
}

export function CompanionOverlay({ companionship, input }: { companionship: Companionship; input: InputKind }) {
  const subscribe = useCallback((listener: () => void) => subscribeCompanionship(companionship, listener), [companionship]);
  const shown = useSyncExternalStore(subscribe, () => companionship.shown);
  const [shownJoins, setShownJoins] = useState(0);
  const lingering = shown.joins > shownJoins;

  useEffect(() => {
    if (!lingering) return;
    // How long the row lingers after one joins is the feature itself.
    const joins = shown.joins;
    const hide = window.setTimeout(() => {
      setShownJoins(joins);
    }, SHOWN_AFTER_JOIN);
    return () => {
      window.clearTimeout(hide);
    };
  }, [lingering, shown.joins]);

  const { offer, naming } = shown;
  const touch = input === "touch";
  const offerLabel = offer ? (offer.name ?? (offer.species === "cat" ? "Cat" : "Dog")) : "";
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {shown.companions.map((c) => (
          <div
            key={c.key}
            ref={(element) => {
              if (element) companionship.screen.names.set(c.key, element);
              else companionship.screen.names.delete(c.key);
            }}
            style={{ opacity: 0 }}
            className={`absolute top-0 left-0 rounded-full bg-(--color-hearthwood-valley-ui-shade)/45 px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap ${INK}`}
          >
            {c.name}
          </div>
        ))}
        {shown.marks.map((m) => (
          <div
            key={m.id}
            ref={(element) => {
              if (element) companionship.screen.marks.set(m.id, element);
              else companionship.screen.marks.delete(m.id);
            }}
            style={{ opacity: 0 }}
            className="absolute top-0 left-0 flex"
          >
            {m.kind === "paw" ? (
              <PawPrint className="size-6 text-(--color-hearthwood-companion-paw)" fill="currentColor" />
            ) : m.kind === "hearts" ? (
              <>
                <Heart className={`size-5 translate-y-2 ${HEART}`} fill="currentColor" />
                <Heart className={`size-8 ${HEART}`} fill="currentColor" />
                <Heart className={`size-5 translate-y-2 ${HEART}`} fill="currentColor" />
              </>
            ) : (
              <Heart className={`size-6 ${HEART}`} fill="currentColor" />
            )}
          </div>
        ))}
      </div>

      {(shown.open || lingering) && shown.companions.length > 0 && (
        <div aria-label="Companions" className={`pointer-events-none absolute left-3 flex max-h-[60%] flex-col gap-1.5 px-2.5 py-2 ${touch ? "top-16" : "top-3"} ${PANEL} ${INK}`}>
          {shown.companions.map((c, i) => (
            <div key={c.key} className={`flex items-center gap-2 ${c.following ? "" : "opacity-60"}`} title={c.following ? c.name : `${c.name}: resting at camp`}>
              <span key={i === shown.companions.length - 1 ? shown.joins : 0} className={i === shown.companions.length - 1 && lingering ? "inline-flex animate-[hearthwood-forage-pop_500ms_ease-out]" : "inline-flex"}>
                <CompanionPortrait portrait={c.portrait} className="size-9" />
              </span>
              <span className="text-base font-semibold">{c.name}</span>
              {!c.following && <Flame aria-label="Resting at camp" className="size-4 text-(--color-hearthwood-valley-fire-flame)" />}
            </div>
          ))}
          {shown.open && !touch && <Prompt binding={COMPANIONS} input={input} className="self-end opacity-70" />}
        </div>
      )}

      {offer &&
        !naming &&
        (touch ? (
          <div className="absolute top-[70%] left-1/2 flex -translate-x-1/2 gap-2">
            {offer.canPet && (
              <button
                type="button"
                onClick={() => {
                  petAnimal(companionship, offer.key);
                }}
                aria-label={`Pet: ${offerLabel}`}
                title={`Pet: ${offerLabel}`}
                className={`flex items-center gap-2 px-4 py-2.5 ${PANEL} ${INK}`}
              >
                <Hand aria-hidden className="size-6" />
                <CompanionPortrait portrait={offer.portrait} className="size-8" />
              </button>
            )}
            {offer.treat && (
              <button
                type="button"
                onClick={() => {
                  treatAnimal(companionship, offer.key);
                }}
                aria-label={`Give a treat: ${treatName(offer.treat)}`}
                title={`Give a treat: ${treatName(offer.treat)}`}
                className={`flex items-center gap-1.5 px-4 py-2.5 ${PANEL} ${INK}`}
              >
                <Heart aria-hidden className={`size-5 ${HEART}`} />
                <TreatIcon treat={offer.treat} className="size-8" />
              </button>
            )}
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-x-0 top-[68%] flex justify-center">
            <div className={`flex items-center gap-4 px-3 py-2 text-base ${PANEL} ${INK}`}>
              {offer.canPet && (
                <span aria-label={`Pet: ${offerLabel}`} title={`Pet: ${offerLabel}`} className="flex items-center gap-2">
                  <Prompt binding={INTERACT} input={input} />
                  <Hand aria-hidden className="size-6" />
                  <CompanionPortrait portrait={offer.portrait} className="size-8" />
                </span>
              )}
              {offer.treat && (
                <span aria-label={`Give a treat: ${treatName(offer.treat)}`} title={`Give a treat: ${treatName(offer.treat)}`} className="flex items-center gap-1.5">
                  <Prompt binding={TREAT} input={input} />
                  <Heart aria-hidden className={`size-5 ${HEART}`} />
                  <TreatIcon treat={offer.treat} className="size-8" />
                </span>
              )}
            </div>
          </div>
        ))}

      {touch && shown.companions.length > 0 && (
        <button
          type="button"
          aria-label="Companions"
          title="Companions"
          aria-pressed={shown.open}
          onClick={() => {
            setCompanionsOpen(companionship, !shown.open);
          }}
          className={`absolute top-3 left-[7.25rem] flex size-11 items-center justify-center ${PANEL} ${INK}`}
        >
          <PawPrint aria-hidden className="size-6" />
        </button>
      )}

      {naming && <NamingCard key={naming.key} companionship={companionship} naming={naming} input={input} />}
    </>
  );
}
