"use client";

import { useEffect, useRef, type ComponentType } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import { usePadNavigation } from "@/shared/lib/gamepad";
import { PadHints } from "@/shared/components/pad-hints";
import { useDriveSoundSettings } from "../audio/settings";
import type { GameMenu as GameMenuState, MenuItemId } from "../render/game-menu";

/*
 * The game's own menu, on a pad's Menu or Esc. The game says what it holds
 * (`render/game-menu.ts`); this draws each item by its id. It opens on Resume,
 * which B, Menu and Esc press too.
 */

const INK = "var(--color-aland-drive-ui-ink)";
const SHADE = "var(--color-aland-drive-ui-shade)";
const ACCENT = "var(--color-aland-drive-ui-accent)";

interface ItemLook {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  /** For an item that is a setting: whether it's on. */
  on?: boolean;
}

function useItemLook(): (id: MenuItemId) => ItemLook {
  const muted = useDriveSoundSettings((state) => state.settings.muted);
  return (id) => {
    switch (id) {
      case "resume":
        return { icon: Play, label: "Resume" };
      case "sound":
        return { icon: muted ? VolumeX : Volume2, label: "Sound", on: !muted };
    }
  };
}

export function GameMenu({ menu, revealPadFocus, onPick }: { menu: GameMenuState; revealPadFocus: boolean; onPick: (id: MenuItemId) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const look = useItemLook();
  usePadNavigation(root, { reveal: revealPadFocus });
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ ["--color-pad-focus" as string]: ACCENT }}>
      <div ref={root} role="dialog" aria-modal aria-label="Game menu" className="flex w-72 max-w-[90vw] flex-col gap-2 rounded-lg p-4" style={{ background: SHADE, color: INK }}>
        {menu.items.map((id, index) => {
          const { icon: Icon, label, on } = look(id);
          const resume = id === "resume";
          return (
            <button
              key={id}
              ref={index === 0 ? first : undefined}
              type="button"
              aria-pressed={on}
              data-pad-start={resume || undefined}
              data-pad-back={resume || undefined}
              data-pad-menu={resume || undefined}
              className="flex cursor-pointer items-center gap-3 rounded border-2 px-3 py-2 text-left text-lg font-semibold"
              style={{ borderColor: INK }}
              onClick={() => { onPick(id); }}
            >
              <Icon aria-hidden className="size-5 shrink-0" />
              <span className="grow">{label}</span>
            </button>
          );
        })}
        <PadHints hints={[["A", "Choose"], ["B", "Resume"]]} className="mt-1" />
      </div>
    </div>
  );
}
