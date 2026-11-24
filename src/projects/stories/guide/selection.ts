import type { Mark } from "./timeline-layout";

/** What the reader has picked, which the detail panel shows. */
export type Selection =
  | { type: "event"; id: string }
  | { type: "chapter"; index: number }
  | { type: "person"; id: string }
  | { type: "place"; id: string };

export function selectionOf(mark: Mark): Selection {
  switch (mark.type) {
    case "event":
      return { type: "event", id: mark.id };
    case "chapter":
      return { type: "chapter", index: mark.index };
    case "born":
    case "died":
      return { type: "person", id: mark.person };
  }
}

/** Whether a mark on the timeline is the thing selected. */
export function isSelected(mark: Mark, selection: Selection | null): boolean {
  if (selection === null) return false;
  switch (mark.type) {
    case "event":
      return selection.type === "event" && selection.id === mark.id;
    case "chapter":
      return selection.type === "chapter" && selection.index === mark.index;
    case "born":
    case "died":
      return selection.type === "person" && selection.id === mark.person;
  }
}
