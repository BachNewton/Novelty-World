import { isTextEntryTarget } from "@/shared/lib/utils";

/** What the player can do, each bound to keys by their place on the keyboard (`KeyW`), so the same keys work on every layout. */
export const BINDINGS = {
  ahead: ["KeyW"],
  back: ["KeyS"],
  left: ["KeyA"],
  right: ["KeyD"],
  sprint: ["ShiftLeft", "ShiftRight"],
  jump: ["Space"],
} as const satisfies Record<string, readonly string[]>;

export type Action = keyof typeof BINDINGS;

/**
 * The controls as the game reads them once a frame: how far to go ahead and to
 * the right (each −1, 0 or 1), whether to sprint, and whether jump was pressed
 * since the last read (a press, not a hold, so holding it doesn't bounce).
 */
export interface ControlState {
  ahead: number;
  right: number;
  sprint: boolean;
  jump: boolean;
}

/** Each action's keys as a player reads them: `KeyW` is W, `ShiftLeft` is Shift. */
export function keyLabel(code: string): string {
  return code.replace(/^Key/, "").replace(/(Left|Right)$/, "");
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
