"use client";

import { ArrowLeft, ArrowRight, Minus, Swords, TrendingDown, TrendingUp } from "lucide-react";
import { forwardRef } from "react";
import { PromptButton, type Hold } from "@/shared/components/prompts";
import type { InputKind } from "@/shared/lib/input";
import { cn } from "@/shared/lib/utils";
import type { GameView, Move, Options } from "../contract";
import { shownChange, type RatedGame } from "../online/rating";
import { BINDINGS } from "../ui/bindings";
import { territoryName, type Line } from "../ui/describe";
import { blitzOdds } from "../ui/odds";
import { shortName } from "../ui/short-names";
import type { Step } from "../ui/selection";
import { DiceRow, SeatName, Slider } from "./bits";
import { BUTTON, DISPLAY, PANEL, PRIMARY } from "./theme";

/*
 * The one box for everything that isn't a place on the map: the latest news, what to do now with
 * ending the phase beside it, and the amount and dice choices. Decisions about places are made on
 * the map itself. It floats over the map, so it stays as small as the step allows.
 */

interface Props {
  view: GameView;
  options: Options | null;
  step: Step;
  amount: number;
  setAmount: (value: number) => void;
  keep: number;
  setKeep: (value: number) => void;
  act: (move: Move) => void;
  back: () => void;
  news: readonly Line[];
  onMenu: () => void;
  /** The move that ends the phase, when the step offers it. */
  ending: Move | null;
  endHold: Hold;
  input: InputKind;
  onNewGame: () => void;
  error: string | null;
  rating: RatedGame | null;
}

/** What a step that asks in words asks; a choice of an amount asks with its slider. */
function prompt(step: Extract<Step, { kind: "wait" | "must-trade" | "pick" }>, view: GameView): string {
  switch (step.kind) {
    case "wait":
      return view.phase === "game-over" ? "The war is over." : "Waiting…";
    case "must-trade":
      return "Trade a set of cards first.";
    case "pick":
      switch (step.purpose) {
        case "place":
          return `Place ${view.armiesToPlace} ${view.armiesToPlace === 1 ? "army" : "armies"}.`;
        case "attack-from":
          return "Attack from…";
        case "attack-to":
          return "Attack where?";
        case "fortify-from":
          return "Fortify from…";
        case "fortify-to":
          return "Fortify where?";
      }
  }
}

/** What the game did to the player's Elo: from, to, and the change, rising in brass or falling in red. */
function EloChange({ rating }: { rating: RatedGame }) {
  const from = Math.round(rating.from);
  const to = Math.round(rating.to);
  const change = shownChange(rating);
  const Trend = to > from ? TrendingUp : to < from ? TrendingDown : Minus;
  const tone = to > from ? "text-(--rk-brass-bright)" : to < from ? "text-(--rk-danger)" : "text-(--rk-muted)";
  const label = `Your Elo: ${from.toString()} to ${to.toString()}, ${change}`;
  return (
    <p role="img" aria-label={label} title={label} className="flex flex-wrap items-center gap-[0.4em] tabular-nums" data-testid="risk-elo-change">
      <Trend aria-hidden size="1.2em" className={tone} />
      <span className={cn(DISPLAY, "text-[0.85em] text-(--rk-muted)")}>Elo</span>
      <span>{from}</span>
      <ArrowRight aria-hidden size="0.9em" className="text-(--rk-muted)" />
      <span className="font-bold">{to}</span>
      <span className={cn("font-bold", tone)}>{change}</span>
    </p>
  );
}

export const StatusBox = forwardRef<HTMLDivElement, Props>(function StatusBox({ view, options, step, amount, setAmount, keep, setKeep, act, back, news, onMenu, ending, endHold, input, onNewGame, error, rating }, ref) {
  const latest = news.at(-1);
  const canTrade = options?.kind === "reinforce" && options.sets.length > 0 && !options.mustTrade;
  const backButton = (
    <button type="button" data-pad-back className={cn(BUTTON, "shrink-0 px-[0.5em]")} onClick={back} aria-label="Back" title="Back">
      <ArrowLeft size="1.1em" />
    </button>
  );

  return (
    <div ref={ref} className={cn(PANEL, "pointer-events-auto flex flex-col gap-[0.6em] p-[0.75em]")} data-testid="risk-status">
      {latest && (
        // One row of a fixed budget, so the box always fits the room the screen keeps for it. A
        // battle is drawn, not told: who fought (unless it is the fight on hand) and the dice, or
        // a blitz's losses; other news is at most two lines of words.
        <div className="flex min-h-[1.8em] items-center gap-x-[0.6em] text-[0.9em] text-(--rk-muted)" aria-live="polite" title={latest.text}>
          {latest.battle ? (
            <>
              <span className="sr-only">{latest.text}</span>
              {!(step.kind === "battle" && step.from === latest.battle.from && step.to === latest.battle.to) && (
                <span aria-hidden className="inline-flex shrink-0 items-center gap-[0.3em] whitespace-nowrap">
                  {shortName(latest.battle.from)}
                  <Swords size="0.95em" className="shrink-0" />
                  {shortName(latest.battle.to)}
                </span>
              )}
              <span aria-hidden className="shrink-0 tabular-nums">
                {latest.dice ? <DiceRow attacker={latest.dice.attacker} defender={latest.dice.defender} /> : `−${latest.battle.attackerLost} vs −${latest.battle.defenderLost}`}
              </span>
            </>
          ) : (
            <p className="line-clamp-2 min-w-0 flex-1">{latest.text}</p>
          )}
        </div>
      )}

      {error && <p className="text-(--rk-danger)">The engine refused that move: {error}</p>}

      {/* Each row stays one row, so the box always fits the room the screen keeps for it. A
          choice of an amount, a battle's included, has no words to say: the map lights where it
          goes, and its slider shows how many. */}
      {(step.kind === "wait" || step.kind === "must-trade" || step.kind === "pick") && (
        <div className="flex items-center gap-[0.5em]">
          <p className={cn(DISPLAY, "mr-auto line-clamp-2 min-w-0 text-[1.1em] text-(--rk-brass-bright)")}>{prompt(step, view)}</p>
          {canTrade && (
            <PromptButton binding={BINDINGS.menu} input={input} className={cn(BUTTON, "shrink-0")} onClick={onMenu}>
              Trade cards
            </PromptButton>
          )}
          {ending && (
            <PromptButton binding={BINDINGS["end-phase"]} input={input} hold={endHold} className={cn(BUTTON, "shrink-0")} onClick={() => act(ending)}>
              {ending.kind === "end-attack" ? "End attack" : "End turn"}
            </PromptButton>
          )}
        </div>
      )}

      {step.kind === "wait" && view.winner !== null && (
        <div className="flex flex-wrap items-center gap-[0.6em]">
          <SeatName seat={view.winner} className="text-[1.3em]" /> <span>wins.</span>
          <button type="button" data-pad-start className={cn(BUTTON, PRIMARY)} onClick={onNewGame}>
            New game
          </button>
        </div>
      )}

      {rating && <EloChange rating={rating} />}

      {step.kind === "must-trade" && (
        <PromptButton binding={BINDINGS.menu} input={input} data-pad-start className={cn(BUTTON, PRIMARY, "self-start")} onClick={onMenu}>
          Choose a set
        </PromptButton>
      )}

      {step.kind === "place" && (
        <div className="flex items-center gap-[0.5em]">
          {backButton}
          <Slider value={amount} min={1} max={step.max} onChange={setAmount} input={input} label={`Armies to place on ${territoryName(step.territory)}`} className="flex-1" />
          <button type="button" data-pad-start className={cn(BUTTON, PRIMARY, "shrink-0")} onClick={() => act({ kind: "place", territory: step.territory, armies: amount })}>
            Place
          </button>
        </div>
      )}

      {step.kind === "battle" && (
        <div className="flex flex-col gap-[0.6em]">
          <div className="flex items-center gap-[0.4em]" role="group" aria-label={`${territoryName(step.from)} attacks ${territoryName(step.to)}`}>
            {backButton}
            {([1, 2, 3] as const)
              .filter((dice) => dice <= step.maxDice)
              .map((dice) => (
                <button key={dice} type="button" className={cn(BUTTON, "min-w-0 flex-1 px-[0.4em]")} onClick={() => act({ kind: "attack", from: step.from, to: step.to, dice })}>
                  {input === "keyboard-mouse" && <kbd className="rounded border border-current px-[0.3em] text-[0.8em]">{dice}</kbd>}
                  Roll {dice}
                </button>
              ))}
            </div>
          {/* The blitz is the usual way to fight, so it is the step's primary action. */}
          <div className="flex items-center gap-[0.5em]">
            <Slider value={keep} min={1} max={Math.max(1, view.territories[step.from].armies - 1)} onChange={setKeep} input={input} label={`Armies the blitz keeps back in ${territoryName(step.from)}`} className="flex-1" />
            <PromptButton binding={BINDINGS.blitz} input={input} data-pad-start className={cn(BUTTON, PRIMARY, "shrink-0 px-[0.6em]")} onClick={() => act({ kind: "blitz", from: step.from, to: step.to, keepAtLeast: keep })}>
              Blitz
              <span className="inline-block w-[4ch] text-right tabular-nums" title="The chance the blitz captures it">
                {Math.round(blitzOdds(view.territories[step.from].armies, view.territories[step.to].armies, keep).capture * 100)}%
              </span>
            </PromptButton>
          </div>
        </div>
      )}

      {step.kind === "occupy" && (
        <div className="flex items-center gap-[0.5em]">
          <Slider value={amount} min={step.min} max={step.max} onChange={setAmount} input={input} label={`Armies to move into ${territoryName(step.to)}`} className="flex-1" />
          <button type="button" data-pad-start className={cn(BUTTON, PRIMARY, "shrink-0")} onClick={() => act({ kind: "occupy", armies: amount })}>
            Hold
          </button>
        </div>
      )}

      {step.kind === "fortify-amount" && (
        <div className="flex items-center gap-[0.5em]">
          {backButton}
          <Slider value={amount} min={1} max={step.max} onChange={setAmount} input={input} label={`Armies to march to ${territoryName(step.to)}`} className="flex-1" />
          <button type="button" data-pad-start className={cn(BUTTON, PRIMARY, "shrink-0")} onClick={() => act({ kind: "fortify", from: step.from, to: step.to, armies: amount })}>
            March
          </button>
        </div>
      )}
    </div>
  );
});
