import {
  Bird,
  Car,
  Cat,
  Crown,
  Dog,
  Plane,
  Rocket,
  Ship,
  type LucideIcon,
} from "lucide-react";
import type { Player, PlayerIcon } from "../types";
import { PLAYER_COLOR_VAR } from "../theme";

/** Maps each player icon token to its lucide component. Shared so the board
 *  token and the lobby icon picker render the same glyph for a given icon. */
export const PLAYER_ICON_COMPONENTS: Record<PlayerIcon, LucideIcon> = {
  dog: Dog,
  car: Car,
  ship: Ship,
  crown: Crown,
  cat: Cat,
  plane: Plane,
  rocket: Rocket,
  bird: Bird,
};

interface Props {
  player: Player;
  /** Tailwind classes for sizing — callers supply width/height to control
   *  the token's size in their layout context (e.g. `h-6 w-6` or
   *  `h-[70%] aspect-square`). */
  className?: string;
  /** When this is the player whose turn is active, the token pulses its frame
   *  (reusing the chip-emphasis keyframe) so the eye lands on whose turn it is,
   *  on both the board and the header. */
  active?: boolean;
}

export function PlayerToken({ player, className = "", active = false }: Props) {
  const Icon = PLAYER_ICON_COMPONENTS[player.icon];
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full ${className}`}
      style={{
        backgroundColor: PLAYER_COLOR_VAR[player.color],
        color: "white",
        // Active player's token pulses its frame (reusing the chip-emphasis
        // keyframe) so whose turn it is reads at a glance; otherwise a static
        // frame ring.
        boxShadow: active
          ? "inset 0 0 0 1.5px var(--mono-ink)"
          : "0 0 0 1px var(--mono-frame)",
        ...(active && {
          animation: "mono-chip-pulse 1.1s ease-in-out infinite",
        }),
      }}
    >
      <Icon strokeWidth={2.5} style={{ width: "60%", height: "60%" }} />
    </div>
  );
}
