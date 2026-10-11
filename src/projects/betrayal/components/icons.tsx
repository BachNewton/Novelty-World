import { BicepsFlexed, BookOpen, Brain, Check, Dice1, Dice2, Droplet, Footprints, HeartCrack, Key, Moon, Square, X, type LucideIcon } from "lucide-react";
import type { CardType, Trait } from "../types";

/*
 * Betrayal's flat icons, one place for every phase: the four traits, the
 * three card types, the two kinds of damage, a pass and a fail, and a die
 * face. Lucide's line icons where one fits, and our own drawing on Lucide's
 * grid where none does, all in `currentColor`, so each takes its colour from
 * the project's tokens where it is used. The screen prefers, in order:
 * showing a thing in the house, an icon, and text only for what only text
 * can explain. An icon used alone carries its name for screen readers
 * (`label`); beside words that say it already, it is hidden from them.
 */

interface IconProps {
  /** Its name for screen readers, or none when words beside it say it. */
  label?: string;
  className?: string;
}

const iconClass = (className: string) => `inline-block shrink-0 align-[-0.125em] ${className}`;

/** What screen readers make of an icon: its name, or nothing. */
const spoken = (label: string | undefined) => (label === undefined ? { "aria-hidden": true } : { role: "img", "aria-label": label });

function Lucide({ icon: Shown, label, className = "size-4" }: IconProps & { icon: LucideIcon }) {
  return <Shown {...spoken(label)} className={iconClass(className)} />;
}

const TRAIT_ICONS: Record<Trait, LucideIcon> = { speed: Footprints, might: BicepsFlexed, sanity: Brain, knowledge: BookOpen };

const TRAIT_NAMES: Record<Trait, string> = { speed: "Speed", might: "Might", sanity: "Sanity", knowledge: "Knowledge" };

export function TraitIcon({ trait, ...props }: IconProps & { trait: Trait }) {
  return <Lucide icon={TRAIT_ICONS[trait]} {...props} />;
}

/** A trait's icon named for screen readers, for where it stands alone. */
export const traitLabel = (trait: Trait) => TRAIT_NAMES[trait];

/** The event's spiral, drawn as Lucide draws: Lucide has no spiral. */
function EventIcon({ label, className = "size-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...spoken(label)}
      className={iconClass(className)}
    >
      <path d="M12 12a1 1 0 1 1 1 1 3 3 0 1 1-3-3 5 5 0 1 1-5 5 7 7 0 1 1 7 7" />
    </svg>
  );
}

export function CardTypeIcon({ type, ...props }: IconProps & { type: CardType }) {
  if (type === "event") return <EventIcon {...props} />;
  return <Lucide icon={type === "item" ? Key : Moon} {...props} />;
}

export function DamageIcon({ kind, ...props }: IconProps & { kind: "physical" | "mental" }) {
  return <Lucide icon={kind === "physical" ? Droplet : HeartCrack} {...props} />;
}

export function PassIcon(props: IconProps) {
  return <Lucide icon={Check} {...props} />;
}

export function FailIcon(props: IconProps) {
  return <Lucide icon={X} {...props} />;
}

/** A die as the game's dice show it: blank, one pip or two. */
export function DieFace({ value, label, className = "size-8" }: IconProps & { value: number }) {
  return <Lucide icon={value === 1 ? Dice1 : value === 2 ? Dice2 : Square} label={label} className={className} />;
}
