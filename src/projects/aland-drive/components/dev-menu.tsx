"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, MapPin, Navigation, X } from "lucide-react";
import type { CarChoice } from "../render/game";
import type { CarId } from "../sim/cars";

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
    <ul className="grid grid-cols-2 gap-1">
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

function SpotList({ spots, onJump }: { spots: readonly { id: string; name: string }[]; onJump: (id: string) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-1">
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

export function DevMenu({ cars, car, onCar, spots, onJump, whereabouts, onClose }: { cars: readonly CarChoice[]; car: CarId; onCar: (id: CarId) => void; spots: readonly { id: string; name: string }[]; onJump: (id: string) => void; whereabouts: () => string; onClose: () => void }) {
  return (
    <div className="absolute inset-0" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label="Dev menu"
        className="absolute top-14 right-6 flex w-80 max-w-full flex-col gap-3 rounded-lg p-3"
        style={{ background: SHADE, color: INK }}
        onClick={(event) => { event.stopPropagation(); }}
      >
        <button type="button" aria-label="Close" title="Close" className="absolute top-2 right-2 cursor-pointer" onClick={onClose}>
          <X className="size-5" />
        </button>
        <Section title="Place">
          <CopyPlace whereabouts={whereabouts} />
        </Section>
        <Section title="Jump to">
          <SpotList spots={spots} onJump={onJump} />
        </Section>
        <Section title="Cars">
          <CarList cars={cars} car={car} onCar={onCar} />
        </Section>
      </div>
    </div>
  );
}
