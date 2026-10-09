"use client";

import { Suspense, use, useState, type RefObject } from "react";
import type { RuleNotes } from "../../data/rule-notes";
import { describeDecision } from "../../engine/describe";
import { viewExplorer, type GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import type { InputKind } from "../../input/controls";
import type { PlayChoices } from "../../play/choices";
import { happenings, whyItems, type Happening, type WhyItem } from "../../play/status";
import type { Action } from "../../types";
import { seatLabel } from "../describe";
import { ErrorBox } from "../error-box";
import { PendingPanel } from "../pending-panel";
import { RuleDetail, ruleNotes } from "../why";
import { GhostPanel, type GhostPlacer } from "./ghost-placer";
import { seatDot, seatText } from "./seat-colour";

/*
 * The one status box: what just happened, why it happened, and what the
 * player holding the device can do now. "Now" is the strongest part and
 * stays in view; when many things happened at once, the parts above it
 * scroll within the box.
 */

export interface StatusBoxProps {
  /** The box, for a controller to move the focus round its buttons. */
  boxRef: RefObject<HTMLElement | null>;
  view: GameView;
  holder: number;
  problem: string | null;
  choices: PlayChoices;
  ghost: GhostPlacer | null;
  input: InputKind;
  act: (action: Action) => void;
}

/** The rule texts load with the box; until they arrive it words what it can without them. */
export function StatusBox(props: StatusBoxProps) {
  return (
    <Suspense fallback={<Box {...props} notes={null} />}>
      <WithNotes {...props} />
    </Suspense>
  );
}

function WithNotes(props: StatusBoxProps) {
  return <Box {...props} notes={use(ruleNotes())} />;
}

/** The latest write's lines, as the holder may read them. A write with
 *  nothing to say (a question asked mid-move) leaves the last ones up. */
function useCaption(view: GameView, notes: RuleNotes | null): { key: string | null; lines: Happening[] } {
  const lines = happenings(ENGINE, view, notes);
  const key = view.events.at(0)?.id ?? null;
  const [caption, setCaption] = useState({ key, lines });
  if (key !== caption.key && lines.length > 0) setCaption({ key, lines });
  return caption;
}

function Box({ notes, boxRef, ...props }: StatusBoxProps & { notes: RuleNotes | null }) {
  const { view, problem, input } = props;
  const caption = useCaption(view, notes);
  const pending = view.pending;
  const raisedBy = pending?.type === "decision" && pending.detail !== null ? pending.rule : null;
  const whys = whyItems(ENGINE, notes, caption.lines, raisedBy);

  return (
    <section
      ref={boxRef}
      aria-label="Status"
      className={`pointer-events-auto flex max-h-[45vh] w-full flex-col overflow-y-auto rounded border border-(--bt-line) bg-(--bt-panel) sm:w-[28rem] ${input === "pad" ? PAD_FOCUS : ""}`}
    >
      {(caption.lines.length > 0 || whys.length > 0) && (
        // Keyed by the write, so a new one is read from its top.
        <div key={caption.key} className="flex min-h-0 shrink flex-col gap-1.5 overflow-y-auto px-3 py-2">
          {caption.lines.length > 0 && (
            <ul aria-label="What happened" aria-live="polite" className="flex flex-col gap-0.5 text-sm">
              {caption.lines.map(({ event, text }) => (
                <li key={event.id}>{text}</li>
              ))}
            </ul>
          )}
          {whys.length > 0 && (
            <ul aria-label="Why it happened" className="flex flex-col gap-1 border-l-2 border-(--bt-line) pl-2 text-xs text-(--bt-muted)">
              {whys.map((why) => (
                <WhyLine key={why.statement} why={why} />
              ))}
            </ul>
          )}
        </div>
      )}
      <div data-now aria-label="What you can do now" className="flex shrink-0 flex-col gap-2 border-t border-(--bt-line) p-3 first:border-t-0">
        {problem !== null && <ErrorBox message={problem} />}
        <Now {...props} boxRef={boxRef} />
      </div>
    </section>
  );
}

function WhyLine({ why }: { why: WhyItem }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      {why.statement}{" "}
      <button
        type="button"
        aria-expanded={open}
        className="inline-flex min-h-7 items-center underline decoration-dotted hover:text-(--bt-ink)"
        onClick={() => {
          setOpen(!open);
        }}
      >
        {open ? "Hide the full rule" : "Full rule"}
      </button>
      {open && (
        <div className="mt-1 rounded border border-(--bt-line) bg-(--bt-bg) p-2 text-(--bt-ink)">
          <Suspense fallback={<p className="text-(--bt-muted)">Loading the rules…</p>}>
            <RuleDetail rule={why.rule} />
          </Suspense>
        </div>
      )}
    </li>
  );
}

/** With a controller, the button the focus is on shows it: the pad moves the focus by hand. */
const PAD_FOCUS = "[&_button:focus]:outline-2 [&_button:focus]:outline-offset-2 [&_button:focus]:outline-(--bt-ink)";

/** A controller button's name, as a key cap; on a button, kept out of its accessible name. */
function Glyph({ children, onButton = false }: { children: string; onButton?: boolean }) {
  return (
    <span aria-hidden={onButton} className="mx-1 inline-block rounded border border-current px-1 text-xs leading-4 font-semibold">
      {children}
    </span>
  );
}

/** How to choose a place in the house, for the input the player last used. */
const PLACE_HINTS: Record<InputKind, string> = {
  "keyboard-mouse": "Click a glowing room or doorway to go there.",
  pad: "Aim at a glowing room or doorway and press A; LB / RB jump between them.",
  touch: "Tap a glowing room or doorway, then tap it again to go.",
};

/** The seat holding the device, named with its explorer, in its colour. */
function SeatName({ view, holder }: { view: GameView; holder: number }) {
  const explorer = Object.values(view.figures).find((figure) => figure.kind === "explorer" && figure.owner === holder);
  return (
    <>
      {explorer && <span className={`mr-1.5 inline-block size-2.5 rounded-full align-middle ${seatDot(ENGINE, explorer.definition)}`} />}
      <span className={`font-semibold ${explorer ? seatText(ENGINE, explorer.definition) : ""}`}>{seatLabel(view, holder)}</span>
    </>
  );
}

function Now({ view, holder, choices, ghost, input, act }: StatusBoxProps) {
  const { targets, panel, end } = choices;
  const pending = view.pending;
  if (pending?.type !== "decision" || pending.detail === null || pending.detail.answer !== null) {
    return <PendingPanel engine={ENGINE} view={view} onAction={act} />;
  }

  const isTurn = pending.kind === "turn";
  const explorer = viewExplorer(view, holder);
  // The question names who is asked, as the seat's name already does.
  const question = (prompt: string) => (explorer ? prompt.replace(`${explorer.name}: `, "") : prompt);
  const prompt = isTurn
    ? `your turn. ${
        targets.length > 0
          ? `Choose a glowing room or doorway in the house${panel.length > 0 ? ", or an action below" : ""}${end ? ", or end your turn." : "."}`
          : panel.length > 0
            ? `Choose an action below${end ? ", or end your turn." : "."}`
            : "No moves or actions left: End turn."
      }`
    : question(describeDecision(ENGINE, view, { ...pending, params: pending.detail.params }));

  return (
    <>
      <p className="text-base">
        <SeatName view={view} holder={holder} />: {prompt}
      </p>
      {isTurn && targets.length > 0 && <p className="text-xs text-(--bt-muted)">{PLACE_HINTS[input]}</p>}
      {input === "pad" && (panel.length > 0 || ghost) && (
        <p className="text-xs text-(--bt-muted)">
          <Glyph>View</Glyph> moves into this box: the d-pad goes between its buttons, <Glyph>A</Glyph> presses one, <Glyph>B</Glyph> goes back to the house.
        </p>
      )}
      {ghost && <GhostPanel ghost={ghost} input={input} act={act} />}
      {panel.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {panel.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className="min-h-11 rounded border border-(--bt-line) bg-(--bt-room) px-3 py-1.5 text-left text-sm hover:border-(--bt-accent)"
              onClick={() => {
                act(choice.action);
              }}
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}
      {end && (
        <button
          type="button"
          onClick={() => {
            act(end.action);
          }}
          className="min-h-11 self-end rounded bg-(--bt-accent) px-4 py-1 font-semibold text-(--bt-bg)"
        >
          End turn
          {input === "pad" && <Glyph onButton>X</Glyph>}
        </button>
      )}
    </>
  );
}
