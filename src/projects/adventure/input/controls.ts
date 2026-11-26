import { readPad, subscribeGamepads, type StandardButton, type StandardControls } from "@/shared/lib/gamepad";
import type { PadGlyph } from "@/shared/components/prompts";
import { isTextEntryTarget } from "@/shared/lib/utils";
import { ALONE, padLeft, playerOf, pressedJoin, used, type Input, type Lineup } from "./lineup";

/** What a player can do, Enter joining a second player on the keyboard or leaving, each bound to keys by their place on the keyboard (`KeyW`), so the same keys work on every layout. */
export const BINDINGS = {
  ahead: ["KeyW"],
  back: ["KeyS"],
  left: ["KeyA"],
  right: ["KeyD"],
  sprint: ["ShiftLeft", "ShiftRight"],
  jump: ["Space"],
  turnLeft: ["ArrowLeft"],
  turnRight: ["ArrowRight"],
  tiltUp: ["ArrowUp"],
  tiltDown: ["ArrowDown"],
  zoomIn: ["Equal", "NumpadAdd"],
  zoomOut: ["Minus", "NumpadSubtract"],
  overlay: ["Backquote"],
  join: ["Enter", "NumpadEnter"],
} as const satisfies Record<string, readonly string[]>;

export type Action = keyof typeof BINDINGS;

/**
 * The same actions on a controller, laid out as third-person games lay them
 * out: the left stick walks, and clicked in it runs until it is clicked again
 * or let go to rest; the right stick turns and tilts the camera, A jumps, the
 * triggers zoom (right in, left out), View toggles the debug overlay, and Menu
 * joins a second player on that pad or leaves. Each is named by the glyph its
 * hint draws; the sticks by their glyphs, the buttons by their standard names.
 */
export const PAD_BINDINGS = {
  walk: "L3",
  sprint: "L3",
  jump: "A",
  camera: "R3",
  zoomIn: "RT",
  zoomOut: "LT",
  overlay: "View",
  join: "Menu",
} as const satisfies Record<string, PadGlyph>;

/**
 * The controls as the game reads them once a frame: how far to go ahead and to
 * the right (each −1 to 1: a key is all or nothing, a stick as far as it is
 * pushed), whether to sprint, whether jump was pressed since the last read (a
 * press, not a hold, so holding it doesn't bounce), which way to turn the
 * camera round the player, tilt it and zoom it (each −1 to 1), and whether the
 * debug overlay was toggled since the last read (a press, as jump is).
 */
export interface ControlState {
  ahead: number;
  right: number;
  sprint: boolean;
  jump: boolean;
  turn: number;
  tilt: number;
  zoom: number;
  overlay: boolean;
}

/** Keys whose code isn't what is printed on them. `Equal` is +'s key, shifted or not, and `Backquote` ~'s. */
const PRINTED: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Equal: "+",
  NumpadAdd: "+",
  Minus: "−",
  NumpadSubtract: "−",
  Backquote: "~",
};

/** Each action's keys as a player reads them: `KeyW` is W, `ShiftLeft` is Shift, `ArrowLeft` is ←, `Equal` is +. */
export function keyLabel(code: string): string {
  return PRINTED[code] ?? code.replace(/^Key/, "").replace(/(Left|Right)$/, "");
}

/**
 * Whether a pad is being played on: a button down, a stick out of its deadzone,
 * or a trigger pulled. A resting stick's drift is inside its deadzone, so it
 * isn't; nor is join pressed, which asks for a player of its own.
 */
function inUse({ buttons, leftStick, rightStick, leftTrigger, rightTrigger }: StandardControls): boolean {
  return (
    Object.entries(buttons).some(([name, button]) => button.pressed && name !== PAD_BINDINGS.join) ||
    [leftStick.x, leftStick.y, rightStick.x, rightStick.y, leftTrigger, rightTrigger].some((value) => value !== 0)
  );
}

/** The keys' value on an axis while any of them is held, otherwise the first pad's that isn't at rest, otherwise none. */
function either(keys: number, pads: readonly number[]): number {
  return keys !== 0 ? keys : (pads.find((value) => value !== 0) ?? 0);
}

/**
 * The game's keyboard and controllers: which keys are held and what each pad
 * with the standard layout holds, read by the frame loop as each player's
 * actions. Who plays with what is the lineup (`lineup.ts`): alone, the first
 * player plays on every input at once; with a second, each on their own. Not
 * React's: the loop owns it, and tells the page only the lineup, which the
 * hints follow.
 */
export class Controls {
  private readonly held = new Set<string>();
  /** Keys pressed since the last read: a press and release between two frames still counts. */
  private readonly pressed = new Set<string>();
  /** Each standard pad as its last frame read it, by slot. */
  private pads = new Map<number, StandardControls>();
  /** Each pad's buttons pressed since the last read, as keys are. */
  private readonly padPressed = new Map<number, Set<StandardButton>>();
  /** The pads whose left stick was clicked in to run: until it is clicked again, or let go to rest. */
  private readonly padSprint = new Set<number>();
  private lineup: Lineup = ALONE;
  private readonly stopPads: () => void;

  private readonly down = (event: KeyboardEvent): void => {
    // A picker or field has the keyboard while it has focus.
    if (isTextEntryTarget(event.target)) return;
    // Join asks for a player of its own, so it doesn't make the keyboard the first player's.
    if (!BINDINGS.join.some((code) => code === event.code)) this.use("keys");
    this.held.add(event.code);
    // A held key repeats its keydown: only the first is a press.
    if (!event.repeat) this.pressed.add(event.code);
    // Space would otherwise press whatever button has focus, or scroll.
    if (BINDINGS.jump.some((code) => code === event.code)) event.preventDefault();
  };

  private readonly up = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly pointed = (event: PointerEvent): void => {
    if (event.pointerType === "mouse") this.use("keys");
  };

  private readonly wheeled = (): void => {
    this.use("keys");
  };

  /** A key let go while the page is in the background is never reported, so nothing stays held after leaving it. */
  private readonly release = (): void => {
    this.held.clear();
    this.pressed.clear();
  };

  constructor(
    /** Told whenever who plays with what changes: a second player joined or left, or the first turned to another input. */
    private readonly onLineup: (lineup: Lineup) => void,
  ) {
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.release);
    window.addEventListener("pointerdown", this.pointed);
    window.addEventListener("wheel", this.wheeled, { passive: true });
    this.stopPads = subscribeGamepads({
      onFrame: (pads, changed) => {
        this.pads = new Map(
          pads.flatMap((pad) => {
            const controls = readPad(pad).controls;
            return controls === null ? [] : [[pad.index, controls] as const];
          }),
        );
        if (!changed) return;
        for (const [slot, controls] of this.pads) if (inUse(controls)) this.use(slot);
      },
      onButton: (edge) => {
        if (!edge.pressed || edge.name === null) return;
        const pressed = this.padPressed.get(edge.pad) ?? new Set<StandardButton>();
        pressed.add(edge.name);
        this.padPressed.set(edge.pad, pressed);
      },
      onConnectionChange: (pads) => {
        const slots = new Set(pads.map((pad) => pad.index));
        for (const slot of new Set([...this.pads.keys(), ...this.padSprint, ...this.padPressed.keys()])) {
          if (slots.has(slot)) continue;
          this.pads.delete(slot);
          this.padSprint.delete(slot);
          this.padPressed.delete(slot);
        }
        const { first, second } = this.lineup;
        for (const slot of [first, second]) if (typeof slot === "number" && !slots.has(slot)) this.setLineup(padLeft(this.lineup, slot));
      },
    });
  }

  /** Who plays with what, now. */
  get current(): Lineup {
    return this.lineup;
  }

  /** What each player asks for since the last read: the first player's, and the second's while one plays. */
  read(): ControlState[] {
    if (BINDINGS.join.some((code) => this.pressed.has(code))) this.setLineup(pressedJoin(this.lineup, "keys"));
    for (const [slot, pressed] of this.padPressed) {
      if (pressed.has(PAD_BINDINGS.join)) this.setLineup(pressedJoin(this.lineup, slot));
      if (pressed.has("LS") && !this.padSprint.delete(slot)) this.padSprint.add(slot);
    }
    for (const slot of this.padSprint) {
      const pad = this.pads.get(slot);
      if (pad === undefined || (pad.leftStick.x === 0 && pad.leftStick.y === 0)) this.padSprint.delete(slot);
    }
    const states = (this.lineup.second === null ? [0] : [0, 1]).map((player) => this.stateOf(player));
    this.pressed.clear();
    this.padPressed.clear();
    return states;
  }

  /** What one player's inputs ask for: the keys win where they ask, then the first of their pads that asks. */
  private stateOf(player: number): ControlState {
    const keys = playerOf(this.lineup, "keys") === player;
    const pads = [...this.pads].filter(([slot]) => playerOf(this.lineup, slot) === player).sort(([a], [b]) => a - b);
    const isHeld = (action: Action): boolean => keys && BINDINGS[action].some((code) => this.held.has(code));
    const wasPressed = (action: "jump" | "overlay"): boolean =>
      (keys && BINDINGS[action].some((code) => this.pressed.has(code))) || pads.some(([slot]) => this.padPressed.get(slot)?.has(PAD_BINDINGS[action]) === true);
    const ahead = Number(isHeld("ahead")) - Number(isHeld("back"));
    const right = Number(isHeld("right")) - Number(isHeld("left"));
    // The keys walk while any of them is held; otherwise the first stick pushed, as far as it's pushed.
    const walking = ahead !== 0 || right !== 0 ? undefined : pads.find(([, pad]) => pad.leftStick.x !== 0 || pad.leftStick.y !== 0);
    return {
      // A stick's y is down.
      ahead: walking === undefined ? ahead : -walking[1].leftStick.y,
      right: walking === undefined ? right : walking[1].leftStick.x,
      sprint: isHeld("sprint") || (walking !== undefined && this.padSprint.has(walking[0])),
      jump: wasPressed("jump"),
      // The right stick pushed right looks further right, and up looks up, as the arrow keys do.
      turn: either(Number(isHeld("turnRight")) - Number(isHeld("turnLeft")), pads.map(([, pad]) => pad.rightStick.x)),
      tilt: either(Number(isHeld("tiltUp")) - Number(isHeld("tiltDown")), pads.map(([, pad]) => -pad.rightStick.y)),
      zoom: either(Number(isHeld("zoomIn")) - Number(isHeld("zoomOut")), pads.map(([, pad]) => pad.rightTrigger - pad.leftTrigger)),
      overlay: wasPressed("overlay"),
    };
  }

  private use(input: Input): void {
    this.setLineup(used(this.lineup, input));
  }

  private setLineup(lineup: Lineup): void {
    if (lineup === this.lineup) return;
    this.lineup = lineup;
    this.onLineup(lineup);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
    window.removeEventListener("blur", this.release);
    window.removeEventListener("pointerdown", this.pointed);
    window.removeEventListener("wheel", this.wheeled);
    this.stopPads();
  }
}

