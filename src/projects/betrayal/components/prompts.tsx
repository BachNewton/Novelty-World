"use client";

import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import type { InputKind } from "../input/controls";

/*
 * Button prompts, drawn as games draw them: each glyph is the control's own
 * shape (a keycap, a face button, a bumper, a trigger, a stick, the d-pad,
 * the View and Menu buttons, the mouse), with its label filling it. They are
 * our own drawings on the conventions of console prompts: near-black with a
 * pale rim and label, so a glyph reads on the dark house, a dark panel, the
 * accent, a pale portrait and a hold's fill alike. The face buttons are
 * Xbox's coloured discs, for identity at a glance; their colours are prompt
 * tokens, naming a button and never one of the house's colour meanings.
 *
 * `Prompt` is the one map from a meaning to its glyph for the input the
 * player last used. Hints never spell a button's name in words: the map is
 * the single source, and the glyph sits on the thing it acts on. Touch has no
 * glyph: the control is the tap target. One system for all of them: a glyph
 * is sized in ems of its text and leads the label inside its button
 * (`PromptButton`); a filling hold fills that button.
 */

type PadGlyph = "A" | "B" | "X" | "Y" | "LB" | "RB" | "LT" | "RT" | "L3" | "R3" | "View" | "Menu" | "DpadUp" | "DpadDown" | "DpadLeft" | "DpadRight" | "DpadLeftRight" | "DpadUpDown";

/** The prompt scale: a glyph is this many ems tall, of the text it sits beside. */
const GLYPH_EM = 1.5;

/** A glyph's body: near-black with an ink rim, over a dark halo that keeps
 *  the rim's edge on a pale background. */
const BODY = { fill: "var(--bt-bg)", stroke: "var(--bt-ink)", strokeWidth: 1.5, strokeLinejoin: "round" } as const;
const HALO = { fill: "none", stroke: "var(--bt-bg)", strokeWidth: 4, strokeLinejoin: "round" } as const;
type Paint = typeof BODY | typeof HALO;

/** A body drawn twice: its halo, then itself. */
function Body({ shape }: { shape: (paint: Paint) => ReactNode }) {
  return (
    <>
      {shape(HALO)}
      {shape(BODY)}
    </>
  );
}
const INK = "var(--bt-ink)";

const FACE_COLOUR: Record<"A" | "B" | "X" | "Y", string> = {
  A: "var(--bt-prompt-a)",
  B: "var(--bt-prompt-b)",
  X: "var(--bt-prompt-x)",
  Y: "var(--bt-prompt-y)",
};

/** The height of a capital in the labels' font, Space Grotesk, in ems of its size. */
const CAP_HEIGHT = 0.7;

/** How far a label's ink sits off the middle of its advance in that font, in
 *  ems, measured: a letter's side bearings differ (an L's ink leans left), so
 *  centring the advance alone leaves it a fraction of a pixel off. */
const INK_SHIFT: Partial<Record<string, number>> = { L: 0.024, R: 0.014, F: 0.018, LB: 0.013, RB: 0.013, LT: 0.021, RT: 0.021, Tab: -0.009, Enter: 0.022, Esc: 0.017 };

/** A label filling its shape, its ink centred on (x, y): across by its
 *  measured ink, and down by the capitals' box. The font's own middle
 *  (`dominant-baseline: central`) sits below the capitals' middle, so the
 *  baseline is set from the capitals' height instead. */
function Label({ x, y, size, fill = INK, children }: { x: number; y: number; size: number; fill?: string; children: string }) {
  return (
    <text x={x - (INK_SHIFT[children] ?? 0) * size} y={y + (CAP_HEIGHT * size) / 2} textAnchor="middle" fontSize={size} fontWeight={700} fill={fill} fontFamily="inherit">
      {children}
    </text>
  );
}

const mirror = (width: number) => `matrix(-1 0 0 1 ${width} 0)`;
/** A left bumper: a wide rounded bar whose outer top corner sweeps round. */
const BUMPER = "M1.75 19V13Q1.75 3.75 14 3.75H32a2.25 2.25 0 0 1 2.25 2.25v13a2 2 0 0 1-2 2H3.75a2 2 0 0 1-2-2z";
/** A left trigger: tall, its top rounded over towards the outside. */
const TRIGGER = "M2.75 21V10.5Q2.75 2 13 2 23.25 2 23.25 8.5V21a1.5 1.5 0 0 1-1.5 1.5H4.25a1.5 1.5 0 0 1-1.5-1.5z";
const DPAD = "M8.5 1.75h7v6.75h6.75v7H15.5v6.75h-7V15.5H1.75v-7H8.5z";
const ARMS = { up: "M8.5 1.75h7v6.75h-7z", down: "M8.5 15.5h7v6.75h-7z", left: "M1.75 8.5H8.5v7H1.75z", right: "M15.5 8.5h6.75v7H15.5z" };

/** A round button's body: a face button's disc, or a stick's cap. */
const ROUND = { cx: 12, cy: 12, r: 10.75 } as const;

/** Each pad glyph: its width on the 24-unit-high grid, and its shapes. */
function padShape(glyph: PadGlyph): { width: number; shape: ReactNode } {
  switch (glyph) {
    case "A":
    case "B":
    case "X":
    case "Y":
      return {
        width: 24,
        shape: (
          <>
            <circle {...ROUND} fill={FACE_COLOUR[glyph]} stroke="var(--bt-bg)" strokeWidth={2.5} />
            <Label x={12} y={12} size={15} fill="var(--bt-bg)">
              {glyph}
            </Label>
          </>
        ),
      };
    case "LB":
    case "RB":
      return {
        width: 36,
        shape: (
          <>
            <Body shape={(paint) => <path d={BUMPER} transform={glyph === "RB" ? mirror(36) : undefined} {...paint} />} />
            <Label x={18} y={12.375} size={13.5}>
              {glyph}
            </Label>
          </>
        ),
      };
    case "LT":
    case "RT":
      return {
        width: 26,
        shape: (
          <>
            <Body shape={(paint) => <path d={TRIGGER} transform={glyph === "RT" ? mirror(26) : undefined} {...paint} />} />
            <Label x={13} y={12.25} size={12.5}>
              {glyph}
            </Label>
          </>
        ),
      };
    case "L3":
    case "R3":
      // The stick's cap with its letter: the stick alone says it is pressed.
      return {
        width: 24,
        shape: (
          <>
            <Body shape={(paint) => <circle {...ROUND} {...paint} />} />
            <Label x={12} y={12} size={13}>
              {glyph === "L3" ? "L" : "R"}
            </Label>
          </>
        ),
      };
    case "View":
      return {
        width: 24,
        shape: (
          <>
            <Body shape={(paint) => <circle {...ROUND} {...paint} />} />
            <path
              d="M7 14.5V8.25A1.25 1.25 0 0 1 8.25 7h5.5M10 9.75h5.75A1.25 1.25 0 0 1 17 11v4.75A1.25 1.25 0 0 1 15.75 17h-4.5A1.25 1.25 0 0 1 10 15.75z"
              fill="none"
              stroke={INK}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        ),
      };
    case "Menu":
      return {
        width: 24,
        shape: (
          <>
            <Body shape={(paint) => <circle {...ROUND} {...paint} />} />
            <path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h9" stroke={INK} strokeWidth={1.75} strokeLinecap="round" />
          </>
        ),
      };
    default: {
      const pressed = {
        DpadUp: [ARMS.up],
        DpadDown: [ARMS.down],
        DpadLeft: [ARMS.left],
        DpadRight: [ARMS.right],
        DpadLeftRight: [ARMS.left, ARMS.right],
        DpadUpDown: [ARMS.up, ARMS.down],
      }[glyph];
      return {
        width: 24,
        shape: (
          <>
            <Body shape={(paint) => <path d={DPAD} {...paint} />} />
            {pressed.map((arm) => (
              <path key={arm} d={arm} fill={INK} />
            ))}
          </>
        ),
      };
    }
  }
}

/** A keycap with its key's label filling it; a long name gets a wider cap. */
/** Keys drawn as a symbol rather than a name, on a wide cap: the symbol's box is centred on the cap. */
const KEY_SYMBOLS: Record<string, { width: number; shape: ReactNode }> = {
  Backspace: {
    width: 34,
    shape: (
      <path d="M12 7h13a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H12l-5-5zM17.5 10l4 4m0-4-4 4" fill="none" stroke={INK} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    ),
  },
};

/** A long key name's width in ems of its label, measured in the labels' font, so its cap fits it; another name
 *  takes an average letter's width. */
const KEY_NAME_EM: Partial<Record<string, number>> = { Tab: 1.72, Esc: 1.66, Enter: 2.57, Space: 2.98 };
const KEY_LETTER_EM = 0.6;
/** The space either side of a long key name, inside its cap. */
const KEY_PADDING = 5;

/** A keycap with its key's label filling it; a long name gets a cap as wide as the name. */
function keyShape(label: string): { width: number; shape: ReactNode } {
  const symbol = KEY_SYMBOLS[label] as { width: number; shape: ReactNode } | undefined;
  const single = label.length <= 1;
  const size = single ? 14 : 11;
  const width = symbol?.width ?? (single ? 24 : Math.round((KEY_NAME_EM[label] ?? label.length * KEY_LETTER_EM) * size + 2 * KEY_PADDING + 3.5));
  return {
    width,
    shape: (
      <>
        <Body shape={(paint) => <rect x="1.75" y="1.75" width={width - 3.5} height="20.5" rx="4" {...paint} />} />
        {symbol?.shape ?? (
          <Label x={width / 2} y={12} size={size}>
            {label}
          </Label>
        )}
      </>
    ),
  };
}

const MOUSE_BUTTONS = { left: "M12 2.75A6.25 6.25 0 0 0 5.75 9v1.5H12z", right: "M12 2.75A6.25 6.25 0 0 1 18.25 9v1.5H12z" };

/** The mouse, its pressed button filled. */
function mouseShape(pressed: "left" | "right"): { width: number; shape: ReactNode } {
  return {
    width: 24,
    shape: (
      <>
        <Body shape={(paint) => <rect x="5.75" y="2.75" width="12.5" height="18.5" rx="6.25" {...paint} />} />
        <path d={MOUSE_BUTTONS[pressed]} fill={INK} />
        <path d="M12 2.75v7.75M5.75 10.5h12.5" stroke={INK} strokeWidth={1.5} />
      </>
    ),
  };
}

/** A control as the player presses it: a pad button, a key, or a mouse button. */
export type Control = { pad: PadGlyph } | { key: string } | { mouse: "left" | "right" };

/** One control's glyph: the control's own shape, sized with the text beside it. */
export function ControlGlyph({ control, className = "" }: { control: Control; className?: string }) {
  const { width, shape } = "pad" in control ? padShape(control.pad) : "key" in control ? keyShape(control.key) : mouseShape(control.mouse);
  return (
    <svg viewBox={`0 0 ${width} 24`} width={`${(GLYPH_EM * width) / 24}em`} height={`${GLYPH_EM}em`} aria-hidden overflow="visible" className={`inline-block shrink-0 ${className}`}>
      {shape}
    </svg>
  );
}

/** What a control means, whatever the input: the map's single source. A
 *  and B (Enter and Esc) are left out: pressing the focused thing and
 *  closing the topmost one go without saying, so they never show a glyph. */
export type Meaning = "end-turn" | "explorer" | "menu" | "follow" | "details" | "walls" | "floor-down" | "floor-up" | "choices";

/** Each meaning's control on a pad and on the keyboard, and whether it is a
 *  hold that fills before it acts. Touch has none. */
const MAP: Record<Meaning, { pad: PadGlyph; key: string | null; fills: boolean }> = {
  "end-turn": { pad: "X", key: "Backspace", fills: true },
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

/** A meaning's glyph, for the input the player last used, or nothing on touch. */
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
