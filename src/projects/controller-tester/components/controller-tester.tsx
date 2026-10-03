"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Gamepad2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { DEFAULT_DEADZONE, gamepadSupport, useGamepads, type ButtonEdge } from "@/shared/lib/gamepad";
import { useHydrated } from "@/shared/lib/use-hydrated";
import { PadCard, padLabel } from "./pad-card";

const LOG_LENGTH = 12;

interface LogEntry {
  id: number;
  edge: ButtonEdge;
}

/** Shows every connected controller live, to check one works and to see
 *  what the shared gamepad library reports for it. */
export function ControllerTester() {
  const hydrated = useHydrated();
  const [deadzone, setDeadzone] = useState(DEFAULT_DEADZONE);
  const [log, setLog] = useState<LogEntry[]>([]);
  const nextId = useRef(0);

  const pads = useGamepads({
    deadzone,
    onButton(edge) {
      const id = nextId.current++;
      setLog((entries) => [{ id, edge }, ...entries].slice(0, LOG_LENGTH));
    },
  });

  const support = hydrated ? gamepadSupport() : "supported";

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="space-y-2 text-center">
        <div className="mx-auto w-fit rounded-md bg-surface-elevated p-3 text-brand-pink">
          <Gamepad2 size={32} />
        </div>
        <h1 className="text-3xl font-bold">Controller Tester</h1>
        <p className="text-text-secondary">Plug in a controller and make sure every button, stick and trigger works.</p>
      </header>

      {support !== "supported" ? (
        <Card className="mx-auto max-w-lg p-5 text-center text-sm text-text-secondary">
          {support === "insecure-context"
            ? "Browsers only share controllers with secure pages (https, or localhost). Open this page that way and try again."
            : "This browser doesn't support game controllers. Try Chrome, Edge or Firefox."}
        </Card>
      ) : pads.length === 0 ? (
        <Card className="mx-auto max-w-lg space-y-3 p-6 text-center">
          <p className="animate-pulse text-xl font-bold text-brand-green">Press any button to connect</p>
          <p className="text-sm text-text-secondary">
            Browsers keep controllers hidden until you press a button with this page open. Plug in by USB or pair over
            Bluetooth first.
          </p>
        </Card>
      ) : (
        <>
          <DeadzoneSlider value={deadzone} onChange={setDeadzone} />
          <div className="grid gap-6 lg:grid-cols-2">
            {pads.map((pad) => (
              <PadCard key={pad.index} pad={pad} deadzone={deadzone} />
            ))}
          </div>
        </>
      )}

      {support === "supported" && <EventLog entries={log} />}

      <Link href="/" className="mx-auto">
        <Button variant="ghost">Back to Novelty World</Button>
      </Link>
    </div>
  );
}

function DeadzoneSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <Card className="mx-auto w-full max-w-md space-y-2 p-4">
      <label className="flex items-center justify-between text-sm font-semibold" htmlFor="deadzone">
        Stick deadzone
        <span className="font-mono text-brand-orange">{Math.round(value * 100)}%</span>
      </label>
      <input
        id="deadzone"
        type="range"
        min={0}
        max={0.5}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-orange"
      />
      <p className="text-xs text-text-muted">
        Tilts inside the dashed ring count as zero. Raise it if a stick drifts at rest.
      </p>
    </Card>
  );
}

function EventLog({ entries }: { entries: readonly LogEntry[] }) {
  return (
    <Card className="mx-auto w-full max-w-md space-y-2 p-4">
      <h2 className="text-sm font-semibold">Recent presses</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-text-muted">Nothing yet.</p>
      ) : (
        <ol className="space-y-1 font-mono text-xs">
          {entries.map(({ id, edge }) => (
            <li key={id} className="flex justify-between gap-2">
              <span className="text-text-secondary">{padLabel(edge.pad)}</span>
              <span className="text-text-primary">{edge.name ?? `button ${edge.button}`}</span>
              <span className={edge.pressed ? "text-brand-green" : "text-brand-pink"}>
                {edge.pressed ? "pressed" : "released"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
