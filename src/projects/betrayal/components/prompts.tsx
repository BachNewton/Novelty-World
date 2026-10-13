"use client";

import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import type { InputKind } from "../input/controls";

/*
 * Button prompts: the controller's buttons, keyboard keys and the mouse,
 * drawn as our own glyphs on Lucide's grid (a 24-unit viewbox, a 2-unit
 * stroke, round caps and joins, outline only, in `currentColor`), so they
 * read as one set with the project's icons and take Betrayal's tokens. The
 * letters are Xbox's names, never its colours: they would fight the house's
 * colour meanings. Filling the pressed arm of the d-pad, or the pressed
 * button of the mouse, is the only fill.
 *
 * `Prompt` is the one map from a meaning to its glyph for the input the
 * player last used. Hints never spell a button's name in words: the map is
 * the single source, and the glyph sits on the thing it acts on. Touch has no
 * glyph: the control is the tap target. One system for all of them: a glyph
 * is sized in ems of its text, sits on one opaque chip, and leads the label
 * inside its button (`PromptButton`); a filling hold fills that button.
 */

type PadGlyph = "A" | "B" | "X" | "Y" | "LB" | "RB" | "LT" | "RT" | "L3" | "R3" | "View" | "Menu" | "DpadUp" | "DpadDown" | "DpadLeft" | "DpadRight" | "DpadLeftRight" | "DpadUpDown";

/** The strokes of a face button's letter, inside its circle. */
const LETTERS: Record<"A" | "B" | "X" | "Y", string> = {
  A: "M8.5 16.5 12 7.5l3.5 9M9.9 13h4.2",
  B: "M9.5 7.5v9h3.25a2.25 2.25 0 0 0 0-4.5H9.5m0-4.5h2.75a2.25 2.25 0 0 1 0 4.5",
  X: "m9 8 6 8m0-8-6 8",
  Y: "m9 7.5 3 4.5 3-4.5M12 12v4.5",
};

/** A small L or R, for a bumper, a trigger or a stick, drawn round (x, y), its top-left. */
const side = (letter: "L" | "R", x: number, y: number) => (letter === "L" ? `M${x} ${y}v4.5h3` : `M${x} ${y + 4.5}v-4.5h1.75a1.25 1.25 0 0 1 0 2.5H${x}m1.75 0 1.25 2`);

const BUMPER = "M3 16v-5.5Q3 7 7 7q8 0 14 3.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z";
const TRIGGER = "M7 21a1 1 0 0 1-1-1v-9q0-8 7-8 5 0 5 5v12a1 1 0 0 1-1 1z";
const MIRROR = "matrix(-1 0 0 1 24 0)";
const DPAD = "M9 2h6v7h7v6h-7v7H9v-7H2V9h7z";
const ARMS = { up: "M9 2h6v7H9z", down: "M9 15h6v7H9z", left: "M2 9h7v6H2z", right: "M15 9h7v6h-7z" };

/** The shapes of each pad glyph, on the 24-unit grid. */
function padShape(glyph: PadGlyph): ReactNode {
  switch (glyph) {
    case "A":
    case "B":
    case "X":
    case "Y":
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d={LETTERS[glyph]} />
        </>
      );
    case "LB":
    case "RB":
      return (
        <>
          <path d={BUMPER} transform={glyph === "RB" ? MIRROR : undefined} />
          <path d={side(glyph === "LB" ? "L" : "R", 10.5, 10.5)} />
        </>
      );
    case "LT":
    case "RT":
      return (
        <>
          <path d={TRIGGER} transform={glyph === "RT" ? MIRROR : undefined} />
          <path d={side(glyph === "LT" ? "L" : "R", 10.5, 12)} />
        </>
      );
    case "L3":
    case "R3":
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <path d={side(glyph === "L3" ? "L" : "R", 10.75, 9.75)} />
        </>
      );
    case "View":
      return (
        <>
          <rect x="3" y="5" width="12" height="9" rx="2" />
          <rect x="9" y="10" width="12" height="9" rx="2" />
        </>
      );
    case "Menu":
      return <path d="M5 7h14M5 12h14M5 17h14" />;
    default: {
      const pressed = {
        DpadUp: [ARMS.up],
        DpadDown: [ARMS.down],
        DpadLeft: [ARMS.left],
        DpadRight: [ARMS.right],
        DpadLeftRight: [ARMS.left, ARMS.right],
        DpadUpDown: [ARMS.up, ARMS.down],
      }[glyph];
      return (
        <>
          {pressed.map((arm) => (
            <path key={arm} d={arm} fill="currentColor" />
          ))}
          <path d={DPAD} />
        </>
      );
    }
  }
}

/** A glyph's svg, `width` units wide on the 24-unit grid; its height is the
 *  prompt scale's, so it sizes with the text it sits beside. */
function Svg({ width, children }: { width: number; children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${width} 24`}
      width={`${(GLYPH_EM * width) / 24}em`}
      height={`${GLYPH_EM}em`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="block"
    >
      {children}
    </svg>
  );
}


/** A keycap with its key's letter or symbol; a long name gets a wider cap. */
function keyShape(label: string): { width: number; shape: ReactNode } {
  const width = label.length <= 1 ? 24 : 12 + label.length * 7;
  return {
    width,
    shape: (
      <>
        <rect x="2" y="3" width={width - 4} height="18" rx="3" />
        <text x={width / 2} y="16" textAnchor="middle" fontSize={label.length <= 1 ? 11 : 9} fontWeight={600} fill="currentColor" stroke="none" fontFamily="inherit">
          {label}
        </text>
      </>
    ),
  };
}

const MOUSE_BUTTONS = { left: "M12 3a6 6 0 0 0-6 6v1h6z", right: "M12 3a6 6 0 0 1 6 6v1h-6z" };

function mouseShape(pressed: "left" | "right"): ReactNode {
  return (
    <>
      <path d={MOUSE_BUTTONS[pressed]} fill="currentColor" />
      <rect x="6" y="3" width="12" height="18" rx="6" />
      <path d="M12 3v7M6 10h12" />
    </>
  );
}

/** A control as the player presses it: a pad button, a key, or a mouse button. */
export type Control = { pad: PadGlyph } | { key: string } | { mouse: "left" | "right" };

/** The prompt scale: a glyph is this many ems tall, of the text it sits beside. */
const GLYPH_EM = 1.25;

/** The chip every glyph sits on: solid and opaque, pale with a dark rim, so
 *  it reads on the house, a dark panel, the accent and a pale portrait alike. */
const CHIP = "inline-flex shrink-0 items-center rounded-[0.3em] bg-(--bt-ink) p-[0.1em] text-(--bt-bg) ring-1 ring-(--bt-bg)";

/** One control's glyph on its chip. */
export function ControlGlyph({ control, className = "" }: { control: Control; className?: string }) {
  const { width, shape } = "pad" in control ? { width: 24, shape: padShape(control.pad) } : "key" in control ? keyShape(control.key) : { width: 24, shape: mouseShape(control.mouse) };
  return (
    <span className={`${CHIP} ${className}`}>
      <Svg width={width}>{shape}</Svg>
    </span>
  );
}

/** What a control means, whatever the input: the map's single source. A
 *  and B (Enter and Esc) are left out: pressing the focused thing and
 *  closing the topmost one go without saying, so they never show a glyph. */
export type Meaning = "end-turn" | "explorer" | "menu" | "follow" | "details" | "walls" | "floor-down" | "floor-up" | "choices";

/** Each meaning's control on a pad and on the keyboard, and whether it is a
 *  hold that fills before it acts. Touch has none. */
const MAP: Record<Meaning, { pad: PadGlyph; key: string | null; fills: boolean }> = {
  "end-turn": { pad: "X", key: "⌫", fills: true },
  explorer: { pad: "Y", key: "I", fills: false },
  menu: { pad: "Menu", key: "M", fills: false },
  follow: { pad: "View", key: "C", fills: false },
  details: { pad: "R3", key: "Z", fills: false },
  walls: { pad: "L3", key: "V", fills: false },
  "floor-down": { pad: "LB", key: "F", fills: false },
  "floor-up": { pad: "RB", key: "R", fills: false },
  choices: { pad: "DpadLeftRight", key: "Tab", fills: false },
};

/** The control for a meaning on an input, or null where it has none (touch, or a key it lacks). */
export function controlFor(meaning: Meaning, input: InputKind): Control | null {
  const entry = MAP[meaning];
  if (input === "pad") return { pad: entry.pad };
  if (input === "keyboard-mouse" && entry.key !== null) return { key: entry.key };
  return null;
}

/** A meaning's glyph on its chip, for the input the player last used, or nothing on touch. */
export function Prompt({ meaning, input, className }: { meaning: Meaning; input: InputKind; className?: string }) {
  const control = controlFor(meaning, input);
  if (control === null) return null;
  return <ControlGlyph control={control} className={className} />;
}

/** How long a filling hold is held to act, in ms: about half a second. */
export const HOLD_MS = 500;

/** A filling hold: under way while `holding`, and `onHeld` hears it complete. */
export interface Hold {
  holding: boolean;
  onHeld: () => void;
}

/** The fill of a hold, across its button's background from the left. It
 *  runs while the hold does and empties when it is let go: the fill is the
 *  hold's own timing, the feature, not a wait on something else. */
function HoldFill({ holding, onHeld }: Hold) {
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(onHeld);
  useEffect(() => {
    done.current = onHeld;
  });
  useEffect(() => {
    const fill = ref.current;
    if (!holding || !fill) return;
    const run = fill.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: HOLD_MS, fill: "forwards" });
    run.onfinish = () => {
      done.current();
    };
    return () => {
      run.cancel();
    };
  }, [holding]);
  return <span ref={ref} aria-hidden data-hold-fill={holding ? "filling" : "rest"} style={{ transform: "scaleX(0)" }} className="absolute inset-0 origin-left bg-(--bt-ink)" />;
}

/** A filling hold's button is always the accent with dark text, so its label
 *  and glyph read on the empty part and on the pale fill alike. */
const HOLD_BUTTON = "bg-(--bt-accent) text-(--bt-bg)";

/** A button with its meaning's prompt: the glyph leads the label, centred
 *  on it, at the prompt scale. A filling hold fills the button's background
 *  while held. Every on-screen control with a prompt is one of these. */
export function PromptButton({ meaning, input, hold, className = "", children, ...button }: ComponentProps<"button"> & { meaning: Meaning; input: InputKind; hold?: Hold }) {
  if (MAP[meaning].fills !== (hold !== undefined)) throw new Error(`${meaning}'s button ${hold ? "fills" : "needs its hold's fill"}`);
  return (
    <button type="button" {...button} className={`relative inline-flex items-center gap-[0.4em] overflow-hidden ${hold ? HOLD_BUTTON : ""} ${className}`}>
      {hold && <HoldFill holding={hold.holding} onHeld={hold.onHeld} />}
      <Prompt meaning={meaning} input={input} className="relative" />
      <span className="relative inline-flex items-center gap-1.5">{children}</span>
    </button>
  );
}

/** With a controller, the button its focus is on shows it plainly: a thick
 *  ink ring with a dark band inside it, so it reads on a pale portrait and a
 *  dark panel alike. No glyph marks it: A pressing the focused thing goes
 *  without saying, so glyphs are kept for controls that aren't obvious. */
export const PAD_FOCUS = "[&_button:focus]:outline-3 [&_button:focus]:outline-offset-2 [&_button:focus]:outline-(--bt-ink) [&_button:focus]:shadow-[0_0_0_2px_var(--bt-bg)]";
