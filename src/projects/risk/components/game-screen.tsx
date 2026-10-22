"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from "react";
import { usePadNavigation, type Direction } from "@/shared/lib/gamepad";
import { cycleChoice, type InputKind } from "@/shared/lib/input";
import { cn } from "@/shared/lib/utils";
import { COMPOSITION, locate, WRAP_WIDTH } from "../board/graph";
import type { GameView, Move, Options } from "../contract";
import type { TerritoryId } from "../map";
import type { LoggedEvent } from "../online/game";
import type { RatedGame } from "../online/rating";
import { describeEvents } from "../ui/describe";
import { SPEEDS } from "../ui/playback";
import { alsoPickable, back as backOut, NO_SELECTION, nextSelection, phaseEnd, pick, stepOf, type Selection } from "../ui/selection";
import { nearestTo, nextTerritory } from "../ui/territory-nav";
import { layoutScreen, type Rect, type ScreenLayout } from "../ui/camera";
import { GraphBoard } from "./graph-board";
import { LogDialog, WarRoom } from "./overlays";
import { PlayersPanel, type PanelShape, type Player } from "./players-panel";
import { StatusBox } from "./status-box";
import { DISPLAY_FONT, RISK_THEME } from "./theme";
import type { BoardHandle, Marks } from "./use-board-camera";
import { usePlayback, useSpeed } from "./use-playback";
import { useRiskInput, type FocusZone } from "./use-risk-input";

/** What the game screen plays: the game as this player's seat sees it, and how to move. An
 *  online game gives it this through `use-online-feed.ts`. */
export interface GameFeed {
  view: GameView;
  /** The seat's choices, or null while it waits on someone else. */
  options: Options | null;
  /** Everything that happened, oldest first, as this seat may see it, each with an id that
   *  stays the same as the feed grows. */
  events: readonly LoggedEvent[];
  act: (move: Move) => void;
  /** A move the engine or server refused, or a connection problem, in words. */
  problem: string | null;
  /** Who plays each seat; this player's own is `view.viewer`. */
  players: readonly Player[];
  /** What this game did to the player's Elo, once their seat's game is over: null until then,
   *  and for a spectator. */
  rating: RatedGame | null;
}

type Dialog = { kind: "menu" } | { kind: "log" } | null;

/** Where the board and the panels sit on this screen (`ui/camera.ts`), laid out afresh whenever
 *  the screen changes size and only then. */
function useScreenLayout(root: RefObject<HTMLElement | null>): ScreenLayout | null {
  const [screen, setScreen] = useState<ScreenLayout | null>(null);
  useLayoutEffect(() => {
    const host = root.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setScreen(layoutScreen({ width, height }, COMPOSITION));
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [root]);
  return screen;
}

/** A panel's box, its content kept the screen's inset from the screen's edges and a little less
 *  from the board. */
function boxAt(r: Rect, view: { width: number; height: number }): CSSProperties {
  const pad = (atEdge: boolean) => (atEdge ? "var(--rk-inset)" : "0.5em");
  return {
    left: r.left,
    top: r.top,
    width: r.right - r.left,
    height: r.bottom - r.top,
    padding: [r.top <= 0, r.right >= view.width, r.bottom >= view.height, r.left <= 0].map(pad).join(" "),
  };
}

/** The action panel's box: its slot, or, while the step fits in it, the wider box along the bottom
 *  (`actionWide`), so short steps spread out instead of wrapping. It tries the wide box afresh with
 *  each step, and gives it up the moment its content outgrows it. */
function ActionBox({ screen, stepKey, children }: { screen: ScreenLayout; stepKey: string; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [narrowFor, setNarrowFor] = useState<string | null>(null);
  const wide = screen.panels.actionWide !== undefined && narrowFor !== stepKey;
  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!wide || !box || !content) return;
    const check = () => {
      const style = getComputedStyle(box);
      const room = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      if (content.offsetHeight > room + 0.5) setNarrowFor(stepKey);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(content);
    return () => observer.disconnect();
  }, [wide, stepKey, screen]);
  const rect = wide && screen.panels.actionWide ? screen.panels.actionWide : screen.panels.action;
  return (
    <div ref={outer} className="pointer-events-none absolute flex flex-col justify-end" style={boxAt(rect, screen.view)}>
      {/* Widened, it stops where its lines no longer need the room. */}
      <div ref={inner} className={cn("w-full", screen.form === "short" && "h-full", wide && "max-w-[30em]")}>
        {children}
      </div>
    </div>
  );
}

const SHAPES: Record<ScreenLayout["form"], PanelShape> = { landscape: "strip", portrait: "band", short: "column" };

const COARSE = "(pointer: coarse)";
function subscribeCoarse(changed: () => void) {
  const query = window.matchMedia(COARSE);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
}

export function GameScreen({ feed, onLeave }: { feed: GameFeed; onLeave: () => void }) {
  const { act: send } = feed;
  // The game as presented: another seat's moves play a beat at a time (`ui/playback.ts`), and
  // nothing is asked of the player until the screen has caught up with the game.
  const [speed, setSpeed] = useSpeed();
  const played = usePlayback(feed.view, feed.events, feed.view.viewer, speed);
  const { board: presented, shown: shownLog, latestFrom, beat } = played.playback;
  const view = presented.view;
  const options = played.caughtUp ? feed.options : null;
  const shown = useMemo(() => shownLog.map((logged) => logged.event), [shownLog]);
  const board = useRef<BoardHandle>(null);
  const box = useRef<HTMLDivElement>(null);

  // Until something is used, hints suit the device: none on a touch screen, keys elsewhere.
  const coarse = useSyncExternalStore(subscribeCoarse, () => window.matchMedia(COARSE).matches, () => false);
  const [used, setInput] = useState<InputKind | null>(null);
  const input = used ?? (coarse ? "touch" : "keyboard-mouse");
  const [byKeys, setByKeys] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const [focus, setFocus] = useState<TerritoryId | null>(null);
  const [optionsSeen, setOptionsSeen] = useState(options);

  // A move changes the options: the selection carries on where the move leads (`nextSelection`).
  if (optionsSeen !== options) {
    setOptionsSeen(options);
    setSelection(nextSelection(optionsSeen, options, selection));
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

  const placed = (ids: readonly TerritoryId[]) => ids.map((id) => ({ id, ...locate(id) }));
  const focusOn = (id: TerritoryId | null) => {
    setFocus(id);
    if (id) board.current?.reveal(id);
  };
  const currentFocus = focus !== null && choices.includes(focus) ? focus : null;
  const moveFocus = (direction: Direction) => {
    if (choices.length === 0) return;
    if (!showFocus || currentFocus === null) {
      const start = selection.from !== null && !choices.includes(selection.from) ? nearestTo(placed(choices), locate(selection.from), WRAP_WIDTH) : nearestTo(placed(choices), board.current?.centre() ?? { x: WRAP_WIDTH / 2, y: 0 });
      return focusOn(start as TerritoryId | null);
    }
    const next = nextTerritory(placed(choices), locate(currentFocus), direction, WRAP_WIDTH) as TerritoryId | null;
    if (next) focusOn(next);
  };

  // Only picking a territory offers to end the phase: beside a fight or an amount on hand, "End
  // attack" or "End turn" reads as ending that one move. Back steps out of it first.
  const ending = step.kind === "pick" ? phaseEnd(options) : null;
  const news = describeEvents(shown.slice(latestFrom));
  const latestLine = news.at(-1) ?? describeEvents(shown).at(-1);

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
    confirm: () => box.current?.querySelector<HTMLElement>("[data-pad-start]")?.click(),
    closeDialog: () => setDialog(null),
    endPhase: () => {
      if (ending && dialog === null) act(ending);
    },
    menu: () => setDialog((open) => (open?.kind === "menu" ? null : { kind: "menu" })),
    log: () => setDialog({ kind: "log" }),
    // An open dialog's one amount is the war room's playback speed.
    less: () => {
      if (dialog !== null) {
        if (dialog.kind === "menu") setSpeed(Math.max(0, speed - 1));
      } else if (step.kind === "battle") setKeep(Math.max(1, keep - 1));
      else if (step.kind === "place" || step.kind === "fortify-amount") setAmount(Math.max(1, amount - 1));
      else if (step.kind === "occupy") setAmount(Math.max(step.min, amount - 1));
    },
    more: () => {
      if (dialog !== null) {
        if (dialog.kind === "menu") setSpeed(Math.min(SPEEDS.length - 1, speed + 1));
      } else if (step.kind === "battle") setKeep(Math.min(Math.max(1, view.territories[step.from].armies - 1), keep + 1));
      else if (step.kind === "place" || step.kind === "fortify-amount" || step.kind === "occupy") setAmount(Math.min(step.max, amount + 1));
    },
    dice: (count) => {
      if (step.kind === "battle" && count <= step.maxDice) act({ kind: "attack", from: step.from, to: step.to, dice: count });
    },
    blitz: () => {
      if (step.kind === "battle") act({ kind: "blitz", from: step.from, to: step.to, keepAtLeast: keep });
    },
    pan: (dx) => board.current?.pan(dx),
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

  const root = useRef<HTMLDivElement>(null);
  const screen = useScreenLayout(root);


  return (
    <div
      ref={root}
      style={RISK_THEME}
      className={cn(DISPLAY_FONT.variable, "fixed inset-0 overflow-hidden bg-(--rk-sea) text-[15px] text-(--rk-text) [--rk-inset:0.5em] min-[640px]:text-base min-[1800px]:text-[23px] min-[1800px]:[--rk-inset:1.5em]")}
      onContextMenu={(event) => event.preventDefault()}
    >
      <GraphBoard ref={board} view={view} marks={marks} focus={currentFocus} showFocus={showFocus} onPick={choose} onTouch={onTouch} screen={screen} beat={beat} />

      {/* The panels, in the boxes the screen's layout gives them (`ui/camera.ts`): the turn, the
          players and the war room in one, the status box in the other. */}
      {screen && (
        <>
          <div className="pointer-events-none absolute flex flex-col" style={boxAt(screen.panels.players, screen.view)}>
            <PlayersPanel view={view} players={feed.players} shape={SHAPES[screen.form]} input={input} onMenu={() => setDialog({ kind: "menu" })} />
          </div>

          <ActionBox screen={screen} stepKey={stepKey}>
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
              onMenu={() => setDialog({ kind: "menu" })}
              ending={ending}
              input={input}
              onNewGame={onLeave}
              error={feed.problem}
              rating={feed.rating}
              tall={screen.form === "short"}
              stacked={screen.form === "landscape"}
            />
          </ActionBox>
        </>
      )}

      {dialog?.kind === "menu" && <WarRoom view={view} options={options} act={act} onClose={() => setDialog(null)} onLog={() => setDialog({ kind: "log" })} onQuit={onLeave} input={input} speed={speed} setSpeed={setSpeed} />}
      {dialog?.kind === "log" && <LogDialog log={shown} onClose={() => setDialog(null)} input={input} />}
    </div>
  );
}
