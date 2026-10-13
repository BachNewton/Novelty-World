"use client";

import { Check } from "lucide-react";
import Image from "next/image";
import { Suspense, use, useEffect, useRef } from "react";
import type { RuleNotes } from "../../data/rule-notes";
import type { HouseScene, Pin } from "../../art/house-scene";
import { describeRule } from "../../engine/describe";
import type { EventView, FigureView, GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import { cardMood, consequence, statChanges, type StatChange } from "../../play/cards";
import { portraitOf } from "../../play/portraits";
import { shortName } from "../../play/short-name";
import { figureLines, inspectFigureId } from "../../play/inspect";
import { bonusRow, type BonusState } from "../../play/room-bonus";
import { firstAction, type ExplorerActions } from "../../play/sheet";
import { cardThingId } from "../../play/things";
import type { Spots } from "../../play/spots";
import { figureTracks } from "../../play/tracks";
import type { Action, FigureId } from "../../types";
import { ruleNotes } from "../why";
import { CardFace } from "./card-face";
import { MOOD_EDGE, MOOD_TEXT } from "./moods";
import { enterLayer } from "./pad-focus";
import { seatDot } from "./seat-colour";
import { CompactTrait, TrackRow } from "./trait-track";
import { CardTypeIcon, TraitIcon, traitLabel } from "../icons";

/*
 * What the explorers carry, on the figures: a mark under each explorer with
 * a pip for each card it holds, in the card's colour, and a tag for each
 * status it keeps, drawn smaller as the camera zooms out. Holding the
 * details up turns each mark into a nameplate, the same size for everyone:
 * the seat's colour down its edge, the explorer's short name, the pips and
 * the stats in brief. A gain or loss floats up over the figure as its beat plays.
 * The cards' 3D props on the figures are art still to come: the pips stand
 * in for them.
 *
 * "Your explorer" is the character card as a sheet docked over the house: a tab
 * for each explorer in the house, then the explorer's portrait, its four
 * trait tracks and the cards it holds, with their text. On the acting
 * player's own tab, in their turn, it holds the turn's actions on fixed
 * rows: each card held with its uses (and what using it costs) and Drop,
 * the cards on the floor to pick up, and a trade with each explorer who can.
 * Another explorer's tab is for reading only. Y, I, the box's chip, a mark
 * or the nameplate opens it.
 */

const FLOAT_MS = 1800;

/** The explorers with a mark: those standing in the house, in seat order. */
export function markedExplorers(view: GameView, spots: Spots): FigureView[] {
  return Object.values(view.figures)
    .filter((figure) => figure.kind === "explorer" && spots[figure.id] !== undefined)
    .sort((a, b) => (a.owner ?? 0) - (b.owner ?? 0));
}

/** Every trait in brief, its icon and value, two to a row, so six explorers' stats leave the house in view. */
function CompactStats({ view, figure }: { view: GameView; figure: FigureView }) {
  return (
    <span aria-label={`${figure.name}'s stats`} className="grid w-full grid-cols-2 gap-x-1.5 text-xs">
      {figureTracks(ENGINE, view, figure.id).map((track) => (
        <CompactTrait key={track.trait} track={track} />
      ))}
    </span>
  );
}

/** A gain or loss rising from a figure as it happens. */
function Float({ change }: { change: StatChange }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    ref.current?.animate(
      [
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 1, transform: "translateY(-0.75rem)", offset: 0.6 },
        { opacity: 0, transform: "translateY(-1.5rem)" },
      ],
      { duration: FLOAT_MS, fill: "forwards", easing: "ease-out" },
    );
  }, []);
  return (
    <span
      ref={ref}
      data-float={change.figure}
      aria-label={`${change.spaces > 0 ? "+" : "−"}${Math.abs(change.spaces)} ${traitLabel(change.trait)}`}
      className={`pointer-events-none absolute bottom-full left-1/2 inline-flex -translate-x-1/2 items-center gap-0.5 text-base font-bold whitespace-nowrap ${change.spaces > 0 ? "text-(--bt-mood-supernatural)" : "text-(--bt-danger)"}`}
    >
      {change.spaces > 0 ? "+" : "−"}
      {Math.abs(change.spaces)}
      <TraitIcon trait={change.trait} className="size-5" />
    </span>
  );
}

/** Keeps an element over a figure while it is mounted. */
function usePinned(scene: HouseScene, group: string, figure: FigureId, { height, lift, clamp, apart }: Omit<Pin, "element" | "at">) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) throw new Error(`The ${group} pin has no element`);
    scene.setPins(group, [{ element, at: { figure }, height, lift, clamp, apart }]);
    return () => {
      scene.setPins(group, []);
    };
  }, [scene, group, figure, height, lift, clamp, apart]);
  return ref;
}

/** Outside the details, the mark: a small pill with the seat's dot and a pip per card, drawn smaller as the camera
 *  zooms out (the scene sets `--bt-pin-scale`). */
const MARK = "min-h-[2em] min-w-[2em] rounded-full border-(--bt-line) px-[0.375em] py-[0.125em] text-[calc(1rem*var(--bt-pin-scale,1))]";
/** While the details are held, the nameplate: one size and shape for every explorer, whatever their name, with the
 *  seat's colour down its edge, the short name, the pips and the stats. */
const PLATE = "gap-0.5 overflow-hidden rounded border-(--bt-line) py-0.5 pr-1 pl-2 text-base";

function Mark({ scene, view, figure, details, inspected, floats, open, toggle }: {
  scene: HouseScene;
  view: GameView;
  figure: FigureView;
  details: boolean;
  /** Pointed at while the details are held: the nameplate adds what they hold. */
  inspected: boolean;
  floats: StatChange[];
  open: boolean;
  toggle: () => void;
}) {
  // A nameplate under the figure's base: over its head it would cover the rooms behind it, which may be choices.
  // Kept apart: on a phone the figures of one room stand closer than a finger's width.
  const ref = usePinned(scene, `mark:${figure.id}`, figure.id, { height: 0, lift: 0, clamp: false, apart: true });
  const held = figure.cards.length;
  return (
    <div ref={ref} className="pointer-events-none invisible absolute top-0 left-0">
      <div className="relative">
        {floats.map((change) => (
          <Float key={change.id} change={change} />
        ))}
        <button
          type="button"
          aria-label={`${figure.name}: character card${held > 0 ? `, ${held} ${held === 1 ? "card" : "cards"} held` : ""}`}
          aria-expanded={open}
          data-mark={figure.id}
          onClick={toggle}
          data-inspected={(details && inspected) || undefined}
          className={`pointer-events-auto relative flex flex-col items-center justify-center border bg-(--bt-panel) aria-expanded:border-(--bt-accent) ${details ? `${PLATE} ${inspected ? "w-36 border-(--bt-accent)" : "w-20"}` : MARK}`}
        >
          {details && <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${seatDot(ENGINE, figure.definition)}`} />}
          {details && <span className="w-full truncate text-center text-xs leading-4 font-semibold">{shortName(figure.name)}</span>}
          <span className={`flex items-center gap-[0.25em] ${details ? "h-3.5 max-w-full overflow-hidden" : ""}`}>
            {!details && <span className={`inline-block size-[0.5em] rounded-full ${seatDot(ENGINE, figure.definition)}`} />}
            {figure.cards.map((card) => (
              <CardTypeIcon key={card} type={ENGINE.catalog.cards[card].type} className={`size-[0.875em] shrink-0 ${MOOD_TEXT[cardMood(ENGINE, card)]}`} />
            ))}
            {figure.statuses.map((status) => (
              <span key={status.id} className="truncate rounded bg-(--bt-danger) px-[0.25em] text-[0.625em] leading-[1.6] font-semibold text-(--bt-bg)">
                {describeRule(ENGINE, status.rule)}
              </span>
            ))}
          </span>
          {details && <CompactStats view={view} figure={figure} />}
          {details && inspected && (
            <span className="w-full text-left text-[11px] leading-3.5">
              <span className="block font-semibold">{figure.name}</span>
              {figureLines(ENGINE, view, figure.id).join(" ")}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

export interface FigureMarksProps {
  scene: HouseScene;
  view: GameView;
  spots: Spots;
  /** The gains and losses whose beats have started: they float. */
  floating: readonly EventView[];
  /** Whether the details are held up: each mark adds the explorer's name and stats. */
  details: boolean;
  /** What pointing has found while the details are held (`play/inspect.ts`), or null. */
  inspected: string | null;
  /** The explorer whose tab the sheet shows, or null while it is closed. */
  tab: FigureId | null;
  openTab: (figure: FigureId | null) => void;
}

export function FigureMarks({ scene, view, spots, floating, details, inspected, tab, openTab }: FigureMarksProps) {
  const explorers = markedExplorers(view, spots);
  const changes = statChanges(floating);
  return explorers.map((figure) => (
    <Mark
      key={figure.id}
      scene={scene}
      view={view}
      figure={figure}
      details={details}
      inspected={inspected === inspectFigureId(figure.id)}
      floats={changes.filter((change) => change.figure === figure.id)}
      open={figure.id === tab}
      toggle={() => {
        openTab(figure.id === tab ? null : figure.id);
      }}
    />
  ));
}

export interface ExplorerSheetProps {
  scene: HouseScene;
  view: GameView;
  /** The explorers with a tab, in seat order. */
  explorers: FigureView[];
  tab: FigureView;
  setTab: (figure: FigureId) => void;
  /** The turn's actions on the acting player's own tab, or null where there are none to take (another's tab, another decision). */
  actions: { figure: FigureId; rows: ExplorerActions } | null;
  act: (action: Action) => void;
  openTrade: (figure: FigureId) => void;
  close: () => void;
}

/** "Your explorer": the character card, docked, with the turn's actions on the acting player's tab. */
export function ExplorerSheet(props: ExplorerSheetProps) {
  const { tab, close } = props;
  const sheet = useRef<HTMLElement>(null);
  // Focusing a tab shows it: a sheet with no action opens on its own tab, never the layer's first control, which is the first explorer's tab.
  const opensOnTab = firstAction(shownActions(props)) === null;
  // It opens with the focus on its first action, or its tab where there is none.
  useEffect(() => {
    if (!sheet.current) throw new Error("The sheet has no element");
    enterLayer(sheet.current);
  }, []);
  // Docked in one place whichever tab it shows, so switching tabs never moves it: a bottom sheet on a phone, a panel at the right on a wide screen, clear of the status box.
  return (
    <div className="absolute inset-x-0 bottom-0 lg:top-[6.5rem] lg:right-3 lg:bottom-auto lg:left-auto lg:w-[30rem]">
      <section
        ref={sheet}
        role="dialog"
        aria-label={`${tab.name}'s character card`}
        data-pad-layer="1"
        className="flex h-[70vh] flex-col gap-2 overflow-y-auto rounded-t border border-(--bt-accent) bg-(--bt-panel) p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:h-auto lg:max-h-[calc(100vh-7.5rem)] lg:rounded lg:pb-2"
      >
        <div className="flex items-start gap-1.5">
          <div role="tablist" aria-label="Explorers" className="flex flex-1 flex-wrap gap-1">
            {props.explorers.map((figure) => (
              <button
                key={figure.id}
                type="button"
                role="tab"
                aria-selected={figure.id === tab.id}
                data-pad-start={(opensOnTab && figure.id === tab.id) || undefined}
                // The d-pad moving along the tabs shows each: the focus is the tab.
                onFocus={() => {
                  props.setTab(figure.id);
                }}
                onClick={() => {
                  props.setTab(figure.id);
                }}
                className="flex min-h-9 items-center gap-1 rounded border border-(--bt-line) px-2 text-xs aria-selected:border-(--bt-accent) aria-selected:bg-(--bt-room) aria-selected:font-semibold"
              >
                <span className={`inline-block size-2 shrink-0 rounded-full ${seatDot(ENGINE, figure.definition)}`} />
                {figure.name}
              </button>
            ))}
          </div>
          <button type="button" data-pad-back onClick={close} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded border border-(--bt-line) px-3 text-sm hover:border-(--bt-accent)">
            Close
          </button>
        </div>
        <Suspense fallback={<SheetBody {...props} notes={null} />}>
          <WithNotes {...props} />
        </Suspense>
      </section>
    </div>
  );
}

function WithNotes(props: ExplorerSheetProps) {
  return <SheetBody {...props} notes={use(ruleNotes())} />;
}

const ACTION = "min-h-10 rounded border border-(--bt-line) bg-(--bt-room) px-3 py-1 text-left text-sm hover:border-(--bt-accent)";

/** The turn's actions on the tab shown, or null where it shows none. */
const shownActions = ({ actions, tab }: Pick<ExplorerSheetProps, "actions" | "tab">): ExplorerActions | null => (actions?.figure === tab.id ? actions.rows : null);

const BONUS_LOOK: Record<BonusState, string> = {
  available: "border-solid border-(--bt-mood-holy) text-(--bt-mood-holy)",
  taken: "border-solid border-(--bt-line) text-(--bt-muted)",
  undiscovered: "border-dashed border-(--bt-line) text-(--bt-muted) opacity-60",
};
const BONUS_WORDS: Record<BonusState, string> = { available: "yours to take", taken: "taken", undiscovered: "not found yet" };

/** The explorer's room bonuses: each bonus room's trait, lit while theirs to take, ticked once taken, outlined while the room is still to be found. */
function BonusRow({ view, figure }: { view: GameView; figure: FigureId }) {
  const row = bonusRow(ENGINE, view, figure);
  if (row.length === 0) return null;
  return (
    <section aria-label="Room bonuses" className="flex items-center gap-2">
      <h3 className="text-xs font-semibold text-(--bt-muted)">Room bonuses</h3>
      <ul className="flex flex-wrap gap-1.5">
        {row.map(({ room, traits, state }) => {
          const name = ENGINE.catalog.rooms[room].name;
          return (
            <li
              key={room}
              data-bonus-room={room}
              data-state={state}
              aria-label={`${name}: +1 ${traits.map(traitLabel).join(" or ")}, ${BONUS_WORDS[state]}`}
              title={`${name}: ${BONUS_WORDS[state]}`}
              className={`relative flex size-8 items-center justify-center rounded-full border-2 ${BONUS_LOOK[state]}`}
            >
              {traits.map((trait) => (
                <TraitIcon key={trait} trait={trait} className="size-4" />
              ))}
              {state === "taken" && (
                <span aria-hidden className="absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full bg-(--bt-ink) text-(--bt-bg)">
                  <Check className="size-2.5" strokeWidth={4} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SheetBody({ scene, view, tab, actions, act, openTrade, notes }: ExplorerSheetProps & { notes: RuleNotes | null }) {
  const rows = shownActions({ actions, tab });
  // The first action takes the focus as the sheet opens.
  const first = firstAction(rows);
  const start = (id: string) => id === first || undefined;
  return (
    <>
      <header className="flex items-center gap-2">
        <Image src={portraitOf(tab.definition)} unoptimized alt="" width={48} height={60} draggable={false} className="h-15 w-12 shrink-0 rounded border border-(--bt-line) object-cover" />
        <span className="flex min-w-0 items-center gap-1.5 font-semibold">
          <span className={`inline-block size-2.5 shrink-0 rounded-full ${seatDot(ENGINE, tab.definition)}`} />
          {tab.name}
        </span>
      </header>
      <div className="flex flex-col gap-1">
        {figureTracks(ENGINE, view, tab.id).map((track) => (
          <TrackRow key={track.trait} track={track} />
        ))}
      </div>
      <BonusRow view={view} figure={tab.id} />
      {tab.cards.length === 0 ? (
        <p className="text-sm text-(--bt-muted)">No cards.</p>
      ) : (
        <ul aria-label="Cards held" className="flex flex-col gap-1.5">
          {tab.cards.map((card) => {
            const row = rows?.held.find((held) => held.card === card);
            const drop = row?.drop ?? null;
            const line = notes === null ? null : consequence(notes, card);
            return (
              <li key={card} className="flex flex-col gap-1">
                <CardFace card={card} notes={notes} />
                {row && (row.uses.length > 0 || drop) && (
                  <div className="flex flex-wrap gap-1.5">
                    {row.uses.map((use) => (
                      <button key={use.id} type="button" data-pad-start={start(use.id)} onClick={() => act(use.action)} className={`${ACTION} ${MOOD_EDGE[cardMood(ENGINE, card)]}`}>
                        {use.label}
                        {line !== null && <span className="block text-xs text-(--bt-muted)">{line}</span>}
                      </button>
                    ))}
                    {drop && (
                      <button type="button" data-pad-start={start(drop.id)} onClick={() => act(drop.action)} className={ACTION}>
                        Drop
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {rows && rows.floor.length > 0 && (
        <ul aria-label="On the floor" className="flex flex-col gap-1">
          {rows.floor.map(({ card, pickUp }) => (
            <li key={card} className="flex items-center justify-between gap-2 text-sm">
              <span className={`font-semibold ${MOOD_TEXT[cardMood(ENGINE, card)]}`}>{ENGINE.catalog.cards[card].name}</span>
              {/* Pointing at a card's Pick up points at the card where it lies in the room. */}
              <button
                type="button"
                data-pad-start={start(pickUp.id)}
                onFocus={() => scene.hook.focus(cardThingId(card))}
                onPointerEnter={() => scene.hook.focus(cardThingId(card))}
                onClick={() => act(pickUp.action)}
                className={ACTION}
              >
                Pick up
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.trades.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {rows.trades.map((trade) => (
            <button key={trade.with} type="button" data-pad-start={start(`trade:${trade.with}`)} onClick={() => openTrade(trade.with)} className={ACTION}>
              Trade with {view.figures[trade.with].name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
