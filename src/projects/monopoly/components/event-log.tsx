"use client";

import { ChevronDown, ChevronUp, KeyRound } from "lucide-react";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { deckFor, SPACES } from "../data";
import { useMonopolyStore } from "../store";
import { PLAYER_COLOR_VAR } from "../theme";
import { SetContextChips } from "./holdings-grid";
import { Money } from "./money";
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
  // Money in the log is colored from the VIEWER's vantage: green for cash that
  // came to me, red for cash that left me, plain white for money that moved but
  // never touched my balance. A spectator (no id) sees everything white.
  const myId = useMonopolyStore((s) => s.myPlayerId);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Auto-scroll only when the user is parked at the bottom — chat-style
  // behavior so reviewing history isn't fighting incoming events.
  const stickToBottom = useRef(true);

  // A new turn pushes a turn group (and its divider) before any of its events
  // exist, so the rendered height grows on turn count too — track both, or the
  // log won't re-pin to the bottom until the turn's first event lands.
  const totalEvents = state.turns.reduce((n, t) => n + t.events.length, 0);
  const turnCount = state.turns.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [totalEvents, turnCount, expanded]);

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
              myId={myId}
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
  myId,
}: {
  turn: TurnGroup;
  playersById: ReadonlyMap<string, Player>;
  myId: string | null;
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
        // A bot's reasoning gets a full-width, wrapping row of its own (the
        // dense 3-cell grid would truncate it) — distinct so players can scan
        // past it, or read why the bot acted. The acting bot may be off-turn
        // (an off-turn trade proposal), so it carries its own playerId.
        if (event.kind === "bot-note") {
          const noteRow: ReactNode[] = [
            <BotNoteRow
              key={key}
              actor={playersById.get(event.playerId)}
              text={event.text}
            />,
          ];
          return noteRow;
        }
        // A trade moves several things at once; like build/sell it gets one
        // row per move rather than a single crammed line. A declined offer
        // renders the same rows, dimmed, plus a "declined by" row. See
        // `tradeRows`.
        if (event.kind === "trade" || event.kind === "trade-declined") {
          return tradeRows({ event, playersById, myId, keyBase: key });
        }
        // A bust eliminates a player and hands over their whole estate at once.
        // Like a trade, each asset and cash move gets its own line (under a BUST
        // headline naming the debtor) so readers can follow exactly what went
        // where. See `bankruptRows`.
        if (event.kind === "bankrupt") {
          return bankruptRows({ event, playersById, myId, keyBase: key });
        }
        const cells: ReactNode[] = [
          <EventCells
            key={key}
            event={event}
            playersById={playersById}
            myId={myId}
            turnPlayerId={turn.playerId}
          />,
        ];
        // Passing GO is conceptually a side-effect of movement, but pro
        // players want it as its own line so it doesn't fight for space
        // with the roll outcome. It credits the active player, so it's "mine"
        // only when I'm the one whose turn it is.
        if (event.kind === "roll" && event.passedGo) {
          cells.push(
            <PassedGoCells key={`${key}-pass`} mine={myId === turn.playerId} />,
          );
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

/** A bot's reasoning line — full-width and wrapping (unlike the dense one-line
 *  event rows), under an orange "BOT" tag with the acting bot's chip, so it
 *  reads as the bot "speaking" and players can scan past it or read why it
 *  acted. The actor may be off-turn (an off-turn trade proposal). */
function BotNoteRow({
  actor,
  text,
}: {
  actor: Player | undefined;
  text: string;
}) {
  return (
    <div
      className="flex items-start gap-1.5 py-0.5 text-xs leading-snug"
      style={{ gridColumn: "1 / -1" }}
    >
      <span
        className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--mono-orange)" }}
      >
        Bot
      </span>
      {actor && <PlayerChip player={actor} />}
      <span className="min-w-0 italic" style={{ opacity: 0.7 }}>
        {text}
      </span>
    </div>
  );
}

function EventCells({
  event,
  playersById,
  myId,
  turnPlayerId,
}: {
  event: GameEvent;
  playersById: ReadonlyMap<string, Player>;
  myId: string | null;
  turnPlayerId: string;
}) {
  return (
    <Fragment>
      <VerbCell verb={verbFor(event)} />
      <BodyCell>
        <EventBody
          event={event}
          playersById={playersById}
          turnPlayerId={turnPlayerId}
        />
      </BodyCell>
      <NumericCell>
        <EventNumeric event={event} myId={myId} turnPlayerId={turnPlayerId} />
      </NumericCell>
    </Fragment>
  );
}

function PassedGoCells({ mine }: { mine: boolean }) {
  return (
    <Fragment>
      <VerbCell verb="PASS" />
      <BodyCell>
        <span className="font-medium">GO</span>
      </BodyCell>
      <NumericCell>
        <Money amount={200} sign="+" mine={mine} />
      </NumericCell>
    </Fragment>
  );
}

// `dim` fades a row to signal a move that didn't take effect (a declined trade
// offer). The verb is already half-opacity, so dimming drops it further.
function VerbCell({ verb, dim = false }: { verb: string; dim?: boolean }) {
  return (
    <div
      className="py-0.5 text-right font-mono text-[11px] font-semibold uppercase tracking-wider"
      style={{ color: "var(--mono-ink)", opacity: dim ? 0.3 : 0.5 }}
    >
      {verb}
    </div>
  );
}

function BodyCell({
  children,
  dim = false,
}: {
  children: ReactNode;
  dim?: boolean;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap py-0.5 text-sm leading-snug"
      style={{ opacity: dim ? 0.5 : undefined }}
    >
      {children}
    </div>
  );
}

function NumericCell({
  children,
  dim = false,
}: {
  children: ReactNode;
  dim?: boolean;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-end py-0.5 text-sm leading-snug"
      style={{ opacity: dim ? 0.5 : undefined }}
    >
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
    case "trade-declined":
      return "OFFER";
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
    case "bot-note":
      // Rendered as a full-width row (see `BotNoteRow`), not through the 3-cell
      // grid, so this label is only a fallback for the exhaustive switch.
      return "BOT";
  }
}

/** Pro shorthand for a drawn card (the nickname, not the flavor text). */
function cardName(source: CardSource, cardId: string): string {
  return deckFor(source).find((c) => c.id === cardId)?.name ?? cardId;
}

function EventBody({
  event,
  playersById,
  turnPlayerId,
}: {
  event: GameEvent;
  playersById: ReadonlyMap<string, Player>;
  turnPlayerId: string;
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
          <OffTurnActor
            actorId={event.playerId}
            turnPlayerId={turnPlayerId}
            playersById={playersById}
          />
          <span>+1 {piece}</span>
          <SpaceLabel position={event.position} />
        </>
      );
    }
    case "sell-building": {
      const piece = event.toLevel === 4 ? "hotel" : "house";
      return (
        <>
          <OffTurnActor
            actorId={event.playerId}
            turnPlayerId={turnPlayerId}
            playersById={playersById}
          />
          <span>−1 {piece}</span>
          <SpaceLabel position={event.position} />
        </>
      );
    }
    case "mortgage":
    case "unmortgage":
      return (
        <>
          <OffTurnActor
            actorId={event.playerId}
            turnPlayerId={turnPlayerId}
            playersById={playersById}
          />
          <SpaceLabel position={event.position} />
        </>
      );
    case "trade":
    case "trade-declined":
      // Trades render as one row per move via `tradeRows` (see `TurnFragment`),
      // never as a single EventCells body, so these arms are unreachable.
      return null;
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
    case "bankrupt":
      // Busts render as a headline + one row per asset/cash move via
      // `bankruptRows` (see `TurnFragment`), never as a single EventCells body.
      return null;
    case "winner": {
      const winner = playersById.get(event.winnerId);
      if (!winner) return null;
      return <PlayerChip player={winner} />;
    }
    case "bot-note":
      // Rendered as a full-width row (see `BotNoteRow`), never through this cell.
      return null;
  }
}

function EventNumeric({
  event,
  myId,
  turnPlayerId,
}: {
  event: GameEvent;
  myId: string | null;
  turnPlayerId: string;
}) {
  const cash = cashFor(event, myId, turnPlayerId);
  // A zero amount carries no information and would render an ugly "−$0" — e.g. a
  // charge that busts a debtor with an empty purse (the real cash moved is $0).
  if (!cash || cash.amount === 0) return null;
  return <Money amount={cash.amount} sign={cash.sign} mine={cash.mine} />;
}

/** How a money event reads in the log for the current viewer. `sign` is the
 *  flow direction (`+` in / `−` out); `mine` is whether it moved the viewer's
 *  own balance — true ⇒ colored green/red, false ⇒ plain white. When it's mine,
 *  the sign is from MY side (a landlord sees rent as `+`); when it isn't, the
 *  sign keeps the acting player's side (an opponent's purchase reads `−`). */
interface CashFlow {
  amount: number;
  sign: "+" | "-";
  mine: boolean;
}

function cashFor(
  event: GameEvent,
  myId: string | null,
  turnPlayerId: string,
): CashFlow | null {
  const isMine = (id: string | null | undefined): boolean =>
    myId !== null && id === myId;
  switch (event.kind) {
    case "buy":
      return { amount: event.price, sign: "-", mine: isMine(turnPlayerId) };
    case "rent":
      // The landlord receives (+); the active player paid (−). Either party may
      // be the viewer; everyone else sees the payer's side.
      return isMine(event.ownerId)
        ? { amount: event.amount, sign: "+", mine: true }
        : { amount: event.amount, sign: "-", mine: isMine(turnPlayerId) };
    case "tax":
      return { amount: event.amount, sign: "-", mine: isMine(turnPlayerId) };
    case "build":
      return { amount: event.cost, sign: "-", mine: isMine(event.playerId) };
    case "sell-building":
      return { amount: event.refund, sign: "+", mine: isMine(event.playerId) };
    case "mortgage":
      return { amount: event.received, sign: "+", mine: isMine(event.playerId) };
    case "unmortgage":
      return { amount: event.cost, sign: "-", mine: isMine(event.playerId) };
    case "jail-pay":
      return { amount: 50, sign: "-", mine: isMine(turnPlayerId) };
    case "auction":
      return event.winnerId === null
        ? null
        : { amount: event.price, sign: "-", mine: isMine(event.winnerId) };
    case "card-drawn":
      // Movement / jail / GOJF cards carry no bank cash; collect / pay show it.
      return event.cash === undefined
        ? null
        : {
            amount: Math.abs(event.cash),
            sign: event.cash > 0 ? "+" : "-",
            mine: isMine(turnPlayerId),
          };
    case "card-transfer":
      // Between two players. The viewer's side when they're a party; otherwise
      // the drawer's side (the drawer is the active player).
      if (isMine(event.toId)) return { amount: event.amount, sign: "+", mine: true };
      if (isMine(event.fromId)) return { amount: event.amount, sign: "-", mine: true };
      return {
        amount: event.amount,
        sign: turnPlayerId === event.toId ? "+" : "-",
        mine: false,
      };
    case "pass-go":
      return { amount: 200, sign: "+", mine: isMine(turnPlayerId) };
    case "roll":
    case "jail-roll":
    case "trade":
    case "trade-declined":
    case "go-to-jail":
    case "jail-card":
    case "bankrupt":
    case "winner":
    case "bot-note":
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

// A trade moves several assets and cash deltas at once. Rather than cram them
// onto one log line, each move gets its own grid row — the same line-per-change
// treatment build/sell get. An asset move reads as "«from» «asset» → «to»"; a
// cash move puts its net amount in the right-aligned numeric column like every
// other money line (cash has no "from" — `cashDelta` is a net per player, not a
// pairwise flow). Who proposed the trade is intentionally not shown.
//
// A declined offer (`trade-declined`) renders the same would-be move rows but
// dimmed — nothing took effect — under an OFFER verb, then a final un-dimmed row
// stating who rejected it.
function tradeRows({
  event,
  playersById,
  myId,
  keyBase,
}: {
  event: Extract<GameEvent, { kind: "trade" | "trade-declined" }>;
  playersById: ReadonlyMap<string, Player>;
  myId: string | null;
  keyBase: string;
}): ReactNode[] {
  const declined = event.kind === "trade-declined";
  const moves: { key: string; body: ReactNode; numeric?: ReactNode }[] = [];
  for (const [posStr, toId] of Object.entries(event.propertyTo)) {
    const pos = Number(posStr);
    const fromId = event.propertyFrom[pos];
    const from = fromId ? playersById.get(fromId) : undefined;
    const to = playersById.get(toId);
    if (!from || !to) continue;
    moves.push({
      key: `p-${posStr}`,
      body: (
        <>
          <PlayerChip player={from} />
          <SpaceLabel position={pos} />
          <Arrow />
          <PlayerChip player={to} />
        </>
      ),
    });
  }
  for (const [src, toId] of Object.entries(event.gojfTo)) {
    const fromId = event.gojfFrom[src as CardSource];
    const from = fromId ? playersById.get(fromId) : undefined;
    const to = toId ? playersById.get(toId) : undefined;
    if (!from || !to) continue;
    moves.push({
      key: `g-${src}`,
      body: (
        <>
          <PlayerChip player={from} />
          <GojfTag source={src as CardSource} />
          <Arrow />
          <PlayerChip player={to} />
        </>
      ),
    });
  }
  for (const [pid, delta] of Object.entries(event.cashDelta)) {
    if (!delta) continue;
    const p = playersById.get(pid);
    if (!p) continue;
    moves.push({
      key: `c-${pid}`,
      body: <PlayerChip player={p} />,
      numeric: (
        <Money
          amount={Math.abs(delta)}
          sign={delta > 0 ? "+" : "-"}
          mine={myId !== null && pid === myId}
        />
      ),
    });
  }

  const verb = verbFor(event);
  const rows: ReactNode[] = moves.map((move) => (
    <Fragment key={`${keyBase}-${move.key}`}>
      <VerbCell verb={verb} dim={declined} />
      <BodyCell dim={declined}>{move.body}</BodyCell>
      <NumericCell dim={declined}>{move.numeric}</NumericCell>
    </Fragment>
  ));

  if (event.kind === "trade-declined") {
    const decliner = playersById.get(event.declinedBy);
    rows.push(
      <Fragment key={`${keyBase}-declined`}>
        <VerbCell verb={verb} dim />
        <BodyCell>
          <span style={{ color: "var(--mono-red)", fontWeight: 600 }}>✗</span>
          <span style={{ opacity: 0.6 }}>declined by</span>
          {decliner && <PlayerChip player={decliner} />}
        </BodyCell>
        <NumericCell>{null}</NumericCell>
      </Fragment>,
    );
  }

  return rows;
}

// A bankruptcy hands a player's whole estate over in one beat. Rather than the
// old single cramped line, it renders like a trade: a BUST headline naming the
// debtor and where the estate goes, then one indented row per asset moved and a
// final cash row for what the creditor netted from the estate (buildings sold
// to the bank at half, less inherited mortgage interest). The debtor's own cash
// already moved on the triggering charge line, so it isn't repeated here — every
// number across the bust still sums exactly to the header balances.
//
// A bank bust (no creditor) shows only the headline: its lots are auctioned and
// surface as their own AUCT lines, and GOJF cards return to the deck.
function bankruptRows({
  event,
  playersById,
  myId,
  keyBase,
}: {
  event: Extract<GameEvent, { kind: "bankrupt" }>;
  playersById: ReadonlyMap<string, Player>;
  myId: string | null;
  keyBase: string;
}): ReactNode[] {
  const debtor = playersById.get(event.debtorId);
  if (!debtor) return [];
  const creditor = event.creditorId
    ? (playersById.get(event.creditorId) ?? undefined)
    : undefined;

  const rows: ReactNode[] = [
    <Fragment key={`${keyBase}-head`}>
      <VerbCell verb="BUST" />
      <BodyCell>
        <PlayerChip player={debtor} />
        <span style={{ color: "var(--mono-red)", fontWeight: 600 }}>bankrupt</span>
        <Arrow />
        {creditor ? (
          <PlayerChip player={creditor} />
        ) : (
          <span style={{ opacity: 0.6 }}>bank</span>
        )}
      </BodyCell>
      <NumericCell>{null}</NumericCell>
    </Fragment>,
  ];

  // Detail lines exist only for a player creditor (a bank bust auctions the
  // lots separately). The verb column is blank so they read as an indented
  // breakdown under the headline.
  if (!creditor) return rows;

  for (const pos of event.estateProperties) {
    rows.push(
      <Fragment key={`${keyBase}-p-${pos}`}>
        <VerbCell verb="" />
        <BodyCell>
          <SetContextChips position={pos} />
          <Arrow />
          <PlayerChip player={creditor} />
        </BodyCell>
        <NumericCell>{null}</NumericCell>
      </Fragment>,
    );
  }
  for (const src of event.estateGojf) {
    rows.push(
      <Fragment key={`${keyBase}-g-${src}`}>
        <VerbCell verb="" />
        <BodyCell>
          <GojfTag source={src} />
          <Arrow />
          <PlayerChip player={creditor} />
        </BodyCell>
        <NumericCell>{null}</NumericCell>
      </Fragment>,
    );
  }
  if (event.estateCash !== 0) {
    rows.push(
      <Fragment key={`${keyBase}-cash`}>
        <VerbCell verb="" />
        <BodyCell>
          <PlayerChip player={creditor} />
          <span style={{ opacity: 0.6 }}>estate</span>
        </BodyCell>
        <NumericCell>
          <Money
            amount={Math.abs(event.estateCash)}
            sign={event.estateCash > 0 ? "+" : "-"}
            mine={myId !== null && event.creditorId === myId}
          />
        </NumericCell>
      </Fragment>,
    );
  }
  return rows;
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
    // Ownables carry no name in the log — the set strip alone identifies them by
    // color + position-in-set (the same grammar as the header), which keeps the
    // dense log line tight. Non-ownable squares below still need their label.
    case "property":
    case "railroad":
    case "utility":
      return <SetContextChips position={position} />;
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

/** Names the actor on a manage event (build / sell / mortgage / unmortgage) only
 *  when they aren't the turn's active player. A manage intermission can be driven
 *  by an OFF-TURN player (Player B armed "manage", so it opens during Player A's
 *  pre-roll); those events fold into A's turn group, whose divider names A — so
 *  without this chip B's builds read as A's. On-turn manages stay chip-free; the
 *  divider already attributes them. */
function OffTurnActor({
  actorId,
  turnPlayerId,
  playersById,
}: {
  actorId: string;
  turnPlayerId: string;
  playersById: ReadonlyMap<string, Player>;
}) {
  if (actorId === turnPlayerId) return null;
  const actor = playersById.get(actorId);
  if (!actor) return null;
  return <PlayerChip player={actor} />;
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
