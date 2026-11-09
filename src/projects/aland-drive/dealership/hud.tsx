"use client";

import type { ReactNode } from "react";
import { Armchair, Check, DoorOpen, Gauge, KeyRound, LoaderCircle, Store, Timer, Weight, Zap } from "lucide-react";
import { Prompt } from "@/shared/components/prompts";
import type { InputKind } from "@/shared/lib/input";
import { carFacts } from "../garage/car-facts";
import { BINDINGS } from "../input/controls";
import { speedNumber, speedUnit, useUnits } from "../units";
import type { DealershipReading } from "./walk-in";

/*
 * What the page shows for a dealership: the offer at its door, the cover while the island is captured, and inside, its
 * name, the way out at the door, and at a car its figures and what can be done with it, each a glyph and an icon.
 */

const INK = "var(--color-aland-drive-ui-ink)";
const SHADE = "var(--color-aland-drive-ui-shade)";
const MARK = "var(--color-aland-drive-dealer-mark)";
const KW_A_HP = 0.7456999;
const KG_A_LB = 0.45359237;

function Pill({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-lg font-semibold" style={{ color: INK, background: SHADE, border: `2px solid ${MARK}` }} aria-label={label} title={label}>
      {children}
    </div>
  );
}

function Figure({ icon: Glyph, label, value, unit }: { icon: typeof Gauge; label: string; value: string; unit: string }) {
  return (
    <div className="flex items-center gap-2" aria-label={`${label}: ${value} ${unit}`} title={label}>
      <Glyph aria-hidden className="size-4 shrink-0 opacity-80" />
      <span className="text-lg font-bold tabular-nums">{value}</span>
      <span className="text-xs opacity-70">{unit}</span>
    </div>
  );
}

function CarCard({ id, yours }: { id: Parameters<typeof carFacts>[0]; yours: boolean }) {
  const facts = carFacts(id);
  const units = useUnits((state) => state.units);
  const metric = units === "metric";
  return (
    <div role="region" aria-label={`${facts.name}'s figures`} className="pointer-events-none absolute top-1/2 right-8 flex w-64 -translate-y-1/2 flex-col gap-2 rounded-lg p-4" style={{ color: INK, background: SHADE, border: `2px solid ${MARK}` }}>
      <span className="text-xs font-semibold tracking-widest uppercase opacity-75" aria-label="Maker">{facts.maker}</span>
      <span className="flex items-center gap-2 text-2xl leading-tight font-bold">
        {facts.name}
        {facts.tier && <span className="rounded px-1.5 text-sm" style={{ boxShadow: `inset 0 0 0 2px ${MARK}` }} aria-label="Tier">{facts.tier}</span>}
        {yours && <Check className="size-5" style={{ color: MARK }} aria-label="Yours" />}
      </span>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <Figure icon={Timer} label={metric ? "0–100 km/h" : "0–62 mph"} value={facts.to100.s.toFixed(1)} unit="s" />
        <Figure icon={Gauge} label="Top speed" value={String(speedNumber(facts.topKmh, units))} unit={speedUnit(units)} />
        <Figure icon={Zap} label="Power" value={String(Math.round(facts.powerKw / KW_A_HP))} unit="hp" />
        <Figure icon={Weight} label="Weight" value={(metric ? facts.massKg : facts.massKg / KG_A_LB).toLocaleString("en-GB", { maximumFractionDigits: 0 })} unit={metric ? "kg" : "lb"} />
      </div>
      <span className="text-xs opacity-80" aria-label="Engine">{facts.engine}</span>
    </div>
  );
}

/** The cover fades in over this long, and the room is built once it has: the page's own keyframes (`aland-time-cover`). */
const COVER_S = 0.2;

export function DealershipHud({ reading, input, onCovered }: { reading: DealershipReading | null; input: InputKind; onCovered: () => void }) {
  if (reading === null) return null;
  if (reading.kind === "door") {
    return (
      <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2">
        <Pill label={`Go into ${reading.name}`}>
          <Prompt binding={BINDINGS.challenge} input={input} />
          <Store aria-hidden className="size-5 shrink-0" style={{ color: MARK }} />
          <span>{reading.name}</span>
          <span className="text-sm opacity-70">{reading.place}</span>
        </Pill>
      </div>
    );
  }
  if (reading.kind === "entering") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ background: SHADE, color: INK, animation: `aland-time-cover ${COVER_S}s ease-out forwards` }} role="status" aria-label={`Going into ${reading.name}`} onAnimationEnd={onCovered}>
        <div className="flex items-center gap-3 text-3xl font-bold">
          <Store aria-hidden className="size-9" style={{ color: MARK }} />
          <span>{reading.name}</span>
        </div>
        <LoaderCircle aria-hidden className="size-10 animate-spin" style={{ color: MARK }} />
      </div>
    );
  }
  const { car } = reading;
  return (
    <>
      <div className="pointer-events-none absolute top-4 left-4">
        <Pill label={reading.name}>
          <Store aria-hidden className="size-5 shrink-0" style={{ color: MARK }} />
          <span>{reading.name}</span>
        </Pill>
      </div>
      {car && <CarCard id={car.id} yours={car.yours} />}
      <div className="pointer-events-none absolute bottom-24 left-1/2 flex -translate-x-1/2 gap-3">
        {reading.door && (
          <Pill label="Leave">
            <Prompt binding={BINDINGS.challenge} input={input} />
            <DoorOpen aria-hidden className="size-5" />
          </Pill>
        )}
        {car && (
          <>
            <Pill label="Rev it, held">
              <Prompt binding={BINDINGS.rev} input={input} />
              <Gauge aria-hidden className="size-5" style={car.revving ? { color: MARK } : undefined} />
            </Pill>
            <Pill label={car.seated ? "Get out" : "Sit in it"}>
              <Prompt binding={BINDINGS.cockpit} input={input} />
              <Armchair aria-hidden className="size-5" style={car.seated ? { color: MARK } : undefined} />
            </Pill>
            {!reading.door && (
              <Pill label={car.yours ? "Yours" : "Take it"}>
                {car.yours ? <Check aria-hidden className="size-5" style={{ color: MARK }} /> : <Prompt binding={BINDINGS.challenge} input={input} />}
                <KeyRound aria-hidden className="size-5" />
              </Pill>
            )}
          </>
        )}
      </div>
    </>
  );
}
