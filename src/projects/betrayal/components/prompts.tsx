"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { InputKind } from "../input/controls";

/*
 * Button prompts: the controller's buttons, keyboard keys and the mouse,
 * drawn as our own glyphs on Lucide's grid (a 24-unit viewbox, a 2-unit
 * stroke, round caps and joins, outline only, in `currentColor`), so they
 * read as one set with the project's icons and take Betrayal's tokens. The
 * letters are Xbox's names, never its colours: they would fight the house's
 * colour meanings. Filling the pressed arm of the d-pad, or the pressed
 * button of the mouse, is the only fill. A hold-only control shows a ring
 * round its glyph, which fills while the hold is under way.
 *
 * `Prompt` is the one map from a meaning to its glyph for the input the
 * player last used. Hints never spell a button's name in words: the map is
 * the single source, and the glyph sits on the thing it acts on. Touch has no
 * glyph: the control is the tap target.
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

/** A glyph's svg: `width` units wide on the 24-unit grid, drawn `size` pixels tall. */
function Svg({ width = 24, size, className = "", children }: { width?: number; size: number; className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${width} 24`}
      width={(size * width) / 24}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`inline-block shrink-0 align-middle ${className}`}
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

/** How long a hold-only control is held to act, in ms: about half a second. */
export const HOLD_MS = 500;
const RING = 2 * Math.PI * 13.5;
/** The share of the ring drawn at rest, so a hold-only control never looks like a tap. */
const REST = 0.25;

/** The ring of a hold-only control: a short arc at rest, filling round while
 *  `holding`; `onHeld` hears it come full circle. The ring's fill is the
 *  hold's own timing, the feature, not a wait on something else. */
function HoldRing({ holding, onHeld }: { holding: boolean; onHeld?: () => void }) {
  const ref = useRef<SVGCircleElement>(null);
  const done = useRef(onHeld);
  useEffect(() => {
    done.current = onHeld;
  });
  useEffect(() => {
    const ring = ref.current;
    if (!holding || !ring) return;
    const fill = ring.animate([{ strokeDashoffset: RING * (1 - REST) }, { strokeDashoffset: 0 }], { duration: HOLD_MS, fill: "forwards" });
    fill.onfinish = () => done.current?.();
    return () => {
      fill.cancel();
    };
  }, [holding]);
  return (
    <>
      <circle cx="15" cy="15" r="13.5" strokeOpacity={0.3} />
      <circle
        ref={ref}
        data-hold-ring={holding ? "filling" : "rest"}
        cx="15"
        cy="15"
        r="13.5"
        strokeDasharray={RING}
        strokeDashoffset={RING * (1 - REST)}
        transform="rotate(-90 15 15)"
      />
    </>
  );
}

/** One control's glyph, `size` pixels tall; `hold` draws the hold ring round it. */
export function ControlGlyph({ control, size = 18, hold, className }: { control: Control; size?: number; hold?: { holding: boolean; onHeld?: () => void }; className?: string }) {
  const { width, shape } = "pad" in control ? { width: 24, shape: padShape(control.pad) } : "key" in control ? keyShape(control.key) : { width: 24, shape: mouseShape(control.mouse) };
  if (!hold) {
    return (
      <Svg width={width} size={size} className={className}>
        {shape}
      </Svg>
    );
  }
  if (width !== 24) throw new Error("A hold ring goes round a square glyph only");
  // The glyph keeps its size, and the ring sits outside it on a wider grid.
  return (
    <Svg width={30} size={(size * 30) / 24} className={`-my-[0.125em] ${className ?? ""}`}>
      <g transform="translate(3 3)">{shape}</g>
      <HoldRing holding={hold.holding} onHeld={hold.onHeld} />
    </Svg>
  );
}

/** What a control means, whatever the input: the map's single source. */
export type Meaning =
  | "confirm"
  | "back"
  | "end-turn"
  | "explorer"
  | "menu"
  | "recentre"
  | "stats"
  | "walls"
  | "floor-down"
  | "floor-up"
  | "choices";

/** Each meaning's control on a pad and on the keyboard, and whether it is held. Touch has none. */
const MAP: Record<Meaning, { pad: PadGlyph; key: string | null; held: boolean }> = {
  confirm: { pad: "A", key: "Enter", held: false },
  back: { pad: "B", key: "Esc", held: false },
  "end-turn": { pad: "X", key: "⌫", held: true },
  explorer: { pad: "Y", key: "I", held: false },
  menu: { pad: "Menu", key: "M", held: false },
  recentre: { pad: "View", key: "C", held: false },
  stats: { pad: "R3", key: "Z", held: true },
  walls: { pad: "L3", key: "V", held: true },
  "floor-down": { pad: "LB", key: "F", held: false },
  "floor-up": { pad: "RB", key: "R", held: false },
  choices: { pad: "DpadLeftRight", key: "Tab", held: false },
};

/** The control for a meaning on an input, or null where it has none (touch, or a key it lacks). */
export function controlFor(meaning: Meaning, input: InputKind): Control | null {
  const entry = MAP[meaning];
  if (input === "pad") return { pad: entry.pad };
  if (input === "keyboard-mouse" && entry.key !== null) return { key: entry.key };
  return null;
}

/** A meaning's glyph for the input the player last used, or nothing on touch.
 *  A hold-only meaning draws its ring; `hold` fills it while held. */
export function Prompt({ meaning, input, size, hold, className }: { meaning: Meaning; input: InputKind; size?: number; hold?: { holding: boolean; onHeld?: () => void }; className?: string }) {
  const control = controlFor(meaning, input);
  if (control === null) return null;
  return <ControlGlyph control={control} size={size} hold={MAP[meaning].held ? (hold ?? { holding: false }) : undefined} className={className} />;
}

/** The pad's A, as a CSS mask image: the focused control's prompt, drawn by the stylesheet on whichever button has the pad's focus. */
export const FOCUS_A_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='${LETTERS.A}'/></svg>`,
)}")`;

/** With a controller, the button its focus is on shows it: an outline, and the A that presses it on its corner. Needs `--bt-focus-a` set to `FOCUS_A_MASK`. */
export const PAD_FOCUS =
  "[&_button:focus]:outline-2 [&_button:focus]:outline-offset-2 [&_button:focus]:outline-(--bt-ink) [&_button:focus]:relative [&_button:focus]:after:pointer-events-none [&_button:focus]:after:absolute [&_button:focus]:after:-top-1.5 [&_button:focus]:after:-right-1.5 [&_button:focus]:after:size-4 [&_button:focus]:after:bg-(--bt-ink) [&_button:focus]:after:[mask:var(--bt-focus-a)_center/contain_no-repeat] [&_button:focus]:after:content-['']";
