import { isTextEntryTarget } from "@/shared/lib/utils";

/** What the player can do, each bound to keys by their place on the keyboard (`KeyW`), so the same keys work on every layout. */
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
} as const satisfies Record<string, readonly string[]>;

export type Action = keyof typeof BINDINGS;

/**
 * The controls as the game reads them once a frame: how far to go ahead and to
 * the right (each −1, 0 or 1), whether to sprint, whether jump was pressed
 * since the last read (a press, not a hold, so holding it doesn't bounce), and
 * which way to turn the camera round the player, tilt it and zoom it (−1, 0 or 1),
 * and whether the debug overlay was toggled since the last read (a press, as jump is).
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

/** The game's keyboard: which keys are held, read by the frame loop as actions. Not React's: the loop owns it. */
export class Controls {
  private readonly held = new Set<string>();
  /** Keys pressed since the last read: a press and release between two frames still counts. */
  private readonly pressed = new Set<string>();

  private readonly down = (event: KeyboardEvent): void => {
    // A picker or field has the keyboard while it has focus.
    if (isTextEntryTarget(event.target)) return;
    this.held.add(event.code);
    // A held key repeats its keydown: only the first is a press.
    if (!event.repeat) this.pressed.add(event.code);
    // Space would otherwise press whatever button has focus, or scroll.
    if (BINDINGS.jump.some((code) => code === event.code)) event.preventDefault();
  };

  private readonly up = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  /** A key let go while the page is in the background is never reported, so nothing stays held after leaving it. */
  private readonly release = (): void => {
    this.held.clear();
    this.pressed.clear();
  };

  constructor() {
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.release);
  }

  read(): ControlState {
    const state = {
      ahead: Number(this.isHeld("ahead")) - Number(this.isHeld("back")),
      right: Number(this.isHeld("right")) - Number(this.isHeld("left")),
      sprint: this.isHeld("sprint"),
      jump: BINDINGS.jump.some((code) => this.pressed.has(code)),
      turn: Number(this.isHeld("turnRight")) - Number(this.isHeld("turnLeft")),
      tilt: Number(this.isHeld("tiltUp")) - Number(this.isHeld("tiltDown")),
      zoom: Number(this.isHeld("zoomIn")) - Number(this.isHeld("zoomOut")),
      overlay: BINDINGS.overlay.some((code) => this.pressed.has(code)),
    };
    this.pressed.clear();
    return state;
  }

  private isHeld(action: Action): boolean {
    return BINDINGS[action].some((code) => this.held.has(code));
  }

  dispose(): void {
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
    window.removeEventListener("blur", this.release);
  }
}
