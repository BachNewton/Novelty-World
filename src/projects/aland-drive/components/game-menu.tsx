"use client";

import { useEffect, useRef, type ComponentType } from "react";
import { Check, Flag, LogOut, Play, RotateCcw, Trophy, Volume2, VolumeX, X } from "lucide-react";
import { usePadNavigation } from "@/shared/lib/gamepad";
import { PadHints } from "@/shared/components/pad-hints";
import { useDriveSoundSettings } from "../audio/settings";
import { resultText } from "../challenge/format";
import type { GameMenu as GameMenuState, MenuItemId, MenuResult } from "../render/game-menu";

/*
 * The game's own menu, on a pad's Menu or Esc. The game says what it holds
 * (`render/game-menu.ts`); this draws each item by its id. It opens on its
 * first item, and B, Menu and Esc press the one the game names as its way
 * back: Resume, or Leave on a challenge's result card.
 */

const INK = "var(--color-aland-drive-ui-ink)";
const SHADE = "var(--color-aland-drive-ui-shade)";
const ACCENT = "var(--color-aland-drive-ui-accent)";
const CHALLENGE = "var(--color-aland-drive-ui-challenge)";
const PASS = "var(--color-aland-drive-ui-pass)";
const FAIL = "var(--color-aland-drive-ui-redline)";

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
      case "sound":
        return { icon: muted ? VolumeX : Volume2, label: "Sound", on: !muted };
      case "start-solo":
        return { icon: Flag, label: `Start ${menu.challenge ?? ""}` };
      case "retry":
        return { icon: RotateCcw, label: "Retry" };
      case "leave":
        return { icon: LogOut, label: "Leave challenge" };
    }
  };
}

/** How an attempt went: passed or not, against the target, and the best kept. */
function ResultHeader({ title, result: { passed, kind, result, target, best } }: { title: string; result: MenuResult }) {
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
      {best !== null && (
        <div className="flex items-center gap-2 text-sm tabular-nums" aria-label="Best" title="Best">
          <Trophy aria-hidden className="size-4 shrink-0" style={{ color: ACCENT }} />
          <span>{resultText(kind, best)}</span>
        </div>
      )}
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
      <div ref={root} role="dialog" aria-modal aria-label={menu.result ? "Challenge result" : "Game menu"} className="flex w-80 max-w-[90vw] flex-col gap-2 rounded-lg p-4" style={{ background: SHADE, color: INK }}>
        {menu.result && <ResultHeader title={menu.challenge ?? ""} result={menu.result} />}
        {menu.items.map((id, index) => {
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
              style={{ borderColor: id === "start-solo" ? CHALLENGE : INK }}
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
