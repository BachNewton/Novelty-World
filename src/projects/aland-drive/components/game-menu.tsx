"use client";

import { useEffect, useRef, type ComponentType } from "react";
import { Check, CircleDot, Flag, LogOut, Play, RotateCcw, Snowflake, Sun, Trophy, User, UserPlus, Users, Volume2, VolumeX, X } from "lucide-react";
import { usePadNavigation } from "@/shared/lib/gamepad";
import { PadHints } from "@/shared/components/pad-hints";
import { useDriveSoundSettings } from "../audio/settings";
import { resultText } from "../challenge/format";
import { tyreOfItem, type GameMenu as GameMenuState, type MenuItemId, type MenuResult } from "../render/game-menu";
import type { Tyre } from "../sim/surfaces";

/*
 * The game's own menu, on a pad's Menu or Esc, and a challenge's small
 * choices on its own button. The game says what it holds
 * (`render/game-menu.ts`); this draws each item by its id. It opens on its
 * first item, and B, Menu and Esc press the one the game names as its way
 * back: Resume, Cancel, or Leave on a challenge's result card.
 */

const INK = "var(--color-aland-drive-ui-ink)";
const SHADE = "var(--color-aland-drive-ui-shade)";
const ACCENT = "var(--color-aland-drive-ui-accent)";
const CHALLENGE = "var(--color-aland-drive-ui-challenge)";
const PASS = "var(--color-aland-drive-ui-pass)";
const FAIL = "var(--color-aland-drive-ui-redline)";

const TYRE_LOOKS: Record<Tyre, { icon: ItemLook["icon"]; name: string }> = {
  summer: { icon: Sun, name: "Summer" },
  winter: { icon: Snowflake, name: "Winter" },
  studded: { icon: CircleDot, name: "Studded" },
};

type TyreItem = `tyres-${Tyre}`;
const isTyreItem = (id: MenuItemId): id is TyreItem => id.startsWith("tyres-");

interface ItemLook {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  /** For an item that is a setting: whether it's on. */
  on?: boolean;
}

function useItemLook(menu: GameMenuState): (id: MenuItemId) => ItemLook {
  const muted = useDriveSoundSettings((state) => state.settings.muted);
  return (id) => {
    switch (id) {
      case "resume":
        return { icon: Play, label: "Resume" };
      case "tyres-summer":
      case "tyres-winter":
      case "tyres-studded": {
        const tyre = tyreOfItem(id);
        return { icon: TYRE_LOOKS[tyre].icon, label: `${TYRE_LOOKS[tyre].name} tyres`, on: menu.tyres === tyre };
      }
      case "sound":
        return { icon: muted ? VolumeX : Volume2, label: "Sound", on: !muted };
      case "start-solo":
        return { icon: User, label: "Solo" };
      case "start-coop":
        return { icon: Users, label: `Co-op with ${menu.partner ?? ""}` };
      case "join-coop":
        return { icon: UserPlus, label: `Join ${menu.partner ?? ""}` };
      case "decline-coop":
        return { icon: X, label: "Decline" };
      case "cancel":
        return { icon: X, label: "Cancel" };
      case "retry":
        return { icon: RotateCcw, label: "Retry" };
      case "leave":
        return { icon: LogOut, label: "Leave challenge" };
    }
  };
}

/** How an attempt went: passed or not, against the target, and the best kept. */
function ResultHeader({ title, result: { passed, kind, result, target, best, team } }: { title: string; result: MenuResult }) {
  const Verdict = passed ? Check : X;
  return (
    <div className="mb-1 flex flex-col gap-1" aria-label="Result">
      <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: CHALLENGE }}>
        <Flag aria-hidden className="size-4 shrink-0" />
        <span>{title}</span>
      </div>
      <div className="flex items-center gap-2 text-2xl font-bold" style={{ color: passed ? PASS : FAIL }}>
        <Verdict aria-hidden className="size-7 shrink-0" />
        <span>{passed ? "Passed" : "Failed"}</span>
      </div>
      <div className="flex items-baseline gap-2 text-lg tabular-nums">
        <span className="text-2xl font-bold" aria-label={kind === "route" ? "Time" : "Speed"}>{result === null ? "–" : resultText(kind, result)}</span>
        <span className="opacity-75" aria-label="Target">/ {resultText(kind, target)}</span>
      </div>
      {team && (
        <div className="flex flex-col gap-0.5 text-sm tabular-nums" aria-label="Team">
          <div className="flex items-center gap-2" aria-label="Yours">
            <User aria-hidden className="size-4 shrink-0" />
            <span>{team.own === null ? "–" : resultText(kind, team.own)}</span>
          </div>
          <div className="flex items-center gap-2" aria-label={team.partnerName} title={team.partnerName}>
            <Users aria-hidden className="size-4 shrink-0" />
            <span>{team.partner === null ? "–" : resultText(kind, team.partner)}</span>
          </div>
        </div>
      )}
      {best !== null && (
        <div className="flex items-center gap-2 text-sm tabular-nums" aria-label="Best" title="Best">
          <Trophy aria-hidden className="size-4 shrink-0" style={{ color: ACCENT }} />
          <span>{resultText(kind, best)}</span>
        </div>
      )}
    </div>
  );
}

/** The tyres to fit, side by side, the fitted set marked: each picks its own, so none has to say whether it's the set on or the next. */
function TyreChoice({ items, fitted, onPick }: { items: TyreItem[]; fitted: Tyre | undefined; onPick: (id: MenuItemId) => void }) {
  return (
    <div role="radiogroup" aria-label="Tyres" className="grid grid-cols-3 gap-2">
      {items.map((id) => {
        const tyre = tyreOfItem(id);
        const { icon: Icon, name } = TYRE_LOOKS[tyre];
        const on = tyre === fitted;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${name} tyres`}
            className="relative flex cursor-pointer flex-col items-center gap-1 rounded border-2 px-2 py-2 text-sm font-semibold"
            style={{ borderColor: on ? ACCENT : "transparent", color: on ? ACCENT : INK }}
            onClick={() => { onPick(id); }}
          >
            {on && <Check aria-hidden className="absolute top-1 right-1 size-4" />}
            <Icon aria-hidden className="size-6" />
            <span>{name}</span>
          </button>
        );
      })}
    </div>
  );
}

const DIALOG_NAMES = { menu: "Game menu", start: "Start challenge", invite: "Co-op invite" } as const;

/** A choice's heading: the challenge, and who a co-op invite is from. */
function ChoiceHeader({ title, from }: { title: string; from?: string }) {
  return (
    <div className="mb-1 flex flex-col gap-1">
      {from !== undefined && (
        <div className="flex items-center gap-2 text-lg font-semibold" aria-label="From">
          <Users aria-hidden className="size-5 shrink-0" />
          <span>{from}</span>
        </div>
      )}
      <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: CHALLENGE }}>
        <Flag aria-hidden className="size-4 shrink-0" />
        <span>{title}</span>
      </div>
    </div>
  );
}

export function GameMenu({ menu, revealPadFocus, onPick }: { menu: GameMenuState; revealPadFocus: boolean; onPick: (id: MenuItemId) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const look = useItemLook(menu);
  usePadNavigation(root, { reveal: revealPadFocus });
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ ["--color-pad-focus" as string]: ACCENT }}>
      <div ref={root} role="dialog" aria-modal aria-label={menu.result ? "Challenge result" : DIALOG_NAMES[menu.kind ?? "menu"]} className="flex w-80 max-w-[90vw] flex-col gap-2 rounded-lg p-4" style={{ background: SHADE, color: INK }}>
        {menu.result && <ResultHeader title={menu.challenge ?? ""} result={menu.result} />}
        {menu.kind === "start" && <ChoiceHeader title={menu.challenge ?? ""} />}
        {menu.kind === "invite" && <ChoiceHeader title={menu.challenge ?? ""} from={menu.partner} />}
        {menu.items.map((id, index) => {
          if (isTyreItem(id)) return id === menu.items.find(isTyreItem) ? <TyreChoice key="tyres" items={menu.items.filter(isTyreItem)} fitted={menu.tyres} onPick={onPick} /> : null;
          const { icon: Icon, label, on } = look(id);
          const back = id === menu.back;
          return (
            <button
              key={id}
              ref={index === 0 ? first : undefined}
              type="button"
              aria-pressed={on}
              data-pad-start={index === 0 || undefined}
              data-pad-back={back || undefined}
              data-pad-menu={back || undefined}
              className="flex cursor-pointer items-center gap-3 rounded border-2 px-3 py-2 text-left text-lg font-semibold"
              style={{ borderColor: id === "start-solo" || id === "start-coop" || id === "join-coop" ? CHALLENGE : INK }}
              onClick={() => { onPick(id); }}
            >
              <Icon aria-hidden className="size-5 shrink-0" />
              <span className="grow">{label}</span>
            </button>
          );
        })}
        <PadHints hints={[["A", "Choose"], ["B", look(menu.back).label]]} className="mt-1" />
      </div>
    </div>
  );
}
