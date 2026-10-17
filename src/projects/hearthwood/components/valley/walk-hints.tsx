"use client";

import { ArrowBigDown, ArrowBigUp, Broom, Eye, Footprints, Rabbit, Rotate3d, SwitchCamera, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ControlGlyph, Prompt, type Binding } from "@/shared/components/prompts";
import type { InputKind } from "@/shared/lib/input";
import type { AirMode } from "../../gameplay/airborne";
import { otherView, type PointOfView } from "../../input/point-of-view";
import type { TouchStick, WalkInput } from "../../input/use-walk-input";
import { STICK_RADIUS } from "../../input/walk-controls";

/*
 * How to walk, shown as the controls themselves beside a symbol of what they
 * do, for whichever input was used last and the point of view, until that
 * input has walked; the prompt to click to look while a mouse is free in
 * first person; what jump does next while in the air, until it has been
 * done; the touch buttons that switch the view and jump; and the touch
 * stick under the thumb while it is held.
 */

const RUN: Binding = { pad: "RT", key: "Shift", fills: false };
const SWITCH_VIEW: Binding = { pad: "View", key: "V", fills: false };
const JUMP: Binding = { pad: "A", key: "Space", fills: false };

const INK = "text-(--color-hearthwood-valley-ui-ink)";
const PANEL = "rounded-2xl bg-(--color-hearthwood-valley-ui-shade)/55 backdrop-blur-sm";

const VIEW_NAME: Record<PointOfView, string> = { first: "first person", third: "third person" };
/** What jump does next: a hop from the ground, the broom out in the air, and put away on it. */
const JUMP_DOES: Record<AirMode, { icon: LucideIcon; label: string }> = {
  ground: { icon: ArrowBigUp, label: "Jump" },
  air: { icon: Broom, label: "Jump again for the broom" },
  broom: { icon: ArrowBigDown, label: "Put the broom away" },
};

/** What turning does in each view: look round, or turn the camera round them. */
const TURN: Record<PointOfView, { icon: LucideIcon; label: string }> = {
  first: { icon: Eye, label: "Look around" },
  third: { icon: Rotate3d, label: "Turn the camera" },
};

function Hint({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2" aria-label={label} title={label}>
      <span className="flex items-center gap-1">{children}</span>
      <Icon aria-hidden className="size-5" />
    </div>
  );
}

/** Switching the view. */
function ViewHint({ view, input }: { view: PointOfView; input: InputKind }) {
  const next = otherView(view);
  return (
    <Hint icon={SwitchCamera} label={`Switch to ${VIEW_NAME[next]}`}>
      <Prompt binding={SWITCH_VIEW} input={input} />
    </Hint>
  );
}

function KeyHints({ view }: { view: PointOfView }) {
  return (
    <>
      <Hint icon={Footprints} label="Walk">
        {["W", "A", "S", "D"].map((key) => (
          <ControlGlyph key={key} control={{ key }} />
        ))}
      </Hint>
      {/* In first person the mouse looks once it is locked, which the click prompt shows. */}
      {view === "third" && (
        <Hint icon={TURN.third.icon} label={TURN.third.label}>
          <ControlGlyph control={{ mouse: "left" }} />
        </Hint>
      )}
      <Hint icon={Rabbit} label="Run">
        <Prompt binding={RUN} input="keyboard-mouse" />
      </Hint>
      <Hint icon={ArrowBigUp} label="Jump">
        <Prompt binding={JUMP} input="keyboard-mouse" />
      </Hint>
      <ViewHint view={view} input="keyboard-mouse" />
    </>
  );
}

function PadHints({ view }: { view: PointOfView }) {
  return (
    <>
      <Hint icon={Footprints} label="Walk">
        <ControlGlyph control={{ pad: "L3" }} />
      </Hint>
      <Hint icon={TURN[view].icon} label={TURN[view].label}>
        <ControlGlyph control={{ pad: "R3" }} />
      </Hint>
      <Hint icon={Rabbit} label="Run">
        <Prompt binding={RUN} input="pad" />
      </Hint>
      <Hint icon={ArrowBigUp} label="Jump">
        <Prompt binding={JUMP} input="pad" />
      </Hint>
      <ViewHint view={view} input="pad" />
    </>
  );
}

/** Where the thumbs go: a ghost stick on the left half, and turning on the right. */
function TouchHints({ view }: { view: PointOfView }) {
  const Turn = TURN[view].icon;
  return (
    <div className={`pointer-events-none absolute inset-x-0 bottom-0 flex h-1/2 items-end justify-between px-8 pb-12 ${INK}`}>
      <div
        aria-label="Walk: drag on the left"
        className="flex items-center justify-center rounded-full border-2 border-(--color-hearthwood-valley-ui-ink)/50 bg-(--color-hearthwood-valley-ui-shade)/30"
        style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2 }}
      >
        <Footprints aria-hidden className="size-7 opacity-80" />
      </div>
      <div aria-label={`${TURN[view].label}: drag on the right`} className="mb-24 flex size-28 items-center justify-center">
        <Turn aria-hidden className="size-9 opacity-80" />
      </div>
    </div>
  );
}

/** A mouse in first person looks once the pointer is locked to the game, which a click does. Low in the
 *  middle, clear of what they are looking at. */
function ClickToLook() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[18%] flex justify-center">
      <div aria-label="Click to look around" title="Click to look around" className={`flex items-center gap-2 px-3 py-2.5 text-base ${PANEL} ${INK}`}>
        <ControlGlyph control={{ mouse: "left" }} />
        <Eye aria-hidden className="size-6" />
      </div>
    </div>
  );
}

/** In the air, what another jump does, until the player has done it: the broom out, then put away. */
function AirHint({ air, input }: { air: AirMode; input: InputKind }) {
  const does = JUMP_DOES[air];
  const Icon = does.icon;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[28%] flex justify-center">
      <div aria-label={does.label} title={does.label} className={`flex items-center gap-2 px-3 py-2.5 text-base ${PANEL} ${INK}`}>
        <Prompt binding={JUMP} input={input} />
        <Icon aria-hidden className="size-6" />
      </div>
    </div>
  );
}

/** On touch, jump is a button under the right thumb, showing what it will do: hop, take out the broom, or put it away. */
function JumpButton({ air, onJump }: { air: AirMode; onJump: () => void }) {
  const does = JUMP_DOES[air];
  const Icon = does.icon;
  return (
    <button
      type="button"
      aria-label={does.label}
      title={does.label}
      // On the press, not the click: a jump is felt the moment the thumb lands.
      onPointerDown={(event) => {
        event.preventDefault();
        onJump();
      }}
      className={`absolute right-6 bottom-8 flex size-[4.5rem] touch-none items-center justify-center rounded-full border-2 border-(--color-hearthwood-valley-ui-ink)/45 bg-(--color-hearthwood-valley-ui-shade)/45 backdrop-blur-sm ${INK}`}
    >
      <Icon aria-hidden className="size-9" />
    </button>
  );
}

/** On touch, switching the view is a button of its own. */
function ViewButton({ view, onSwitch }: { view: PointOfView; onSwitch: () => void }) {
  const next = otherView(view);
  return (
    <button
      type="button"
      aria-label={`Switch to ${VIEW_NAME[next]}`}
      title={`Switch to ${VIEW_NAME[next]}`}
      onClick={onSwitch}
      className={`absolute top-3 left-3 flex size-11 items-center justify-center ${PANEL} ${INK}`}
    >
      <SwitchCamera aria-hidden className="size-6" />
    </button>
  );
}

export function WalkHints({ input }: { input: WalkInput }) {
  const { kind, pointOfView: view, locked, air, broomed } = input;
  const showHow = !input.walkedWith.has(kind);
  const showAir = kind !== "touch" && ((air === "air" && !broomed.out) || (air === "broom" && !broomed.away));
  return (
    <>
      {showHow &&
        (kind === "touch" ? (
          <TouchHints view={view} />
        ) : (
          <div className={`pointer-events-none absolute bottom-4 left-4 flex flex-col gap-2 px-3 py-2.5 text-sm ${PANEL} ${INK}`}>
            {kind === "pad" ? <PadHints view={view} /> : <KeyHints view={view} />}
          </div>
        ))}
      {kind === "keyboard-mouse" && view === "first" && !locked && <ClickToLook />}
      {showAir && <AirHint air={air} input={kind} />}
      {kind === "touch" && (
        <>
          <ViewButton
            view={view}
            onSwitch={() => {
              input.setPointOfView(otherView(view));
            }}
          />
          <JumpButton air={air} onJump={input.jump} />
        </>
      )}
    </>
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
