import type { ReactNode } from "react";
import type { CardType, Trait } from "../types";

/*
 * Betrayal's flat icons, one place for every phase: the four traits, the
 * three card types, the two kinds of damage, a pass and a fail, and a die
 * face. Line drawings on a 24-unit grid in `currentColor`, so each takes its
 * colour from the project's tokens where it is used. The screen prefers, in
 * order: showing a thing in the house, an icon, and text only for what only
 * text can explain. An icon used alone carries its name for screen readers
 * (`label`); beside words that say it already, it is hidden from them.
 */

interface IconProps {
  /** Its name for screen readers, or none when words beside it say it. */
  label?: string;
  className?: string;
}

function Icon({ label, className = "size-4", children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      className={`inline-block shrink-0 align-[-0.125em] ${className}`}
    >
      {children}
    </svg>
  );
}

const TRAIT_PATHS: Record<Trait, ReactNode> = {
  // A winged heel: running.
  speed: (
    <>
      <path d="M4 17h9l3-3h4" />
      <path d="M6 13l3-6h4l-2 4h4" />
      <path d="M3 9h3M2 12h3" />
    </>
  ),
  // A flexed arm.
  might: (
    <>
      <path d="M5 20c-1-4 0-8 3-11l2-4h3l-1 4 2 2c3-2 6-1 7 2-1 4-5 7-10 7z" />
    </>
  ),
  // A watching eye.
  sanity: (
    <>
      <path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // An open book.
  knowledge: (
    <>
      <path d="M12 6c-2-2-5-2-9-1v14c4-1 7-1 9 1 2-2 5-2 9-1V5c-4-1-7-1-9 1z" />
      <path d="M12 6v14" />
    </>
  ),
};

const TRAIT_NAMES: Record<Trait, string> = { speed: "Speed", might: "Might", sanity: "Sanity", knowledge: "Knowledge" };

export function TraitIcon({ trait, ...props }: IconProps & { trait: Trait }) {
  return <Icon {...props}>{TRAIT_PATHS[trait]}</Icon>;
}

/** A trait's icon named for screen readers, for where it stands alone. */
export const traitLabel = (trait: Trait) => TRAIT_NAMES[trait];

const CARD_PATHS: Record<CardType, ReactNode> = {
  // A key.
  item: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="M11 11l9 9M16 16l2-2M18 18l2-2" />
    </>
  ),
  // A crescent moon.
  omen: <path d="M15 3a9 9 0 1 0 6 13 7 7 0 0 1-6-13z" />,
  // A spiral: something happens.
  event: <path d="M12 12a1 1 0 1 1 1 1 3 3 0 1 1-3-3 5 5 0 1 1-5 5 7 7 0 1 1 7 7" />,
};

export function CardTypeIcon({ type, ...props }: IconProps & { type: CardType }) {
  return <Icon {...props}>{CARD_PATHS[type]}</Icon>;
}

export function DamageIcon({ kind, ...props }: IconProps & { kind: "physical" | "mental" }) {
  return (
    <Icon {...props}>
      {kind === "physical" ? (
        // A drop of blood.
        <path d="M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z" />
      ) : (
        // A crack through the mind.
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3l-2 6 4 3-3 4 1 5" />
        </>
      )}
    </Icon>
  );
}

export function PassIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 13l5 5L20 6" />
    </Icon>
  );
}

export function FailIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

/** A die as the game's dice show it: blank, one pip or two. */
export function DieFace({ value, label, className = "size-8" }: IconProps & { value: number }) {
  const pips = value === 1 ? [[12, 12]] : value === 2 ? [[8, 8], [16, 16]] : [];
  return (
    <Icon label={label} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      {pips.map(([cx, cy]) => (
        <circle key={`${cx}`} cx={cx} cy={cy} r="1.8" fill="currentColor" stroke="none" />
      ))}
    </Icon>
  );
}

