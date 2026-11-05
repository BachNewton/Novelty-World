"use client";

import { useMemo, useState } from "react";
import { dateOfDayNumber, dateText, dayNumberOf, parseDate, type CalendarDate } from "../climate/calendar";
import { climateTimeAt, dateAsked } from "../climate/feed";
import { seasonAt } from "../climate/season";
import { weatherAt } from "../climate/weather";

/*
 * The `?weather-lab` page: the climate's values at any date and hour, to step through the year and judge them.
 * `?date=2027-01-20&hour=7` opens it there. Nothing is drawn: the art and the sky read these same values later.
 */

const STEPS: { label: string; days: number }[] = [
  { label: "−30", days: -30 },
  { label: "−7", days: -7 },
  { label: "−1", days: -1 },
  { label: "+1", days: 1 },
  { label: "+7", days: 7 },
  { label: "+30", days: 30 },
];

const today = () => dateOfDayNumber(Date.now() / 86_400_000);

function hourAsked(search: string) {
  const asked = new URLSearchParams(search).get("hour");
  return asked === null ? 12 : Number(asked);
}

/** The game day of the shared clock at a date's noon, plus how many game days on: what fronts the page shows. */
function gameDaysAt(date: CalendarDate, onward: number, hour: number) {
  const noon = climateTimeAt((dayNumberOf(date) + 0.5) * 86_400).gameDays;
  return Math.floor(noon) + onward + hour / 24;
}

function Bar({ label, value, most = 1, show, colour }: { label: string; value: number; most?: number; show: string; colour: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr_4rem] items-center gap-2">
      <span className="text-text-secondary">{label}</span>
      <span className="h-2 rounded bg-surface-tertiary">
        <span className="block h-2 rounded" style={{ width: `${Math.min(100, Math.max(0, (value / most) * 100))}%`, background: colour }} />
      </span>
      <span className="text-right tabular-nums">{show}</span>
    </div>
  );
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

const COLOURS = {
  sky: "var(--color-text-secondary)",
  water: "var(--color-brand-blue)",
  snow: "var(--color-text-primary)",
  fog: "var(--color-text-muted)",
  warm: "var(--color-brand-orange)",
  green: "var(--color-brand-green)",
  lights: "var(--color-aland-drive-ui-accent)",
  aurora: "var(--color-brand-pink)",
} as const;

/** The selected date's whole winter year, one column a day, with the date marked: snow, sea ice, leaves and lights. */
function YearStrip({ date }: { date: CalendarDate }) {
  const days = useMemo(() => {
    const start = dayNumberOf({ year: date.month >= 7 ? date.year : date.year - 1, month: 7, day: 1 });
    return Array.from({ length: 365 }, (_, index) => {
      const day = start + index;
      return { day, season: seasonAt(dateOfDayNumber(day), 0.5) };
    });
  }, [date]);
  const marked = dayNumberOf(date) - days[0].day;
  const rows: { label: string; colour: string; value: (season: ReturnType<typeof seasonAt>) => number }[] = [
    { label: "Snow (to 20 cm)", colour: COLOURS.snow, value: (season) => Math.min(1, season.snow.depthCm / 20) },
    { label: "Sea ice reach", colour: COLOURS.water, value: (season) => season.seaIce.reach },
    { label: "Drivable ice", colour: COLOURS.water, value: (season) => season.seaIce.drivable },
    { label: "In leaf", colour: COLOURS.green, value: (season) => season.leaves.leafed },
    { label: "Turned", colour: COLOURS.warm, value: (season) => season.leaves.turned * season.leaves.leafed },
    { label: "Homes lit", colour: COLOURS.lights, value: (season) => season.lights.homes },
    { label: "Terraces out", colour: COLOURS.warm, value: (season) => season.inSeason.terraces },
  ];
  return (
    <svg viewBox={`0 0 365 ${rows.length * 12}`} preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label="The season through the year from July, the date marked">
      {rows.map((row, index) => (
        <g key={row.label} transform={`translate(0 ${index * 12})`}>
          <title>{row.label}</title>
          {days.map(({ season }, day) => (
            <rect key={day} x={day} y={10 - row.value(season) * 10} width={1} height={row.value(season) * 10} fill={row.colour} />
          ))}
        </g>
      ))}
      <line x1={marked + 0.5} x2={marked + 0.5} y1={0} y2={rows.length * 12} stroke={COLOURS.aurora} strokeWidth={1} />
    </svg>
  );
}

/** The game day's 24 hours: cloud as the bar's height, rain blue, snow white, fog grey. */
function DayStrip({ date, onward }: { date: CalendarDate; onward: number }) {
  const hours = Array.from({ length: 48 }, (_, half) => weatherAt({ date, through: 0.5, hour: half / 2, gameDays: gameDaysAt(date, onward, half / 2) }));
  return (
    <svg viewBox="0 0 48 20" preserveAspectRatio="none" className="h-16 w-full" role="img" aria-label="The game day hour by hour">
      {hours.map((weather, half) => (
        <g key={half}>
          <title>{`${half / 2}:00 ${weather.state}, ${weather.temperatureC.toFixed(1)} °C, road ${weather.condition}`}</title>
          <rect x={half} y={10 - weather.cloudCover * 10} width={1} height={weather.cloudCover * 10} fill={COLOURS.sky} />
          <rect x={half} y={10} width={1} height={weather.rain * 5} fill={COLOURS.water} />
          <rect x={half} y={15} width={1} height={weather.snowfall * 5} fill={COLOURS.snow} />
          <rect x={half} y={0} width={1} height={weather.fog * 10} fill={COLOURS.fog} opacity={0.8} />
        </g>
      ))}
    </svg>
  );
}

export function WeatherLab() {
  const [date, setDate] = useState(() => dateAsked(window.location.search) ?? today());
  const [hour, setHour] = useState(() => hourAsked(window.location.search));
  const [onward, setOnward] = useState(0);

  const weather = weatherAt({ date, through: 0.5, hour, gameDays: gameDaysAt(date, onward, hour) });
  const season = seasonAt(date, 0.5);
  const step = (days: number) => setDate(dateOfDayNumber(dayNumberOf(date) + days));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 text-sm text-text-primary">
      <h1 className="text-lg font-bold">Weather lab</h1>
      <section className="flex flex-wrap items-center gap-2">
        {STEPS.slice(0, 3).map(({ label, days }) => (
          <button key={label} type="button" className="rounded bg-surface-tertiary px-2 py-1 tabular-nums" onClick={() => step(days)}>{label}</button>
        ))}
        <input type="date" aria-label="Date" className="rounded bg-surface-tertiary px-2 py-1" value={dateText(date)} onChange={(event) => event.target.value && setDate(parseDate(event.target.value))} />
        {STEPS.slice(3).map(({ label, days }) => (
          <button key={label} type="button" className="rounded bg-surface-tertiary px-2 py-1 tabular-nums" onClick={() => step(days)}>{label}</button>
        ))}
      </section>
      <section className="flex flex-wrap items-center gap-3">
        <label className="flex flex-1 items-center gap-2">
          <span className="text-text-secondary">Hour</span>
          <input type="range" min={0} max={23.75} step={0.25} value={hour} className="flex-1" onChange={(event) => setHour(Number(event.target.value))} />
          <span className="w-12 tabular-nums">{`${Math.floor(hour)}:${String(Math.round((hour % 1) * 60)).padStart(2, "0")}`}</span>
        </label>
        <span className="flex items-center gap-1">
          <span className="text-text-secondary" title="Which of the date's game days: each has fronts of its own">Game day</span>
          <button type="button" aria-label="Previous game day" className="rounded bg-surface-tertiary px-2 py-1" onClick={() => setOnward(onward - 1)}>‹</button>
          <span className="w-8 text-center tabular-nums">{onward}</span>
          <button type="button" aria-label="Next game day" className="rounded bg-surface-tertiary px-2 py-1" onClick={() => setOnward(onward + 1)}>›</button>
        </span>
      </section>

      <section className="flex flex-col gap-1 rounded-lg bg-surface-secondary p-3">
        <h2 className="font-bold">
          {weather.state} · road {weather.condition} · {weather.temperatureC.toFixed(1)} °C
        </h2>
        <DayStrip date={date} onward={onward} />
        <Bar label="Cloud" value={weather.cloudCover} show={percent(weather.cloudCover)} colour={COLOURS.sky} />
        <Bar label="Rain" value={weather.rain} show={percent(weather.rain)} colour={COLOURS.water} />
        <Bar label="Snowfall" value={weather.snowfall} show={percent(weather.snowfall)} colour={COLOURS.snow} />
        <Bar label="Fog" value={weather.fog} show={percent(weather.fog)} colour={COLOURS.fog} />
        <Bar label="Wind" value={weather.windMS} most={20} show={`${weather.windMS.toFixed(1)} m/s`} colour={COLOURS.sky} />
        <Bar label="From" value={weather.windFromDeg} most={360} show={`${Math.round(weather.windFromDeg)}°`} colour={COLOURS.sky} />
        <Bar label="Road wet" value={weather.roadWet} show={percent(weather.roadWet)} colour={COLOURS.water} />
        <Bar label="Road snow" value={weather.roadSnow} show={percent(weather.roadSnow)} colour={COLOURS.snow} />
        <Bar label="Black ice" value={weather.blackIce} show={percent(weather.blackIce)} colour={COLOURS.water} />
        <Bar label="Aurora" value={weather.aurora} show={percent(weather.aurora)} colour={COLOURS.aurora} />
      </section>

      <section className="flex flex-col gap-1 rounded-lg bg-surface-secondary p-3">
        <h2 className="font-bold">Season</h2>
        <YearStrip date={date} />
        <Bar label="In leaf" value={season.leaves.leafed} show={percent(season.leaves.leafed)} colour={COLOURS.green} />
        <Bar label="Turned" value={season.leaves.turned} show={percent(season.leaves.turned)} colour={COLOURS.warm} />
        <Bar label="Fallen leaves" value={season.leaves.fallen} show={percent(season.leaves.fallen)} colour={COLOURS.warm} />
        <Bar label="Snow" value={season.snow.depthCm} most={30} show={`${season.snow.depthCm.toFixed(1)} cm`} colour={COLOURS.snow} />
        <Bar label="Snow cover" value={season.snow.cover} show={percent(season.snow.cover)} colour={COLOURS.snow} />
        <Bar label="Sea ice reach" value={season.seaIce.reach} show={percent(season.seaIce.reach)} colour={COLOURS.water} />
        <Bar label="Drivable ice" value={season.seaIce.drivable} show={percent(season.seaIce.drivable)} colour={COLOURS.water} />
        <Bar label="Bay ice" value={season.seaIce.bayCm} most={60} show={`${season.seaIce.bayCm.toFixed(0)} cm`} colour={COLOURS.water} />
        <Bar label="Town lights" value={season.lights.town} show={percent(season.lights.town)} colour={COLOURS.lights} />
        <Bar label="Homes lit" value={season.lights.homes} show={percent(season.lights.homes)} colour={COLOURS.lights} />
        <Bar label="Window stars" value={season.lights.windows} show={percent(season.lights.windows)} colour={COLOURS.lights} />
        <Bar label="Advent candles" value={season.lights.adventCandles} most={4} show={`${season.lights.adventCandles}`} colour={COLOURS.lights} />
        <Bar label="Aurora nights" value={season.auroraNightChance} most={0.15} show={percent(season.auroraNightChance)} colour={COLOURS.aurora} />
        <Bar label="Terraces" value={season.inSeason.terraces} show={percent(season.inSeason.terraces)} colour={COLOURS.warm} />
        <Bar label="Grazing" value={season.inSeason.grazing} show={percent(season.inSeason.grazing)} colour={COLOURS.green} />
        <Bar label="Boats afloat" value={season.inSeason.boatsAfloat} show={percent(season.inSeason.boatsAfloat)} colour={COLOURS.water} />
        <Bar label="Bales" value={season.inSeason.bales} show={percent(season.inSeason.bales)} colour={COLOURS.warm} />
      </section>
    </main>
  );
}
