"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bike, CalendarDays, Car, Check, RotateCcw, Cloud, CloudFog, CloudRain, CloudSnow, CloudSun, FlaskConical, Globe, MapPin, Navigation, Pause, Play, TreePine, Snowflake, Sun, Sunrise, ThermometerSnowflake, X, type LucideIcon } from "lucide-react";
import type { CarChoice, DayChange, DayShown, Game } from "../render/game";
import { HELD_WEATHER, type HeldWeather } from "../climate/held";
import { DAYS_A_MONTH, MONTH_NAMES } from "../time/calendar";
import type { CarId } from "../sim/cars";
import { CONDITIONS, type Condition } from "../sim/surfaces";
import { playgroundAsked, playgroundLink } from "../playground/place";

/*
 * A tool for the owner, not part of the game: no prompt, no controller. Set to
 * one side so the car can be seen changing behind it. Each thing it offers is a
 * section of its own.
 */

const INK = "var(--color-aland-drive-ui-ink)";
const SHADE = "var(--color-aland-drive-ui-shade)";
const ACCENT = "var(--color-aland-drive-ui-accent)";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function CarList({ cars, car, onCar }: { cars: readonly CarChoice[]; car: CarId; onCar: (id: CarId) => void }) {
  const current = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    current.current?.focus();
  }, []);
  return (
    <ul className="flex flex-col gap-1">
      {cars.map(({ id, name, paint }) => (
        <li key={id}>
          <button
            ref={id === car ? current : undefined}
            type="button"
            aria-pressed={id === car}
            className="flex w-full cursor-pointer items-center gap-2 rounded border-2 px-2 py-1 text-left text-sm"
            style={{ borderColor: id === car ? ACCENT : "transparent" }}
            onClick={() => { onCar(id); }}
          >
            <span aria-hidden className="size-4 shrink-0 rounded-full border" style={{ background: `var(--color-aland-drive-${paint})`, borderColor: INK }} />
            <span className="grow">{name}</span>
            {id === car && <Check aria-hidden className="size-4" style={{ color: ACCENT }} />}
          </button>
        </li>
      ))}
    </ul>
  );
}

function CopyPlace({ whereabouts }: { whereabouts: () => string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="flex cursor-pointer items-center gap-2 rounded border-2 px-2 py-1 text-sm"
      style={{ borderColor: copied ? ACCENT : INK }}
      onClick={() => { void navigator.clipboard.writeText(whereabouts()).then(() => { setCopied(true); }); }}
    >
      {copied ? <Check aria-hidden className="size-4" style={{ color: ACCENT }} /> : <MapPin aria-hidden className="size-4" />}
      {copied ? "Copied" : "Copy where the car is"}
    </button>
  );
}

/** Forgets every place found, challenge passed and setting kept in this browser, after a second press to be sure. */
function ResetSave({ onReset }: { onReset: () => void }) {
  const [asked, setAsked] = useState(false);
  return (
    <button
      type="button"
      className="flex cursor-pointer items-center gap-2 rounded border-2 px-2 py-1 text-sm"
      style={{ borderColor: asked ? ACCENT : INK }}
      onClick={() => { if (asked) onReset(); else setAsked(true); }}
    >
      <RotateCcw aria-hidden className="size-4" style={asked ? { color: ACCENT } : undefined} />
      {asked ? "Sure? Reset and reload" : "Reset save data"}
    </button>
  );
}

const CONDITION_ICONS: Record<Condition, LucideIcon> = { dry: Sun, wet: CloudRain, snow: Snowflake, ice: ThermometerSnowflake };

/** Every surface's condition at once, for trying the grip before there is weather to set it. */
function ConditionChoice({ condition, onCondition }: { condition: Condition; onCondition: (condition: Condition) => void }) {
  const [chosen, setChosen] = useState(condition);
  return (
    <div role="radiogroup" aria-label="Condition" className="grid grid-cols-4 gap-1">
      {CONDITIONS.map((name) => {
        const Icon = CONDITION_ICONS[name];
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={name === chosen}
            className="flex cursor-pointer flex-col items-center gap-1 rounded border-2 px-1 py-1 text-xs capitalize"
            style={{ borderColor: name === chosen ? ACCENT : "transparent" }}
            onClick={() => {
              setChosen(name);
              onCondition(name);
            }}
          >
            <Icon aria-hidden className="size-4" style={{ color: name === chosen ? ACCENT : INK }} />
            {name}
          </button>
        );
      })}
    </div>
  );
}

const WEATHER_ICONS: Record<HeldWeather, LucideIcon> = { clear: Sun, cloud: CloudSun, overcast: Cloud, rain: CloudRain, snowfall: CloudSnow, fog: CloudFog, ice: ThermometerSnowflake };
const HELD = Object.keys(HELD_WEATHER) as HeldWeather[];

/** The weather this page draws and drives on: one held, or the shared one running, whose state is marked. */
function WeatherChoice({ weather, onWeather }: { weather: Game["weather"]; onWeather: Game["setWeather"] }) {
  const [shown, setShown] = useState(weather);
  const choose = (held: HeldWeather | null) => {
    onWeather(held);
    setShown({ ...weather(), held });
  };
  const { held, state } = shown;
  const live = held === null;
  return (
    <div role="radiogroup" aria-label="Weather" className="grid grid-cols-4 gap-1">
      <button type="button" role="radio" aria-checked={live} title="The shared weather, as every player has it" className="flex cursor-pointer flex-col items-center gap-1 rounded border-2 px-1 py-1 text-xs" style={{ borderColor: live ? ACCENT : "transparent" }} onClick={() => { choose(null); }}>
        <Globe aria-hidden className="size-4" style={{ color: live ? ACCENT : INK }} />
        shared
      </button>
      {HELD.map((name) => {
        const Icon = WEATHER_ICONS[name];
        const chosen = name === held;
        // The shared weather's own state is marked too, underlined, so what it is now can be seen.
        const now = live && name === state;
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={chosen}
            className="flex cursor-pointer flex-col items-center gap-1 rounded border-2 px-1 py-1 text-xs"
            style={{ borderColor: chosen ? ACCENT : "transparent", textDecoration: now ? "underline" : undefined }}
            onClick={() => { choose(name); }}
          >
            <Icon aria-hidden className="size-4" style={{ color: chosen || now ? ACCENT : INK }} />
            {name === "ice" ? "black ice" : name}
          </button>
        );
      })}
    </div>
  );
}

/** Cars, cyclists and walkers on the lanes round the car, on or off. Offline only: in the shared world, null, it's always on, since everyone sees the same. */
function TrafficSwitch({ traffic, onTraffic }: { traffic: boolean | null; onTraffic: (on: boolean) => void }) {
  const [on, setOn] = useState(traffic);
  const offline = on !== null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on !== false}
      aria-label="Traffic"
      disabled={!offline}
      title={offline ? undefined : "Always on in the shared world, where everyone sees the same traffic"}
      className="flex cursor-pointer items-center gap-2 rounded border-2 px-2 py-1 text-sm disabled:cursor-default disabled:opacity-50"
      style={{ borderColor: on !== false ? ACCENT : INK }}
      onClick={() => {
        if (on === null) return;
        setOn(!on);
        onTraffic(!on);
      }}
    >
      <Car aria-hidden className="size-4" style={on !== false ? { color: ACCENT } : undefined} />
      <Bike aria-hidden className="size-4" style={on !== false ? { color: ACCENT } : undefined} />
      <span className="grow text-left">{on !== false ? "On" : "Off"}</span>
    </button>
  );
}

const clockText = (hour: number) => `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor((hour % 1) * 60)).padStart(2, "0")}`;

/** The time this page shows: a month and one of its four game days, an hour, or the time held still. Now is the real date and time. */
function DayChoice({ day, onDay }: { day: () => DayShown; onDay: (change: DayChange) => void }) {
  const [shown, setShown] = useState(day);
  const change = (next: DayChange) => {
    onDay(next);
    setShown(day());
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className="flex grow items-center gap-2 text-sm">
          <CalendarDays aria-hidden className="size-4 shrink-0" />
          <span className="sr-only">Month</span>
          <select
            value={shown.month}
            className="grow cursor-pointer rounded border-2 bg-transparent px-1"
            style={{ borderColor: INK }}
            onChange={(event) => { change({ calendar: { month: Number(event.target.value), day: shown.day } }); }}
          >
            {MONTH_NAMES.map((name, at) => (
              <option key={name} value={at + 1} style={{ background: SHADE }}>{name}</option>
            ))}
          </select>
        </label>
        <button type="button" title="The real date and time" aria-label="Now" className="cursor-pointer rounded border-2 px-2 py-1 text-xs" style={{ borderColor: INK }} onClick={() => { change({ now: true }); }}>
          Now
        </button>
      </div>
      <div className="flex items-center gap-2" role="radiogroup" aria-label="Day of the month">
        {Array.from({ length: DAYS_A_MONTH }, (_, at) => at + 1).map((number) => (
          <button
            key={number}
            type="button"
            role="radio"
            aria-checked={number === shown.day && !shown.dateHeld}
            className="grow cursor-pointer rounded border-2 py-1 text-sm tabular-nums"
            style={{ borderColor: number === shown.day && !shown.dateHeld ? ACCENT : INK }}
            onClick={() => { change({ calendar: { month: shown.month, day: number } }); }}
          >
            {number}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" title={shown.held ? "Let the time run" : "Hold the time"} aria-label={shown.held ? "Let the time run" : "Hold the time"} className="cursor-pointer" onClick={() => { change({ held: !shown.held }); }}>
          {shown.held ? <Play className="size-4" /> : <Pause className="size-4" />}
        </button>
        <input type="range" aria-label="Hour" min={0} max={23.75} step={0.25} value={shown.hour} className="grow" style={{ accentColor: ACCENT }} onChange={(event) => { change({ hour: Number(event.target.value) }); }} />
        <span className="w-12 text-right text-sm tabular-nums">{clockText(shown.hour)}</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span title="The real date whose sky is shown" className="tabular-nums">{shown.date}</span>
        <span className="flex items-center gap-1" title="The sun's height over the horizon">
          <Sunrise aria-hidden className="size-4" />
          <span className="tabular-nums">{shown.sun.elevationDeg.toFixed(1)}°</span>
        </span>
      </div>
    </div>
  );
}

/** Over to the playground, a made-up map for trying the car, or back to Åland. */
function WorldSwitch() {
  const inPlayground = playgroundAsked(window.location.search);
  const Icon = inPlayground ? TreePine : FlaskConical;
  return (
    <a href={playgroundLink(window.location.href, inPlayground)} className="flex cursor-pointer items-center gap-2 rounded border-2 px-2 py-1 text-sm" style={{ borderColor: INK }}>
      <Icon aria-hidden className="size-4" />
      {inPlayground ? "Back to Åland" : "Playground"}
    </a>
  );
}

function SpotList({ spots, onJump, onJumpToDestination }: { spots: readonly { id: string; name: string }[]; onJump: (id: string) => void; onJumpToDestination: (() => void) | null }) {
  return (
    <ul className="flex flex-col gap-1">
      <li>
        <button type="button" disabled={onJumpToDestination === null} title={onJumpToDestination === null ? "Set a destination on the map first" : undefined} className="flex w-full cursor-pointer items-center gap-2 rounded border-2 px-2 py-1 text-left text-sm disabled:cursor-default disabled:opacity-50" style={{ borderColor: ACCENT }} onClick={() => { onJumpToDestination?.(); }}>
          <MapPin aria-hidden className="size-4 shrink-0" style={{ color: ACCENT }} />
          <span className="grow">GPS destination</span>
        </button>
      </li>
      {spots.map(({ id, name }) => (
        <li key={id}>
          <button type="button" className="flex w-full cursor-pointer items-center gap-2 rounded border-2 px-2 py-1 text-left text-sm" style={{ borderColor: INK }} onClick={() => { onJump(id); }}>
            <Navigation aria-hidden className="size-4 shrink-0" />
            <span className="grow">{name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function DevMenu({ cars, car, onCar, traffic, onTraffic, condition, onCondition, day, onDay, weather, onWeather, spots, onJump, onJumpToDestination, whereabouts, onResetSave, onClose }: { cars: readonly CarChoice[]; car: CarId; onCar: (id: CarId) => void; traffic: boolean | null; onTraffic: (on: boolean) => void; condition: Condition; onCondition: (condition: Condition) => void; day: () => DayShown; onDay: (change: DayChange) => void; weather: Game["weather"]; onWeather: Game["setWeather"]; spots: readonly { id: string; name: string }[]; onJump: (id: string) => void; onJumpToDestination: (() => void) | null; whereabouts: () => string; onResetSave: () => void; onClose: () => void }) {
  return (
    <div className="absolute inset-0" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label="Dev menu"
        className="absolute top-14 right-6 grid max-h-[calc(100vh-4.5rem)] w-[min(60rem,calc(100vw-3rem))] grid-cols-3 gap-5 overflow-y-auto rounded-lg p-4"
        style={{ background: SHADE, color: INK }}
        onClick={(event) => { event.stopPropagation(); }}
      >
        <button type="button" aria-label="Close" title="Close" className="absolute top-2 right-2 cursor-pointer" onClick={onClose}>
          <X className="size-5" />
        </button>
        {/* Three columns, so it fits a screen's height: the world's day, weather and ground, where to go, and what to drive. */}
        <div className="flex flex-col gap-4">
          <Section title="Place">
            <CopyPlace whereabouts={whereabouts} />
            <WorldSwitch />
          </Section>
          <Section title="Save">
            <ResetSave onReset={onResetSave} />
          </Section>
          <Section title="Day">
            <DayChoice day={day} onDay={onDay} />
          </Section>
          <Section title="Weather">
            <WeatherChoice weather={weather} onWeather={onWeather} />
          </Section>
          <Section title="Ground">
            <ConditionChoice condition={condition} onCondition={onCondition} />
          </Section>
          <Section title="Traffic">
            <TrafficSwitch traffic={traffic} onTraffic={onTraffic} />
          </Section>
        </div>
        <Section title="Jump to">
          <SpotList spots={spots} onJump={onJump} onJumpToDestination={onJumpToDestination} />
        </Section>
        <Section title="Cars">
          <CarList cars={cars} car={car} onCar={onCar} />
        </Section>
      </div>
    </div>
  );
}
