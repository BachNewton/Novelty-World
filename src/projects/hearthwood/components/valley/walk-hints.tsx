"use client";

import { Footprints, Rabbit, Rotate3d, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ControlGlyph, Prompt, type Binding } from "@/shared/components/prompts";
import type { InputKind } from "@/shared/lib/input";
import type { TouchStick } from "../../input/use-walk-input";
import { STICK_RADIUS } from "../../input/walk-controls";

/*
 * How to walk, shown as the controls themselves beside a symbol of what they
 * do, for whichever input was used last, until that input has walked; and
 * the touch stick under the thumb while it is held.
 */

const RUN: Binding = { pad: "RT", key: "Shift", fills: false };

const INK = "text-(--color-hearthwood-valley-ui-ink)";
const PANEL = "rounded-2xl bg-(--color-hearthwood-valley-ui-shade)/55 backdrop-blur-sm";

function Hint({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2" aria-label={label} title={label}>
      <span className="flex items-center gap-1">{children}</span>
      <Icon aria-hidden className="size-5" />
    </div>
  );
}

function KeyHints() {
  return (
    <>
      <Hint icon={Footprints} label="Walk">
        {["W", "A", "S", "D"].map((key) => (
          <ControlGlyph key={key} control={{ key }} />
        ))}
      </Hint>
      <Hint icon={Rotate3d} label="Turn the camera">
        <ControlGlyph control={{ mouse: "left" }} />
      </Hint>
      <Hint icon={Rabbit} label="Run">
        <Prompt binding={RUN} input="keyboard-mouse" />
      </Hint>
    </>
  );
}

function PadHints() {
  return (
    <>
      <Hint icon={Footprints} label="Walk">
        <ControlGlyph control={{ pad: "L3" }} />
      </Hint>
      <Hint icon={Rotate3d} label="Turn the camera">
        <ControlGlyph control={{ pad: "R3" }} />
      </Hint>
      <Hint icon={Rabbit} label="Run">
        <Prompt binding={RUN} input="pad" />
      </Hint>
    </>
  );
}

/** Where the thumbs go: a ghost stick on the left half, and turning on the right. */
function TouchHints() {
  return (
    <div className={`pointer-events-none absolute inset-x-0 bottom-0 flex h-1/2 items-end justify-between px-8 pb-12 ${INK}`}>
      <div
        aria-label="Walk: drag on the left"
        className="flex items-center justify-center rounded-full border-2 border-(--color-hearthwood-valley-ui-ink)/50 bg-(--color-hearthwood-valley-ui-shade)/30"
        style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2 }}
      >
        <Footprints aria-hidden className="size-7 opacity-80" />
      </div>
      <div aria-label="Turn the camera: drag on the right" className="flex size-28 items-center justify-center">
        <Rotate3d aria-hidden className="size-9 opacity-80" />
      </div>
    </div>
  );
}

export function WalkHints({ kind, show }: { kind: InputKind; show: boolean }) {
  if (!show) return null;
  if (kind === "touch") return <TouchHints />;
  return (
    <div className={`pointer-events-none absolute bottom-4 left-4 flex flex-col gap-2 px-3 py-2.5 text-sm ${PANEL} ${INK}`}>
      {kind === "pad" ? <PadHints /> : <KeyHints />}
    </div>
  );
}

export function TouchStickView({ stick }: { stick: TouchStick | null }) {
  if (stick === null) return null;
  const dx = stick.knob.x - stick.origin.x;
  const dy = stick.knob.y - stick.origin.y;
  const reach = Math.hypot(dx, dy);
  const scale = reach > STICK_RADIUS ? STICK_RADIUS / reach : 1;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0">
      <div
        className="absolute rounded-full border-2 border-(--color-hearthwood-valley-ui-ink)/60 bg-(--color-hearthwood-valley-ui-shade)/25"
        style={{ left: stick.origin.x - STICK_RADIUS, top: stick.origin.y - STICK_RADIUS, width: STICK_RADIUS * 2, height: STICK_RADIUS * 2 }}
      />
      <div
        className="absolute size-14 rounded-full bg-(--color-hearthwood-valley-ui-ink)/70"
        style={{ left: stick.origin.x + dx * scale - 28, top: stick.origin.y + dy * scale - 28 }}
      />
    </div>
  );
}
