"use client";

import type { ComponentType, Ref } from "react";
import { Check, CircleDot, Cog, Hand, Ruler, Snowflake, Sun, ToggleLeft, ToggleRight } from "lucide-react";
import type { MenuItemId } from "../render/game-menu";
import type { Units } from "../units";
import type { Tyre } from "../sim/surfaces";
import type { Shifting } from "../sim/gearbox";

/* What the game menu and its Settings page share: the game's UI colours, a setting's choices side by side, and a menu's button. */

export const INK = "var(--color-aland-drive-ui-ink)";
export const SHADE = "var(--color-aland-drive-ui-shade)";
export const ACCENT = "var(--color-aland-drive-ui-accent)";
export const CHALLENGE = "var(--color-aland-drive-ui-challenge)";

export type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export interface ItemLook {
  icon: Icon;
  label: string;
  /** For an item that is a setting: whether it's on. */
  on?: boolean;
}

export const TYRE_LOOKS: Record<Tyre, { icon: Icon; name: string }> = {
  summer: { icon: Sun, name: "Summer" },
  winter: { icon: Snowflake, name: "Friction" },
  studded: { icon: CircleDot, name: "Studded" },
};

export const SHIFTING_LOOKS: Record<Shifting, { icon: Icon; name: string }> = {
  auto: { icon: Cog, name: "Auto" },
  manual: { icon: Hand, name: "Manual" },
};

export const UNITS_LOOKS: Record<Units, { icon: Icon; name: string; detail: string }> = {
  metric: { icon: Ruler, name: "Metric", detail: "km/h · °C · 24h" },
  imperial: { icon: Ruler, name: "Imperial", detail: "mph · °F · 12h" },
};

/**
 * A setting's choices side by side, the one in force marked: each picks its own, so no button has to say whether it's
 * what's set or what pressing it would set. The tyres and the units are each one.
 */
export function SideBySide({ name, choices, first, onPick }: { name: string; choices: { id: MenuItemId; icon: Icon; label: string; spoken: string; detail?: string; on: boolean }[]; first?: Ref<HTMLButtonElement>; onPick: (id: MenuItemId) => void }) {
  return (
    <div role="radiogroup" aria-label={name} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}>
      {choices.map(({ id, icon: Icon, label, spoken, detail, on }, index) => (
        <button
          key={id}
          ref={index === 0 ? first : undefined}
          type="button"
          role="radio"
          aria-checked={on}
          aria-label={spoken}
          data-pad-start={(index === 0 && first !== undefined) || undefined}
          className="relative flex cursor-pointer flex-col items-center gap-1 rounded border-2 px-2 py-2 text-sm font-semibold"
          style={{ borderColor: on ? ACCENT : "transparent", color: on ? ACCENT : INK }}
          onClick={() => { onPick(id); }}
        >
          {on && <Check aria-hidden className="absolute top-1 right-1 size-4" />}
          <Icon aria-hidden className="size-6" />
          <span>{label}</span>
          {detail !== undefined && <span className="text-xs font-normal opacity-80">{detail}</span>}
        </button>
      ))}
    </div>
  );
}

/** One of a menu's buttons: an icon and a label, with a switch's look when it is a setting on or off. */
export function MenuButton({ look: { icon: Icon, label, on }, border = INK, start = false, back = false, buttonRef, onPress }: { look: ItemLook; border?: string; start?: boolean; back?: boolean; buttonRef?: Ref<HTMLButtonElement>; onPress: () => void }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-pressed={on}
      data-pad-start={start || undefined}
      data-pad-back={back || undefined}
      data-pad-menu={back || undefined}
      className="flex cursor-pointer items-center gap-3 rounded border-2 px-3 py-2 text-left text-lg font-semibold"
      style={{ borderColor: border }}
      onClick={onPress}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      <span className="grow">{label}</span>
      {on !== undefined && (on ? <ToggleRight aria-hidden className="size-7 shrink-0" style={{ color: ACCENT }} /> : <ToggleLeft aria-hidden className="size-7 shrink-0 opacity-50" />)}
    </button>
  );
}
