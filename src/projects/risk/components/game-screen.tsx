"use client";

import { Maximize2, Menu, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Prompt, PromptButton } from "@/shared/components/prompts";
import { usePadNavigation, type Direction } from "@/shared/lib/gamepad";
import { cycleChoice, type InputKind } from "@/shared/lib/input";
import { cn } from "@/shared/lib/utils";
import { BOARD_WIDTH, TERRITORY_SHAPES } from "../board/board-data";
import type { GameEvent, GameView, Move, Options } from "../contract";
import type { TerritoryId } from "../map";
import { BINDINGS } from "../ui/bindings";
import { describeEvents, phaseName } from "../ui/describe";
import { alsoPickable, back as backOut, keepSelection, NO_SELECTION, phaseEnd, pick, stepOf, type Selection } from "../ui/selection";
import { nearestTo, nextTerritory } from "../ui/territory-nav";
import { SeatMark, SeatName } from "./bits";
import { BoardMap, type BoardHandle, type Marks } from "./board-map";
import { CardsDialog, LogDialog, MenuDialog, WhyDialog } from "./overlays";
import { StatusBox } from "./status-box";
import { BUTTON, DISPLAY, DISPLAY_FONT, PANEL, RISK_THEME } from "./theme";
import { useRiskInput, type FocusZone } from "./use-risk-input";

/** What the game screen plays: the game as the seat at the device sees it, and how to move. A
 *  local game (`use-local-game.ts`) and an online one (`use-online-feed.ts`) both give it this. */
export interface GameFeed {
  view: GameView;
  /** The seat's choices, or null while it waits on someone else. */
  options: Options | null;
  /** Everything that happened, oldest first, as this seat may see it. */
  events: readonly GameEvent[];
  /** Where the last move's events start in `events`. */
  latestFrom: number;
  /** Changes when territories were dealt, to play the deal. */
  dealKey: number;
  act: (move: Move) => void;
  /** A move the engine or server refused, or a connection problem, in words. */
  problem: string | null;
  /** Who plays each seat, online, where each player has a seat of their own (`view.viewer`). A
   *  game passed round one device has none: the seat shown is whoever's turn it is. */
  players?: readonly string[];
}

type Dialog = { kind: "cards" } | { kind: "menu" } | { kind: "log" } | { kind: "why"; rule: string } | null;

/** The marker size on the screen: big enough for a fingertip, and for a couch on a TV. */
function useMarkerSize(): number {
  const [size, setSize] = useState(24);
  useEffect(() => {
    const tv = window.matchMedia("(min-width: 1800px)");
    const update = () => setSize(tv.matches ? 34 : 24);
    update();
    tv.addEventListener("change", update);
    return () => tv.removeEventListener("change", update);
  }, []);
  return size;
}

export function GameScreen({ feed, onLeave }: { feed: GameFeed; onLeave: () => void }) {
  const { view, options, act: send } = feed;
  const board = useRef<BoardHandle>(null);
  const box = useRef<HTMLDivElement>(null);
  const markerSize = useMarkerSize();

  const [input, setInput] = useState<InputKind>("keyboard-mouse");
  const [byKeys, setByKeys] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const [focus, setFocus] = useState<TerritoryId | null>(null);
  const [holding, setHolding] = useState(false);
  const [optionsSeen, setOptionsSeen] = useState(options);

  // A move changes the options: keep a selection still meaningful (attack again from the same
  // territory), and drop it when the phase moved on.
  if (optionsSeen !== options) {
    setOptionsSeen(options);
    setSelection(optionsSeen?.kind === options?.kind ? keepSelection(options, selection) : NO_SELECTION);
  }

  const step = stepOf(options, selection);
  const stepKey = JSON.stringify(step);
  const defaultAmount = step.kind === "place" || step.kind === "fortify-amount" || step.kind === "occupy" ? step.max : 1;
  const [amountFor, setAmountFor] = useState<{ key: string; value: number }>({ key: "", value: 1 });
  const amount = amountFor.key === stepKey ? amountFor.value : defaultAmount;
  const setAmount = (value: number) => setAmountFor({ key: stepKey, value });
  const [keepFor, setKeepFor] = useState<{ key: string; value: number }>({ key: "", value: 1 });
  const keep = keepFor.key === stepKey ? keepFor.value : 1;
  const setKeep = (value: number) => setKeepFor({ key: stepKey, value });

  const choices = step.kind === "pick" ? step.choices : [];
  const occupying = view.occupying ? [view.occupying.from, view.occupying.to] : [];
  const marks: Marks = {
    choices: new Set(choices),
    also: new Set(alsoPickable(options, selection)),
    selected: [...[selection.from, selection.to].filter((id): id is TerritoryId => id !== null), ...occupying],
    picking: step.kind === "pick",
  };

  const zone: FocusZone = dialog !== null ? "dialog" : step.kind === "pick" ? "map" : "box";
  const showFocus = zone === "map" && (input === "pad" || byKeys);

  const act = (move: Move) => {
    setDialog(null);
    send(move);
  };

  const choose = (territory: TerritoryId) => {
    const result = pick(options, selection, territory);
    if (result === null) return;
    if ("move" in result) act(result.move);
    else setSelection(result.selection);
  };

  const placed = (ids: readonly TerritoryId[]) => ids.map((id) => ({ id, x: TERRITORY_SHAPES[id].label[0], y: TERRITORY_SHAPES[id].label[1] }));
  const focusOn = (id: TerritoryId | null) => {
    setFocus(id);
    if (id) board.current?.reveal(id);
  };
  const currentFocus = focus !== null && choices.includes(focus) ? focus : null;
  const moveFocus = (direction: Direction) => {
    if (choices.length === 0) return;
    if (!showFocus || currentFocus === null) return focusOn(nearestTo(placed(choices), board.current?.centre() ?? { x: BOARD_WIDTH / 2, y: 300 }) as TerritoryId | null);
    const [x, y] = TERRITORY_SHAPES[currentFocus].label;
    const next = nextTerritory(placed(choices), { x, y }, direction, BOARD_WIDTH) as TerritoryId | null;
    if (next) focusOn(next);
  };

  const ending = phaseEnd(options);
  const news = describeEvents(feed.events.slice(feed.latestFrom));
  const latestLine = news.at(-1) ?? describeEvents(feed.events).at(-1);

  useRiskInput({
    zone: () => zone,
    usedInput: (kind, keys = false) => {
      setInput(kind);
      setByKeys(keys);
    },
    moveFocus,
    cycleFocus: (way) => {
      const next = cycleChoice(placed(choices), showFocus ? currentFocus : null, way, board.current?.centre() ?? { x: 0, y: 0 }) as TerritoryId | null;
      focusOn(next);
    },
    pickFocus: () => {
      if (!showFocus || currentFocus === null) return moveFocus("right");
      choose(currentFocus);
    },
    back: () => {
      const previous = backOut(selection);
      if (previous) setSelection(previous);
    },
    closeDialog: () => setDialog(null),
    endHold: (held) => setHolding(held && ending !== null && dialog === null),
    cards: () => setDialog((open) => (open?.kind === "cards" ? null : { kind: "cards" })),
    menu: () => setDialog((open) => (open?.kind === "menu" ? null : { kind: "menu" })),
    log: () => setDialog({ kind: "log" }),
    why: () => latestLine && setDialog({ kind: "why", rule: latestLine.rule }),
    overview: () => board.current?.overview(),
    less: () => {
      if (step.kind === "battle") setKeep(Math.max(1, keep - 1));
      else if (step.kind === "place" || step.kind === "fortify-amount") setAmount(Math.max(1, amount - 1));
      else if (step.kind === "occupy") setAmount(Math.max(step.min, amount - 1));
    },
    more: () => {
      if (step.kind === "battle") setKeep(Math.min(Math.max(1, view.territories[step.from].armies - 1), keep + 1));
      else if (step.kind === "place" || step.kind === "fortify-amount" || step.kind === "occupy") setAmount(Math.min(step.max, amount + 1));
    },
    dice: (count) => {
      if (step.kind === "battle" && count <= step.maxDice) act({ kind: "attack", from: step.from, to: step.to, dice: count });
    },
    blitz: () => {
      if (step.kind === "battle") act({ kind: "blitz", from: step.from, to: step.to, keepAtLeast: keep });
    },
    zoom: (factor) => board.current?.zoom(factor),
    pan: (dx, dy) => board.current?.pan(dx, dy),
  });

  // The status box holds a controller's focus while it asks for something; a keyboard player
  // lands on its main button.
  usePadNavigation(box, { enabled: zone === "box", reveal: input === "pad" });
  useEffect(() => {
    if (zone !== "box" || input === "touch") return;
    box.current?.querySelector<HTMLElement>("[data-pad-start]")?.focus({ preventScroll: true });
  }, [zone, stepKey, input]);

  const onTouch = useCallback((kind: "touch" | "mouse") => {
    setInput(kind === "touch" ? "touch" : "keyboard-mouse");
    setByKeys(false);
  }, []);

  const why = (rule: string) => setDialog({ kind: "why", rule });
  const active = view.active;
  const { players } = feed;
  const you = players ? view.viewer : null;

  return (
    <div
      style={RISK_THEME}
      className={cn(DISPLAY_FONT.variable, "fixed inset-0 flex flex-col gap-[0.5em] bg-(--rk-bg) p-[0.5em] text-[15px] text-(--rk-text) sm:text-base min-[1800px]:gap-[0.8em] min-[1800px]:px-[3vw] min-[1800px]:py-[3vh] min-[1800px]:text-[23px]")}
      onContextMenu={(event) => event.preventDefault()}
    >
      <header className="flex items-center gap-[0.6em]">
        <h1 className={cn(DISPLAY, "hidden text-[1.3em] text-(--rk-brass) sm:block")}>Risk</h1>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-[0.6em] gap-y-[0.1em]">
          {view.phase !== "game-over" && <SeatName seat={active} className="text-[1.1em]" />}
          {view.phase !== "game-over" && players && <span className="truncate">{active === you ? "you" : players[active]}</span>}
          <span className="text-(--rk-muted)">
            {phaseName(view.phase)}
            {view.turn > 0 && view.phase !== "game-over" && ` · turn ${view.turn}`}
            {view.armiesToPlace > 0 && ` · ${view.armiesToPlace} to place`}
          </span>
        </div>
        <PromptButton binding={BINDINGS.cards} input={input} className={BUTTON} onClick={() => setDialog({ kind: "cards" })} aria-label="Cards">
          Cards <span className="tabular-nums">{view.cards.hand?.length ?? 0}</span>
        </PromptButton>
        <PromptButton binding={BINDINGS.menu} input={input} className={BUTTON} onClick={() => setDialog({ kind: "menu" })} aria-label="Menu">
          <Menu size="1.1em" />
        </PromptButton>
      </header>

      <ol className="flex flex-wrap gap-x-[0.9em] gap-y-[0.2em] text-[0.85em] lg:hidden" aria-label="Players">
        {view.turnOrder.map((seat) => {
          const s = view.seats[seat];
          return (
            <li key={seat} className={cn("inline-flex items-center gap-[0.25em] tabular-nums", s.eliminated && "line-through opacity-40", seat === active && "font-bold text-(--rk-brass-bright)")}>
              <SeatMark seat={seat} />
              {seat === you && <span className="font-bold">you</span>}
              {s.territories}
              <span className="text-(--rk-muted)">/{s.armies}</span>
            </li>
          );
        })}
      </ol>

      <div className="flex min-h-0 flex-1 flex-col gap-[0.5em] lg:flex-row">
        <div className={cn(PANEL, "relative min-h-[45vh] flex-1 overflow-hidden")}>
          <BoardMap ref={board} view={view} marks={marks} focus={currentFocus} showFocus={showFocus} markerSize={markerSize} onPick={choose} onTouch={onTouch} dealKey={feed.dealKey} />
          <div className="absolute right-[0.4em] bottom-[0.4em] flex flex-col gap-[0.3em] text-[0.9em]">
            <button type="button" tabIndex={-1} className={cn(BUTTON, "min-h-[2.2em] px-[0.5em] opacity-85")} onClick={() => board.current?.zoom(1.4)} aria-label="Zoom in">
              <Plus size="1em" />
            </button>
            <button type="button" tabIndex={-1} className={cn(BUTTON, "min-h-[2.2em] px-[0.5em] opacity-85")} onClick={() => board.current?.zoom(1 / 1.4)} aria-label="Zoom out">
              <Minus size="1em" />
            </button>
            <button type="button" tabIndex={-1} className={cn(BUTTON, "min-h-[2.2em] px-[0.5em] opacity-85")} onClick={() => board.current?.overview()} aria-label="Whole map">
              <Prompt binding={BINDINGS.overview} input={input} />
              <Maximize2 size="1em" />
            </button>
          </div>
        </div>

        <aside className="flex shrink-0 flex-col gap-[0.5em] lg:w-[24em] min-[1800px]:w-[26em]">
          <StatusBox
            ref={box}
            view={view}
            options={options}
            step={step}
            amount={amount}
            setAmount={setAmount}
            keep={keep}
            setKeep={setKeep}
            act={act}
            back={() => setSelection(backOut(selection) ?? NO_SELECTION)}
            news={latestLine ? [latestLine] : []}
            onWhy={why}
            onCards={() => setDialog({ kind: "cards" })}
            endHold={{ holding, onHeld: () => ending && act(ending) }}
            input={input}
            onNewGame={onLeave}
            error={feed.problem}
          />
          <section className={cn(PANEL, "hidden flex-col gap-[0.3em] p-[0.75em] lg:flex")} aria-label="Players">
            <h2 className={cn(DISPLAY, "text-(--rk-muted)")}>Players</h2>
            <table className="w-full text-left text-[0.95em] tabular-nums">
              <thead className="text-[0.8em] text-(--rk-muted)">
                <tr>
                  <th className="font-normal" />
                  <th className="text-right font-normal">Lands</th>
                  <th className="text-right font-normal">Armies</th>
                  <th className="text-right font-normal">Cards</th>
                </tr>
              </thead>
              <tbody>
                {view.turnOrder.map((seat) => {
                  const s = view.seats[seat];
                  return (
                    <tr key={seat} className={cn(s.eliminated && "line-through opacity-40", seat === active && "text-(--rk-brass-bright)")}>
                      <td>
                        <SeatName seat={seat} />
                        {players && <span className="block max-w-[10em] truncate text-[0.85em] text-(--rk-muted)">{seat === you ? "you" : players[seat]}</span>}
                      </td>
                      <td className="text-right">{s.territories}</td>
                      <td className="text-right">{s.armies}</td>
                      <td className="text-right">{s.handSize}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[0.85em] text-(--rk-muted)">
              Next set: <span className="font-bold text-(--rk-brass)">{view.cards.nextSetValue}</span> armies · {view.cards.setsTraded} traded
            </p>
          </section>
          {news.length > 1 && (
            <section className={cn(PANEL, "hidden max-h-[14em] flex-col gap-[0.25em] overflow-y-auto p-[0.75em] text-[0.85em] lg:flex")} aria-label="What just happened">
              {news.slice(0, -1).map((line, i) => (
                <p key={i} className="text-(--rk-muted)">
                  {line.text}
                </p>
              ))}
            </section>
          )}
        </aside>
      </div>

      {dialog?.kind === "cards" && <CardsDialog view={view} options={options} act={act} onClose={() => setDialog(null)} onWhy={why} input={input} />}
      {dialog?.kind === "menu" && <MenuDialog onClose={() => setDialog(null)} onLog={() => setDialog({ kind: "log" })} onQuit={onLeave} onRules={() => why("TURN-1")} input={input} />}
      {dialog?.kind === "log" && <LogDialog log={feed.events} onClose={() => setDialog(null)} onWhy={why} input={input} />}
      {dialog?.kind === "why" && <WhyDialog rule={dialog.rule} onClose={() => setDialog(null)} input={input} />}
    </div>
  );
}
