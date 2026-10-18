import type { ReactNode } from "react";
import { folkVar, type FolkLook } from "../../art/folk";

/*
 * A person's face for the overlay (the talk prompt, the storybook panel, the
 * journal), drawn from the same look as their figure: their coat at the
 * shoulders, skin, hair, a beard, the hat that says who they are, dot eyes
 * and a little blush.
 */

function hatOf(look: FolkLook): { behind: ReactNode; over: ReactNode } {
  const tone = folkVar(look.hatTone);
  const trim = folkVar(look.hatTrim);
  switch (look.hat) {
    case "knit":
      return {
        behind: null,
        over: (
          <>
            <path d="M6.8 13.4 C7 5.6 25 5.6 25.2 13.4 Z" fill={tone} />
            <rect x="6.4" y="11.8" width="19.2" height="3" rx="1.5" fill={tone} opacity="0.85" />
            <circle cx="16" cy="5.4" r="2.3" fill={trim} />
          </>
        ),
      };
    case "headscarf":
      return {
        behind: <path d="M5.6 15 C5.6 3.4 26.4 3.4 26.4 15 L25 22 L7 22 Z" fill={tone} />,
        over: (
          <>
            <path d="M6.6 14 C7 5.4 25 5.4 25.4 14 C22 11 10 11 6.6 14 Z" fill={tone} />
            <circle cx="18" cy="25.4" r="1.8" fill={tone} />
          </>
        ),
      };
    case "veil":
      return {
        behind: <path d="M6 11 L5 23 L27 23 L26 11 Z" fill="var(--color-hearthwood-folk-linen)" opacity="0.9" />,
        over: (
          <>
            <ellipse cx="16" cy="10.6" rx="12.4" ry="2.1" fill={tone} />
            <path d="M11 10.6 L11.6 5.6 L20.4 5.6 L21 10.6 Z" fill={tone} />
          </>
        ),
      };
    case "souwester":
      return {
        behind: null,
        over: (
          <>
            <path d="M7.4 12.6 C7.6 4.8 24.4 4.8 24.6 12.6 Z" fill={tone} />
            <path d="M4.6 14.4 C8 11 24 11 27.4 14.4 C24 13.2 8 13.2 4.6 14.4 Z" fill={tone} />
          </>
        ),
      };
    case "cap":
      return {
        behind: null,
        over: (
          <>
            <path d="M6.8 12.2 C7 6 25 6 25.2 12.2 Z" fill={tone} />
            <path d="M8 12.2 L24 12.2 L22.6 13.8 L9.4 13.8 Z" fill={tone} opacity="0.8" />
          </>
        ),
      };
    case "tasselled":
      return {
        behind: null,
        over: (
          <>
            <path d="M7.2 12.4 L7.8 5.6 C11 3.6 21 3.6 24.2 5.6 L24.8 12.4 Z" fill={tone} />
            <rect x="7" y="10.6" width="18" height="2.4" fill={trim} />
            <circle cx="16" cy="3.4" r="2" fill={trim} />
          </>
        ),
      };
    case "felt":
      return {
        behind: null,
        over: (
          <>
            <path d="M8.4 11.8 L11.4 3.8 L20.6 3.8 L23.6 11.8 Z" fill={tone} />
            <ellipse cx="16" cy="11.8" rx="9" ry="1.5" fill={tone} opacity="0.85" />
          </>
        ),
      };
    case "hood":
      return {
        behind: <path d="M3.8 26 C2.4 8 8 3.6 16 3.6 C24 3.6 29.6 8 28.2 26 Z" fill={tone} />,
        over: <path d="M7.4 11 C9 6.4 23 6.4 24.6 11 C21 8.8 11 8.8 7.4 11 Z" fill={tone} />,
      };
    case "none":
      return { behind: look.bun ? <circle cx="16" cy="5.2" r="3.2" fill={folkVar(look.hair)} /> : null, over: null };
  }
}

export function FolkPortrait({ look, className = "" }: { look: FolkLook; className?: string }) {
  const hat = hatOf(look);
  const hair = folkVar(look.hair);
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={`shrink-0 ${className}`}>
      {hat.behind}
      <path d="M4.5 32 C5 25 10 23.4 16 23.4 C22 23.4 27 25 27.5 32 Z" fill={folkVar(look.coat)} />
      {look.scarf && <rect x="10" y="22.4" width="12" height="3" rx="1.5" fill={folkVar(look.scarf)} />}
      <circle cx="16" cy="15.4" r="8.6" fill={folkVar(look.skin)} />
      <path d="M7.4 14.4 C7.4 6.2 24.6 6.2 24.6 14.4 C22.4 10.6 9.6 10.6 7.4 14.4 Z" fill={hair} />
      {look.beard && <path d="M9.4 18.4 C10.4 25.6 21.6 25.6 22.6 18.4 C20 21.4 12 21.4 9.4 18.4 Z" fill={hair} />}
      <circle cx="12.7" cy="15.8" r="1.15" fill={folkVar("eye")} />
      <circle cx="19.3" cy="15.8" r="1.15" fill={folkVar("eye")} />
      <ellipse cx="10.6" cy="18.8" rx="1.7" ry="1" fill={folkVar("blush")} opacity="0.85" />
      <ellipse cx="21.4" cy="18.8" rx="1.7" ry="1" fill={folkVar("blush")} opacity="0.85" />
      {hat.over}
    </svg>
  );
}
