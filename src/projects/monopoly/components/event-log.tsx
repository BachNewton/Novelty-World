"use client";

import {
  ChevronDown,
  ChevronUp,
  Droplets,
  KeyRound,
  Train,
  Zap,
} from "lucide-react";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { deckFor, SPACES } from "../data";
import { PLAYER_COLOR_VAR, PROPERTY_COLOR_VAR } from "../theme";
import type {
  CardSource,
  GameEvent,
  GameState,
  Player,
  TurnGroup,
} from "../types";

interface Props {
  state: GameState;
}

// Single 3-column grid for the whole log so vertical alignment is shared
// across every row:
//   1: verb (fixed) — event-type label, all rows hang from this column
//   2: body (flex)  — narrative content, truncates when long
//   3: numeric (auto, right-aligned) — $ amounts ONLY, pinned to the
//      row's right edge so all money in the log scans down one column.
//      Roll totals live inline in the body so they don't read as dollar
//      amounts.
const GRID_COLUMNS = "3.5rem minmax(0, 1fr) auto";

export function EventLog({ state }: Props) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Auto-scroll only when the user is parked at the bottom — chat-style
  // behavior so reviewing history isn't fighting incoming events.
  const stickToBottom = useRef(true);

  const totalEvents = state.turns.reduce((n, t) => n + t.events.length, 0);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [totalEvents, expanded]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 8;
  };

  const toggle = () => {
    setExpanded((v) => !v);
  };

  const playersById = new Map(state.players.map((p) => [p.id, p]));

  return (
    <div
      className="relative shrink-0"
      style={{
        height: expanded ? "60vh" : "12rem",
        backgroundColor: "var(--mono-card)",
        boxShadow: "inset 0 1px 0 var(--mono-frame)",
        color: "var(--mono-ink)",
        transition: "height 200ms ease-in-out",
      }}
    >
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onClick={toggle}
        className="absolute inset-0 cursor-pointer overflow-y-auto px-2.5 pb-1.5 pt-0.5"
      >
        <div
          className="grid items-baseline gap-x-3"
          style={{ gridTemplateColumns: GRID_COLUMNS }}
        >
          {state.turns.map((turn) => (
            <TurnFragment
              key={turn.turn}
              turn={turn}
              playersById={playersById}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={expanded ? "Collapse event log" : "Expand event log"}
        // Centered handle straddling the top divider line so the button
        // visually "pinches" the boundary between board and log.
        className="absolute left-1/2 top-0 z-20 flex h-5 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded"
        style={{
          backgroundColor: "var(--mono-card)",
          color: "var(--mono-ink)",
          boxShadow: "inset 0 0 0 1px var(--mono-frame)",
        }}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

function TurnFragment({
  turn,
  playersById,
}: {
  turn: TurnGroup;
  playersById: ReadonlyMap<string, Player>;
}) {
  const actor = playersById.get(turn.playerId);
  if (!actor) return null;
  return (
    <>
      <div className="py-0.5" style={{ gridColumn: "1 / -1" }}>
        <TurnDivider turn={turn.turn} actor={actor} />
      </div>
      {turn.events.flatMap((event, i) => {
        const key = `${turn.turn}-${i}`;
        const cells: ReactNode[] = [
          <EventCells key={key} event={event} playersById={playersById} />,
        ];
        // Passing GO is conceptually a side-effect of movement, but pro
        // players want it as its own line so it doesn't fight for space
        // with the roll outcome.
        if (event.kind === "roll" && event.passedGo) {
          cells.push(<PassedGoCells key={`${key}-pass`} />);
        }
        return cells;
      })}
    </>
  );
}

function TurnDivider({ turn, actor }: { turn: number; actor: Player }) {
  const color = PLAYER_COLOR_VAR[actor.color];
  return (
    <div className="flex items-center gap-2 text-xs uppercase tracking-wider">
      <span style={{ opacity: 0.6 }}>Turn {turn}</span>
      <span
        className="h-px flex-1"
        style={{ backgroundColor: "var(--mono-frame)" }}
      />
      <span className="inline-flex items-center gap-1.5" style={{ color }}>
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{
            backgroundColor: color,
            boxShadow: "0 0 0 1px var(--mono-frame)",
          }}
        />
        <span className="font-semibold">{actor.name}</span>
      </span>
    </div>
  );
}

function EventCells({
  event,
  playersById,
}: {
  event: GameEvent;
  playersById: ReadonlyMap<string, Player>;
}) {
  return (
    <Fragment>
      <VerbCell verb={verbFor(event)} />
      <BodyCell>
        <EventBody event={event} playersById={playersById} />
      </BodyCell>
      <NumericCell>
        <EventNumeric event={event} />
      </NumericCell>
    </Fragment>
  );
}

function PassedGoCells() {
  return (
    <Fragment>
      <VerbCell verb="PASS" />
      <BodyCell>
        <span className="font-medium">GO</span>
      </BodyCell>
      <NumericCell>
        <Money amount={200} sign="+" />
      </NumericCell>
    </Fragment>
  );
}

function VerbCell({ verb }: { verb: string }) {
  return (
    <div
      className="py-0.5 text-right font-mono text-[11px] font-semibold uppercase tracking-wider"
      style={{ color: "var(--mono-ink)", opacity: 0.5 }}
    >
      {verb}
    </div>
  );
}

function BodyCell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap py-0.5 text-sm leading-snug">
      {children}
    </div>
  );
}

function NumericCell({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-end py-0.5 text-sm leading-snug">
      {children}
    </div>
  );
}

function verbFor(event: GameEvent): string {
  switch (event.kind) {
    case "roll":
      return "ROLL";
    case "buy":
      return "BUY";
    case "rent":
      return "RENT";
    case "tax":
      return "TAX";
    case "build":
      return "BUILD";
    case "sell-building":
      return "SELL";
    case "mortgage":
      return "MORT";
    case "unmortgage":
      return "UNMORT";
    case "trade":
      return "TRADE";
    case "go-to-jail":
      return "JAIL";
    case "jail-roll":
      return "ROLL";
    case "jail-pay":
      return "BAIL";
    case "jail-card":
      return "GOJF";
    case "card-drawn":
      return "CARD";
    case "card-transfer":
      return "PAY";
    case "pass-go":
      return "PASS";
    case "auction":
      return "AUCT";
    case "bankrupt":
      return "BUST";
    case "winner":
      return "WIN";
  }
}

/** Pro shorthand for a drawn card (the nickname, not the flavor text). */
function cardName(source: CardSource, cardId: string): string {
  return deckFor(source).find((c) => c.id === cardId)?.name ?? cardId;
}

function EventBody({
  event,
  playersById,
}: {
  event: GameEvent;
  playersById: ReadonlyMap<string, Player>;
}) {
  switch (event.kind) {
    case "roll":
      return (
        <>
          <RollTotal value={event.dice[0] + event.dice[1]} />
          {event.doublesStreak > 0 && (
            <DoublesNote streak={event.doublesStreak} />
          )}
          <Arrow />
          <SpaceLabel position={event.toPosition} />
        </>
      );
    case "buy":
      return <SpaceLabel position={event.position} />;
    case "rent": {
      const owner = playersById.get(event.ownerId);
      if (!owner) return null;
      return (
        <>
          <PlayerChip player={owner} />
          <SpaceLabel position={event.position} />
        </>
      );
    }
    case "tax":
      return <span>{event.taxName}</span>;
    case "build": {
      const piece = event.toLevel === 5 ? "hotel" : "house";
      return (
        <>
          <span>+1 {piece}</span>
          <SpaceLabel position={event.position} />
        </>
      );
    }
    case "sell-building": {
      const piece = event.toLevel === 4 ? "hotel" : "house";
      return (
        <>
          <span>−1 {piece}</span>
          <SpaceLabel position={event.position} />
        </>
      );
    }
    case "mortgage":
    case "unmortgage":
      return <SpaceLabel position={event.position} />;
    case "trade": {
      const proposer = playersById.get(event.proposerId);
      return (
        <>
          {proposer && (
            <>
              <span style={{ opacity: 0.6 }}>by</span>
              <PlayerChip player={proposer} />
            </>
          )}
          <TradeMoves event={event} playersById={playersById} />
        </>
      );
    }
    case "go-to-jail": {
      const reason =
        event.reason === "tile"
          ? "Go to Jail tile"
          : event.reason === "card"
            ? "card"
            : "3 doubles";
      return (
        <>
          <span style={{ color: "var(--mono-orange)", fontWeight: 600 }}>
            → Jail
          </span>
          <span style={{ opacity: 0.6 }}>({reason})</span>
        </>
      );
    }
    case "jail-roll":
      return (
        <>
          <RollTotal value={event.dice[0] + event.dice[1]} />
          <span
            style={{
              color: event.escaped
                ? "var(--mono-green)"
                : "var(--mono-orange)",
              fontWeight: 600,
            }}
          >
            {event.escaped ? "escaped" : "no escape"}
          </span>
          <span style={{ opacity: 0.6 }}>({event.jailTurn}/3)</span>
        </>
      );
    case "jail-pay":
      return <span>to leave jail</span>;
    case "jail-card":
      return (
        <>
          <span>used</span>
          <span style={{ opacity: 0.6 }}>
            ({event.source === "chance" ? "Chance" : "Chest"})
          </span>
        </>
      );
    case "card-drawn":
      return (
        <>
          <span style={{ opacity: 0.6 }}>
            {event.source === "chance" ? "Chance" : "Chest"}
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span className="font-medium">
            {cardName(event.source, event.cardId)}
          </span>
        </>
      );
    case "card-transfer": {
      const from = playersById.get(event.fromId);
      const to = playersById.get(event.toId);
      if (!from || !to) return null;
      return (
        <>
          <PlayerChip player={from} />
          <Arrow />
          <PlayerChip player={to} />
        </>
      );
    }
    case "pass-go":
      return <span className="font-medium">GO</span>;
    case "auction": {
      const winner = event.winnerId
        ? (playersById.get(event.winnerId) ?? null)
        : null;
      return (
        <>
          <SpaceLabel position={event.position} />
          {winner ? (
            <>
              <Arrow />
              <PlayerChip player={winner} />
            </>
          ) : (
            <span style={{ opacity: 0.6 }}>(no bids)</span>
          )}
        </>
      );
    }
    case "bankrupt": {
      const creditor = event.creditorId
        ? (playersById.get(event.creditorId) ?? null)
        : null;
      return creditor ? (
        <>
          <span style={{ opacity: 0.6 }}>→ estate to</span>
          <PlayerChip player={creditor} />
        </>
      ) : (
        <span style={{ opacity: 0.6 }}>(to bank)</span>
      );
    }
    case "winner": {
      const winner = playersById.get(event.winnerId);
      if (!winner) return null;
      return <PlayerChip player={winner} />;
    }
  }
}

function EventNumeric({ event }: { event: GameEvent }) {
  switch (event.kind) {
    case "buy":
      return <Money amount={event.price} sign="-" />;
    case "rent":
      return <Money amount={event.amount} sign="-" />;
    case "tax":
      return <Money amount={event.amount} sign="-" />;
    case "build":
      return <Money amount={event.cost} sign="-" />;
    case "sell-building":
      return <Money amount={event.refund} sign="+" />;
    case "mortgage":
      return <Money amount={event.received} sign="+" />;
    case "unmortgage":
      return <Money amount={event.cost} sign="-" />;
    case "jail-pay":
      return <Money amount={50} sign="-" />;
    case "auction":
      return event.winnerId ? (
        <Money amount={event.price} sign="-" />
      ) : null;
    case "card-drawn":
      // Movement / jail / GOJF cards carry no bank cash; collect / pay show it.
      return event.cash === undefined ? null : (
        <Money amount={Math.abs(event.cash)} sign={event.cash > 0 ? "+" : "-"} />
      );
    case "card-transfer":
      // Neutral amount — the from → to chips already show the direction.
      return <Money amount={event.amount} />;
    case "pass-go":
      return <Money amount={200} sign="+" />;
    case "roll":
    case "jail-roll":
    case "trade":
    case "go-to-jail":
    case "jail-card":
    case "bankrupt":
    case "winner":
      return null;
  }
}

function DoublesNote({ streak }: { streak: number }) {
  return (
    <span style={{ opacity: 0.6 }}>
      (doubles{streak > 1 ? ` ×${streak}` : ""})
    </span>
  );
}

function RollTotal({ value }: { value: number }) {
  return (
    <span
      style={{
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </span>
  );
}

// Multi-party trade summary: one "asset → new holder" segment per property
// and card that changed hands, plus one "player ±$" segment per cash move.
// Reads as "who ends up with what", which scans better across N parties than
// trying to render each player's give/get columns on one log line.
function TradeMoves({
  event,
  playersById,
}: {
  event: Extract<GameEvent, { kind: "trade" }>;
  playersById: ReadonlyMap<string, Player>;
}) {
  const parts: ReactNode[] = [];
  for (const [posStr, ownerId] of Object.entries(event.propertyTo)) {
    const owner = playersById.get(ownerId);
    if (!owner) continue;
    parts.push(
      <span key={`p-${posStr}`} className="inline-flex items-center gap-0.5">
        <SpaceLabel position={Number(posStr)} />
        <Arrow />
        <PlayerChip player={owner} />
      </span>,
    );
  }
  for (const [src, holderId] of Object.entries(event.gojfTo)) {
    const holder = holderId ? (playersById.get(holderId) ?? null) : null;
    if (!holder) continue;
    parts.push(
      <span key={`g-${src}`} className="inline-flex items-center gap-0.5">
        <GojfTag source={src as CardSource} />
        <Arrow />
        <PlayerChip player={holder} />
      </span>,
    );
  }
  for (const [pid, delta] of Object.entries(event.cashDelta)) {
    if (!delta) continue;
    const p = playersById.get(pid);
    if (!p) continue;
    parts.push(
      <span key={`c-${pid}`} className="inline-flex items-center gap-0.5">
        <PlayerChip player={p} />
        <Money amount={Math.abs(delta)} sign={delta > 0 ? "+" : "-"} />
      </span>,
    );
  }
  return <span className="inline-flex items-center gap-x-2">{parts}</span>;
}

function GojfTag({ source }: { source: CardSource }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <KeyRound
        className="h-3.5 w-3.5 shrink-0"
        style={{ color: "var(--mono-orange)" }}
      />
      <span className="text-[11px] uppercase" style={{ opacity: 0.7 }}>
        {source === "chance" ? "Ch" : "CC"}
      </span>
    </span>
  );
}

function Arrow() {
  return <span style={{ opacity: 0.4 }}>→</span>;
}

function SpaceLabel({ position }: { position: number }) {
  const space = SPACES[position];
  switch (space.kind) {
    case "property":
      return (
        <span className="inline-flex min-w-0 items-center gap-1">
          <ColorSwatch color={PROPERTY_COLOR_VAR[space.color]} />
          <span className="font-medium">{shortPropertyName(space.name)}</span>
        </span>
      );
    case "railroad":
      return (
        <span className="inline-flex min-w-0 items-center gap-1">
          <Train
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: "var(--mono-rail)" }}
          />
          <span className="font-medium">{shortRailroadName(space.name)}</span>
        </span>
      );
    case "utility": {
      const Icon = space.name === "Electric Company" ? Zap : Droplets;
      return (
        <span className="inline-flex min-w-0 items-center gap-1">
          <Icon
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: "var(--mono-utility)" }}
          />
          <span className="font-medium">
            {space.name === "Electric Company" ? "Electric" : "Water"}
          </span>
        </span>
      );
    }
    case "go":
      return <span className="font-medium">GO</span>;
    case "jail":
      return <span className="font-medium">Jail</span>;
    case "free-parking":
      return <span className="font-medium">Free Parking</span>;
    case "go-to-jail":
      return <span className="font-medium">Go to Jail</span>;
    case "chance":
      return <span className="font-medium">Chance</span>;
    case "community-chest":
      return <span className="font-medium">Chest</span>;
    case "tax":
      return <span className="font-medium">{space.name}</span>;
  }
}

// Strip trailing " Avenue" entirely and shorten " Place" → " Pl". Property
// identity is conveyed by the color swatch + first word(s); the suffix is
// noise that pushes content widths around.
function shortPropertyName(name: string): string {
  return name.replace(/ Avenue$/, "").replace(/ Place$/, " Pl");
}

// "Reading Railroad" → "Reading RR", "Pennsylvania Railroad" → "Penn RR",
// "B. & O. Railroad" → "B&O RR". "Short Line" is left as-is.
function shortRailroadName(name: string): string {
  return name
    .replace("Pennsylvania", "Penn")
    .replace("B. & O.", "B&O")
    .replace(" Railroad", " RR");
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-3 w-3 shrink-0 rounded-sm"
      style={{
        backgroundColor: color,
        boxShadow: "0 0 0 1px var(--mono-frame)",
      }}
    />
  );
}

function PlayerChip({ player }: { player: Player }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{
          backgroundColor: PLAYER_COLOR_VAR[player.color],
          boxShadow: "0 0 0 1px var(--mono-frame)",
        }}
      />
      <span className="font-semibold">{player.name}</span>
    </span>
  );
}

function Money({
  amount,
  sign,
}: {
  amount: number;
  sign?: "+" | "-";
}) {
  const color =
    sign === "+"
      ? "var(--mono-green)"
      : sign === "-"
        ? "var(--mono-red)"
        : "var(--mono-ink)";
  const prefix = sign === "+" ? "+" : sign === "-" ? "−" : "";
  return (
    <span
      style={{
        color,
        fontVariantNumeric: "tabular-nums",
        fontWeight: 600,
      }}
    >
      {prefix}${amount.toLocaleString("en-US")}
    </span>
  );
}
