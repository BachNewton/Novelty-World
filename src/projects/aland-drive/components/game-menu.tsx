"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowLeft, Car, Check, Disc, Footprints, Navigation, Flag, LogOut, Medal as MedalIcon, PaintBucket, Play, Repeat, Route, RotateCcw, Settings, Trophy, User, UserPlus, UserX, Users, X } from "lucide-react";
import type { InputKind } from "@/shared/lib/input";
import { usePadNavigation } from "@/shared/lib/gamepad";
import { PadHints } from "@/shared/components/pad-hints";
import { placeText, resultText } from "../challenge/format";
import type { Medal } from "../challenge/standings";
import type { RaceGround } from "../challenge/types";
import { isCarItem, isPaintItem, paintOfItem, tyreOfItem, unitsOfItem, type GameMenu as GameMenuState, type MenuItemId, type MenuResult, type RaceCard, type RaceResult } from "../render/game-menu";
import { CarSelect } from "./car-select";
import { SettingsMenu } from "./settings-menu";
import { ACCENT, CHALLENGE, INK, MenuButton, SHADE, TYRE_LOOKS, UNITS_LOOKS, type ItemLook } from "./menu-parts";
import { useUnits } from "../units";

/*
 * The game's own menu, on a pad's Menu or Esc, and a challenge's small
 * choices on its own button. The game says what it holds
 * (`render/game-menu.ts`); this draws each item by its id. It opens on its
 * first item, and B, Menu and Esc press the one the game names as its way
 * back: Resume, Cancel, or Leave on a challenge's result card. A race has its
 * own card before it starts and its own result card, with the places.
 */

const PASS = "var(--color-aland-drive-ui-pass)";
const FAIL = "var(--color-aland-drive-ui-redline)";

/** A race's colour, by what's under its wheels. */
export const raceColour = (ground: RaceGround) => `var(--color-aland-drive-ui-race-${ground})`;
const medalColour = (medal: Medal) => `var(--color-aland-drive-ui-${medal})`;
const MEDAL_NAMES: Record<Medal, string> = { gold: "Gold", silver: "Silver", bronze: "Bronze" };
const GROUND_NAMES: Record<RaceGround, string> = { road: "Road", "cross-country": "Cross country", "off-road": "Off-road" };

function useItemLook(menu: GameMenuState): (id: MenuItemId) => ItemLook {
  const shownUnits = useUnits((state) => state.units);
  return (id) => {
    if (isPaintItem(id)) return { icon: PaintBucket, label: `Paint ${paintOfItem(id) + 1}` };
    if (isCarItem(id)) return { icon: Car, label: id };
    switch (id) {
      case "resume":
        return { icon: Play, label: "Resume" };
      case "tyres-summer":
      case "tyres-winter":
      case "tyres-studded": {
        const tyre = tyreOfItem(id);
        return { icon: TYRE_LOOKS[tyre].icon, label: `${TYRE_LOOKS[tyre].name} tyres`, on: menu.tyres === tyre };
      }
      case "units-metric":
      case "units-imperial": {
        const units = unitsOfItem(id);
        return { icon: UNITS_LOOKS[units].icon, label: UNITS_LOOKS[units].name, on: units === shownUnits };
      }
      case "abs":
        return { icon: Disc, label: "ABS", on: menu.assists?.abs ?? true };
      case "traction":
        return { icon: Footprints, label: "Traction control", on: menu.assists?.traction ?? true };
      case "stability":
        return { icon: Navigation, label: "Stability", on: menu.assists?.stability ?? true };
      case "settings":
        return { icon: Settings, label: "Settings" };
      case "cars":
        return { icon: Car, label: "Cars" };
      case "back":
        return { icon: ArrowLeft, label: "Back" };
      case "start-solo":
        return menu.kind === "race" ? { icon: Flag, label: menu.players === undefined ? "Start" : "Solo" } : { icon: User, label: "Solo" };
      case "start-coop":
        return { icon: Users, label: `Co-op · ask ${menu.players ?? 0}` };
      case "join-coop":
        return { icon: UserPlus, label: `Join ${menu.partner ?? ""}` };
      case "decline-coop":
        return { icon: X, label: "Decline" };
      case "start-team":
        return { icon: Flag, label: `Start · ${(menu.players ?? 0) + 1} players` };
      case "withdraw-coop":
        return { icon: UserX, label: "Take the invite back" };
      case "cancel":
        return { icon: X, label: "Cancel" };
      case "retry":
        return { icon: RotateCcw, label: "Retry" };
      case "leave":
        return { icon: LogOut, label: menu.ground ? "Leave race" : "Leave challenge" };
    }
  };
}

/** A medal as a coloured disc, or an empty ring for none. */
function MedalMark({ medal, className }: { medal: Medal | null; className: string }) {
  return <MedalIcon aria-label={medal ? MEDAL_NAMES[medal] : "No medal"} className={className} style={{ color: medal ? medalColour(medal) : INK, opacity: medal ? 1 : 0.4 }} />;
}

/** A race before it starts: its number, ground and shape, laps and length, the car, what each medal takes, and what's been won solo and in co-op. */
function RaceCardHeader({ title, card }: { title: string; card: RaceCard }) {
  const colour = raceColour(card.ground);
  return (
    <div className="mb-1 flex flex-col gap-2" aria-label="Race card">
      <div className="flex items-center gap-2 text-lg font-semibold" style={{ color: colour }}>
        <Trophy aria-hidden className="size-5 shrink-0" />
        <span>{card.number}</span>
        <span>{title}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
        <span className="font-semibold" style={{ color: colour }} aria-label="Ground">{GROUND_NAMES[card.ground]}</span>
        <span className="flex items-center gap-1" aria-label={card.shape === "circuit" ? "Laps" : "Sprint"} title={card.shape === "circuit" ? "Laps" : "Sprint"}>
          {card.shape === "circuit" ? <Repeat aria-hidden className="size-4" /> : <Route aria-hidden className="size-4" />}
          {card.shape === "circuit" ? card.laps : "A to B"}
        </span>
        <span aria-label="Length">{(card.lengthM / 1000).toFixed(1)} km</span>
        <span className="flex items-center gap-1" aria-label="Car" title="Car">
          <Car aria-hidden className="size-4" />
          {card.car}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 text-sm tabular-nums" aria-label="Won">
        {(["solo", "coop"] as const).map((mode) => {
          const record = card.records[mode];
          const Icon = mode === "solo" ? User : Users;
          return (
            <div key={mode} className="flex items-center gap-2" aria-label={mode === "solo" ? "Solo" : "Co-op"} title={mode === "solo" ? "Solo" : "Co-op"}>
              <Icon aria-hidden className="size-4 shrink-0" />
              <MedalMark medal={record?.medal ?? null} className="size-4 shrink-0" />
              <span aria-label="Best place">{record ? placeText(record.place) : "–"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One player of a co-op team on a result card: this player as a single figure, a teammate by name. */
function TeamRow({ name, children }: { name: string | null; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2" aria-label={name ?? "Yours"} title={name ?? "You"}>
      {name === null ? <User aria-hidden className="size-4 shrink-0" /> : <Users aria-hidden className="size-4 shrink-0" />}
      {name !== null && <span className="max-w-32 truncate">{name}</span>}
      <span>{children}</span>
    </div>
  );
}

/** How a race finished: the medal and place, with each teammate's points in co-op, and the best medal kept. */
function RaceResultHeader({ title, race }: { title: string; race: RaceResult }) {
  return (
    <div className="mb-1 flex flex-col gap-1" aria-label="Result">
      <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: raceColour(race.ground) }}>
        <Trophy aria-hidden className="size-4 shrink-0" />
        <span>{title}</span>
      </div>
      <div className="flex items-center gap-3 text-3xl font-bold">
        <MedalMark medal={race.medal} className="size-9 shrink-0" />
        <span aria-label="Place">{placeText(race.place)}</span>
      </div>
      {race.team && (
        <div className="flex flex-col gap-0.5 text-sm tabular-nums" aria-label="Team" title="Team points: 100 a racer beaten, 50 for beating them all">
          {race.team.map(({ name, points }) => (
            <TeamRow key={name ?? ""} name={name}>
              {points === undefined || points === null ? "–" : `${points} pts`}
            </TeamRow>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 text-sm" aria-label="Best medal" title="Best medal">
        <Trophy aria-hidden className="size-4 shrink-0" style={{ color: ACCENT }} />
        <MedalMark medal={race.bestMedal} className="size-4 shrink-0" />
      </div>
    </div>
  );
}

/** How an attempt went: passed or not, against the target, and the best kept. */
function ResultHeader({ title, result: { passed, kind, result, target, best, team } }: { title: string; result: MenuResult }) {
  const Verdict = passed ? Check : X;
  const units = useUnits((state) => state.units);
  return (
    <div className="mb-1 flex flex-col gap-1" aria-label="Result">
      <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: CHALLENGE }}>
        <Flag aria-hidden className="size-4 shrink-0" />
        <span>{title}</span>
      </div>
      <div className="flex items-center gap-2 text-2xl font-bold" style={{ color: passed ? PASS : FAIL }}>
        <Verdict aria-hidden className="size-7 shrink-0" />
        <span>{passed ? "Passed" : "Failed"}</span>
      </div>
      <div className="flex items-baseline gap-2 text-lg tabular-nums">
        <span className="text-2xl font-bold" aria-label={kind === "route" ? "Time" : "Speed"}>{result === null ? "–" : resultText(kind, result, units)}</span>
        {target !== null && <span className="opacity-75" aria-label="Target">/ {resultText(kind, target, units)}</span>}
      </div>
      {team && (
        <div className="flex flex-col gap-0.5 text-sm tabular-nums" aria-label="Team">
          {team.map(({ name, result: own }) => (
            <TeamRow key={name ?? ""} name={name}>
              {own === null ? "–" : resultText(kind, own, units)}
            </TeamRow>
          ))}
        </div>
      )}
      {best !== null && (
        <div className="flex items-center gap-2 text-sm tabular-nums" aria-label="Best" title="Best">
          <Trophy aria-hidden className="size-4 shrink-0" style={{ color: ACCENT }} />
          <span>{resultText(kind, best, units)}</span>
        </div>
      )}
    </div>
  );
}

/** The size of an element in CSS pixels, kept as it changes. */
function useSize(element: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: target.clientWidth, height: target.clientHeight });
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [element]);
  return size;
}

const DIALOG_NAMES = { menu: "Game menu", settings: "Settings", cars: "Cars", start: "Start challenge", invite: "Co-op invite", race: "Race", team: "Co-op team" } as const;

/** A choice's heading: the challenge, and who a co-op invite is from. */
function ChoiceHeader({ title, from, ground }: { title: string; from?: string; ground?: RaceGround }) {
  return (
    <div className="mb-1 flex flex-col gap-1">
      {from !== undefined && (
        <div className="flex items-center gap-2 text-lg font-semibold" aria-label="From">
          <Users aria-hidden className="size-5 shrink-0" />
          <span>{from}</span>
        </div>
      )}
      <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: ground ? raceColour(ground) : CHALLENGE }} aria-label={ground ? "Race" : "Challenge"}>
        {ground ? <Trophy aria-hidden className="size-4 shrink-0" /> : <Flag aria-hidden className="size-4 shrink-0" />}
        <span>{title}</span>
      </div>
    </div>
  );
}

export function GameMenu({ menu, input, onPick }: { menu: GameMenuState; input: InputKind; onPick: (id: MenuItemId) => void }) {
  const backdrop = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const look = useItemLook(menu);
  const view = useSize(backdrop);
  usePadNavigation(root, { reveal: input === "pad" });
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div ref={backdrop} className="absolute inset-0 flex items-center justify-center" style={{ ["--color-pad-focus" as string]: ACCENT }}>
      <div ref={root} role="dialog" aria-modal aria-label={menu.result ? (menu.result.race ? "Race result" : "Challenge result") : DIALOG_NAMES[menu.kind ?? "menu"]} className={`flex max-h-[94vh] flex-col gap-2 rounded-lg p-4 ${menu.kind === "cars" ? "max-w-[96vw]" : menu.kind === "settings" ? "w-[52rem] max-w-[96vw]" : "w-80 max-w-[90vw]"}`} style={{ background: SHADE, color: INK }}>
        {menu.result && (menu.result.race ? <RaceResultHeader title={menu.challenge ?? ""} race={menu.result.race} /> : <ResultHeader title={menu.challenge ?? ""} result={menu.result} />)}
        {menu.kind === "race" && menu.race && <RaceCardHeader title={menu.challenge ?? ""} card={menu.race} />}
        {menu.kind === "settings" && <SettingsMenu menu={menu} input={input} view={view} first={first} look={look} onPick={onPick} />}
        {menu.kind === "cars" && <CarSelect menu={menu} first={first} onPick={onPick} />}
        {menu.kind === "start" && <ChoiceHeader title={menu.challenge ?? ""} />}
        {(menu.kind === "invite" || menu.kind === "team") && <ChoiceHeader title={menu.challenge ?? ""} from={menu.partner} ground={menu.ground} />}
        {menu.kind !== "settings" && menu.items.map((id, index) => {
          if (isPaintItem(id) || isCarItem(id)) return null;
          // The Cars page opens on the car being driven.
          const opensHere = index === 0 && menu.kind !== "cars";
          return (
            <MenuButton
              key={id}
              look={look(id)}
              start={opensHere}
              back={id === menu.back}
              buttonRef={opensHere ? first : undefined}
              border={id === "start-solo" || id === "start-coop" || id === "join-coop" || id === "start-team" ? CHALLENGE : INK}
              onPress={() => { onPick(id); }}
            />
          );
        })}
        <PadHints hints={[["A", "Choose"], ["B", look(menu.back).label]]} className="mt-1" />
      </div>
    </div>
  );
}
