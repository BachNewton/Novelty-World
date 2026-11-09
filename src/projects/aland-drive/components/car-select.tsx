"use client";

import { useRef, useState, type ComponentType, type ReactNode, type RefObject } from "react";
import { Check, Cog, Disc, Droplet, Flag, Gauge, Gem, Mountain, Ship, Sparkles, Spline, Square, Store, Timer, Warehouse, Wrench } from "lucide-react";
import { paintName, type CarPaint, type PaintFinish } from "../art/cars/paints";
import type { CarFacts, CarGroup, Drive, Field, Reach } from "../garage/car-facts";
import type { Origin } from "../sim/cars/character";
import { TIER_BANDS, type Tier } from "../sim/tiers";
import type { CarCard, GameMenu, MenuItemId } from "../render/game-menu";
import { speedNumber, speedUnit, useUnits, type Units } from "../units";

/*
 * The Cars page of the game menu: every car by class and tier on the left, and the car under the focus or the pointer
 * on the right, as a racing game's spec sheet: its maker, class and tier, its engine and drive, its figures, and bars
 * for what it does against the whole field. Picking a car drives it at once, from where the car is; the driven car's
 * paints are on its sheet, each painting it at once, and picking the car it's already in goes to them, so a pad gets
 * there from anywhere in the grid.
 */

const INK = "var(--color-aland-drive-ui-ink)";
const SHADE = "var(--color-aland-drive-ui-shade)";
const ACCENT = "var(--color-aland-drive-ui-accent)";
const classColour = (group: CarGroup) => `var(--color-aland-drive-ui-class-${group})`;
const faint = (colour: string, share: number) => `color-mix(in oklab, ${colour} ${share}%, transparent)`;

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean; style?: React.CSSProperties }>;

const GROUP_NAMES: Record<CarGroup, string> = { asphalt: "Asphalt", gravel: "Gravel", classic: "Classic", none: "Outside the tiers" };

const ORIGINS: Record<Origin, { icon: Icon; name: string }> = {
  harbour: { icon: Ship, name: "Shipped to the harbour" },
  dealer: { icon: Store, name: "From a dealer" },
  club: { icon: Flag, name: "From the motor club" },
  barn: { icon: Warehouse, name: "A barn find" },
};

const DRIVE_NAMES: Record<Drive, string> = { FWD: "Front-wheel drive", RWD: "Rear-wheel drive", AWD: "All-wheel drive" };

const carColour = (token: string) => `var(--color-aland-drive-${token})`;
const SHINE = "var(--color-aland-drive-ui-swatch-shine)";
const DARK = "var(--color-aland-drive-ui-swatch-shade)";
/** A share of the shine or the dark over a colour, for a swatch's light. */
const lit = (colour: string, by: string, share: number) => `color-mix(in oklab, ${colour}, ${by} ${share}%)`;
const clear = (by: string, share: number) => `color-mix(in oklab, ${by} ${share}%, transparent)`;

const FINISH_GLYPHS: Record<PaintFinish, Icon> = { solid: Droplet, metallic: Sparkles, matte: Square, pearl: Gem };

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
      `radial-gradient(circle at 30% 26%, ${clear(SHINE, 80)} 0 4%, transparent 14%)`,
      ...[[38, 22], [24, 38], [44, 40]].map(([x, y]) => `radial-gradient(circle at ${x}% ${y}%, ${clear(SHINE, 55)} 0 1px, transparent 1.5px)`),
      `radial-gradient(ellipse at 30% 26%, ${lit(base, SHINE, 45)}, ${base} 55%, ${lit(base, DARK, 35)})`,
    ],
    matte: [`linear-gradient(180deg, ${lit(base, SHINE, 6)}, ${lit(base, DARK, 8)})`],
    pearl: [`radial-gradient(circle at 30% 26%, ${clear(SHINE, 55)} 0 8%, transparent 30%)`, `linear-gradient(150deg, ${base} 30%, ${carColour(flip ?? colour)} 70%, ${lit(carColour(flip ?? colour), DARK, 12)})`],
  };
  return [...stripes, ...layers[finish]].join(", ");
}

/** A tier as a chip in its class's colour; a car outside the tiers wears a spanner, a working car. */
function TierChip({ tier, group, className = "" }: { tier: Tier | null; group: CarGroup; className?: string }) {
  return (
    <span className={`flex h-6 items-center justify-center rounded px-1.5 text-sm font-bold tabular-nums ${className}`} style={{ background: classColour(group), color: SHADE }} title={tier === null ? GROUP_NAMES.none : `${GROUP_NAMES[group]} ${tier}`}>
      {tier ?? <Wrench aria-hidden className="size-3.5" />}
    </span>
  );
}

/** The cars in the registry's order, by class and then by tier. */
function byClassAndTier(cars: readonly CarCard[]): { group: CarGroup; tiers: { tier: Tier | null; cars: CarCard[] }[] }[] {
  const groups: { group: CarGroup; tiers: { tier: Tier | null; cars: CarCard[] }[] }[] = [];
  for (const card of cars) {
    const { group, tier } = card.facts;
    let inGroup = groups.at(-1);
    if (inGroup?.group !== group) groups.push((inGroup = { group, tiers: [] }));
    let inTier = inGroup.tiers.at(-1);
    if (inTier?.tier !== tier) inGroup.tiers.push((inTier = { tier, cars: [] }));
    inTier.cars.push(card);
  }
  return groups;
}

/** Every car, a row for each tier, the driven one marked: choosing one drives it. */
function CarGrid({ cars, driven, shown, first, onShow, onPick, onPaints }: { cars: readonly CarCard[]; driven: string; shown: string; first: RefObject<HTMLButtonElement | null>; onShow: (id: CarFacts["id"]) => void; onPick: (id: MenuItemId) => void; onPaints: () => void }) {
  const columns = Math.max(...byClassAndTier(cars).flatMap(({ tiers }) => tiers.map((row) => row.cars.length)));
  return (
    <div role="radiogroup" aria-label="Cars" className="flex min-h-0 shrink-0 flex-col gap-3 overflow-y-auto pr-1">
      {byClassAndTier(cars).map(({ group, tiers }) => (
        <div key={group} role="group" aria-label={GROUP_NAMES[group]} className="flex flex-col gap-1">
          <span className="text-xs font-bold tracking-widest uppercase" style={{ color: classColour(group) }}>{GROUP_NAMES[group]}</span>
          {tiers.map(({ tier, cars: inTier }) => (
            <div key={tier ?? "none"} className="grid items-center gap-1" style={{ gridTemplateColumns: `2.5rem repeat(${columns}, 8rem)` }}>
              <TierChip tier={tier} group={group} />
              {inTier.map(({ facts: { id, name }, paints, chosen }) => {
                const on = id === driven;
                return (
                  <button
                    key={id}
                    ref={on ? first : undefined}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={name}
                    data-pad-start={on || undefined}
                    className="flex h-8 cursor-pointer items-center gap-1.5 rounded border-2 px-1.5 text-left text-sm font-semibold"
                    style={{ borderColor: on ? ACCENT : "transparent", background: id === shown ? faint(INK, 12) : undefined, color: on ? ACCENT : INK }}
                    onFocus={() => { onShow(id); }}
                    // A pointer that moved, not one a tile appeared under: the browser also tells a still pointer that it entered whatever the page drew under it, which would take the sheet from the driven car as the page opens.
                    onPointerMove={(event) => { if (event.movementX !== 0 || event.movementY !== 0) onShow(id); }}
                    onClick={() => { if (on) onPaints(); else onPick(`car-${id}`); }}
                  >
                    <span aria-hidden className="size-3.5 shrink-0 rounded-full" style={{ background: swatchBackground(paints[chosen]), boxShadow: `0 0 0 1px ${faint(INK, 40)}` }} />
                    <span className="grow truncate">{name}</span>
                    {on && <Check aria-hidden className="size-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Four wheels seen from above, the driven ones filled. */
function DriveMark({ drive, colour }: { drive: Drive; colour: string }) {
  const front = drive !== "RWD";
  const rear = drive !== "FWD";
  const wheel = (x: number, y: number, driven: boolean) => <rect x={x} y={y} width="4" height="7" rx="1" fill={driven ? colour : "none"} stroke={driven ? colour : INK} strokeWidth="1.2" />;
  return (
    <svg aria-hidden viewBox="0 0 20 26" className="h-6 w-5 shrink-0">
      <rect x="5" y="2" width="10" height="22" rx="3" fill="none" stroke={INK} strokeOpacity="0.5" strokeWidth="1.2" />
      {wheel(1, 3, front)}
      {wheel(15, 3, front)}
      {wheel(1, 16, rear)}
      {wheel(15, 16, rear)}
    </svg>
  );
}

/** A figure as a number, its unit small beside it. */
function Figure({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex flex-col items-center rounded py-1" style={{ background: faint(INK, 7) }} aria-label={`${label}: ${value} ${unit}`} title={label}>
      <span className="text-lg leading-tight font-bold tabular-nums">{value}</span>
      <span className="text-[0.7rem] leading-none opacity-70">{unit}</span>
    </div>
  );
}

/** Where a value falls along a figure's reach, from a sliver to full: more is better unless `lessIsBetter`, and a time is read on a log scale so the quick cars spread out. */
function along(value: number, [low, high]: Reach, { lessIsBetter = false, log = false } = {}): number {
  const at = (v: number) => (log ? Math.log(v) : v);
  const share = (at(value) - at(low)) / (at(high) - at(low));
  return 0.04 + 0.96 * (lessIsBetter ? 1 - share : share);
}

/** A figure as a bar along the whole field's reach, with its tier's band behind it where the tier sets one. */
function Bar({ icon: Glyph, label, value, colour, share, band, gravel = false }: { icon: Icon; label: string; value: string; colour: string; share: number; band?: readonly [number, number]; gravel?: boolean }) {
  const spoken = gravel ? `${label} on gravel` : label;
  return (
    <div className="grid items-center gap-2" style={{ gridTemplateColumns: "1.25rem 5.5rem 1fr 4.5rem" }} aria-label={`${spoken}: ${value}`} title={spoken}>
      <Glyph aria-hidden className="size-4" />
      <span className="flex items-center gap-1 truncate text-xs opacity-80">
        {label}
        {gravel && <Mountain aria-hidden className="size-3 shrink-0" />}
      </span>
      <span aria-hidden className="relative h-2.5 rounded-full" style={{ background: faint(INK, 12) }}>
        {band && <span className="absolute inset-y-[-3px] rounded" style={{ left: `${Math.min(...band) * 100}%`, width: `${Math.abs(band[1] - band[0]) * 100}%`, background: faint(colour, 30), boxShadow: `inset 0 0 0 1px ${faint(colour, 70)}` }} />}
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${share * 100}%`, background: colour }} />
      </span>
      <span className="text-right text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

const KG_A_LB = 0.45359237;
const M_A_FT = 0.3048;
const NM_A_LBFT = 1.3558179;
const KW_A_HP = 0.7456999;

/** The bars: top speed and the sprint against the field and the tier's band, then braking and cornering grip on the two roads. */
function Bars({ facts, field, units }: { facts: CarFacts; field: Field; units: Units }) {
  const colour = classColour(facts.group);
  const band = facts.tier && TIER_BANDS[facts.tier];
  const sprintBand = band && ([along(band.to100S[1], field.to100S, { lessIsBetter: true, log: true }), along(band.to100S[0], field.to100S, { lessIsBetter: true, log: true })] as const);
  const topBand = band && ([along(band.topKmh[0], field.topKmh), along(band.topKmh[1], field.topKmh)] as const);
  const sprint = units === "metric" ? "0–100 km/h" : "0–62 mph";
  return (
    <div className="flex flex-col gap-1.5">
      <Bar icon={Gauge} label="Top speed" value={`${speedNumber(facts.topKmh, units)} ${speedUnit(units)}`} colour={colour} share={along(facts.topKmh, field.topKmh)} band={topBand ?? undefined} />
      <Bar icon={Timer} label={sprint} gravel={facts.to100.surface === "gravel"} value={`${facts.to100.s.toFixed(1)} s`} colour={colour} share={along(facts.to100.s, field.to100S, { lessIsBetter: true, log: true })} band={sprintBand ?? undefined} />
      <Bar icon={Disc} label={units === "metric" ? "100–0 km/h" : "62–0 mph"} value={units === "metric" ? `${Math.round(facts.stopFrom100M)} m` : `${Math.round(facts.stopFrom100M / M_A_FT)} ft`} colour={colour} share={along(facts.stopFrom100M, field.stopFrom100M, { lessIsBetter: true })} />
      <Bar icon={Spline} label="Grip, asphalt" value={`${facts.grip.asphalt.toFixed(2)} g`} colour={colour} share={along(facts.grip.asphalt, field.grip)} />
      <Bar icon={Mountain} label="Grip, gravel" value={`${facts.grip.gravel.toFixed(2)} g`} colour={colour} share={along(facts.grip.gravel, field.grip)} />
    </div>
  );
}

/** The driven car's paints as swatches, the one it's in marked, each painting it at once; another car's only shown. */
function Paints({ card, driven, paints, onPick }: { card: CarCard; driven: boolean; paints: RefObject<HTMLDivElement | null>; onPick: (id: MenuItemId) => void }) {
  return (
    <div ref={paints} role={driven ? "radiogroup" : "list"} aria-label="Paint" className="grid grid-cols-8 gap-1.5">
      {card.paints.map((paint, index) => {
        const on = index === card.chosen;
        const name = paintName(paint);
        const Glyph = FINISH_GLYPHS[paint.finish];
        const chip: ReactNode = (
          <>
            <span aria-hidden className="block size-full rounded-sm" style={{ background: swatchBackground(paint) }} />
            <span aria-hidden className="absolute bottom-1 left-1 flex size-4 items-center justify-center rounded-full" style={{ background: SHADE }}>
              <Glyph className="size-2.5" />
            </span>
            {on && (
              <span aria-hidden className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full" style={{ background: SHADE, color: ACCENT }}>
                <Check className="size-3" />
              </span>
            )}
          </>
        );
        const look = "relative h-11 rounded border-2 p-0.5";
        return driven ? (
          <button key={paint.colour + String(index)} type="button" role="radio" aria-checked={on} aria-label={name} title={name} className={`${look} cursor-pointer`} style={{ borderColor: on ? ACCENT : "transparent" }} onClick={() => { onPick(`paint-${index}`); }}>
            {chip}
          </button>
        ) : (
          <span key={paint.colour + String(index)} role="listitem" aria-label={name} title={name} className={look} style={{ borderColor: on ? faint(INK, 50) : "transparent" }}>
            {chip}
          </span>
        );
      })}
    </div>
  );
}

/** A car's spec sheet. */
function SpecSheet({ card, driven, field, paints, onPick }: { card: CarCard; driven: boolean; field: Field; paints: RefObject<HTMLDivElement | null>; onPick: (id: MenuItemId) => void }) {
  const { facts } = card;
  const units = useUnits((state) => state.units);
  const { icon: From, name: fromName } = ORIGINS[facts.from];
  const metric = units === "metric";
  return (
    <div role="region" aria-label={`${facts.name} spec sheet`} className="flex w-[25rem] shrink-0 flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex grow flex-col">
          <span className="text-sm font-semibold tracking-widest uppercase opacity-75" aria-label="Maker">{facts.maker}</span>
          <span className="text-3xl leading-tight font-bold">{facts.name}</span>
        </div>
        <span className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full" style={{ background: faint(INK, 10) }} role="img" aria-label={fromName} title={fromName}>
          <From aria-hidden className="size-5" />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <span className="rounded px-2 py-0.5" style={{ color: classColour(facts.group), boxShadow: `inset 0 0 0 2px ${classColour(facts.group)}` }} aria-label="Class">{GROUP_NAMES[facts.group]}</span>
        <TierChip tier={facts.tier} group={facts.group} />
        <span className="flex items-center gap-1" title={DRIVE_NAMES[facts.drive]} aria-label={DRIVE_NAMES[facts.drive]}>
          <DriveMark drive={facts.drive} colour={classColour(facts.group)} />
          {facts.drive}
        </span>
        <span className="flex items-center gap-1" title="Gears" aria-label={`${facts.gears} gears`}>
          <Cog aria-hidden className="size-4" />
          <span className="tabular-nums">{facts.gears}</span>
        </span>
      </div>
      <div className="text-sm opacity-90" aria-label="Engine" title="Engine">{facts.engine}</div>
      <div className="grid grid-cols-4 gap-1.5">
        <Figure label="Power" value={String(Math.round(facts.powerKw / KW_A_HP))} unit="hp" />
        <Figure label="Torque" value={String(Math.round(metric ? facts.torqueNm : facts.torqueNm / NM_A_LBFT))} unit={metric ? "Nm" : "lb-ft"} />
        <Figure label="Weight" value={(metric ? facts.massKg : facts.massKg / KG_A_LB).toLocaleString("en-GB", { maximumFractionDigits: 0 })} unit={metric ? "kg" : "lb"} />
        <Figure label="Power to weight" value={String(Math.round(facts.kwPerTonne / KW_A_HP))} unit={metric ? "hp/t" : "hp/ton"} />
      </div>
      <Bars facts={facts} field={field} units={units} />
      <Paints card={card} driven={driven} paints={paints} onPick={onPick} />
    </div>
  );
}

export function CarSelect({ menu, first, onPick }: { menu: GameMenu; first: RefObject<HTMLButtonElement | null>; onPick: (id: MenuItemId) => void }) {
  if (!menu.garage) throw new Error("a Cars page with no cars");
  const { driven, cars, field } = menu.garage;
  const [shown, setShown] = useState<CarFacts["id"]>(driven);
  const paints = useRef<HTMLDivElement>(null);
  const toPaints = () => {
    paints.current?.querySelector<HTMLButtonElement>("[aria-checked=true]")?.focus({ preventScroll: true });
  };
  const card = cars.find(({ facts }) => facts.id === shown);
  if (!card) throw new Error(`no card for ${shown}`);
  return (
    <div className="mb-1 flex min-h-0 gap-6">
      <CarGrid cars={cars} driven={driven} shown={shown} first={first} onShow={setShown} onPick={onPick} onPaints={toPaints} />
      <SpecSheet card={card} driven={shown === driven} field={field} paints={paints} onPick={onPick} />
    </div>
  );
}
