"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { BookOpenText, Check, CircleHelp, Lightbulb, Link2, MessageCircleHeart, MessageSquareQuote, Plus, Search, Sparkles, X } from "lucide-react";
import { Prompt, PromptButton, type Binding } from "@/shared/components/prompts";
import { usePadNavigation } from "@/shared/lib/gamepad";
import type { InputKind } from "@/shared/lib/input";
import { isTextEntryTarget } from "@/shared/lib/utils";
import { folkName } from "../../gameplay/folk";
import { isSolved, mysteryOf } from "../../gameplay/sleuthing";
import { folkLook } from "../../art/folk";
import { storyOf } from "../../stories/library";
import type { Clue } from "../../stories/story";
import { ClueIcon } from "./clue-icons";
import { FolkPortrait } from "./folk-portrait";
import { caseEntry, caseShown, chooseCase, closeExamining, connectSelected, examineClue, subscribeMysteries, toggleSelected, type Mysteries } from "./mysteries";
import { subscribePeople, type People } from "./people";

/*
 * The mysteries over the scene: the prompt to examine the clue offered (a
 * button of its own on touch), the card that shows a clue examined (its
 * drawing, what it is and what Elliott made of it, gone into the
 * casebook), and the casebook, a page of the journal: each case's clues as
 * drawings and its deductions, chosen two or more at a time and connected.
 * A connection that holds is a new deduction; one that doesn't is only
 * "these don't connect yet". Solved, the case shows its teller's face, to
 * go and tell them.
 *
 * While the card is up it has the keys and buttons: F, Enter, Space or Esc
 * (the controller's X, A or B) puts it away.
 */

const EXAMINE: Binding = { pad: "X", key: "F", fills: false };
const CLOSE_CARD: Binding = { pad: "B", key: "Esc", fills: false };
const CONNECT: Binding = { pad: null, key: "Enter", fills: false };

const INK = "text-(--color-hearthwood-valley-ui-ink)";
const PANEL = "rounded-2xl bg-(--color-hearthwood-valley-ui-shade)/70 backdrop-blur-sm";
const PAGE_INK = { "--prompt-body": "var(--color-hearthwood-folk-ink)", "--prompt-ink": "var(--color-hearthwood-folk-page)" } as CSSProperties;

function useShown(mysteries: Mysteries) {
  const subscribe = useCallback((listener: () => void) => subscribeMysteries(mysteries, listener), [mysteries]);
  return useSyncExternalStore(subscribe, () => mysteries.shown);
}

/** A clue as its drawing: what was found, or a speech bubble for what was said. */
export function ClueMarkIcon({ clue, className = "size-10" }: { clue: Clue; className?: string }) {
  if (clue.kind === "found") return <ClueIcon mark={clue.mark} label={clue.title} className={className} />;
  return <MessageSquareQuote role="img" aria-label={clue.title} className={`${className} text-(--color-hearthwood-folk-curious)`} strokeWidth={1.8} />;
}

function ExaminingCard({ mysteries, input }: { mysteries: Mysteries; input: InputKind }) {
  const { examining } = useShown(mysteries);
  const root = useRef<HTMLDivElement>(null);
  const [openedOn] = useState(input);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTextEntryTarget(event.target)) return;
      if (["KeyF", "Enter", "Space", "Escape"].includes(event.code)) {
        // Enter or Space would otherwise press the button the mouse last pressed as well.
        event.preventDefault();
        closeExamining(mysteries);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mysteries]);

  usePadNavigation(root, {
    reveal: openedOn === "pad",
    intercept: (edge) => {
      if (edge.name !== "X") return false;
      closeExamining(mysteries);
      return true;
    },
  });

  if (!examining) return null;
  const { clue, count } = examining;
  return (
    <div className="absolute inset-x-0 bottom-3 flex justify-center px-3">
      <div
        ref={root}
        role="dialog"
        aria-label={`Examining: ${clue.title}`}
        className="flex w-full max-w-xl animate-[hearthwood-talk-line_350ms_ease-out] items-start gap-3 rounded-2xl bg-(--color-hearthwood-folk-page) px-4 py-3 text-(--color-hearthwood-folk-ink) shadow-xl"
        style={PAGE_INK}
      >
        <span className="relative inline-flex shrink-0 rounded-2xl bg-(--color-hearthwood-folk-ink)/8 p-1.5 ring-2 ring-(--color-hearthwood-folk-ink)/20">
          <ClueIcon mark={clue.mark} label={clue.title} className="size-20 sm:size-24" />
          <Search aria-hidden className="absolute -right-2 -bottom-2 size-7 rounded-full bg-(--color-hearthwood-folk-page) p-1 text-(--color-hearthwood-folk-curious)" strokeWidth={2.6} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-base font-bold sm:text-lg">{clue.title}</p>
          <p className="text-sm leading-snug italic sm:text-base">{clue.note}</p>
          <span className="flex animate-[hearthwood-forage-pop_600ms_ease-out] items-center gap-0.5 self-start" role="img" aria-label={`Into the casebook: ${count} clues`} title="Into the casebook">
            <BookOpenText aria-hidden className="size-6 text-(--color-hearthwood-folk-curious)" />
            <Plus aria-hidden className="size-3.5" strokeWidth={3} />
          </span>
        </div>
        <PromptButton binding={CLOSE_CARD} input={input} data-pad-back="" data-pad-start="" aria-label="Put it down" title="Put it down" onClick={() => closeExamining(mysteries)} className="-mt-1 -mr-2 rounded-xl px-2 py-1.5">
          <X aria-hidden className="size-5" />
        </PromptButton>
      </div>
    </div>
  );
}

/** Whether a clue is being examined: walking's hints step aside while it is. */
export function useExaminingOn(mysteries: Mysteries): boolean {
  const subscribe = useCallback((listener: () => void) => subscribeMysteries(mysteries, listener), [mysteries]);
  return useSyncExternalStore(subscribe, () => mysteries.shown.examining !== null);
}

export function MysteryOverlay({ mysteries, people, input }: { mysteries: Mysteries; people: People; input: InputKind }) {
  const { offer, examining } = useShown(mysteries);
  const subscribe = useCallback((listener: () => void) => subscribePeople(people, listener), [people]);
  const talking = useSyncExternalStore(subscribe, () => people.shown.talking !== null);
  return (
    <>
      {offer &&
        !examining &&
        !talking &&
        (input === "touch" ? (
          <button
            type="button"
            onClick={() => examineClue(mysteries, offer.key)}
            aria-label={`Examine: ${offer.clue.title}`}
            title={`Examine: ${offer.clue.title}`}
            className={`absolute top-[62%] left-1/2 flex -translate-x-1/2 items-center gap-2 px-4 py-2.5 ${PANEL} ${INK}`}
          >
            <Search aria-hidden className="size-6" strokeWidth={2.6} />
            <ClueIcon mark={offer.clue.mark} label={offer.clue.title} className="size-9" />
          </button>
        ) : (
          <div className="pointer-events-none absolute inset-x-0 top-[60%] flex justify-center">
            <div aria-label={`Examine: ${offer.clue.title}`} title={`Examine: ${offer.clue.title}`} className={`flex items-center gap-2 px-3 py-2 text-base ${PANEL} ${INK}`}>
              <Prompt binding={EXAMINE} input={input} />
              <Search aria-hidden className="size-6" strokeWidth={2.6} />
              <ClueIcon mark={offer.clue.mark} label={offer.clue.title} className="size-9" />
            </div>
          </div>
        ))}
      {examining && <ExaminingCard key={examining.key} mysteries={mysteries} input={input} />}
    </>
  );
}

/** One thing in a case, a clue or a deduction, as a card to choose. */
function EntryCard({ story, id, selected, fresh, onToggle }: { story: string; id: string; selected: boolean; fresh: boolean; onToggle: () => void }) {
  const entry = caseEntry(story, id);
  const mystery = mysteryOf(story);
  const solution = mystery.solution === id;
  const clue = entry.kind === "clue" ? mystery.clues.find((c) => c.id === id) : undefined;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={entry.title}
      title={entry.note}
      className={`relative flex flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-center text-xs leading-tight font-semibold sm:text-sm ${
        entry.kind === "deduction" ? "bg-(--color-hearthwood-folk-playful)/18" : "bg-(--color-hearthwood-folk-ink)/8"
      } ${selected ? "ring-3 ring-(--color-hearthwood-folk-curious)" : ""} ${solution ? "ring-2 ring-(--color-hearthwood-folk-playful)" : ""} ${fresh ? "animate-[hearthwood-forage-pop_600ms_ease-out]" : ""}`}
    >
      {clue ? (
        <ClueMarkIcon clue={clue} className="size-11" />
      ) : (
        <span className="relative inline-flex">
          <Lightbulb aria-hidden className="size-11 text-(--color-hearthwood-folk-playful)" fill="currentColor" fillOpacity={0.25} strokeWidth={1.6} />
          {solution && <Sparkles aria-hidden className="absolute -top-1 -right-2 size-5 text-(--color-hearthwood-folk-playful)" />}
        </span>
      )}
      <span>{entry.title}</span>
      {selected && <Check aria-hidden className="absolute top-1 right-1 size-4 rounded-full bg-(--color-hearthwood-folk-curious) p-0.5 text-(--color-hearthwood-folk-page)" strokeWidth={3} />}
    </button>
  );
}

/** The casebook's page of the journal. */
export function Casebook({ mysteries, input }: { mysteries: Mysteries; input: InputKind }) {
  const shown = useShown(mysteries);
  const { book, selected, verdict } = shown;
  const person = caseShown(mysteries);
  const people = Object.keys(book.cases);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTextEntryTarget(event.target) || event.code !== "Enter") return;
      if (mysteries.shown.selected.length < 2) return;
      event.preventDefault();
      connectSelected(mysteries);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mysteries]);

  if (person === null) {
    return (
      <div className="flex justify-center py-6 opacity-50" aria-label="No mysteries yet">
        <CircleHelp aria-hidden className="size-10" />
      </div>
    );
  }
  const known = book.cases[person];
  const mystery = mysteryOf(known.story);
  const solved = isSolved(known);
  const still = mystery.clues.length - known.clues.length;
  const last = selected.length > 0 ? caseEntry(known.story, selected[selected.length - 1]) : null;
  const fresh = verdict?.connection.kind === "deduced" ? verdict.connection.deduction.id : null;

  return (
    <div className="flex flex-col gap-3" aria-label="Casebook">
      {people.length > 1 && (
        <div role="group" aria-label="Cases" className="flex flex-wrap gap-2">
          {people.map((id) => (
            <CaseFace key={id} mysteries={mysteries} id={id} chosen={id === person} />
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <CasePortrait mysteries={mysteries} id={person} />
        <span className="flex-1 text-base font-bold">{storyOf(known.story).title}</span>
        <span className="flex items-center gap-1" role="img" aria-label={`${known.clues.length} of ${mystery.clues.length} clues`} title={`${known.clues.length} of ${mystery.clues.length} clues`}>
          {mystery.clues.map((c) => (
            <span key={c.id} className={`size-2.5 rounded-full ${known.clues.includes(c.id) ? "bg-(--color-hearthwood-folk-curious)" : "border border-(--color-hearthwood-folk-ink)/40"}`} />
          ))}
        </span>
      </div>

      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Clues">
        {known.clues.map((id) => (
          <li key={id} className="contents">
            <EntryCard story={known.story} id={id} selected={selected.includes(id)} fresh={false} onToggle={() => toggleSelected(mysteries, id)} />
          </li>
        ))}
        {Array.from({ length: still }, (_, i) => (
          <li key={`still/${i}`} className="flex min-h-24 items-center justify-center rounded-xl border-2 border-dashed border-(--color-hearthwood-folk-ink)/25" aria-label="A clue still to find" title="A clue still to find">
            <Search aria-hidden className="size-7 opacity-30" />
          </li>
        ))}
      </ul>

      {known.deduced.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Deductions">
          {known.deduced.map((id) => (
            <li key={id} className="contents">
              <EntryCard story={known.story} id={id} selected={selected.includes(id)} fresh={id === fresh} onToggle={() => toggleSelected(mysteries, id)} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex min-h-12 items-center gap-2 rounded-xl bg-(--color-hearthwood-folk-ink)/6 px-3 py-2">
        <Verdict mysteries={mysteries} last={last} />
        <PromptButton
          binding={CONNECT}
          input={input}
          disabled={selected.length < 2}
          aria-label="Connect"
          title="Connect"
          onClick={() => connectSelected(mysteries)}
          className="shrink-0 rounded-xl bg-(--color-hearthwood-folk-curious) px-3 py-2 text-(--color-hearthwood-folk-page) disabled:opacity-35"
        >
          <Link2 aria-hidden className="size-5" strokeWidth={2.6} />
          <span className="text-sm font-bold tabular-nums">{selected.length}</span>
        </PromptButton>
      </div>

      {solved && (
        <div className="flex items-center justify-center gap-2" role="img" aria-label="Solved: go and tell them" title="Solved: go and tell them">
          <Sparkles aria-hidden className="size-6 text-(--color-hearthwood-folk-playful)" />
          <MessageCircleHeart aria-hidden className="size-6" />
          <CasePortrait mysteries={mysteries} id={person} />
        </div>
      )}
    </div>
  );
}

function CasePortrait({ mysteries, id }: { mysteries: Mysteries; id: string }) {
  const known = mysteries.people.shown.memory.known[id] as (typeof mysteries.people.shown.memory.known)[string] | undefined;
  const look = useMemo(() => (known ? folkLook(known.seed, known.role) : null), [known]);
  if (!look || !known) return null;
  return (
    <span title={folkName(known.seed)} className="inline-flex">
      <FolkPortrait look={look} className="size-10" />
    </span>
  );
}

function CaseFace({ mysteries, id, chosen }: { mysteries: Mysteries; id: string; chosen: boolean }) {
  const known = mysteries.people.shown.memory.known[id] as (typeof mysteries.people.shown.memory.known)[string] | undefined;
  return (
    <button type="button" aria-pressed={chosen} aria-label={known ? folkName(known.seed) : id} onClick={() => chooseCase(mysteries, id)} className={`rounded-full p-0.5 ${chosen ? "ring-3 ring-(--color-hearthwood-folk-curious)" : "opacity-70"}`}>
      <CasePortrait mysteries={mysteries} id={id} />
    </button>
  );
}

function Verdict({ mysteries, last }: { mysteries: Mysteries; last: { title: string; note: string } | null }) {
  const { verdict, selected } = useShown(mysteries);
  if (verdict) {
    const { connection } = verdict;
    if (connection.kind === "not-yet") {
      return (
        <p key={verdict.at} className="flex flex-1 animate-[hearthwood-casebook-nudge_420ms_ease-out] items-center gap-2 text-sm italic sm:text-base">
          <CircleHelp aria-hidden className="size-5 shrink-0 opacity-70" />
          These don&apos;t connect yet.
        </p>
      );
    }
    return (
      <p key={verdict.at} className="flex flex-1 animate-[hearthwood-talk-line_350ms_ease-out] items-start gap-2 text-sm leading-snug sm:text-base">
        {connection.kind === "known" ? <Check aria-hidden className="mt-0.5 size-5 shrink-0" /> : <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0 text-(--color-hearthwood-folk-playful)" fill="currentColor" />}
        <span>
          <span className="font-bold">{connection.deduction.title}. </span>
          <span className="italic">{connection.deduction.note}</span>
        </span>
      </p>
    );
  }
  if (last && selected.length > 0) {
    return (
      <p className="flex flex-1 items-start gap-2 text-sm leading-snug sm:text-base">
        <Search aria-hidden className="mt-0.5 size-5 shrink-0 text-(--color-hearthwood-folk-curious)" strokeWidth={2.6} />
        <span className="italic">{last.note}</span>
      </p>
    );
  }
  return (
    <p className="flex flex-1 items-center gap-1 opacity-60" aria-label="Choose two or more to connect">
      <Check aria-hidden className="size-4" />
      <Check aria-hidden className="size-4" />
      <Link2 aria-hidden className="ml-1 size-5" />
    </p>
  );
}
