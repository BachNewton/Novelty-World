"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { SoundLab as Lab } from "@/shared/components/sound-lab";
import { unlockAudio } from "@/shared/lib/sound";
import { createDriveAudio } from "./graph";
import type { DriveAudioState, Place, SeasonHeard, WeatherHeard } from "./model";
import { useDriveSoundSettings } from "./settings";
import { SOUND_IDS, SOUNDS } from "./sounds";
import { BIKE, ENGINES, VEHICLE_IDS, vehicleLabel, type VehicleId } from "./vehicles";
import { CARS } from "../sim/cars";
import { CONDITIONS, SURFACES, TYRES, type Condition, type Surface, type Tyre } from "../sim/surfaces";
import { pullAt, resistanceAt, restingEngine, stepEngine, topSpeedMS, type EngineRead } from "../sim/gearbox";
import { gameTimeAt } from "../time/day";
import { seasonAt } from "../climate/season";
import { yearDay } from "../climate/calendar";

/** A day in each season to hear the place beds on, at the hour the slider sets: the game's own sun and season for that date. */
const SEASON_DATES = { winter: { year: 2027, month: 1, day: 20 }, spring: { year: 2027, month: 5, day: 20 }, summer: { year: 2026, month: 7, day: 10 }, autumn: { year: 2026, month: 10, day: 15 } } as const;
type SeasonName = keyof typeof SEASON_DATES;
const SEASON_NAMES = Object.keys(SEASON_DATES) as SeasonName[];

function seasonHeard(name: SeasonName, hour: number): SeasonHeard {
  const date = SEASON_DATES[name];
  const { leaves, seaIce } = seasonAt(date, 0.5);
  return { yearDay: yearDay(date.month, date.day) + hour / 24, sunDeg: gameTimeAt(hour / 24, date).sun.elevationDeg, hour, leafed: leaves.leafed, iceReach: seaIce.reach };
}

/*
 * The `?sounds` page: the shared audition for the one-shots, and above it a
 * little drive of sliders for the continuous sounds, played through the same
 * graph as the game, one `update` an animation frame. Every car is here, each
 * on its own gearbox, and flooring it pulls as that car pulls in the game, on
 * the flat, through its own gears to its own top speed.
 */

const ACCELERATION_MS2 = 7;
const BRAKING_MS2 = 11;
/** This page only ever loads in the browser, and lives as long as the tab, so its one graph stays up. */
const drive = createDriveAudio();

const REST: DriveAudioState["suspension"] = [0.114, 0.114, 0.114, 0.114];

interface Knobs {
  vehicle: VehicleId;
  /** What the left wheels are on and what the right ones are, so the road's edge can be straddled. */
  left: Surface;
  right: Surface;
  condition: Condition;
  tyres: Tyre;
  kmh: number;
  throttle: number;
  slip: number;
  handbrake: boolean;
  floorIt: boolean;
  holdRpm: boolean;
  rpm: number;
  place: Place;
  weather: WeatherHeard;
  season: SeasonName;
  hour: number;
}

const START: Knobs = { vehicle: "skerry-gt", left: "asphalt", right: "asphalt", condition: "dry", tyres: "summer", kmh: 0, throttle: 0, slip: 0, handbrake: false, floorIt: false, holdRpm: false, rpm: 3000, place: { forest: 0, shore: 0, town: 0, lake: 0 }, weather: { rain: 0, snowfall: 0, windMS: 0 }, season: "summer", hour: 14 };

function Slider({ label, value, min, max, step = 1, disabled = false, onChange }: { label: string; value: number; min: number; max: number; step?: number; disabled?: boolean; onChange: (value: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-secondary">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="text-text-muted tabular-nums">{Math.round(value * 100) / 100}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value))}
        className="w-full accent-brand-green disabled:opacity-40"
      />
    </label>
  );
}

function Choice<Value extends string>({ values, label, value, onChange }: { values: readonly Value[]; label: (value: Value) => string; value: Value; onChange: (value: Value) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${option === value ? "bg-brand-green text-surface-primary" : "border border-border-hover text-text-primary hover:bg-surface-tertiary"}`}
        >
          {label(option)}
        </button>
      ))}
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-xs text-text-secondary">
      <span>{label}</span>
      {children}
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${on ? "bg-brand-green text-surface-primary" : "border border-border-hover text-text-primary hover:bg-surface-tertiary"}`}
    >
      {label}
    </button>
  );
}

function capitalised(word: string): string {
  return word[0].toUpperCase() + word.slice(1);
}

/** The drive, as sliders. Speed stays where it is put, so a sound can be sat on; floor it and the speed moves by itself. */
function Bench() {
  const [knobs, setKnobs] = useState(START);
  const [running, setRunning] = useState(false);
  const [readout, setReadout] = useState("Stopped");
  const latest = useRef(knobs);
  const set = (changes: Partial<Knobs>) => {
    latest.current = { ...latest.current, ...changes };
    setKnobs(latest.current);
  };

  useEffect(() => {
    if (!running) return;
    let engine: EngineRead | undefined;
    let engineOf: VehicleId | null = null;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const knob = latest.current;
      let speedMS = knob.kmh / 3.6;
      const throttle = knob.floorIt ? 1 : knob.throttle;
      if (knob.vehicle === "bike") {
        engine = undefined;
        if (knob.floorIt) speedMS = Math.min(speedMS + ACCELERATION_MS2 * (1 - (0.8 * speedMS) / BIKE.fullSpeedMS) * dt, BIKE.fullSpeedMS);
      } else {
        const tuning = CARS[knob.vehicle];
        if (engineOf !== knob.vehicle || engine === undefined) engine = restingEngine(tuning.gearbox);
        engine = stepEngine(tuning.gearbox, engine, speedMS, throttle, dt).read;
        if (knob.floorIt) speedMS = Math.max(speedMS + ((pullAt(tuning, engine, 1) - resistanceAt(tuning, speedMS)) / tuning.car.massKg) * dt, 0);
      }
      engineOf = knob.vehicle;
      if (knob.handbrake) speedMS = Math.max(speedMS - BRAKING_MS2 * dt, 0);
      const moved = Math.round(speedMS * 3.6 * 10) / 10;
      if (moved !== knob.kmh) set({ kmh: moved });
      drive.update(
        {
          vehicle: knob.vehicle,
          speedMS,
          throttle,
          brake: 0,
          handbrake: knob.handbrake,
          slip: knob.handbrake && speedMS > 3 ? Math.max(knob.slip, 0.55) : knob.slip,
          wheels: [knob.left, knob.right, knob.left, knob.right],
          condition: knob.condition,
          tyres: knob.tyres,
          suspension: REST,
          // Heard from the middle of the page's world, with the sea off to the left ahead, where the gulls call from.
          place: { ...knob.place, seaAt: knob.place.shore > 0 ? { x: -60, z: -90 } : undefined },
          listener: { x: 0, z: 0, rightX: 1, rightZ: 0 },
          weather: knob.weather,
          season: seasonHeard(knob.season, knob.hour),
          heldRpm: knob.holdRpm ? knob.rpm : undefined,
          engine,
        },
        dt,
      );
      const reading = drive.reading();
      setReadout(reading?.engine ? `${String(Math.round(reading.mix.rpm))} rpm, gear ${String(reading.engine.gear + 1)}, firing ${String(Math.round(reading.mix.firingHz))} Hz` : `${String(Math.round(speedMS * 3.6))} km/h`);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [running]);

  const start = () => {
    unlockAudio();
    void drive.ready.then(() => setRunning(true));
  };
  const stop = () => {
    setRunning(false);
    setReadout("Stopped");
    drive.update({ vehicle: latest.current.vehicle, speedMS: 0, throttle: 0, brake: 0, handbrake: false, slip: 0, wheels: [latest.current.left, latest.current.right, latest.current.left, latest.current.right], condition: latest.current.condition, tyres: latest.current.tyres, suspension: REST, place: { forest: 0, shore: 0, town: 0 }, paused: true }, 0.03);
  };

  const engine = knobs.vehicle === "bike" ? null : ENGINES[knobs.vehicle];
  const topKmh = (knobs.vehicle === "bike" ? BIKE.fullSpeedMS : topSpeedMS(CARS[knobs.vehicle])) * 3.6;

  return (
    <section className="flex w-full flex-col gap-4 rounded-xl border border-border-default bg-surface-secondary p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={running ? stop : start} className="rounded-lg bg-brand-green px-4 py-2 text-sm font-bold text-surface-primary transition-opacity hover:opacity-90">
          {running ? "Stop" : "Start the drive"}
        </button>
        <span className="text-xs text-text-muted tabular-nums">{readout}</span>
      </div>
      <Choice values={VEHICLE_IDS} label={vehicleLabel} value={knobs.vehicle} onChange={(vehicle) => set({ vehicle, kmh: 0, floorIt: false, rpm: vehicle === "bike" ? 0 : Math.min(ENGINES[vehicle].redlineRpm * 0.4, 3000) })} />
      <div className="grid gap-2 sm:grid-cols-4">
        <Labelled label="Left wheels">
          <Choice values={SURFACES} label={capitalised} value={knobs.left} onChange={(left) => set({ left })} />
        </Labelled>
        <Labelled label="Right wheels">
          <Choice values={SURFACES} label={capitalised} value={knobs.right} onChange={(right) => set({ right })} />
        </Labelled>
        <Labelled label="Condition">
          <Choice values={CONDITIONS} label={capitalised} value={knobs.condition} onChange={(condition) => set({ condition })} />
        </Labelled>
        <Labelled label="Tyres">
          <Choice values={TYRES} label={capitalised} value={knobs.tyres} onChange={(tyres) => set({ tyres })} />
        </Labelled>
        <Labelled label="Season, for the forest, shore and town">
          <Choice values={SEASON_NAMES} label={capitalised} value={knobs.season} onChange={(season) => set({ season })} />
        </Labelled>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Slider label="Speed, km/h" value={knobs.kmh} min={0} max={Math.round(topKmh)} onChange={(kmh) => set({ kmh, floorIt: false })} />
        <Slider label="Throttle (pedalling, on the bicycle)" value={knobs.floorIt ? 1 : knobs.throttle} min={0} max={1} step={0.01} onChange={(throttle) => set({ throttle, floorIt: false })} />
        <Slider label="Slide" value={knobs.slip} min={0} max={1} step={0.01} onChange={(slip) => set({ slip })} />
        <Slider label="Revs, when held" value={knobs.rpm} min={engine?.idleRpm ?? 0} max={engine?.redlineRpm ?? 1} step={50} disabled={engine === null || !knobs.holdRpm} onChange={(rpm) => set({ rpm })} />
        <Slider label="Forest" value={knobs.place.forest} min={0} max={1} step={0.05} onChange={(forest) => set({ place: { ...latest.current.place, forest } })} />
        <Slider label="Shore" value={knobs.place.shore} min={0} max={1} step={0.05} onChange={(shore) => set({ place: { ...latest.current.place, shore } })} />
        <Slider label="Town" value={knobs.place.town} min={0} max={1} step={0.05} onChange={(town) => set({ place: { ...latest.current.place, town } })} />
        <Slider label="Lake" value={knobs.place.lake ?? 0} min={0} max={1} step={0.05} onChange={(lake) => set({ place: { ...latest.current.place, lake } })} />
        <Slider label={`Hour (sun ${seasonHeard(knobs.season, knobs.hour).sunDeg.toFixed(0)}°)`} value={knobs.hour} min={0} max={23.75} step={0.25} onChange={(hour) => set({ hour })} />
        <Slider label="Rain" value={knobs.weather.rain} min={0} max={1} step={0.05} onChange={(rain) => set({ weather: { ...latest.current.weather, rain } })} />
        <Slider label="Wind, m/s" value={knobs.weather.windMS} min={0} max={20} step={0.5} onChange={(windMS) => set({ weather: { ...latest.current.weather, windMS } })} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Toggle label="Floor it, through the gears" on={knobs.floorIt} onChange={(floorIt) => set({ floorIt })} />
        <Toggle label="Hold the handbrake" on={knobs.handbrake} onChange={(handbrake) => set({ handbrake })} />
        <Toggle label="Hold the revs" on={knobs.holdRpm} onChange={(holdRpm) => set({ holdRpm })} />
      </div>
    </section>
  );
}

function Volume() {
  const { settings, setVolume, toggleMuted } = useDriveSoundSettings();
  return (
    <div className="flex w-full flex-wrap items-center gap-3">
      <div className="w-48">
        <Slider label="Volume" value={settings.volume} min={0} max={1} step={0.01} onChange={setVolume} />
      </div>
      <Toggle label="Mute" on={settings.muted} onChange={toggleMuted} />
    </div>
  );
}

export function SoundLab() {
  return (
    <Lab
      title="Åland Drive Unlimited sounds"
      intro={
        <>
          The drive runs here as it does in the game, through the same sound. Start it and move the sliders: floor it to hear the gears, hold the revs to sit on one note. The one-shots are below. Edit the engines in{" "}
          <code>audio/vehicles.ts</code>, the mix in <code>audio/model.ts</code> and the one-shots in <code>audio/sounds.ts</code>.
        </>
      }
      controls={
        <>
          <Volume />
          <Bench />
        </>
      }
      ids={SOUND_IDS}
      designs={SOUNDS}
      player={drive.audition}
    />
  );
}
