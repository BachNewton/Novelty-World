"use client";

import Image from "next/image";
import { Suspense, use, useEffect, useRef } from "react";
import type { RuleNotes } from "../../data/rule-notes";
import type { HouseScene } from "../../art/house-scene";
import { describeRule } from "../../engine/describe";
import type { EventView, FigureView, GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import type { InputKind } from "../../input/controls";
import { cardMood, consequence, statChanges, type StatChange } from "../../play/cards";
import { portraitSrc } from "../../play/setup";
import type { ExplorerActions } from "../../play/sheet";
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
import { Prompt } from "../prompts";

/*
 * What the explorers carry, on the figures: a mark under each explorer with
 * a pip for each card it holds, in the card's colour, and a tag for each
 * status it keeps. Holding the stats up shows every explorer's stats in brief
 * on its mark, and a gain or loss floats up over the figure as it happens.
 * The cards' 3D props on the figures are art still to come: the pips stand
 * in for them.
 *
 * "Your explorer" is the character card as a sheet over the figure: a tab
 * for each explorer in the house, then the explorer's portrait, its four
 * trait tracks and the cards it holds, with their text. On the acting
 * player's own tab, in their turn, it holds the turn's actions on fixed
 * rows: each card held with its uses (and what using it costs) and Drop,
 * the cards on the floor to pick up, and a trade with each explorer who can.
 * Another explorer's tab is for reading only. Y, I, the box's chip, a mark
 * or the nameplate opens it.
 */

/** How high over a figure's floor its card opens, in metres: just over its head. */
const FAN_HEIGHT = 2;
const FLOAT_MS = 1800;

/** The explorers with a mark: those standing in the house, in seat order. */
export function markedExplorers(view: GameView, spots: Spots): FigureView[] {
  return Object.values(view.figures)
    .filter((figure) => figure.kind === "explorer" && spots[figure.id] !== undefined)
    .sort((a, b) => (a.owner ?? 0) - (b.owner ?? 0));
}

/** Every trait in brief, two to a row, so six explorers' stats leave the house in view. */
function CompactStats({ view, figure }: { view: GameView; figure: FigureView }) {
  return (
    <span aria-label={`${figure.name}'s stats`} className="grid grid-cols-2 gap-x-1.5 text-xs">
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
function usePinned(scene: HouseScene, group: string, figure: FigureId, height: number, lift: number, clamp: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) throw new Error(`The ${group} pin has no element`);
    scene.setPins(group, [{ element, at: { figure }, height, lift, clamp }]);
    return () => {
      scene.setPins(group, []);
    };
  }, [scene, group, figure, height, lift, clamp]);
  return ref;
}

function Mark({ scene, view, figure, statsHeld, floats, open, toggle }: {
  scene: HouseScene;
  view: GameView;
  figure: FigureView;
  statsHeld: boolean;
  floats: StatChange[];
  open: boolean;
  toggle: () => void;
}) {
  // A nameplate under the figure's base: over its head it would cover the rooms behind it, which may be choices.
  const ref = usePinned(scene, `mark:${figure.id}`, figure.id, 0, 0, false);
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
          className="pointer-events-auto flex min-h-8 min-w-8 flex-col items-center justify-center gap-0.5 rounded-full border border-(--bt-line) bg-(--bt-panel) px-1.5 py-0.5 aria-expanded:border-(--bt-accent)"
        >
          <span className="flex items-center gap-1">
            <span className={`inline-block size-2 rounded-full ${seatDot(ENGINE, figure.definition)}`} />
            {figure.cards.map((card) => (
              <CardTypeIcon key={card} type={ENGINE.catalog.cards[card].type} className={`size-3.5 ${MOOD_TEXT[cardMood(ENGINE, card)]}`} />
            ))}
            {figure.statuses.map((status) => (
              <span key={status.id} className="rounded bg-(--bt-danger) px-1 text-[10px] leading-4 font-semibold text-(--bt-bg)">
                {describeRule(ENGINE, status.rule)}
              </span>
            ))}
          </span>
          {statsHeld && <CompactStats view={view} figure={figure} />}
        </button>
      </div>
    </div>
  );
}

export interface FigureMarksProps {
  scene: HouseScene;
  view: GameView;
  spots: Spots;
  /** The events the status box tells: their gains and losses float. */
  told: readonly EventView[];
  statsHeld: boolean;
  /** The explorer whose tab the sheet shows, or null while it is closed. */
  tab: FigureId | null;
  openTab: (figure: FigureId | null) => void;
}

export function FigureMarks({ scene, view, spots, told, statsHeld, tab, openTab }: FigureMarksProps) {
  const explorers = markedExplorers(view, spots);
  const changes = statChanges(told);
  return explorers.map((figure) => (
    <Mark
      key={figure.id}
      scene={scene}
      view={view}
      figure={figure}
      statsHeld={statsHeld}
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
  input: InputKind;
  close: () => void;
}

/** "Your explorer": the character card over its figure, with the turn's actions on the acting player's tab. */
export function ExplorerSheet(props: ExplorerSheetProps) {
  const { scene, tab, close, input } = props;
  const ref = usePinned(scene, "fan", tab.id, FAN_HEIGHT, 1, true);
  const sheet = useRef<HTMLElement>(null);
  // It opens with the focus on its first action, or its tab where there is none, once the scene has put it over its figure and it shows.
  useEffect(() => {
    const pinned = ref.current;
    const section = sheet.current;
    if (!pinned || !section) throw new Error("The sheet has no element");
    const observer = new MutationObserver(() => {
      enter();
    });
    const enter = () => {
      if (pinned.style.visibility !== "visible") return;
      observer.disconnect();
      enterLayer(section);
    };
    observer.observe(pinned, { attributes: true, attributeFilter: ["style"] });
    enter();
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return (
    <div ref={ref} className="pointer-events-none invisible absolute top-0 left-0 w-[min(30rem,calc(100vw-1rem))]">
      <section
        ref={sheet}
        role="dialog"
        aria-label={`${tab.name}'s character card`}
        data-pad-layer="1"
        className="pointer-events-auto flex max-h-[70vh] flex-col gap-2 overflow-y-auto rounded border border-(--bt-accent) bg-(--bt-panel) p-2"
      >
        <div className="flex items-start gap-1.5">
          <div role="tablist" aria-label="Explorers" className="flex flex-1 flex-wrap gap-1">
            {props.explorers.map((figure) => (
              <button
                key={figure.id}
                type="button"
                role="tab"
                aria-selected={figure.id === tab.id}
                data-pad-start={(props.actions === null && figure.id === tab.id) || undefined}
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
            <Prompt meaning="back" input={input} size={16} />
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

function SheetBody({ view, tab, actions, act, openTrade, notes }: ExplorerSheetProps & { notes: RuleNotes | null }) {
  const seat = tab.owner === null ? null : view.seats[tab.owner];
  const rows = actions?.figure === tab.id ? actions.rows : null;
  // The first action takes the focus as the sheet opens.
  const first = rows && [...rows.held.flatMap((row) => [...row.uses, ...(row.drop ? [row.drop] : [])]).map((choice) => choice.id), ...rows.floor.map(({ pickUp }) => pickUp.id), ...rows.trades.map((trade) => `trade:${trade.with}`)][0];
  const start = (id: string) => id === first || undefined;
  return (
    <>
      <header className="flex items-center gap-2">
        <Image src={portraitSrc(tab.definition)} alt="" width={48} height={60} draggable={false} className="h-15 w-12 shrink-0 rounded border border-(--bt-line) object-cover" />
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 font-semibold">
            <span className={`inline-block size-2.5 shrink-0 rounded-full ${seatDot(ENGINE, tab.definition)}`} />
            {tab.name}
          </span>
          {seat && <span className="truncate text-xs text-(--bt-muted)">{seat.name}</span>}
        </span>
      </header>
      <div className="flex flex-col gap-1">
        {figureTracks(ENGINE, view, tab.id).map((track) => (
          <TrackRow key={track.trait} track={track} />
        ))}
      </div>
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
              <button type="button" data-pad-start={start(pickUp.id)} onClick={() => act(pickUp.action)} className={ACTION}>
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

/** The on-screen button that shows every explorer's stats while it is held, as Z or a controller's R3 does. */
export function StatsButton({ held, hold, input, className }: { held: boolean; hold: (on: boolean) => void; input: InputKind; className: string }) {
  return (
    <button
      type="button"
      aria-label="Show the stats"
      aria-pressed={held}
      title="Hold to show every explorer's stats"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        hold(true);
      }}
      onPointerUp={() => {
        hold(false);
      }}
      onPointerCancel={() => {
        hold(false);
      }}
      // A long press would otherwise open the page's menu over the house.
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      className={`touch-none select-none ${className}`}
    >
      Stats
      <Prompt meaning="stats" input={input} size={16} />
    </button>
  );
}
