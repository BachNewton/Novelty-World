"use client";

import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { STANDARD_BUTTONS, canRumble, rumble, type PadReading, type RumbleOptions, type RumbleResult } from "@/shared/lib/gamepad";
import { XboxPad } from "./xbox-pad";

const RUMBLES: { label: string; options: RumbleOptions }[] = [
  { label: "Light buzz", options: { duration: 300, strong: 0, weak: 1 } },
  { label: "Heavy thud", options: { duration: 300, strong: 1, weak: 0 } },
  { label: "Full rumble", options: { duration: 800, strong: 1, weak: 1 } },
];

const RUMBLE_MESSAGES: Record<RumbleResult | "playing", string> = {
  playing: "Rumbling…",
  complete: "Done. Felt it?",
  preempted: "Cut short by a newer rumble.",
  unsupported: "This browser can't rumble this controller.",
  "no-pad": "The controller went away.",
};

export function padLabel(index: number): string {
  return `Controller ${index + 1}`;
}

export function PadCard({ pad, deadzone }: { pad: PadReading; deadzone: number }) {
  const [rumbleState, setRumbleState] = useState<RumbleResult | "playing" | null>(null);
  const rumbles = canRumble(pad.index);

  function play(options: RumbleOptions) {
    setRumbleState("playing");
    void rumble(pad.index, options).then(setRumbleState);
  }

  return (
    <Card className="space-y-5 p-4 sm:p-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-brand-orange">{padLabel(pad.index)}</h2>
        <p className="break-words text-sm text-text-secondary">{pad.id}</p>
        <p className="text-xs text-text-muted">
          Slot {pad.index} · mapping{" "}
          {pad.standard ? (
            <span className="font-medium text-brand-green">standard</span>
          ) : (
            <span className="font-medium text-brand-pink">not standard</span>
          )}
        </p>
      </div>

      {pad.controls ? (
        <div className="mx-auto max-w-md">
          <XboxPad controls={pad.controls} axes={pad.axes} deadzone={deadzone} />
          <div className="mt-2 grid grid-cols-2 gap-2 text-center font-mono text-xs text-text-secondary">
            <StickReadout label="Left stick" x={pad.controls.leftStick.x} y={pad.controls.leftStick.y} />
            <StickReadout label="Right stick" x={pad.controls.rightStick.x} y={pad.controls.rightStick.y} />
          </div>
        </div>
      ) : (
        <p className="rounded-md bg-surface-tertiary p-3 text-sm text-text-secondary">
          This controller doesn&apos;t report the standard layout, so its buttons and axes are shown by number only. Which
          number is which button depends on the controller and browser.
        </p>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">Rumble</h3>
        {rumbles ? (
          <div className="flex flex-wrap gap-2">
            {RUMBLES.map((r) => (
              <Button key={r.label} variant="secondary" onClick={() => play(r.options)}>
                {r.label}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">{RUMBLE_MESSAGES.unsupported} Chrome and Edge can.</p>
        )}
        {rumbleState && rumbles && <p className="text-sm text-brand-blue">{RUMBLE_MESSAGES[rumbleState]}</p>}
      </section>

      <RawValues pad={pad} />
    </Card>
  );
}

function StickReadout({ label, x, y }: { label: string; x: number; y: number }) {
  return (
    <div className="rounded-md bg-surface-tertiary px-2 py-1">
      <div className="font-sans text-text-muted">{label}</div>
      {x.toFixed(2)}, {y.toFixed(2)}
    </div>
  );
}

function RawValues({ pad }: { pad: PadReading }) {
  return (
    <details className="group">
      <summary className="cursor-pointer text-sm font-semibold text-text-primary">Raw values</summary>
      <div className="mt-3 space-y-4">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {pad.buttons.map((b, i) => (
            <div key={i} className="relative overflow-hidden rounded-sm bg-surface-tertiary px-2 py-1 font-mono text-xs">
              <div className="absolute inset-y-0 left-0 bg-brand-green/30" style={{ width: `${b.value * 100}%` }} />
              <span className="relative text-text-secondary">
                {i} {pad.standard ? STANDARD_BUTTONS[i] : ""}
              </span>
              <span className={b.pressed ? "relative float-right text-brand-green" : "relative float-right text-text-muted"}>
                {b.value.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {pad.axes.map((a, i) => (
            <div key={i} className="rounded-sm bg-surface-tertiary px-2 py-1 font-mono text-xs text-text-secondary">
              axis {i} <span className="float-right text-brand-blue">{a.toFixed(3)}</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
