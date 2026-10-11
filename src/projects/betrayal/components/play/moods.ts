import type { Mood } from "../../play/cards";

/* Each colour's meaning as whole class names, so Tailwind sees each one. */

export const MOOD_TEXT: Record<Mood, string> = {
  moon: "text-(--bt-mood-moon)",
  human: "text-(--bt-mood-human)",
  supernatural: "text-(--bt-mood-supernatural)",
  danger: "text-(--bt-mood-danger)",
  magic: "text-(--bt-mood-magic)",
  holy: "text-(--bt-mood-holy)",
};

export const MOOD_BORDER: Record<Mood, string> = {
  moon: "border-(--bt-mood-moon)",
  human: "border-(--bt-mood-human)",
  supernatural: "border-(--bt-mood-supernatural)",
  danger: "border-(--bt-mood-danger)",
  magic: "border-(--bt-mood-magic)",
  holy: "border-(--bt-mood-holy)",
};

export const MOOD_BG: Record<Mood, string> = {
  moon: "bg-(--bt-mood-moon)",
  human: "bg-(--bt-mood-human)",
  supernatural: "bg-(--bt-mood-supernatural)",
  danger: "bg-(--bt-mood-danger)",
  magic: "bg-(--bt-mood-magic)",
  holy: "bg-(--bt-mood-holy)",
};

/** A choice's or card's left edge in its colour, the rest of its border left as it is. */
export const MOOD_EDGE: Record<Mood, string> = {
  moon: "border-l-4 border-l-(color:--bt-mood-moon)",
  human: "border-l-4 border-l-(color:--bt-mood-human)",
  supernatural: "border-l-4 border-l-(color:--bt-mood-supernatural)",
  danger: "border-l-4 border-l-(color:--bt-mood-danger)",
  magic: "border-l-4 border-l-(color:--bt-mood-magic)",
  holy: "border-l-4 border-l-(color:--bt-mood-holy)",
};
