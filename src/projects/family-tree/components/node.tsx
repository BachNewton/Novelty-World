"use client";

import type { LaidOutNode, Person } from "../types";
import { birthYear, fullName } from "../logic";
import type { ShownHeritage } from "../heritage-symbols";
import { HeritageBadges } from "./heritage-badges";

interface NodeProps {
  node: LaidOutNode;
  person: Person;
  selected: boolean;
  isViewRoot: boolean;
  // On the view root's direct line (an ancestor or a descendant).
  onLine: boolean;
  subtitle: string | null;
  heritage: ShownHeritage;
  // A line drops from the bottom center of the card: a lone parent's.
  lineBelow: boolean;
  // Changing the key replays the flash, so picking the same person again
  // still draws the eye.
  flashKey: number | null;
  onFlashEnd: () => void;
  onSelect: (id: string) => void;
}

export function Node({
  node,
  person,
  selected,
  isViewRoot,
  onLine,
  subtitle,
  heritage,
  lineBelow,
  flashKey,
  onFlashEnd,
  onSelect,
}: NodeProps) {
  function handleClick() {
    onSelect(person.id);
  }

  const year = person.birthDate === "" ? null : birthYear(person.birthDate);
  const approximate = year?.startsWith("~") ?? false;

  return (
    <>
      <div
        className={[
          "absolute flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 px-3 py-2 text-center transition-colors",
          selected
            ? "border-brand-orange bg-surface-elevated"
            : isViewRoot
              ? "border-brand-blue bg-surface-tertiary hover:border-brand-pink"
              : onLine
                ? "border-family-direct-line bg-surface-secondary hover:border-brand-orange"
                : "border-border-default bg-surface-secondary hover:border-border-hover",
        ].join(" ")}
        style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
        onClick={handleClick}
      >
        {flashKey !== null ? (
          <span
            key={flashKey}
            aria-hidden
            className="pointer-events-none absolute -inset-0.5 animate-family-card-flash rounded-lg"
            onAnimationEnd={onFlashEnd}
          />
        ) : null}
        <span className="text-sm font-medium text-text-primary leading-tight">
          {fullName(person)}
        </span>
        {year !== null ? (
          <span
            className="mt-0.5 rounded-full bg-surface-primary px-2 py-0.5 font-mono text-xs leading-none text-brand-green"
            title={approximate ? "Born about this year" : "Birth year"}
          >
            {year}
          </span>
        ) : null}
        {subtitle !== null ? (
          <span
            className={[
              "mt-1 text-xs leading-tight",
              isViewRoot ? "text-brand-blue" : "text-text-muted",
            ].join(" ")}
          >
            {subtitle}
          </span>
        ) : null}
      </div>
      <HeritageBadges node={node} heritage={heritage} lineBelow={lineBelow} />
    </>
  );
}
