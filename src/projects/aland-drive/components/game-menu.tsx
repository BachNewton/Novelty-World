"use client";

import { useEffect, useRef, useState, type ComponentType, type RefObject } from "react";
import { ArrowLeft, Car, Check, CircleDot, Disc, Droplet, Footprints, Gem, Navigation, Flag, Fullscreen, LogOut, Medal as MedalIcon, Minus, MonitorCog, PaintBucket, Play, Plus, Repeat, Route, Ruler, RotateCcw, Snowflake, Sparkles, Square, Sun, ToggleLeft, ToggleRight, Trophy, User, UserPlus, Users, Volume2, VolumeX, X } from "lucide-react";
import { usePadNavigation } from "@/shared/lib/gamepad";
import { PadHints } from "@/shared/components/pad-hints";
import { useDriveSoundSettings } from "../audio/settings";
import { RENDER_SCALES, useDriveGraphics } from "../render/graphics-settings";
import { placeText, resultText } from "../challenge/format";
import type { Medal } from "../challenge/standings";
import type { RaceGround } from "../challenge/types";
import { isPaintItem, paintOfItem, tyreOfItem, unitsOfItem, type GameMenu as GameMenuState, type MenuItemId, type MenuResult, type RaceCard, type RaceResult } from "../render/game-menu";
import { paintName, type CarPaint, type PaintFinish } from "../art/cars/paints";
import { useUnits, type Units } from "../units";
import type { Tyre } from "../sim/surfaces";

/*
 * The game's own menu, on a pad's Menu or Esc, and a challenge's small
 * choices on its own button. The game says what it holds
 * (`render/game-menu.ts`); this draws each item by its id. It opens on its
 * first item, and B, Menu and Esc press the one the game names as its way
 * back: Resume, Cancel, or Leave on a challenge's result card. A race has its
 * own card before it starts and its own result card, with the places.
 */

const INK = "var(--color-aland-drive-ui-ink)";
const SHADE = "var(--color-aland-drive-ui-shade)";
const ACCENT = "var(--color-aland-drive-ui-accent)";
const CHALLENGE = "var(--color-aland-drive-ui-challenge)";
const PASS = "var(--color-aland-drive-ui-pass)";
const FAIL = "var(--color-aland-drive-ui-redline)";

/** A race's colour, by what's under its wheels. */
export const raceColour = (ground: RaceGround) => `var(--color-aland-drive-ui-race-${ground})`;
const medalColour = (medal: Medal) => `var(--color-aland-drive-ui-${medal})`;
const MEDAL_NAMES: Record<Medal, string> = { gold: "Gold", silver: "Silver", bronze: "Bronze" };
const GROUND_NAMES: Record<RaceGround, string> = { road: "Road", "cross-country": "Cross country", "off-road": "Off-road" };

const TYRE_LOOKS: Record<Tyre, { icon: ItemLook["icon"]; name: string }> = {
  summer: { icon: Sun, name: "Summer" },
  winter: { icon: Snowflake, name: "Friction" },
  studded: { icon: CircleDot, name: "Studded" },
};

const UNITS_LOOKS: Record<Units, { icon: ItemLook["icon"]; name: string; detail: string }> = {
  metric: { icon: Ruler, name: "Metric", detail: "km/h · °C · 24h" },
  imperial: { icon: Ruler, name: "Imperial", detail: "mph · °F · 12h" },
};

type TyreItem = `tyres-${Tyre}`;
const isTyreItem = (id: MenuItemId): id is TyreItem => id.startsWith("tyres-");
type UnitsItem = `units-${Units}`;
const isUnitsItem = (id: MenuItemId): id is UnitsItem => id.startsWith("units-");

interface ItemLook {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  /** For an item that is a setting: whether it's on. */
  on?: boolean;
}

function useItemLook(menu: GameMenuState): (id: MenuItemId) => ItemLook {
  const muted = useDriveSoundSettings((state) => state.settings.muted);
  const shownUnits = useUnits((state) => state.units);
  return (id) => {
    if (isPaintItem(id)) {
      const paint = menu.paints?.paints[paintOfItem(id)];
      return { icon: PaintBucket, label: paint ? paintName(paint) : "Paint" };
    }
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
      case "sound":
        return { icon: muted ? VolumeX : Volume2, label: "Sound", on: !muted };
      case "graphics":
        return { icon: MonitorCog, label: "Graphics" };
      case "paint":
        return { icon: PaintBucket, label: "Paint" };
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

/** How a race finished: the medal and place, and the best medal kept. */
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
          <div className="flex items-center gap-2" aria-label="Yours">
            <User aria-hidden className="size-4 shrink-0" />
            <span>{team.own === null ? "–" : resultText(kind, team.own, units)}</span>
          </div>
          <div className="flex items-center gap-2" aria-label={team.partnerName} title={team.partnerName}>
            <Users aria-hidden className="size-4 shrink-0" />
            <span>{team.partner === null ? "–" : resultText(kind, team.partner, units)}</span>
          </div>
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

/**
 * A setting's choices side by side, the one in force marked: each picks its own, so no button has to say whether it's
 * what's set or what pressing it would set. The tyres and the units are each one.
 */
function SideBySide({ name, choices, onPick }: { name: string; choices: { id: MenuItemId; icon: ItemLook["icon"]; label: string; spoken: string; detail?: string; on: boolean }[]; onPick: (id: MenuItemId) => void }) {
  return (
    <div role="radiogroup" aria-label={name} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}>
      {choices.map(({ id, icon: Icon, label, spoken, detail, on }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={on}
          aria-label={spoken}
          className="relative flex cursor-pointer flex-col items-center gap-1 rounded border-2 px-2 py-2 text-sm font-semibold"
          style={{ borderColor: on ? ACCENT : "transparent", color: on ? ACCENT : INK }}
          onClick={() => { onPick(id); }}
        >
          {on && <Check aria-hidden className="absolute top-1 right-1 size-4" />}
          <Icon aria-hidden className="size-6" />
          <span>{label}</span>
          {detail !== undefined && <span className="text-xs font-normal opacity-80">{detail}</span>}
        </button>
      ))}
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

/** The Graphics page's settings, which the page keeps and the game follows live. The menu covers the game, so its size is the game's. */
function GraphicsSettings({ view, first }: { view: { width: number; height: number }; first: RefObject<HTMLButtonElement | null> }) {
  const scale = useDriveGraphics((state) => state.settings.renderScale);
  const step = useDriveGraphics((state) => state.stepRenderScale);
  // As three sizes the canvas: CSS pixels times the pixel ratio, rounded down.
  const ratio = window.devicePixelRatio * scale;
  const resolution = `${Math.floor(view.width * ratio)}×${Math.floor(view.height * ratio)}`;
  const lowest = scale === RENDER_SCALES[0];
  const highest = scale === RENDER_SCALES[RENDER_SCALES.length - 1];
  const stepper = "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded border-2 aria-disabled:cursor-default aria-disabled:opacity-40";
  return (
    <div className="mb-1 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <MonitorCog aria-hidden className="size-5 shrink-0" />
        <span>Graphics</span>
      </div>
      <div role="group" aria-label="Render scale" className="flex items-center gap-2">
        <Fullscreen aria-hidden className="size-5 shrink-0" />
        <div className="flex grow flex-col leading-tight" title="Share of the screen's physical pixels the world is drawn at">
          <span className="text-lg font-semibold">Render scale</span>
          <span className="text-xs tabular-nums opacity-75" aria-label="Resolution">{resolution}</span>
        </div>
        {/* aria-disabled rather than disabled, so a pad's focus stays on a button pressed to its end. */}
        <button ref={first} type="button" data-pad-start aria-label="Lower render scale" aria-disabled={lowest} className={stepper} style={{ borderColor: INK }} onClick={() => { step(-1); }}>
          <Minus aria-hidden className="size-4" />
        </button>
        <span className="w-12 text-center text-lg font-semibold tabular-nums" role="status" aria-label="Render scale">{Math.round(scale * 100)}%</span>
        <button type="button" aria-label="Raise render scale" aria-disabled={highest} className={stepper} style={{ borderColor: INK }} onClick={() => { step(1); }}>
          <Plus aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}

const carColour = (token: string) => `var(--color-aland-drive-${token})`;
const SHINE = "var(--color-aland-drive-ui-swatch-shine)";
const DARK = "var(--color-aland-drive-ui-swatch-shade)";
/** A share of the shine or the dark over a colour, for a swatch's light. */
const lit = (colour: string, by: string, share: number) => `color-mix(in oklab, ${colour}, ${by} ${share}%)`;
const clear = (by: string, share: number) => `color-mix(in oklab, ${by} ${share}%, transparent)`;

const FINISH_GLYPHS: Record<PaintFinish, ItemLook["icon"]> = { solid: Droplet, metallic: Sparkles, matte: Square, pearl: Gem };

/**
 * A paint as a chip of the coat itself, its finish shown in how the chip takes the light: a gloss carries a hard line of
 * the horizon across it, a metallic a tight, bright highlight and a scatter of flakes, a matte only a soft fall of light,
 * a pearl its colour turning to its flip. A car's stripes run down it.
 */
function swatchBackground({ colour, finish, stripe, flip }: CarPaint): string {
  const base = carColour(colour);
  const stripes = stripe === undefined ? [] : [`linear-gradient(90deg, transparent 26%, ${carColour(stripe)} 26% 40%, transparent 40% 60%, ${carColour(stripe)} 60% 74%, transparent 74%)`];
  const layers: Record<PaintFinish, string[]> = {
    solid: [`linear-gradient(180deg, ${clear(SHINE, 28)} 0 46%, ${clear(DARK, 18)} 46% 52%, transparent 52%)`, `linear-gradient(180deg, ${lit(base, SHINE, 12)}, ${lit(base, DARK, 18)})`],
    metallic: [
      `radial-gradient(circle at 30% 26%, ${clear(SHINE, 90)} 0 6%, ${clear(SHINE, 30)} 14%, transparent 32%)`,
      ...[[62, 30], [44, 58], [76, 70], [22, 74], [58, 86], [84, 44], [34, 40]].map(([x, y]) => `radial-gradient(circle at ${x}% ${y}%, ${clear(SHINE, 85)} 0 1.5px, transparent 2px)`),
      `linear-gradient(160deg, ${lit(base, SHINE, 28)}, ${base} 45%, ${lit(base, DARK, 38)})`,
    ],
    matte: [`linear-gradient(180deg, ${lit(base, SHINE, 6)}, ${lit(base, DARK, 8)})`],
    pearl: [`radial-gradient(circle at 30% 26%, ${clear(SHINE, 55)} 0 8%, transparent 30%)`, `linear-gradient(150deg, ${base} 30%, ${carColour(flip ?? colour)} 70%, ${lit(carColour(flip ?? colour), DARK, 12)})`],
  };
  return [...stripes, ...layers[finish]].join(", ");
}

/** The Paint page: the car's paints as swatches, the one it's in marked, each painting the car at once when picked. */
function PaintSwatches({ menu, first, onPick }: { menu: GameMenuState; first: RefObject<HTMLButtonElement | null>; onPick: (id: MenuItemId) => void }) {
  if (!menu.paints) throw new Error("a Paint page with no paints");
  const { car, paints, chosen } = menu.paints;
  return (
    <div className="mb-1 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <PaintBucket aria-hidden className="size-5 shrink-0" />
        <span>{car}</span>
      </div>
      <div role="radiogroup" aria-label="Paint" className="grid grid-cols-3 gap-2">
        {menu.items.filter(isPaintItem).map((id) => {
          const index = paintOfItem(id);
          const paint = paints[index];
          const on = index === chosen;
          const Glyph = FINISH_GLYPHS[paint.finish];
          const name = paintName(paint);
          return (
            <button
              key={id}
              ref={on ? first : undefined}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={name}
              title={name}
              data-pad-start={on || undefined}
              className="relative h-16 cursor-pointer rounded border-2 p-1"
              style={{ borderColor: on ? ACCENT : "transparent" }}
              onClick={() => { onPick(id); }}
            >
              <span aria-hidden className="block size-full rounded-sm" style={{ background: swatchBackground(paint) }} />
              <span aria-hidden className="absolute bottom-1.5 left-1.5 flex size-5 items-center justify-center rounded-full" style={{ background: SHADE }}>
                <Glyph className="size-3" />
              </span>
              {on && (
                <span aria-hidden className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full" style={{ background: SHADE, color: ACCENT }}>
                  <Check className="size-3.5" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const DIALOG_NAMES = { menu: "Game menu", graphics: "Graphics", paint: "Paint", start: "Start challenge", invite: "Co-op invite", race: "Race" } as const;

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

export function GameMenu({ menu, revealPadFocus, onPick }: { menu: GameMenuState; revealPadFocus: boolean; onPick: (id: MenuItemId) => void }) {
  const backdrop = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const look = useItemLook(menu);
  const shownUnits = useUnits((state) => state.units);
  const view = useSize(backdrop);
  usePadNavigation(root, { reveal: revealPadFocus });
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div ref={backdrop} className="absolute inset-0 flex items-center justify-center" style={{ ["--color-pad-focus" as string]: ACCENT }}>
      <div ref={root} role="dialog" aria-modal aria-label={menu.result ? (menu.result.race ? "Race result" : "Challenge result") : DIALOG_NAMES[menu.kind ?? "menu"]} className="flex w-80 max-w-[90vw] flex-col gap-2 rounded-lg p-4" style={{ background: SHADE, color: INK }}>
        {menu.result && (menu.result.race ? <RaceResultHeader title={menu.challenge ?? ""} race={menu.result.race} /> : <ResultHeader title={menu.challenge ?? ""} result={menu.result} />)}
        {menu.kind === "race" && menu.race && <RaceCardHeader title={menu.challenge ?? ""} card={menu.race} />}
        {menu.kind === "graphics" && <GraphicsSettings view={view} first={first} />}
        {menu.kind === "paint" && <PaintSwatches menu={menu} first={first} onPick={onPick} />}
        {menu.kind === "start" && <ChoiceHeader title={menu.challenge ?? ""} />}
        {menu.kind === "invite" && <ChoiceHeader title={menu.challenge ?? ""} from={menu.partner} ground={menu.ground} />}
        {menu.items.map((id, index) => {
          if (isPaintItem(id)) return null;
          if (isTyreItem(id)) {
            if (id !== menu.items.find(isTyreItem)) return null;
            const choices = menu.items.filter(isTyreItem).map((item) => {
              const tyre = tyreOfItem(item);
              return { id: item, icon: TYRE_LOOKS[tyre].icon, label: TYRE_LOOKS[tyre].name, spoken: `${TYRE_LOOKS[tyre].name} tyres`, on: tyre === menu.tyres };
            });
            return <SideBySide key="tyres" name="Tyres" choices={choices} onPick={onPick} />;
          }
          if (isUnitsItem(id)) {
            if (id !== menu.items.find(isUnitsItem)) return null;
            const choices = menu.items.filter(isUnitsItem).map((item) => {
              const units = unitsOfItem(item);
              return { id: item, icon: UNITS_LOOKS[units].icon, label: UNITS_LOOKS[units].name, spoken: `${UNITS_LOOKS[units].name} units`, detail: UNITS_LOOKS[units].detail, on: units === shownUnits };
            });
            return <SideBySide key="units" name="Units" choices={choices} onPick={onPick} />;
          }
          const { icon: Icon, label, on } = look(id);
          const back = id === menu.back;
          // A page of settings opens on its first setting rather than its first item, and the Paint page on the paint the car is in.
          const opensHere = index === 0 && menu.kind !== "graphics" && menu.kind !== "paint";
          return (
            <button
              key={id}
              ref={opensHere ? first : undefined}
              type="button"
              aria-pressed={on}
              data-pad-start={opensHere || undefined}
              data-pad-back={back || undefined}
              data-pad-menu={back || undefined}
              className="flex cursor-pointer items-center gap-3 rounded border-2 px-3 py-2 text-left text-lg font-semibold"
              style={{ borderColor: id === "start-solo" || id === "start-coop" || id === "join-coop" ? CHALLENGE : INK }}
              onClick={() => { onPick(id); }}
            >
              <Icon aria-hidden className="size-5 shrink-0" />
              <span className="grow">{label}</span>
              {on !== undefined && (on ? <ToggleRight aria-hidden className="size-7 shrink-0" style={{ color: ACCENT }} /> : <ToggleLeft aria-hidden className="size-7 shrink-0 opacity-50" />)}
            </button>
          );
        })}
        <PadHints hints={[["A", "Choose"], ["B", look(menu.back).label]]} className="mt-1" />
      </div>
    </div>
  );
}
