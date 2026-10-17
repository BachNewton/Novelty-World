"use client";

import { Menu } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { PromptButton } from "@/shared/components/prompts";
import { usePadNavigation, type Direction } from "@/shared/lib/gamepad";
import { cycleChoice, type InputKind } from "@/shared/lib/input";
import { cn } from "@/shared/lib/utils";
import { locate, WRAP_WIDTH } from "../board/graph";
import type { GameView, Move, Options } from "../contract";
import type { TerritoryId } from "../map";
import type { LoggedEvent } from "../online/game";
import type { RatedGame } from "../online/rating";
import { BINDINGS } from "../ui/bindings";
import { describeEvents, phaseName } from "../ui/describe";
import { SPEEDS } from "../ui/playback";
import { alsoPickable, back as backOut, NO_SELECTION, nextSelection, phaseEnd, pick, stepOf, type Selection } from "../ui/selection";
import { nearestTo, nextTerritory } from "../ui/territory-nav";
import type { Rect } from "../ui/camera";
import { CardPips, SeatMark, SeatName } from "./bits";
import { GraphBoard } from "./graph-board";
import { LogDialog, WarRoom } from "./overlays";
import { riskSounds } from "./sound-board";
import { StatusBox } from "./status-box";
import { BUTTON, DISPLAY_FONT, PANEL, RISK_THEME } from "./theme";
import type { BoardHandle, Marks } from "./use-board-camera";
import { usePlayback, useSpeed } from "./use-playback";
import { useRiskInput, type FocusZone } from "./use-risk-input";
import { useRiskSounds } from "./use-risk-sounds";

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

/** A person by their name, or a bot by its name and version under its rank. */
export interface Player {
  name: string;
  rank?: string;
}

const playerLabel = ({ name, rank }: Player) => (rank ? `${rank} · ${name}` : name);

type Dialog = { kind: "menu" } | { kind: "log" } | null;

/** Where the overlays sit over the map, in its CSS pixels, so the board is framed clear of them.
 *  They are measured as the screen takes its size, and only then: the board moves when the player
 *  pans it or the screen changes size, never because an overlay's content changed. */
function useOverlays(root: RefObject<HTMLElement | null>, parts: readonly RefObject<HTMLElement | null>[]): Rect[] {
  const [rects, setRects] = useState<Rect[]>([]);
  useLayoutEffect(() => {
    const host = root.current;
    if (!host) return;
    const observer = new ResizeObserver(() => {
      const frame = host.getBoundingClientRect();
      setRects(
        parts.flatMap((part) => {
          const box = part.current?.getBoundingClientRect();
          return box ? [{ left: box.left - frame.left, top: box.top - frame.top, right: box.right - frame.left, bottom: box.bottom - frame.top }] : [];
        }),
      );
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [root, parts]);
  return rects;
}

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
  useRiskSounds(shownLog, view, feed.problem);

  // Until something is used, hints suit the device: none on a touch screen, keys elsewhere.
  const coarse = useSyncExternalStore(subscribeCoarse, () => window.matchMedia(COARSE).matches, () => false);
  const [used, setInput] = useState<InputKind | null>(null);
  const input = used ?? (coarse ? "touch" : "keyboard-mouse");
  const [byKeys, setByKeys] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const [focus, setFocus] = useState<TerritoryId | null>(null);
  const [holding, setHolding] = useState(false);
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
    if (result === null) {
      if (step.kind === "pick") riskSounds.play("invalid");
      return;
    }
    if ("move" in result) act(result.move);
    else {
      riskSounds.play("select");
      setSelection(result.selection);
    }
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
    closeDialog: () => setDialog(null),
    endHold: (held) => setHolding(held && ending !== null && dialog === null),
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

  const root = useRef<HTMLDivElement>(null);
  const turn = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const parts = useMemo(() => [turn, status], []);
  const overlays = useOverlays(root, parts);

  const active = view.active;
  const { players } = feed;
  const you = view.viewer;

  return (
    <div
      ref={root}
      style={RISK_THEME}
      className={cn(DISPLAY_FONT.variable, "fixed inset-0 overflow-hidden bg-(--rk-sea) text-[15px] text-(--rk-text) sm:text-base min-[1800px]:text-[23px]")}
      onContextMenu={(event) => event.preventDefault()}
    >
      <GraphBoard ref={board} view={view} marks={marks} focus={currentFocus} showFocus={showFocus} onPick={choose} onTouch={onTouch} overlays={overlays} beat={beat} />

      {/* What floats over the map: the turn, the players and the war room at the top, the status
          box at the bottom. The board is framed clear of them (`ui/camera.ts`). */}
      <div ref={turn} className={cn(PANEL, "absolute top-[0.5em] left-[0.5em] flex flex-col gap-[0.2em] py-[0.3em] pr-[0.3em] pl-[0.7em] max-sm:right-[0.5em] sm:w-[26em] min-[1800px]:top-[1.5em] min-[1800px]:left-[1.5em]")}>
        <div className="flex items-center gap-[0.5em]">
          {/* Always two lines that cut short rather than wrap, so the panel never changes height
              over the board framed clear of it. */}
          <div className="flex min-w-0 flex-1 flex-col whitespace-nowrap">
            <div className="flex h-[1.4em] min-w-0 items-center gap-x-[0.5em]">
              {view.phase === "game-over" ? (
                <span>{phaseName(view.phase)}</span>
              ) : (
                <>
                  <SeatName seat={active} />
                  <span className="truncate">{active === you ? "you" : playerLabel(players[active])}</span>
                </>
              )}
            </div>
            <span className="h-[1.4em] truncate text-(--rk-muted)">
              {view.phase === "game-over" ? `turn ${view.turn}` : `${phaseName(view.phase)} · turn ${view.turn}`}
            </span>
          </div>
          <PromptButton binding={BINDINGS.menu} input={input} className={BUTTON} onClick={() => setDialog({ kind: "menu" })} aria-label={`War room: ${view.cards.hand?.length ?? 0} cards`}>
            <Menu size="1.1em" />
            <CardPips count={view.cards.hand?.length ?? 0} />
          </PromptButton>
        </div>
        <ol className="flex flex-wrap gap-x-[0.8em] gap-y-[0.1em] pr-[0.4em] pb-[0.1em] text-[0.85em]" aria-label="Players">
          {view.turnOrder.map((seat) => {
            const s = view.seats[seat];
            const who = seat === you ? "you" : playerLabel(players[seat]);
            return (
              <li
                key={seat}
                title={`${who}: ${s.territories} territories, ${s.armies} armies, ${s.handSize} ${s.handSize === 1 ? "card" : "cards"}`}
                className={cn("inline-flex items-center gap-[0.25em] tabular-nums", s.eliminated && "line-through opacity-40", seat === active && "font-bold text-(--rk-brass-bright)")}
              >
                <SeatMark seat={seat} />
                {seat === you && <span className="font-bold">you</span>}
                {s.territories}
                <span className="text-(--rk-muted)">/{s.armies}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* The status box's room: as tall as its tallest step, a battle, whatever the step now, so
          the board is framed clear of it once and never moves as the box changes size. */}
      <div ref={status} className="pointer-events-none absolute inset-x-[0.5em] bottom-[0.5em] flex h-[11.5em] flex-col justify-end sm:right-auto sm:w-[21em] min-[1800px]:bottom-[1.5em] min-[1800px]:left-[1.5em]">
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
          endHold={{ holding, onHeld: () => ending && act(ending) }}
          input={input}
          onNewGame={onLeave}
          error={feed.problem}
          rating={feed.rating}
        />
      </div>

      {dialog?.kind === "menu" && <WarRoom view={view} options={options} act={act} onClose={() => setDialog(null)} onLog={() => setDialog({ kind: "log" })} onQuit={onLeave} input={input} speed={speed} setSpeed={setSpeed} />}
      {dialog?.kind === "log" && <LogDialog log={shown} onClose={() => setDialog(null)} input={input} />}
    </div>
  );
}
