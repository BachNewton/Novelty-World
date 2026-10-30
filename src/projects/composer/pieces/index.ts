import { abcScore } from "../formats/abc";
import { eventsScore } from "../formats/events";
import { trackerScore } from "../formats/tracker";
import type { FormatId, Piece } from "../types";
import { ABC_SOURCE } from "./abc-piece";
import { codeScore } from "./code-piece";
import { EVENTS_SOURCE } from "./events-piece";
import { TRACKER_SOURCE } from "./tracker-piece";

// One brief, four formats, each written by a Claude that saw only its own
// format (see `ideas/brief.md`).

export const FORMATS: Record<FormatId, string> = {
  abc: "ABC notation",
  tracker: "Tracker grid",
  events: "Raw MIDI events",
  code: "Code",
  midi: "Uploaded MIDI",
};

function titleOf(source: string): string {
  const match = /^(?:T|title):\s*(.+)$/m.exec(source);
  if (match === null) throw new Error("Composer: a piece with no title");
  return match[1].trim();
}

export const PIECES: readonly Piece[] = [
  { id: "abc", title: titleOf(ABC_SOURCE), format: "abc", source: ABC_SOURCE, score: () => abcScore(ABC_SOURCE) },
  { id: "tracker", title: titleOf(TRACKER_SOURCE), format: "tracker", source: TRACKER_SOURCE, score: () => trackerScore(TRACKER_SOURCE) },
  { id: "events", title: titleOf(EVENTS_SOURCE), format: "events", source: EVENTS_SOURCE, score: () => eventsScore(EVENTS_SOURCE) },
  { id: "code", title: codeScore().title, format: "code", source: null, score: codeScore },
];
