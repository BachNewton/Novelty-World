"use client";

import { Suspense, use, useState, type RefObject } from "react";
import type { RuleNotes } from "../../data/rule-notes";
import { describeDecision } from "../../engine/describe";
import { viewExplorer, type EventView, type GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import type { InputKind } from "../../input/controls";
import type { PlayChoices } from "../../play/choices";
import { costText, warningLines, type RoutePreview } from "../../play/preview";
import { happenings, whyItems, type Happening, type WhyItem } from "../../play/status";
import type { Action } from "../../types";
import { seatLabel } from "../describe";
import { ErrorBox } from "../error-box";
import { PendingPanel } from "../pending-panel";
import { RuleDetail, ruleNotes } from "../why";
import { GhostPanel, type GhostPlacer } from "./ghost-placer";
import { boxActions } from "../../play/sheet";
import type { FigureId } from "../../types";
import { Prompt } from "../prompts";
import { DecisionPart } from "./decision-panel";
import { HappeningLine } from "./happening-line";
import { boxPart } from "../../play/panels";
import type { Moment } from "./presenting";
import { RevealNow } from "./reveal";
import { seatDot, seatText } from "./seat-colour";

/*
 * The one status box: what just happened (in icons where icons say it),
 * why it happened (a tap away), and what the player holding the device can
 * do now. "Now" is the strongest part and stays in view; when many things
 * happened at once, the parts above it scroll within the box. While beats
 * play, "now" is skipping them: the choices wait until they are over. It is
 * the lowest layer a controller's focus works in: the d-pad's down moves the
 * focus from the house into "now", and up past the box's top row gives it
 * back. Its buttons carry their controls' glyphs; it spells out none.
 */

export interface StatusBoxProps {
  /** The box, for a controller to move the focus round its buttons. */
  boxRef: RefObject<HTMLElement | null>;
  view: GameView;
  /** The events to tell: the latest the presenter played, as the holder may see them. */
  told: EventView[];
  /** The line held as a moment, or null. */
  moment: Moment | null;
  /** Beats are playing: the choices wait until they are over, and any input skips them. */
  playing: boolean;
  /** Skips the beats playing. */
  skip: () => void;
  holder: number;
  problem: string | null;
  choices: PlayChoices;
  ghost: GhostPlacer | null;
  input: InputKind;
  act: (action: Action) => void;
  /** The route of the place in focus, previewed before it is chosen. */
  preview: RoutePreview | null;
  /** Something about the device to tell the table (a pad that disconnected), or null. */
  notice?: string | null;
  /** Opens the game menu, where pads take and give back seats. */
  openMenu?: () => void;
  /** End turn's hold: under way, its end (the turn ends), and whether it was let go too soon. */
  endHold: { holding: boolean; onHeld: () => void; tapped: boolean };
  /** The acting player's explorer, with the count of the turn's actions on its sheet; null with no explorer to show. */
  explorer: { count: number } | null;
  openExplorer: () => void;
  /** Opens the trade sheet with an explorer. */
  openTrade: (figure: FigureId) => void;
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

/** The lines of the events told, as the holder may read them. Events with
 *  nothing to say (a question asked mid-move) leave the last ones up. */
function useCaption(view: GameView, told: EventView[], notes: RuleNotes | null): { key: string | null; lines: Happening[] } {
  const lines = happenings(ENGINE, { ...view, events: told }, notes);
  const key = told.at(0)?.id ?? null;
  const [caption, setCaption] = useState({ key, lines });
  if (key !== caption.key && lines.length > 0) setCaption({ key, lines });
  return caption;
}

function Box({ notes, boxRef, ...props }: StatusBoxProps & { notes: RuleNotes | null }) {
  const { view, told, moment, problem } = props;
  const caption = useCaption(view, told, notes);
  const pending = view.pending;
  const raisedBy = pending?.type === "decision" && pending.detail !== null ? pending.rule : null;
  const whys = whyItems(ENGINE, notes, caption.lines, raisedBy);

  return (
    <section
      ref={boxRef}
      aria-label="Status"
      data-pad-layer="0"
      // Only a focus the pad put here is the pad's: a button a click left focused is not.
      data-pad-owned
      className="pointer-events-auto flex max-h-[45vh] w-full flex-col overflow-y-auto rounded border border-(--bt-line) bg-(--bt-panel) sm:w-[28rem]"
    >
      {(caption.lines.length > 0 || whys.length > 0) && (
        // Keyed by the write, so a new one is read from its top.
        <div key={caption.key} className="flex min-h-0 shrink flex-col gap-1.5 overflow-y-auto px-3 py-2">
          {caption.lines.length > 0 && (
            <ul aria-label="What happened" aria-live="polite" className="flex flex-col gap-0.5 text-sm">
              {caption.lines.map((happening) =>
                moment?.event === happening.event.id ? (
                  <li key={happening.event.id} aria-current="true" className="-mx-1 rounded border-l-2 border-(--bt-accent) bg-(--bt-room) px-1 font-semibold">
                    <HappeningLine happening={happening} view={view} notes={notes} />
                  </li>
                ) : (
                  <li key={happening.event.id}>
                    <HappeningLine happening={happening} view={view} notes={notes} />
                  </li>
                ),
              )}
            </ul>
          )}
          {whys.length > 0 && <WhyList whys={whys} />}
        </div>
      )}
      <div data-now aria-label="What you can do now" className="flex shrink-0 flex-col gap-2 border-t border-(--bt-line) p-3 first:border-t-0">
        {problem !== null && <ErrorBox message={problem} />}
        {props.notice != null && <DeviceNotice text={props.notice} openMenu={props.openMenu} />}
        <Now {...props} boxRef={boxRef} notes={notes} />
      </div>
    </section>
  );
}

function DeviceNotice({ text, openMenu }: { text: string; openMenu?: () => void }) {
  return (
    <p role="status" className="flex flex-wrap items-center gap-2 rounded border border-(--bt-line) bg-(--bt-bg) px-2 py-1.5 text-sm">
      {text}
      {openMenu && (
        <button type="button" onClick={openMenu} className="min-h-9 rounded border border-(--bt-line) px-2 underline-offset-2 hover:border-(--bt-accent)">
          Seats
        </button>
      )}
    </p>
  );
}

/** The rules behind what happened, a tap away rather than shown by default. */
function WhyList({ whys }: { whys: WhyItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        data-pad-back={open || undefined}
        onClick={() => {
          setOpen(!open);
        }}
        className="inline-flex min-h-7 items-center self-start text-xs text-(--bt-muted) underline decoration-dotted hover:text-(--bt-ink)"
      >
        {open ? "Hide why" : "Why?"}
      </button>
      {open && (
        <ul aria-label="Why it happened" className="flex flex-col gap-1 border-l-2 border-(--bt-line) pl-2 text-xs text-(--bt-muted)">
          {whys.map((why) => (
            <WhyLine key={why.statement} why={why} />
          ))}
        </ul>
      )}
    </div>
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
        data-pad-back={open || undefined}
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

/** While beats play, what the player can do now is skip them. Keyed as End
 *  turn is, so it is the same button on the page: one focused stays focused. */
function skipButton(input: InputKind, skip: () => void) {
  return (
    <button key="primary" type="button" onClick={skip} className="inline-flex min-h-11 items-center gap-1.5 self-end rounded border border-(--bt-line) px-4 py-1 text-sm hover:border-(--bt-accent)">
      Skip ahead
      <Prompt meaning="confirm" input={input} size={16} />
    </button>
  );
}

/** The acting player's explorer, a press away: its glyph, and how many of the turn's actions its sheet holds. */
function ExplorerChip({ count, input, open }: { count: number; input: InputKind; open: () => void }) {
  return (
    <button type="button" onClick={open} className="inline-flex min-h-10 items-center gap-1.5 self-start rounded-full border border-(--bt-line) bg-(--bt-bg) px-3 text-sm hover:border-(--bt-accent)">
      <Prompt meaning="explorer" input={input} size={18} />
      Your explorer
      {count > 0 && <span className="text-(--bt-muted)">· {count} {count === 1 ? "action" : "actions"}</span>}
    </button>
  );
}

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

/** Where the place in focus would take the player: its cost, and every rule it would set off on the way. */
function RouteLine({ preview, label, notes }: { preview: RoutePreview; label: string; notes: RuleNotes | null }) {
  const warnings = warningLines(ENGINE, notes, preview);
  return (
    <div aria-label="Route preview" className="flex flex-col gap-0.5 rounded border border-(--bt-line) bg-(--bt-bg) px-2 py-1.5 text-sm">
      <p>
        {label}: <span className="font-semibold">{costText(preview)}</span>
      </p>
      {warnings.length > 0 && (
        <ul aria-label="On the way" className="flex flex-col gap-0.5 text-xs text-(--bt-muted)">
          {warnings.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Now({ view, holder, choices, ghost, input, act, preview, notes, playing, skip, endHold, explorer: chip, openExplorer, openTrade }: StatusBoxProps & { notes: RuleNotes | null }) {
  const { targets, panel, end } = choices;
  const pending = view.pending;
  if (playing) return <>{skipButton(input, skip)}</>;
  if (pending?.type === "ready" && view.haunt !== null) return <RevealNow view={view} holder={holder} act={act} input={input} />;
  const part = boxPart(view);
  if (part === "debug" || pending?.type !== "decision" || pending.detail === null) {
    return (
      <div data-debug-panel>
        <PendingPanel engine={ENGINE} view={view} onAction={act} />
      </div>
    );
  }

  const isTurn = pending.kind === "turn";
  const explorer = viewExplorer(view, holder);
  // The question names who is asked, as the seat's name already does.
  const question = (prompt: string) => (explorer ? prompt.replace(`${explorer.name}: `, "") : prompt);
  const prompt = isTurn
    ? `your turn.${targets.length === 0 && panel.length === 0 ? " No moves or actions left: End turn." : ""}`
    : question(describeDecision(ENGINE, view, { ...pending, params: pending.detail.params }));

  return (
    <>
      <p className="text-base">
        <SeatName view={view} holder={holder} />: {prompt}
      </p>
      {isTurn && preview && <RouteLine preview={preview} label={targets.find((target) => target.id === preview.target)?.label ?? ""} notes={notes} />}
      {isTurn && chip && <ExplorerChip count={chip.count} input={input} open={openExplorer} />}
      {ghost && <GhostPanel ghost={ghost} input={input} act={act} />}
      {part !== "turn" && part !== "ghost" && <DecisionPart part={part} view={view} panel={panel} act={act} input={input} notes={notes} />}
      {(part === "turn" || part === "ghost") && panel.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {boxActions(panel).map((entry) =>
            entry.kind === "choice" ? (
              <button
                key={entry.choice.id}
                type="button"
                className={BOX_ACTION}
                onClick={() => {
                  act(entry.choice.action);
                }}
              >
                {entry.choice.label}
              </button>
            ) : (
              <button
                key={`trade:${entry.row.with}`}
                type="button"
                className={BOX_ACTION}
                onClick={() => {
                  openTrade(entry.row.with);
                }}
              >
                Trade with {view.figures[entry.row.with].name}
              </button>
            ),
          )}
        </div>
      )}
      {end && (
        <div className="flex flex-wrap items-center justify-end gap-2 self-end">
          {endHold.tapped && <p className="text-xs text-(--bt-muted)">Hold to end your turn.</p>}
          <button
            key="primary"
            type="button"
            data-end-turn
            onClick={() => {
              act(end.action);
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded bg-(--bt-accent) px-4 py-1 font-semibold text-(--bt-bg)"
          >
            End turn
            <Prompt meaning="end-turn" input={input} size={18} hold={{ holding: endHold.holding, onHeld: endHold.onHeld }} />
          </button>
        </div>
      )}
    </>
  );
}

const BOX_ACTION = "min-h-11 rounded border border-(--bt-line) bg-(--bt-room) px-3 py-1.5 text-left text-sm hover:border-(--bt-accent)";
