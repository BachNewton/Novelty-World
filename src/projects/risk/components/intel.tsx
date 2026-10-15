"use client";

import { Crown, Dices, Hexagon, Layers, Shield, Swords } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import type { GameEvent, GameView, Seat } from "../contract";
import { CONTINENTS, TERRITORIES, type ContinentId, type TerritoryId } from "../map";
import { describeEvents, territoryName } from "../ui/describe";
import { blitzOdds } from "../ui/odds";
import { seatColour, seatName } from "../ui/seats";
import type { Step } from "../ui/selection";
import { shortName } from "../ui/short-names";
import { DiceRow, SeatMark } from "./bits";
import { DISPLAY, PANEL } from "./theme";

/*
 * The war room's intelligence, for screens wide enough to keep it beside the board (an
 * ultrawide): every player's standing, who holds each continent, the odds of a planned attack and
 * the battle log, drawn as bars, marks, dice and pips rather than sentences. Narrower screens keep
 * the same facts behind a tap.
 */

const MEMBERS = new Map<ContinentId, TerritoryId[]>(CONTINENTS.map((c) => [c.id, TERRITORIES.filter((t) => t.continent === c.id).map((t) => t.id)]));

function holders(view: GameView): Map<ContinentId, Seat | null> {
  return new Map(
    CONTINENTS.map((c) => {
      const owners = new Set((MEMBERS.get(c.id) ?? []).map((id) => view.territories[id].owner));
      return [c.id, owners.size === 1 ? [...owners][0] : null];
    }),
  );
}

function Panel({ title, icon, children, className }: { title: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn(PANEL, "flex min-h-0 flex-col gap-[0.5em] p-[0.75em]", className)} aria-label={title}>
      <h2 className={cn(DISPLAY, "flex items-center gap-[0.4em] text-(--rk-muted)")}>
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Bar({ value, of, colour, label }: { value: number; of: number; colour: string; label: string }) {
  return (
    <div className="flex items-center gap-[0.35em]" role="img" aria-label={label} title={label}>
      <div className="h-[0.55em] flex-1 overflow-hidden rounded-full bg-(--rk-line)">
        <div className="h-full rounded-full" style={{ width: `${(100 * value) / Math.max(1, of)}%`, background: colour }} />
      </div>
      <span className="w-[1.8em] text-right tabular-nums">{value}</span>
    </div>
  );
}

function ContinentChip({ continent }: { continent: (typeof CONTINENTS)[number] }) {
  return (
    <span title={`${continent.name}: +${continent.bonus} a turn`} aria-label={`${continent.name}, +${continent.bonus}`} className="rounded-[0.3em] px-[0.3em] text-[0.8em] font-bold tabular-nums" style={{ background: `var(--rk-region-${continent.id})`, color: `var(--rk-region-edge-${continent.id})`, outline: `1px solid var(--rk-region-edge-${continent.id})` }}>
      +{continent.bonus}
    </span>
  );
}

/** Every player: territories and armies as bars against the leader, cards in hand, continents held. */
function Standings({ view }: { view: GameView }) {
  const held = holders(view);
  const mostArmies = Math.max(...view.seats.map((s) => s.armies));
  return (
    <Panel title="Standings" icon={<Crown size="1em" aria-hidden />}>
      <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-x-[0.6em] gap-y-[0.45em] text-[0.9em]">
        <span />
        <Hexagon size="1em" className="text-(--rk-muted)" aria-label="Territories" />
        <Shield size="1em" className="text-(--rk-muted)" aria-label="Armies" />
        <Layers size="1em" className="text-(--rk-muted)" aria-label="Cards" />
        {view.turnOrder.map((seat) => {
          const s = view.seats[seat];
          const continents = CONTINENTS.filter((c) => held.get(c.id) === seat);
          return (
            <div key={seat} className={cn("contents", s.eliminated && "[&>*]:opacity-35")}>
              <span className={cn("inline-flex items-center gap-[0.3em] text-[1.2em]", seat === view.active && "rounded-full outline-2 outline-offset-2 outline-(--rk-brass-bright)")} aria-label={`${seatName(seat)}${seat === view.active ? ", playing" : ""}${s.eliminated ? ", out" : ""}`} title={seatName(seat)}>
                <SeatMark seat={seat} />
              </span>
              <Bar value={s.territories} of={TERRITORIES.length} colour={seatColour(seat)} label={`${s.territories} territories`} />
              <Bar value={s.armies} of={mostArmies} colour={seatColour(seat)} label={`${s.armies} armies`} />
              <span className="inline-flex items-center gap-[0.1em]" aria-label={`${s.handSize} cards`} title={`${s.handSize} cards`}>
                {Array.from({ length: Math.min(s.handSize, 6) }, (_, i) => (
                  <span key={i} className="h-[1em] w-[0.65em] rounded-[0.12em] border border-(--rk-brass-dim) bg-(--rk-parchment)" />
                ))}
                {s.handSize === 0 && <span className="text-(--rk-muted)">·</span>}
              </span>
              {continents.length > 0 && (
                <span className="col-start-2 col-end-5 -mt-[0.2em] flex flex-wrap gap-[0.3em]">
                  {continents.map((c) => (
                    <ContinentChip key={c.id} continent={c} />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/** Each continent: who holds how much of it, and its bonus, crowned when one seat holds it all. */
function Continents({ view }: { view: GameView }) {
  const held = holders(view);
  return (
    <Panel title="Continents" icon={<Hexagon size="1em" aria-hidden />}>
      <ul className="flex flex-col gap-[0.45em] text-[0.9em]">
        {CONTINENTS.map((c) => {
          const members = MEMBERS.get(c.id) ?? [];
          const counts = view.turnOrder.map((seat) => ({ seat, n: members.filter((id) => view.territories[id].owner === seat).length })).filter((x) => x.n > 0);
          const holder = held.get(c.id) ?? null;
          return (
            <li key={c.id} className="grid grid-cols-[6.5em_1fr_auto] items-center gap-[0.5em]" aria-label={`${c.name}: ${counts.map((x) => `${seatName(x.seat)} ${x.n}`).join(", ")} of ${members.length}`}>
              <span className="truncate text-[0.85em] font-semibold" style={{ color: `var(--rk-region-edge-${c.id})` }}>
                {c.name}
              </span>
              <span className="flex h-[1.3em] overflow-hidden rounded-[0.3em]" style={{ outline: `1px solid var(--rk-region-edge-${c.id})` }}>
                {counts.map(({ seat, n }) => (
                  <span key={seat} className="flex items-center justify-center text-[0.75em]" style={{ width: `${(100 * n) / members.length}%`, background: seatColour(seat) }} title={`${seatName(seat)}: ${n}`}>
                    {n / members.length >= 0.2 && <SeatMark seat={seat} className="drop-shadow" />}
                  </span>
                ))}
              </span>
              <span className="inline-flex items-center gap-[0.2em] font-bold tabular-nums" style={{ color: holder === null ? "var(--rk-brass)" : seatColour(holder) }}>
                {holder !== null && <Crown size="0.9em" aria-label={`${seatName(holder)} holds it`} />}+{c.bonus}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

const percent = (p: number) => `${Math.round(p * 100)}%`;

/** A capture chance as a bar, its number beside it. */
function Chance({ p, big }: { p: number; big?: boolean }) {
  return (
    <div className="flex items-center gap-[0.4em]" role="img" aria-label={`${percent(p)} to capture`} title={`${percent(p)} to capture`}>
      <div className={cn("flex-1 overflow-hidden rounded-full bg-(--rk-line)", big ? "h-[0.9em]" : "h-[0.5em]")}>
        <div className="h-full rounded-full bg-(--rk-brass-bright)" style={{ width: percent(p) }} />
      </div>
      <span className={cn("w-[2.6em] text-right font-bold tabular-nums", big && "text-[1.3em]")}>{percent(p)}</span>
    </div>
  );
}

/** The odds of the attack being planned: one target's in full, or every target's from the chosen source. */
function Odds({ view, step, from, keep }: { view: GameView; step: Step; from: TerritoryId | null; keep: number }) {
  const side = (id: TerritoryId, losses: number) => (
    <span className="flex flex-col items-center gap-[0.1em]">
      <span className="inline-flex items-center gap-[0.25em] text-[1.3em] font-bold tabular-nums">
        <SeatMark seat={view.territories[id].owner} />
        {view.territories[id].armies}
      </span>
      <span className="text-[0.85em]">{shortName(id)}</span>
      <span className="text-[0.85em] text-(--rk-danger) tabular-nums" title="Armies expected lost" aria-label={`about ${losses.toFixed(1)} armies lost`}>
        −{losses.toFixed(1)}
      </span>
    </span>
  );
  let body: ReactNode = (
    <p className="flex items-center justify-center py-[0.6em] text-(--rk-line)" aria-label="No attack planned">
      <Dices size="2em" />
    </p>
  );
  if (step.kind === "battle") {
    const odds = blitzOdds(view.territories[step.from].armies, view.territories[step.to].armies, keep);
    body = (
      <div className="flex flex-col gap-[0.5em]">
        <div className="flex items-start justify-around">
          {side(step.from, odds.attackerLosses)}
          <Swords size="1.4em" className="mt-[0.3em] text-(--rk-brass)" aria-label="attacks" />
          {side(step.to, odds.defenderLosses)}
        </div>
        <Chance p={odds.capture} big />
      </div>
    );
  } else if (step.kind === "pick" && step.purpose === "attack-to" && from !== null) {
    const attackers = view.territories[from].armies;
    body = (
      <ul className="flex flex-col gap-[0.35em] text-[0.9em]">
        {step.choices.map((to) => (
          <li key={to} className="grid grid-cols-[auto_5.5em_1fr] items-center gap-[0.4em]" aria-label={territoryName(to)}>
            <span className="inline-flex items-center gap-[0.2em] tabular-nums">
              <SeatMark seat={view.territories[to].owner} />
              {view.territories[to].armies}
            </span>
            <span className="truncate">{shortName(to)}</span>
            <Chance p={blitzOdds(attackers, view.territories[to].armies, keep).capture} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Panel title="Odds" icon={<Dices size="1em" aria-hidden />}>
      {body}
    </Panel>
  );
}

function Pips({ n, side }: { n: number; side: "attack" | "defend" }) {
  return (
    <span className="inline-flex items-center gap-[0.12em]" aria-label={`${side === "attack" ? "attacker" : "defender"} lost ${n}`} title={`${side === "attack" ? "Attacker" : "Defender"} lost ${n}`}>
      {n > 6 ? (
        <span className="tabular-nums">{n}×</span>
      ) : null}
      {Array.from({ length: Math.min(n, 6) }, (_, i) => (
        <span key={i} className="size-[0.55em] rounded-full border border-(--rk-ink)" style={{ background: `var(--rk-die-${side})` }} />
      ))}
    </span>
  );
}

/** What happened, newest first: battles as their dice and losses, the rest in a line. */
function Log({ events, className }: { events: readonly GameEvent[]; className?: string }) {
  const lines = describeEvents(events).reverse().slice(0, 80);
  return (
    <Panel title="Battle log" icon={<Swords size="1em" aria-hidden />} className={className}>
      <ol className="flex min-h-0 flex-col gap-[0.4em] overflow-y-auto pr-[0.3em] text-[0.85em]">
        {lines.map((line, i) => (
          <li key={i} className="border-b border-(--rk-line) pb-[0.35em]" aria-label={line.text}>
            {line.battle ? (
              <div className="flex flex-col gap-[0.2em]">
                <span className="flex items-center gap-[0.35em]">
                  <span className="font-semibold">{shortName(line.battle.from)}</span>
                  <Swords size="0.95em" className="text-(--rk-brass)" aria-hidden />
                  <span className="font-semibold">{shortName(line.battle.to)}</span>
                  {line.battle.battles > 1 && <span className="text-(--rk-muted) tabular-nums">×{line.battle.battles}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-x-[0.8em] gap-y-[0.2em] text-[0.8em]">
                  {line.dice && <DiceRow attacker={line.dice.attacker} defender={line.dice.defender} />}
                  <span className="inline-flex items-center gap-[0.5em]">
                    <Pips n={line.battle.attackerLost} side="attack" />
                    <Pips n={line.battle.defenderLost} side="defend" />
                  </span>
                </span>
              </div>
            ) : (
              <span className="flex items-start gap-[0.35em] text-(--rk-muted)">
                {line.seat !== null && <SeatMark seat={line.seat} className="mt-[0.15em]" />}
                {line.text}
              </span>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/** The panels beside the board on an ultrawide: one column at 21:9, the log a column of its own at
 *  32:9. */
export function IntelPanels({ view, events, step, from, keep, className }: { view: GameView; events: readonly GameEvent[]; step: Step; from: TerritoryId | null; keep: number; className?: string }) {
  return (
    <div className={cn("min-h-0 shrink-0 flex-col gap-[0.5em] min-[3600px]:flex-row min-[3600px]:text-[1.15em]", className)}>
      <div className="flex w-[22em] flex-col gap-[0.5em] min-[3600px]:w-[26em]">
        <Standings view={view} />
        <Continents view={view} />
        <Odds view={view} step={step} from={from} keep={keep} />
      </div>
      <Log events={events} className="w-[22em] flex-1 min-[3600px]:w-[26em]" />
    </div>
  );
}
