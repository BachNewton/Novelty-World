import { isTextEntryTarget } from "@/shared/lib/utils";

/** What the player can do, each bound to keys by their place on the keyboard (`KeyW`), so the same keys work on every layout. */
export const BINDINGS = {
  ahead: ["KeyW"],
  back: ["KeyS"],
  left: ["KeyA"],
  right: ["KeyD"],
  sprint: ["ShiftLeft", "ShiftRight"],
} as const satisfies Record<string, readonly string[]>;

export type Action = keyof typeof BINDINGS;

/** The controls as the game reads them once a frame: how far to go ahead and to the right (each −1, 0 or 1), and whether to sprint. */
export interface ControlState {
  ahead: number;
  right: number;
  sprint: boolean;
}

/** Each action's keys as a player reads them: `KeyW` is W, `ShiftLeft` is Shift. */
export function keyLabel(code: string): string {
  return code.replace(/^Key/, "").replace(/(Left|Right)$/, "");
}

/** The game's keyboard: which keys are held, read by the frame loop as actions. Not React's: the loop owns it. */
export class Controls {
  private readonly held = new Set<string>();

  private readonly down = (event: KeyboardEvent): void => {
    // A picker or field has the keyboard while it has focus.
    if (isTextEntryTarget(event.target)) return;
    this.held.add(event.code);
  };

  private readonly up = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  /** A key let go while the page is in the background is never reported, so nothing stays held after leaving it. */
  private readonly release = (): void => {
    this.held.clear();
  };

  constructor() {
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.release);
  }

  read(): ControlState {
    return {
      ahead: Number(this.isHeld("ahead")) - Number(this.isHeld("back")),
      right: Number(this.isHeld("right")) - Number(this.isHeld("left")),
      sprint: this.isHeld("sprint"),
    };
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
