import type { Keepsake } from "../../stories/story";

/*
 * The keepsakes people give, as small drawings for the storybook panel and
 * the journal, in the same tones as their models at camp.
 */

export const KEEPSAKE_NAMES: Record<Keepsake, string> = {
  "honey-jar": "A jar of heather honey",
  "carved-fish": "A little carved pike",
  "felted-reindeer": "A felted reindeer",
  "sea-glass": "Sea glass from the far shore",
  "rowan-seedling": "A rowan seedling",
  compass: "A brass compass",
};

const c = (name: string) => `var(--color-hearthwood-folk-${name})`;

function drawing(keepsake: Keepsake) {
  switch (keepsake) {
    case "honey-jar":
      return (
        <>
          <rect x="9" y="11" width="14" height="16" rx="3" fill={c("honey")} />
          <rect x="8" y="7.5" width="16" height="4.5" rx="1.5" fill={c("red")} />
          <circle cx="16" cy="6.8" r="1.6" fill={c("red")} />
          <rect x="11" y="14" width="3" height="9" rx="1.5" fill={c("cream")} opacity="0.45" />
        </>
      );
    case "carved-fish":
      return (
        <>
          <ellipse cx="14.5" cy="16" rx="10" ry="5" fill={c("wood")} />
          <path d="M23 16 L29 11 L29 21 Z" fill={c("wood")} opacity="0.85" />
          <circle cx="9" cy="14.8" r="1.2" fill={c("eye")} />
          <path d="M12 16 L19 16" stroke={c("brown")} strokeWidth="0.8" />
        </>
      );
    case "felted-reindeer":
      return (
        <>
          <ellipse cx="14" cy="19" rx="8" ry="5" fill={c("felt")} />
          {[8, 11, 17, 20].map((x) => (
            <rect key={x} x={x} y="22" width="2" height="6" rx="1" fill={c("felt")} />
          ))}
          <circle cx="23" cy="13" r="3.6" fill={c("felt")} />
          <circle cx="26" cy="14" r="1.1" fill={c("red")} />
          <path d="M21 10 L19 4 M19.6 6 L17 5 M24 10 L26 4 M25.6 6 L28 5" stroke={c("oat")} strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </>
      );
    case "sea-glass":
      return (
        <>
          <path d="M7 18 C7 11 14 9 20 10 C26 11 27 17 24 21 C20 25 9 25 7 18 Z" fill={c("sea-glass")} />
          <path d="M11 15 C13 13 16 12.6 18 13" stroke={c("cream")} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.7" />
        </>
      );
    case "rowan-seedling":
      return (
        <>
          <path d="M16 29 L16 9" stroke={c("wood")} strokeWidth="1.6" strokeLinecap="round" />
          {[
            [10, 20, -30],
            [22, 18, 30],
            [11, 14, -30],
            [21, 12, 30],
          ].map(([x, y, r]) => (
            <ellipse key={`${x},${y}`} cx={x} cy={y} rx="4.4" ry="1.8" transform={`rotate(${r} ${x} ${y})`} fill={c("leaf")} />
          ))}
          {[
            [15, 7],
            [17.6, 7.4],
            [16.2, 5],
          ].map(([x, y]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r="1.6" fill={c("rowan")} />
          ))}
        </>
      );
    case "compass":
      return (
        <>
          <circle cx="16" cy="17" r="10" fill={c("brass")} />
          <circle cx="16" cy="17" r="7.6" fill={c("paper")} />
          <path d="M16 10.6 L18 17 L16 23.4 L14 17 Z" fill={c("red")} />
          <circle cx="16" cy="5.6" r="2" fill="none" stroke={c("brass")} strokeWidth="1.4" />
        </>
      );
  }
}

export function KeepsakeIcon({ keepsake, className = "" }: { keepsake: Keepsake; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label={KEEPSAKE_NAMES[keepsake]}>
      {drawing(keepsake)}
    </svg>
  );
}
