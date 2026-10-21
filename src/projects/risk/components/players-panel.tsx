"use client";

import { Menu } from "lucide-react";
import { PromptButton } from "@/shared/components/prompts";
import type { InputKind } from "@/shared/lib/input";
import { cn } from "@/shared/lib/utils";
import type { GameView, Seat } from "../contract";
import type { Rank } from "../online/seat-bots";
import { BINDINGS } from "../ui/bindings";
import { phaseName } from "../ui/describe";
import { seatName } from "../ui/seats";
import { CardPips, SeatMark, SeatName } from "./bits";
import { RankInsignia } from "./insignia";
import { BUTTON, PANEL } from "./theme";

/*
 * The players panel: whose turn it is and the phase, every seat in turn order with its colour,
 * its player and its territories and armies, and the war room's button with the hand drawn as
 * cards. Every seat's colour is named beside its player at all times, so a colour in the news
 * finds its player at a glance. Its shape follows its box: a strip across the board's top-left,
 * a band across a portrait screen's top, or a column beside a short screen's board.
 */

/** A person by their name, or a bot by its name and version under its rank. */
export interface Player {
  name: string;
  rank?: Rank;
}

export const playerLabel = ({ name, rank }: Player) => (rank ? `${rank} · ${name}` : name);

export type PanelShape = "strip" | "band" | "column";

interface Props {
  view: GameView;
  players: readonly Player[];
  shape: PanelShape;
  input: InputKind;
  onMenu: () => void;
}

export function PlayersPanel({ view, players, shape, input, onMenu }: Props) {
  const { active, viewer: you } = view;
  const over = view.phase === "game-over";
  const column = shape === "column";
  const warRoom = (
    <PromptButton binding={BINDINGS.menu} input={input} className={cn(BUTTON, "shrink-0", column && "w-full", shape === "band" && "px-[0.5em]")} onClick={onMenu} aria-label={`War room: ${view.cards.hand?.length ?? 0} cards`}>
      {/* A band is narrow for its roster: the hand stands under the icon. */}
      <span className={cn("inline-flex items-center gap-[0.4em]", shape === "band" && "flex-col gap-[0.15em]")}>
        <Menu size="1.1em" />
        <CardPips count={view.cards.hand?.length ?? 0} />
      </span>
    </PromptButton>
  );
  // Lines that cut short rather than wrap, so the panel never changes height.
  const turn = column ? (
    <p className="flex min-w-0 flex-col whitespace-nowrap text-[0.85em] leading-[1.25]">
      {!over && <SeatName seat={active} />}
      <span className="truncate text-(--rk-muted)">{phaseName(view.phase)}</span>
      <span className="text-(--rk-muted)">turn {view.turn}</span>
    </p>
  ) : (
    <p className="flex min-w-0 items-center gap-x-[0.5em] whitespace-nowrap">
      {!over && <SeatName seat={active} />}
      <span className="truncate text-(--rk-muted)">
        {phaseName(view.phase)} · turn {view.turn}
      </span>
    </p>
  );
  const columns = { strip: "grid-cols-[repeat(auto-fill,minmax(18em,1fr))]", band: "grid-cols-2", column: "grid-cols-1 gap-y-[0.15em]" }[shape];
  const roster = (
    <ol className={cn("grid gap-x-[1em] text-[0.85em] leading-[1.25]", columns)} aria-label="Players">
      {view.turnOrder.map((seat) => (
        <SeatRow key={seat} seat={seat} view={view} player={seat === you ? { name: "you" } : players[seat]} column={column} />
      ))}
    </ol>
  );

  return (
    <div className={cn(PANEL, "pointer-events-auto flex max-h-full min-h-0 flex-col overflow-hidden p-[0.4em]", column ? "h-full gap-[0.25em]" : "gap-[0.35em] pl-[0.7em]")}>
      {shape === "column" && (
        <>
          {warRoom}
          {turn}
          {roster}
        </>
      )}
      {/* Across, the war room's button stands beside the turn and the roster, so the panel is
          only as tall as they are. */}
      {shape !== "column" && (
        <div className="flex items-start gap-[0.5em]">
          <div className="flex min-w-0 flex-1 flex-col gap-[0.2em]">
            {turn}
            {roster}
          </div>
          {warRoom}
        </div>
      )}
    </div>
  );
}

function SeatRow({ seat, view, player, column }: { seat: Seat; view: GameView; player: Player; column: boolean }) {
  const who = playerLabel(player);
  // In a column every line counts: the mark keeps to the line's height.
  const mark = column ? "size-[1em]" : undefined;
  const s = view.seats[seat];
  const mine = seat === view.viewer;
  const count = (
    <span className="ml-auto shrink-0 tabular-nums">
      {s.territories}
      <span className="text-(--rk-muted)">/{s.armies}</span>
    </span>
  );
  const colour = (
    <span className={cn("shrink-0 items-center gap-[0.3em] font-semibold", column ? "flex" : "inline-flex")}>
      <SeatMark seat={seat} className={mark} />
      {seatName(seat)}
    </span>
  );
  // A bot's insignia and name always show; its rank's title only where the row has room for it.
  const named = (
    <span className={cn("flex min-w-0 items-baseline gap-[0.4em]", !mine && "text-(--rk-muted)")}>
      {player.rank && <RankInsignia rank={player.rank} className="shrink-0 self-center" />}
      <span className={cn("min-w-0 truncate", mine && "font-bold text-(--rk-text)")}>{player.name}</span>
      {player.rank && <span className="hidden min-w-0 truncate opacity-75 @min-[21em]:block">· {player.rank}</span>}
    </span>
  );
  return (
    <li
      title={`${seatName(seat)}, ${who}: ${s.territories} territories, ${s.armies} armies, ${s.handSize} ${s.handSize === 1 ? "card" : "cards"}`}
      className={cn("@container min-w-0 whitespace-nowrap", s.eliminated && "line-through opacity-40", seat === view.active && "font-bold text-(--rk-brass-bright)")}
    >
      {column ? (
        <>
          {colour}
          <span className="flex items-center gap-[0.3em]">
            {named}
            {count}
          </span>
        </>
      ) : (
        <span className="flex items-center gap-[0.4em]">
          {colour}
          {named}
          {count}
        </span>
      )}
    </li>
  );
}
