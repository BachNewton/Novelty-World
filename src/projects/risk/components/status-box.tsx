"use client";

import { ArrowLeft, Shield, Swords } from "lucide-react";
import { forwardRef } from "react";
import { PromptButton, type Hold } from "@/shared/components/prompts";
import type { InputKind } from "@/shared/lib/input";
import { cn } from "@/shared/lib/utils";
import type { GameView, Move, Options } from "../contract";
import { BINDINGS } from "../ui/bindings";
import { territoryName, type Line } from "../ui/describe";
import { blitzOdds } from "../ui/odds";
import { phaseEnd, type Step } from "../ui/selection";
import { DiceRow, SeatName, Stepper } from "./bits";
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
  endHold: Hold;
  input: InputKind;
  onNewGame: () => void;
  error: string | null;
}

function prompt(step: Step, view: GameView): string {
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
      return "";
    case "place":
      return `How many on ${territoryName(step.territory)}?`;
    case "battle":
      return "";
    case "occupy":
      return `Captured ${territoryName(step.to)}! How many armies hold it?`;
    case "fortify-amount":
      return `Move armies from ${territoryName(step.from)} to ${territoryName(step.to)}.`;
  }
}

export const StatusBox = forwardRef<HTMLDivElement, Props>(function StatusBox({ view, options, step, amount, setAmount, keep, setKeep, act, back, news, onMenu, endHold, input, onNewGame, error }, ref) {
  const ending = phaseEnd(options);
  const latest = news.at(-1);
  const canTrade = options?.kind === "reinforce" && options.sets.length > 0 && !options.mustTrade;
  const canBack = step.kind === "place" || step.kind === "battle" || step.kind === "fortify-amount";

  return (
    <div ref={ref} className={cn(PANEL, "flex flex-col gap-[0.6em] p-[0.75em]")} data-testid="risk-status">
      {latest && (
        <div className="flex flex-wrap items-center gap-x-[0.6em] gap-y-[0.25em] text-[0.9em]" aria-live="polite">
          {latest.dice && <DiceRow attacker={latest.dice.attacker} defender={latest.dice.defender} />}
          <p className="min-w-0 text-(--rk-muted)">{latest.text}</p>
        </div>
      )}

      {error && <p className="text-(--rk-danger)">The engine refused that move: {error}</p>}

      <div className="flex flex-wrap items-center gap-[0.5em]">
        {canBack && (
          <button type="button" data-pad-back className={cn(BUTTON, "px-[0.5em]")} onClick={back} aria-label="Back" title="Back">
            <ArrowLeft size="1.1em" />
          </button>
        )}
        {step.kind === "battle" ? (
          <p className={cn(DISPLAY, "mr-auto inline-flex flex-wrap items-center gap-x-[0.4em] text-[1.1em] text-(--rk-brass-bright)")}>
            {territoryName(step.from)}
            <Swords size="0.95em" aria-label="attacks" />
            {territoryName(step.to)}
          </p>
        ) : (
          <p className={cn(DISPLAY, "mr-auto text-[1.1em] text-(--rk-brass-bright)")}>{prompt(step, view)}</p>
        )}
        {canTrade && (
          <PromptButton binding={BINDINGS.menu} input={input} className={BUTTON} onClick={onMenu}>
            Trade cards
          </PromptButton>
        )}
        {ending && (
          <PromptButton binding={BINDINGS["end-phase"]} input={input} hold={endHold} className={BUTTON} onClick={() => act(ending)}>
            {ending.kind === "end-attack" ? "End attack" : "End turn"}
          </PromptButton>
        )}
      </div>

      {step.kind === "wait" && view.winner !== null && (
        <div className="flex flex-wrap items-center gap-[0.6em]">
          <SeatName seat={view.winner} className="text-[1.3em]" /> <span>wins.</span>
          <button type="button" data-pad-start className={cn(BUTTON, PRIMARY)} onClick={onNewGame}>
            New game
          </button>
        </div>
      )}

      {step.kind === "must-trade" && (
        <PromptButton binding={BINDINGS.menu} input={input} data-pad-start className={cn(BUTTON, PRIMARY, "self-start")} onClick={onMenu}>
          Choose a set
        </PromptButton>
      )}

      {step.kind === "place" && (
        <div className="flex flex-wrap items-center gap-[0.6em]">
          <Stepper value={amount} min={1} max={step.max} onChange={setAmount} input={input} label="Armies to place" />
          <button type="button" data-pad-start className={cn(BUTTON, PRIMARY)} onClick={() => act({ kind: "place", territory: step.territory, armies: amount })}>
            Place {amount}
          </button>
        </div>
      )}

      {step.kind === "battle" && (
        <div className="flex flex-col gap-[0.6em]">
          <div className="flex flex-wrap items-center gap-[0.4em]">
            {([1, 2, 3] as const)
              .filter((dice) => dice <= step.maxDice)
              .map((dice) => (
                <button key={dice} type="button" data-pad-start={dice === step.maxDice ? "" : undefined} className={cn(BUTTON, dice === step.maxDice && PRIMARY)} onClick={() => act({ kind: "attack", from: step.from, to: step.to, dice })}>
                  {input === "keyboard-mouse" && <kbd className="rounded border border-current px-[0.3em] text-[0.8em]">{dice}</kbd>}
                  Roll {dice}
                </button>
              ))}
            </div>
          <div className="flex flex-wrap items-center gap-[0.4em]">
            <PromptButton binding={BINDINGS.blitz} input={input} className={BUTTON} onClick={() => act({ kind: "blitz", from: step.from, to: step.to, keepAtLeast: keep })}>
              Blitz
              <span className="tabular-nums text-(--rk-muted)" title="The chance the blitz captures it">
                {Math.round(blitzOdds(view.territories[step.from].armies, view.territories[step.to].armies, keep).capture * 100)}%
              </span>
            </PromptButton>
            <Shield size="1.1em" className="text-(--rk-muted)" aria-hidden>
              <title>Keep at least this many back</title>
            </Shield>
            <Stepper value={keep} min={1} max={Math.max(1, view.territories[step.from].armies - 1)} onChange={setKeep} input={input} label="Armies to keep back" all={false} />
          </div>
        </div>
      )}

      {step.kind === "occupy" && (
        <div className="flex flex-wrap items-center gap-[0.6em]">
          <Stepper value={amount} min={step.min} max={step.max} onChange={setAmount} input={input} label={`Armies in ${territoryName(step.to)}`} />
          <button type="button" data-pad-start className={cn(BUTTON, PRIMARY)} onClick={() => act({ kind: "occupy", armies: amount })}>
            Hold with {amount}
          </button>
        </div>
      )}

      {step.kind === "fortify-amount" && (
        <div className="flex flex-wrap items-center gap-[0.6em]">
          <Stepper value={amount} min={1} max={step.max} onChange={setAmount} input={input} label="Armies to move" />
          <button type="button" data-pad-start className={cn(BUTTON, PRIMARY)} onClick={() => act({ kind: "fortify", from: step.from, to: step.to, armies: amount })}>
            Move {amount}
          </button>
        </div>
      )}
    </div>
  );
});
