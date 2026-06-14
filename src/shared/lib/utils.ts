import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** True when the app is running against a local dev/build host (the dev server
 *  or a local production build), as opposed to a deployed environment. Safe on
 *  the server (returns false when there's no `window`). */
export function isLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/** Fisher-Yates shuffle — returns a new array, leaves the input untouched.
 *  `random` supplies uniform values in [0, 1); it defaults to `Math.random`,
 *  but a caller that needs determinism (e.g. a seeded game engine) can inject
 *  its own RNG so the shuffle is reproducible. */
export function shuffleArray<T>(
  arr: readonly T[],
  random: () => number = Math.random,
): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
