"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { BookHeart, BookOpenText, Check, Flame, HeartHandshake, Hourglass, Mail, MessageCircle, Search, X } from "lucide-react";
import { PromptButton, type Binding } from "@/shared/components/prompts";
import { usePadNavigation } from "@/shared/lib/gamepad";
import type { InputKind } from "@/shared/lib/input";
import type { Acquaintance } from "../../gameplay/conversation";
import { folkName } from "../../gameplay/folk";
import { storyOf } from "../../stories/library";
import { folkLook } from "../../art/folk";
import { FolkPortrait } from "./folk-portrait";
import { GiftMark } from "./conversation-overlay";
import { KeepsakeIcon, KEEPSAKE_NAMES } from "./keepsake-icons";
import { NeedMark } from "./need-mark";
import { setCasebookPage, subscribeMysteries, type Mysteries } from "./mysteries";
import { Casebook } from "./mystery-overlay";
import { setJournalOpen, subscribePeople, type People } from "./people";

/*
 * The journal: everyone Elliott has met, in the order they met, each as
 * their face and name with marks for how things stand (a tale told, help
 * asked and what for, a note on its way, help given) and what they gave,
 * and the keepsakes kept at camp along the bottom. Shown, not told: the
 * words are only names and what the marks are called for those who ask.
 * Once a mystery has been told, the journal has a second page, the
 * casebook, with a tab for each page.
 */

const CLOSE: Binding = { pad: "B", key: "Esc", fills: false };
const PAGE_INK = { "--prompt-body": "var(--color-hearthwood-folk-ink)", "--prompt-ink": "var(--color-hearthwood-folk-page)" } as CSSProperties;

function Card({ id, known, worldSeed }: { id: string; known: Acquaintance; worldSeed: string }) {
  const look = useMemo(() => folkLook(known.seed, known.role), [known.seed, known.role]);
  const name = folkName(known.seed);
  const story = storyOf(known.story);
  const mark = (() => {
    if (story.kind === "help") {
      if (known.help === "given") return <HeartHandshake aria-label="Helped" className="size-6 text-(--color-hearthwood-companion-heart)" />;
      if (known.help === "delivered") {
        return (
          <span className="flex items-center" aria-label="The note was taken">
            <Mail aria-hidden className="size-5" />
            <Check aria-hidden className="size-4" />
          </span>
        );
      }
      return (
        <span className="flex items-center gap-0.5" aria-label="Asked for help">
          <Hourglass aria-hidden className="size-4 opacity-70" />
          <NeedMark request={story.request} lostSeed={`${worldSeed}/lost/${id}`} />
        </span>
      );
    }
    if (story.kind === "mystery") {
      return known.help === "given" ? (
        <span className="flex items-center" aria-label="Solved">
          <Search aria-hidden className="size-5" strokeWidth={2.6} />
          <Check aria-hidden className="size-4" />
        </span>
      ) : (
        <span className="flex items-center gap-0.5" aria-label="A mystery to solve">
          <Hourglass aria-hidden className="size-4 opacity-70" />
          <Search aria-hidden className="size-5 text-(--color-hearthwood-folk-curious)" strokeWidth={2.6} />
        </span>
      );
    }
    if (story.kind === "receive" && known.help === "given") {
      return (
        <span className="flex items-center" aria-label="Their note came">
          <Mail aria-hidden className="size-5" />
          <Check aria-hidden className="size-4" />
        </span>
      );
    }
    return <MessageCircle aria-label="Told a tale" className="size-5 opacity-80" />;
  })();
  return (
    <li className="flex flex-col items-center gap-1 rounded-xl bg-(--color-hearthwood-folk-ink)/8 px-1.5 py-2 text-center" title={`${name}: ${story.title}`}>
      <FolkPortrait look={look} className="size-14" />
      <span className="text-sm leading-tight font-semibold">{name}</span>
      <span className="flex min-h-7 items-center">{mark}</span>
      {known.received.length > 0 && (
        <span className="flex flex-wrap items-center justify-center gap-0.5">
          {known.received.map((gift, i) => (
            <GiftMark key={i} gift={gift} className="size-6" />
          ))}
        </span>
      )}
    </li>
  );
}

function Tab({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={on} aria-label={label} title={label} onClick={onClick} className={`flex items-center gap-2 rounded-xl px-2.5 py-1 text-lg font-semibold ${on ? "bg-(--color-hearthwood-folk-ink)/12" : "opacity-55"}`}>
      {children}
    </button>
  );
}

export function JournalOverlay({ people, mysteries, input }: { people: People; mysteries: Mysteries; input: InputKind }) {
  const subscribe = useCallback((listener: () => void) => subscribePeople(people, listener), [people]);
  const { journal, memory } = useSyncExternalStore(subscribe, () => people.shown);
  const subscribeCases = useCallback((listener: () => void) => subscribeMysteries(mysteries, listener), [mysteries]);
  const { casebook, book } = useSyncExternalStore(subscribeCases, () => mysteries.shown);
  const hasCases = Object.keys(book.cases).length > 0;
  const onCasebook = casebook && hasCases;
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!journal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") setJournalOpen(people, false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [people, journal]);

  usePadNavigation(root, { enabled: journal, reveal: input === "pad" });

  const met = Object.entries(memory.known).sort(([, a], [, b]) => a.order - b.order);
  if (!journal) {
    return input === "touch" && met.length > 0 ? (
      <button
        type="button"
        aria-label="Journal"
        title="Journal"
        onClick={() => setJournalOpen(people, true)}
        className="absolute top-3 left-[10.5rem] flex size-11 items-center justify-center rounded-2xl bg-(--color-hearthwood-valley-ui-shade)/60 text-(--color-hearthwood-valley-ui-ink) backdrop-blur-sm"
      >
        <BookHeart aria-hidden className="size-6" />
      </button>
    ) : null;
  }
  return (
    <div className="absolute inset-0 flex items-start justify-center overflow-y-auto px-3 pt-16 pb-4 sm:items-center sm:pt-4">
      <div ref={root} role="dialog" aria-label="Journal" className="w-full max-w-3xl rounded-2xl bg-(--color-hearthwood-folk-page) px-4 py-3 text-(--color-hearthwood-folk-ink) shadow-xl" style={PAGE_INK}>
        <div className="mb-2 flex items-center justify-between">
          <div role="tablist" className="flex items-center gap-1">
            <Tab on={!onCasebook} label={`People: ${met.length} met`} onClick={() => setCasebookPage(mysteries, false)}>
              <BookHeart aria-hidden className="size-6" />
              <span className="tabular-nums">{met.length}</span>
            </Tab>
            {hasCases && (
              <Tab on={onCasebook} label="Casebook" onClick={() => setCasebookPage(mysteries, true)}>
                <BookOpenText aria-hidden className="size-6 text-(--color-hearthwood-folk-curious)" />
                <span className="tabular-nums">{Object.keys(book.cases).length}</span>
              </Tab>
            )}
          </div>
          <PromptButton binding={CLOSE} input={input} data-pad-back="" data-pad-start="" aria-label="Close the journal" title="Close the journal" onClick={() => setJournalOpen(people, false)} className="rounded-xl px-3 py-1.5">
            <X aria-hidden className="size-5" />
          </PromptButton>
        </div>
        {onCasebook ? (
          <Casebook mysteries={mysteries} input={input} />
        ) : met.length === 0 ? (
          <div className="flex justify-center py-6 opacity-50" aria-label="Nobody met yet">
            <MessageCircle aria-hidden className="size-10" />
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {met.map(([id, known]) => (
              <Card key={id} id={id} known={known} worldSeed={people.world.seed} />
            ))}
          </ul>
        )}
        {!onCasebook && memory.keepsakes.length > 0 && (
          <div aria-label="Keepsakes at camp" className="mt-3 flex flex-wrap items-center justify-center gap-2 border-t border-(--color-hearthwood-folk-ink)/20 pt-2">
            <Flame aria-label="At camp" className="size-5 text-(--color-hearthwood-valley-fire-flame)" />
            {memory.keepsakes.map((k) => (
              <span key={k} title={KEEPSAKE_NAMES[k]} className="inline-flex">
                <KeepsakeIcon keepsake={k} className="size-10" />
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
