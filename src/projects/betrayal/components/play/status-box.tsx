"use client";

import { Suspense, use, type RefObject } from "react";
import type { RuleNotes } from "../../data/rule-notes";
import { describeDecision } from "../../engine/describe";
import { seatName, viewExplorer, type EventView, type GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import type { InputKind } from "@/shared/lib/input";
import type { PlayChoices } from "../../play/choices";
import { costText, warningLines, type RoutePreview } from "../../play/preview";
import { lineText, whyItems, type WhyItem } from "../../play/status";
import type { Action } from "../../types";
import { ErrorBox } from "../error-box";
import { PendingPanel } from "../pending-panel";
import { ruleNotes } from "../why";
import { GhostPanel, type GhostPlacer } from "./ghost-placer";
import { actionRoom, boxActions } from "../../play/sheet";
import { PromptButton } from "../prompts";
import { DecisionPart } from "./decision-panel";
import { HappeningLine, HappeningTable } from "./happening-line";
import { boxPart } from "../../play/panels";
import { RevealNow } from "./reveal";
import { seatDot, seatText } from "./seat-colour";
import { WhyDialog } from "./why-dialog";

/*
 * The one status box: what the player holding the device can do now, and at
 * most one line, for the beat playing (or the last one played), in icons
 * where icons say it, with its Why. The box keeps no history: the line goes
 * when the next write's beats begin, and nothing is told before its beat
 * plays. Why opens the rules behind the line's beat, or, with nothing
 * playing, behind the pending decision, in a dialog over the house
 * (`WhyDialog`). While beats play, "now" is empty: the choices wait until
 * they are over, and any input skips them. A card's question is asked on the
 * card over the room, never here. The box is the lowest layer a controller's focus works in:
 * the d-pad's down moves the focus from the house into "now", and up past
 * the box's top row gives it back.
 */

export interface StatusBoxProps {
  /** The box, for a controller to move the focus round its buttons. */
  boxRef: RefObject<HTMLElement | null>;
  view: GameView;
  /** The line to tell and the events of its beat, as the holder may see them, or null. */
  told: { event: EventView; events: EventView[] } | null;
  /** Seconds for the line's dice to turn up while its beat plays, or null. */
  turnUp: number | null;
  /** Beats are playing: the choices wait until they are over, and any input skips them. */
  playing: boolean;
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
  /** Why is open, opening or closing it, and holding the beats between two while it is open. */
  why: { open: boolean; toggle: (open: boolean) => void; hold: (on: boolean) => void };
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

/** The rules a Why opens: the line's beat's, and, with nothing playing, the pending decision's. */
export function boxWhys(view: GameView, told: StatusBoxProps["told"], playing: boolean, notes: RuleNotes | null): WhyItem[] {
  const pending = view.pending;
  const raisedBy = !playing && pending?.type === "decision" && pending.detail !== null ? pending.rule : null;
  return whyItems(ENGINE, notes, told?.events ?? [], raisedBy);
}

function Box({ notes, boxRef, ...props }: StatusBoxProps & { notes: RuleNotes | null }) {
  const { view, told, problem, playing, why } = props;
  const text = told ? lineText(ENGINE, view, told.event, told.events) : null;
  const whys = boxWhys(view, told, playing, notes);
  const open = why.open && whys.length > 0;

  return (
    <section
      ref={boxRef}
      aria-label="Status"
      data-pad-layer="0"
      // Only a focus the pad put here is the pad's: a button a click left focused is not.
      data-pad-owned
      // With End turn apart, a turn with nothing to tell or choose here leaves the box empty, and it hides.
      className="pointer-events-auto flex has-[>[data-now]:first-child:empty]:hidden max-h-[45vh] w-full flex-col overflow-y-auto rounded border border-(--bt-line) bg-(--bt-panel) sm:w-[28rem]"
    >
      {open && (
        <WhyDialog
          whys={whys}
          hold={why.hold}
          close={() => {
            why.toggle(false);
          }}
        />
      )}
      {(text !== null || whys.length > 0) && (
        <div className="flex min-h-0 shrink-0 items-start gap-2 px-3 py-2">
          {told && text !== null && (
            // Keyed by the event, so a new line is announced and its dice turn up afresh.
            <div key={told.event.id} className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p aria-label="What happened" aria-live="polite" className="text-sm">
                <HappeningLine event={told.event} events={told.events} text={text} view={view} turnUp={props.turnUp} />
              </p>
              <HappeningTable event={told.event} events={told.events} />
            </div>
          )}
          {whys.length > 0 && (
            <PromptButton
              meaning="why"
              input={props.input}
              aria-expanded={open}
              data-why
              onClick={() => {
                why.toggle(!open);
              }}
              className="ml-auto min-h-9 shrink-0 rounded border border-(--bt-line) px-2 text-sm text-(--bt-muted) hover:border-(--bt-accent) hover:text-(--bt-ink)"
            >
              Why
            </PromptButton>
          )}
        </div>
      )}
      <div data-now aria-label="What you can do now" className="flex shrink-0 flex-col gap-2 border-t border-(--bt-line) p-3 first:border-t-0 empty:hidden">
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

/** A seat other than the turn's, asked a question mid-turn: named with its explorer, in its colour. */
export function SeatName({ view, holder }: { view: GameView; holder: number }) {
  const explorer = Object.values(view.figures).find((figure) => figure.kind === "explorer" && figure.owner === holder);
  return (
    <>
      {explorer && <span className={`mr-1.5 inline-block size-2.5 rounded-full align-middle ${seatDot(ENGINE, explorer.definition)}`} />}
      <span className={`font-semibold ${explorer ? seatText(ENGINE, explorer.definition) : ""}`}>{seatName(view, holder)}</span>
    </>
  );
}

/** What the place in focus would cost, and every rule it would set off on the way. The route itself is drawn on the floor, so it isn't told; its label stays for screen readers. */
function RouteLine({ preview, label, notes }: { preview: RoutePreview; label: string; notes: RuleNotes | null }) {
  const warnings = warningLines(ENGINE, notes, preview);
  return (
    <div aria-label="Route preview" className="flex flex-col gap-0.5 rounded border border-(--bt-line) bg-(--bt-bg) px-2 py-1.5 text-sm">
      <p>
        <span className="sr-only">{label}: </span>
        <span className="font-semibold">{costText(preview)}</span>
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

/** The holder's pending question in words, without their own name, and
 *  whether it is put to a seat other than the turn's, which it then names. */
export function questionPrompt(view: GameView, holder: number): { prompt: string; otherSeat: boolean } | null {
  const pending = view.pending;
  if (pending?.type !== "decision" || pending.detail === null || pending.kind === "turn") return null;
  const explorer = viewExplorer(view, holder);
  const prompt = describeDecision(ENGINE, view, { ...pending, params: pending.detail.params });
  return { prompt: explorer ? prompt.replace(`${explorer.name}: `, "") : prompt, otherSeat: view.turn !== null && view.turn.seat !== holder };
}

function Now({ view, holder, choices, ghost, input, act, preview, notes, playing }: StatusBoxProps & { notes: RuleNotes | null }) {
  const { targets, panel } = choices;
  const pending = view.pending;
  if (playing) return null;
  const part = boxPart(view);
  // A card's question is asked on the card over the room.
  if (part === "card") return null;
  if (part === "reveal") return <RevealNow view={view} holder={holder} act={act} />;
  if (part === "debug" || pending?.type !== "decision" || pending.detail === null) {
    return (
      <div data-debug-panel>
        <PendingPanel engine={ENGINE} view={view} onAction={act} />
      </div>
    );
  }

  // The turn needs no prompt: its places glow in the house, and End turn is at the top right.
  const isTurn = pending.kind === "turn";
  // A question for a seat other than the turn's names it, as the device passes mid-turn.
  const question = questionPrompt(view, holder);
  const actions = part === "turn" || part === "ghost" ? boxActions(panel) : [];

  return (
    <>
      {question !== null && (
        <p className="text-base">
          {question.otherSeat && (
            <>
              <SeatName view={view} holder={holder} />:{" "}
            </>
          )}
          {question.prompt}
        </p>
      )}
      {isTurn && preview && <RouteLine preview={preview} label={targets.find((target) => target.id === preview.target)?.label ?? ""} notes={notes} />}
      {ghost && <GhostPanel ghost={ghost} input={input} act={act} />}
      {part !== "turn" && part !== "ghost" && <DecisionPart part={part} view={view} panel={panel} act={act} input={input} notes={notes} />}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((choice) => {
            const room = actionRoom(choice);
            return (
              <button
                key={choice.id}
                type="button"
                className={BOX_ACTION}
                onClick={() => {
                  act(choice.action);
                }}
              >
                {/* A room's own action names the room, so it never shows without its reason. */}
                {room !== null && <span className="block text-xs text-(--bt-muted)">{ENGINE.catalog.rooms[room].name}</span>}
                {choice.label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

const BOX_ACTION = "min-h-11 rounded border border-(--bt-line) bg-(--bt-room) px-3 py-1.5 text-left text-sm hover:border-(--bt-accent)";
