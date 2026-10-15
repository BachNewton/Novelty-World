"use client";

import { forwardRef } from "react";
import { PromptButton, type Hold } from "@/shared/components/prompts";
import type { InputKind } from "@/shared/lib/input";
import { cn } from "@/shared/lib/utils";
import type { GameView, Move, Options } from "../contract";
import { BINDINGS } from "../ui/bindings";
import { territoryName, type Line } from "../ui/describe";
import { phaseEnd, type Step } from "../ui/selection";
import { DiceRow, SeatName, Stepper } from "./bits";
import { BUTTON, DISPLAY, PANEL, PRIMARY } from "./theme";

/*
 * The one box for everything that isn't a place on the map: what to do now, the amount and dice
 * choices, the latest news, and ending the phase. Decisions about places are made
 * on the map itself.
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
  onCards: () => void;
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
        case "setup-place":
          return `Place an army on one of your territories (${view.armiesToPlace} left).`;
        case "place":
          return `Place ${view.armiesToPlace} ${view.armiesToPlace === 1 ? "army" : "armies"}: pick a territory.`;
        case "attack-from":
          return "Attack: pick a territory to attack from.";
        case "attack-to":
          return "Pick a territory to attack.";
        case "fortify-from":
          return "Fortify: pick a territory to move armies from.";
        case "fortify-to":
          return "Pick where the armies go.";
      }
      return "";
    case "place":
      return `How many on ${territoryName(step.territory)}?`;
    case "battle":
      return `${territoryName(step.from)} attacks ${territoryName(step.to)}.`;
    case "occupy":
      return `Captured ${territoryName(step.to)}! How many armies hold it?`;
    case "fortify-amount":
      return `Move armies from ${territoryName(step.from)} to ${territoryName(step.to)}.`;
  }
}

export const StatusBox = forwardRef<HTMLDivElement, Props>(function StatusBox({ view, options, step, amount, setAmount, keep, setKeep, act, back, news, onCards, endHold, input, onNewGame, error }, ref) {
  const ending = phaseEnd(options);
  const latest = news.at(-1);
  const backButton = (
    <button type="button" data-pad-back className={BUTTON} onClick={back}>
      Back
    </button>
  );

  return (
    <div ref={ref} className={cn(PANEL, "flex flex-col gap-[0.6em] p-[0.75em]")} data-testid="risk-status">
      {latest && (
        <div className="flex items-start justify-between gap-[0.5em] text-[0.9em]" aria-live="polite">
          <div className="min-w-0 space-y-[0.25em]">
            <p className="text-(--rk-muted)">{latest.text}</p>
            {latest.dice && <DiceRow attacker={latest.dice.attacker} defender={latest.dice.defender} />}
          </div>
        </div>
      )}

      {error && <p className="text-(--rk-danger)">The engine refused that move: {error}</p>}

      <p className={cn(DISPLAY, "text-[1.1em] text-(--rk-brass-bright)")}>{prompt(step, view)}</p>

      {step.kind === "wait" && view.winner !== null && (
        <div className="flex flex-wrap items-center gap-[0.6em]">
          <SeatName seat={view.winner} className="text-[1.3em]" /> <span>wins.</span>
          <button type="button" data-pad-start className={cn(BUTTON, PRIMARY)} onClick={onNewGame}>
            New game
          </button>
        </div>
      )}

      {step.kind === "must-trade" && (
        <PromptButton binding={BINDINGS.cards} input={input} data-pad-start className={cn(BUTTON, PRIMARY, "self-start")} onClick={onCards}>
          Choose a set
        </PromptButton>
      )}

      {step.kind === "place" && (
        <div className="flex flex-wrap items-center gap-[0.6em]">
          <Stepper value={amount} min={1} max={step.max} onChange={setAmount} input={input} label="Armies to place" />
          <button type="button" data-pad-start className={cn(BUTTON, PRIMARY)} onClick={() => act({ kind: "place", territory: step.territory, armies: amount })}>
            Place {amount}
          </button>
          {backButton}
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
            {backButton}
          </div>
          <div className="flex flex-wrap items-center gap-[0.4em]">
            <PromptButton binding={BINDINGS.blitz} input={input} className={BUTTON} onClick={() => act({ kind: "blitz", from: step.from, to: step.to, keepAtLeast: keep })}>
              Blitz
            </PromptButton>
            <span className="text-[0.9em] text-(--rk-muted)">keeping at least</span>
            <Stepper value={keep} min={1} max={Math.max(1, view.territories[step.from].armies - 1)} onChange={setKeep} input={input} label="Armies to keep back" />
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
          {backButton}
        </div>
      )}

      {(ending || (options?.kind === "reinforce" && options.sets.length > 0 && !options.mustTrade)) && (
        <div className="flex flex-wrap items-center gap-[0.5em] border-t border-(--rk-line) pt-[0.6em]">
          {options?.kind === "reinforce" && options.sets.length > 0 && !options.mustTrade && (
            <PromptButton binding={BINDINGS.cards} input={input} className={BUTTON} onClick={onCards}>
              Trade cards (+{view.cards.nextSetValue})
            </PromptButton>
          )}
          {ending && (
            <PromptButton binding={BINDINGS["end-phase"]} input={input} hold={endHold} className={cn(BUTTON, "ml-auto")} onClick={() => act(ending)}>
              {ending.kind === "end-attack" ? "End attack" : "End turn"}
            </PromptButton>
          )}
        </div>
      )}
    </div>
  );
});
