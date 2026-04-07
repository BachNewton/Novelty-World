"use client";

import type { PlayerInfo } from "@/shared/lib/multiplayer";

interface WorldViewProps {
  playerRoster: PlayerInfo[];
  selfId: string;
}

const SIZE = 600;
const CENTER = SIZE / 2;
const RADIUS = SIZE * 0.32;
const NODE_RADIUS = 24;

function getNodePosition(index: number, total: number) {
  if (total === 1) return { x: CENTER, y: CENTER };
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  return {
    x: CENTER + RADIUS * Math.cos(angle),
    y: CENTER + RADIUS * Math.sin(angle),
  };
}

export function WorldView({ playerRoster, selfId }: WorldViewProps) {
  const selfIndex = playerRoster.findIndex((p) => p.playerId === selfId);
  const total = playerRoster.length;

  return (
    <div className="w-full max-w-2xl aspect-square">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full">
        {/* Edges — from self to each remote peer */}
        {selfIndex !== -1 &&
          playerRoster.map((player, i) => {
            if (player.playerId === selfId) return null;
            const selfPos = getNodePosition(selfIndex, total);
            const peerPos = getNodePosition(i, total);
            const connected = player.status === "connected";
            return (
              <line
                key={`edge-${player.playerId}`}
                x1={selfPos.x}
                y1={selfPos.y}
                x2={peerPos.x}
                y2={peerPos.y}
                className={
                  connected
                    ? "stroke-brand-green"
                    : "stroke-text-muted opacity-40"
                }
                strokeWidth={connected ? 2 : 1.5}
                strokeDasharray={connected ? undefined : "6 4"}
                style={{ transition: "all 0.5s ease" }}
              />
            );
          })}

        {/* Nodes */}
        {playerRoster.map((player, i) => {
          const pos = getNodePosition(i, total);
          const isSelf = player.playerId === selfId;
          const connected = player.status === "connected";

          return (
            <g
              key={player.playerId}
              style={{
                transition: "transform 0.5s ease",
                transform: `translate(${pos.x}px, ${pos.y}px)`,
              }}
            >
              <circle
                r={NODE_RADIUS}
                className={
                  isSelf
                    ? "fill-brand-orange/20 stroke-brand-orange"
                    : connected
                      ? "fill-brand-blue/20 stroke-brand-blue"
                      : "fill-surface-elevated stroke-text-muted opacity-50"
                }
                strokeWidth={2}
                strokeDasharray={!connected && !isSelf ? "4 3" : undefined}
              />
              <text
                y={NODE_RADIUS + 16}
                textAnchor="middle"
                className={`text-xs ${
                  isSelf
                    ? "fill-brand-orange"
                    : connected
                      ? "fill-text-secondary"
                      : "fill-text-muted opacity-50"
                }`}
              >
                {isSelf ? `${player.playerName} (you)` : player.playerName}
              </text>
              <text
                y={NODE_RADIUS + 30}
                textAnchor="middle"
                className={`text-[10px] ${
                  isSelf
                    ? "fill-brand-orange/60"
                    : connected
                      ? "fill-text-muted"
                      : "fill-text-muted opacity-40"
                }`}
              >
                {player.playerId.slice(0, 8)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
