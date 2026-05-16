import { Droplets, Train, Zap } from "lucide-react";
import { SPACES } from "../data";
import { PROPERTY_COLOR_VAR } from "../theme";
import type { GameState, Player } from "../types";
import { PlayerToken } from "./player-token";

interface Props {
  state: GameState;
}

export function Header({ state }: Props) {
  return (
    <div className="flex shrink-0 flex-col">
      {state.players.map((player) => (
        <PlayerRow
          key={player.id}
          player={player}
          ownership={state.ownership}
          mortgaged={state.mortgaged}
        />
      ))}
    </div>
  );
}

function PlayerRow({
  player,
  ownership,
  mortgaged,
}: {
  player: Player;
  ownership: Readonly<Record<number, string>>;
  mortgaged: Readonly<Record<number, boolean>>;
}) {
  const owned = Object.entries(ownership)
    .filter(([, pid]) => pid === player.id)
    .map(([pos]) => Number(pos))
    .sort((a, b) => a - b);
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5"
      style={{
        backgroundColor: "var(--mono-board)",
        color: "var(--mono-ink)",
        boxShadow: "inset 0 -1px 0 var(--mono-frame)",
      }}
    >
      <PlayerToken player={player} className="h-7 w-7" />
      <div
        className="flex shrink-0 flex-col leading-tight"
        style={{ minWidth: "3.5rem" }}
      >
        <span className="truncate text-sm font-semibold">{player.name}</span>
        <span className="font-mono text-xs">
          ${player.cash.toLocaleString("en-US")}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {owned.map((pos) => (
          <OwnedChip
            key={pos}
            position={pos}
            mortgaged={mortgaged[pos] ?? false}
          />
        ))}
      </div>
    </div>
  );
}

function OwnedChip({
  position,
  mortgaged,
}: {
  position: number;
  mortgaged: boolean;
}) {
  const space = SPACES[position];
  const baseClasses =
    "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm";
  const mortgageOverlay = mortgaged
    ? {
        backgroundImage:
          "repeating-linear-gradient(135deg, transparent 0 2px, var(--mono-frame) 2px 3px)",
      }
    : {};

  switch (space.kind) {
    case "property":
      return (
        <div
          className={baseClasses}
          style={{
            backgroundColor: PROPERTY_COLOR_VAR[space.color],
            boxShadow: "inset 0 0 0 1px var(--mono-frame)",
            ...mortgageOverlay,
          }}
        />
      );
    case "railroad":
      return (
        <div
          className={baseClasses}
          style={{
            backgroundColor: "var(--mono-neutral)",
            ...mortgageOverlay,
          }}
        >
          <Train
            strokeWidth={2}
            style={{ width: "70%", height: "70%", color: "white" }}
          />
        </div>
      );
    case "utility": {
      const Icon = space.name === "Electric Company" ? Zap : Droplets;
      return (
        <div
          className={baseClasses}
          style={{
            backgroundColor: "var(--mono-neutral)",
            ...mortgageOverlay,
          }}
        >
          <Icon
            strokeWidth={2}
            style={{ width: "70%", height: "70%", color: "white" }}
          />
        </div>
      );
    }
    default:
      // Non-ownable spaces won't appear in the ownership map. This branch is
      // unreachable in practice but keeps the switch exhaustive.
      return null;
  }
}
