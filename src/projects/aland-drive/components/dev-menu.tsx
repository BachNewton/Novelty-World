"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import type { CarChoice } from "../render/game";

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

function CarList({ cars, car, onCar }: { cars: readonly CarChoice[]; car: string; onCar: (name: string) => void }) {
  const current = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    current.current?.focus();
  }, []);
  return (
    <ul className="grid grid-cols-2 gap-1">
      {cars.map(({ name, paint }) => (
        <li key={name}>
          <button
            ref={name === car ? current : undefined}
            type="button"
            aria-pressed={name === car}
            className="flex w-full cursor-pointer items-center gap-2 rounded border-2 px-2 py-1 text-left text-sm"
            style={{ borderColor: name === car ? ACCENT : "transparent" }}
            onClick={() => { onCar(name); }}
          >
            <span aria-hidden className="size-4 shrink-0 rounded-full border" style={{ background: `var(--color-aland-drive-${paint})`, borderColor: INK }} />
            <span className="grow">{name}</span>
            {name === car && <Check aria-hidden className="size-4" style={{ color: ACCENT }} />}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function DevMenu({ cars, car, onCar, onClose }: { cars: readonly CarChoice[]; car: string; onCar: (name: string) => void; onClose: () => void }) {
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
        <Section title="Cars">
          <CarList cars={cars} car={car} onCar={onCar} />
        </Section>
      </div>
    </div>
  );
}
