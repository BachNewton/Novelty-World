"use client";

import type { CSSProperties, ReactNode } from "react";
import { Diamond, Dice5, Droplets, Package, Train, Zap } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { SPACES } from "../data";
import { colorAt, developmentLevel, groupPositions } from "../development";
import { laneOffset } from "../lanes";
import { hasMonopoly, rentAt, type RentDisplay } from "../logic";
import { isRaiseOnly, manageActorId } from "../manage";
import { useMonopolyStore } from "../store";
import { useTokenAnim } from "../token-anim-store";
import { PLAYER_COLOR_VAR, PROPERTY_COLOR_VAR } from "../theme";
import type { Player, Space } from "../types";
import { MortgageMarker } from "./mortgage-marker";
import { PlayerToken } from "./player-token";

interface Props {
  position: number;
}

// Subscribe per-row to the slices we actually read. Zustand bails on === for
// primitives and (via useShallow) on element-wise equality for arrays/objects;
// the engine's immutable updates preserve unchanged Player refs, so a roll
// only re-renders the SquareRows whose contents really changed.
export function SquareRow({ position }: Props) {
  const space = SPACES[position];
  // Owner hue reflects the trade-in-progress: while a draft is open, a
  // reassigned square paints with its STAGED recipient's color so everyone
  // watching sees the proposal take shape, not just the proposer.
  const ownerColor = useMonopolyStore((s) => {
    const draft = s.state.turn.tradeDraft;
    const stagedTarget =
      draft && s.state.turn.phase === "trade-building"
        ? draft.propertyTo[position]
        : undefined;
    const id = stagedTarget ?? s.state.ownership[position];
    const owner = id ? s.state.players.find((p) => p.id === id) : undefined;
    return owner?.color ?? null;
  });
  const mortgaged = useMonopolyStore(
    (s) => s.state.mortgaged[position] ?? false,
  );
  const houses = useMonopolyStore((s) => s.state.houses[position] ?? 0);
  const tokens = useMonopolyStore(
    useShallow((s) => s.state.players.filter((p) => p.position === position)),
  );
  // Seat order (stable element-wise) drives each token's fixed lane, and the
  // pitch is published by Squares from the measured board width. Subscribing to
  // the id list rather than the players keeps this re-render-cheap: it only
  // changes when the roster does.
  const order = useMonopolyStore(
    useShallow((s) => s.state.players.map((p) => p.id)),
  );
  const activePlayerId = useMonopolyStore((s) => s.state.turn.playerId);
  const pitch = useTokenAnim((s) => s.lanePitch);
  // While a token is sliding to this square on the overlay, drop it here so it
  // isn't drawn twice. The position-keyed selector keeps every other row's
  // result at null, so only this row re-renders when the animation flips.
  const hiddenId = useTokenAnim((s) => (s.hidePos === position ? s.hideId : null));
  const visibleTokens = hiddenId
    ? tokens.filter((p) => p.id !== hiddenId)
    : tokens;
  const rent = useMonopolyStore(useShallow((s) => rentAt(s.state, position)));

  // The board doubles as the interaction surface for three staging modes:
  //  - Manage (the queued manager's intermission, or the forced debtor in
  //    must-raise-cash): two independent tap zones — the color strip cycles the
  //    build level, the row body toggles the mortgage flag.
  //  - Trade building: the proposer taps any owned, building-free square to
  //    cycle its recipient through the players and back to no-change.
  // Staged build levels and a staged mortgage both light the orange ring so the
  // staged set reads at a glance on the board itself.
  const stagedBuild = useMonopolyStore(
    (s) => s.state.turn.manageStaged?.build[position] ?? null,
  );
  const stagedMortgage = useMonopolyStore(
    (s) => s.state.turn.manageStaged?.mortgage[position] ?? null,
  );
  const tradeStaged = useMonopolyStore((s) => {
    const draft = s.state.turn.tradeDraft;
    if (s.state.turn.phase !== "trade-building" || !draft) return false;
    return position in draft.propertyTo;
  });
  // Trade building: the whole row is one button cycling the recipient.
  const tradeClickable = useMonopolyStore((s) => {
    const me = s.myPlayerId;
    if (!me || s.state.turn.phase !== "trade-building") return false;
    if (s.state.turn.tradeDraft?.proposerId !== me) return false;
    return position in s.state.ownership && !s.state.houses[position];
  });
  // Manage: the local player must be the actor (manager, or the forced debtor)
  // and own this square. The strip is buildable only on a full, unmortgaged
  // monopoly; the body toggles the mortgage on any owned square. The store
  // re-checks legality on tap, so these gates only decide whether the zones are
  // interactive (and styled as such).
  const buildClickable = useMonopolyStore((s) => {
    const me = s.myPlayerId;
    if (!me || manageActorId(s.state) !== me) return false;
    const color = colorAt(position);
    if (color === null || s.state.ownership[position] !== me) return false;
    if (!hasMonopoly(s.state, color, me)) return false;
    // Raise-only (forced settle, or a buy-decision cash-raise) can only sell
    // down — gated to built squares.
    if (isRaiseOnly(s.state)) {
      return developmentLevel(s.state, position) > 0;
    }
    // Voluntary: buildable only on an unmortgaged set (counting staged flips).
    const staged = s.state.turn.manageStaged;
    return !groupPositions(color).some((pos) =>
      staged && pos in staged.mortgage
        ? staged.mortgage[pos]
        : s.state.mortgaged[pos] === true,
    );
  });
  const mortgageClickable = useMonopolyStore((s) => {
    const me = s.myPlayerId;
    if (!me || manageActorId(s.state) !== me) return false;
    if (s.state.ownership[position] !== me) return false;
    // Raise-only (forced settle, or a buy-decision cash-raise) can't un-mortgage,
    // so an already mortgaged square isn't a tap target.
    if (isRaiseOnly(s.state) && s.state.mortgaged[position]) {
      return false;
    }
    // Mortgaging needs the lot building-free; selling its buildings to 0 in the
    // same commit (staged level 0) re-enables it.
    const stagedLevel = s.state.turn.manageStaged?.build[position] ?? developmentLevel(s.state, position);
    const alreadyMortgaged = s.state.mortgaged[position] === true;
    return alreadyMortgaged || stagedLevel === 0;
  });
  const cycleBuild = useMonopolyStore((s) => s.cycleBuild);
  const toggleMortgage = useMonopolyStore((s) => s.toggleMortgage);
  const cycleTradeProperty = useMonopolyStore((s) => s.cycleTradeProperty);

  // Two zones: a left identity panel (property color full-bleed, or card bg
  // for non-properties) and a right context panel tinted with the owner's
  // hue so ownership reads across the rest of the row.
  const isProperty = space.kind === "property";
  const leftBackground = isProperty
    ? PROPERTY_COLOR_VAR[space.color]
    : "var(--mono-card)";
  // 1px row divider drawn as an inset bottom shadow on each child rather
  // than as a flex gap on the parent. With the line painted by the same
  // element that owns the background, the browser composites it more
  // consistently across rows at fractional device-pixel ratios.
  const dividerShadow = "inset 0 -1px 0 var(--mono-frame)";
  const leftStyle: CSSProperties = {
    width: "72px",
    backgroundColor: leftBackground,
    boxShadow: dividerShadow,
  };
  const contextTint = ownerColor
    ? `color-mix(in srgb, ${PLAYER_COLOR_VAR[ownerColor]} 28%, var(--mono-card))`
    : "var(--mono-card)";

  // Displayed development / mortgage reflect any STAGED change so the player
  // previews their manage target on the board itself; the committed value still
  // shows when nothing is staged for this square.
  const displayHouses = stagedBuild ?? houses;
  const displayMortgaged = stagedMortgage ?? mortgaged;
  const buildIsStaged = stagedBuild !== null && stagedBuild !== houses;
  const mortgageIsStaged = stagedMortgage !== null && stagedMortgage !== mortgaged;

  // Inline stage indicator: an orange ring around the row when this square is
  // staged — a build change, a mortgage flip, or a trade reassignment — so the
  // staged set reads at a glance on the board itself (the panel shows it too,
  // but the board is the spatial map). 2px inset ring overlay rather than a
  // border to avoid shifting the row's content edges.
  const isStaged = buildIsStaged || mortgageIsStaged || tradeStaged;
  const stageOverlay: ReactNode = isStaged && (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        boxShadow: "inset 0 0 0 2px var(--mono-orange)",
      }}
      aria-hidden="true"
    />
  );

  const strip = (
    <>
      {isProperty ? (
        <Development houses={displayHouses} staged={buildIsStaged} />
      ) : (
        <SpaceIcon space={space} />
      )}
      {displayMortgaged && <MortgageMarker strokeWidth={2} />}
    </>
  );

  const body = (
    <>
      <NameCell space={space} mortgaged={displayMortgaged} />
      <TokenStrip
        tokens={visibleTokens}
        order={order}
        pitch={pitch}
        activePlayerId={activePlayerId}
      />
      <CostCell space={space} mortgaged={displayMortgaged} rent={rent} />
    </>
  );

  // Manage mode splits the row into two independent tap zones: the color strip
  // cycles the build level, the body toggles the mortgage. A row can't be one
  // button wrapping another, so each zone is its own sibling button.
  if (buildClickable || mortgageClickable) {
    return (
      <div
        className="relative flex h-11 shrink-0 overflow-hidden"
        style={{ color: "var(--mono-ink)" }}
      >
        <Zone
          as={buildClickable ? "button" : "div"}
          onClick={
            buildClickable
              ? () => {
                  cycleBuild(position);
                }
              : undefined
          }
          className="relative flex shrink-0 items-center justify-center"
          style={leftStyle}
        >
          {strip}
        </Zone>
        <Zone
          as={mortgageClickable ? "button" : "div"}
          onClick={
            mortgageClickable
              ? () => {
                  toggleMortgage(position);
                }
              : undefined
          }
          className="flex min-w-0 flex-1 items-center overflow-hidden px-2 text-left"
          style={{ background: contextTint, boxShadow: dividerShadow }}
        >
          {body}
        </Zone>
        {stageOverlay}
      </div>
    );
  }

  const content = (
    <>
      <div
        className="relative flex shrink-0 items-center justify-center"
        style={leftStyle}
      >
        {strip}
      </div>
      <div
        className="flex min-w-0 flex-1 items-center overflow-hidden px-2"
        style={{ background: contextTint, boxShadow: dividerShadow }}
      >
        {body}
      </div>
      {stageOverlay}
    </>
  );

  if (tradeClickable) {
    return (
      <button
        type="button"
        onClick={() => {
          cycleTradeProperty(position);
        }}
        className="relative flex h-11 w-full shrink-0 overflow-hidden text-left"
        style={{ color: "var(--mono-ink)", cursor: "pointer" }}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className="relative flex h-11 shrink-0 overflow-hidden"
      style={{ color: "var(--mono-ink)" }}
    >
      {content}
    </div>
  );
}

/** A tap zone that renders as a `<button>` when interactive and a plain `<div>`
 *  otherwise — so the build strip and mortgage body can each independently be a
 *  control or inert without nesting buttons. */
function Zone({
  as,
  onClick,
  className,
  style,
  children,
}: {
  as: "button" | "div";
  onClick?: () => void;
  className: string;
  style: CSSProperties;
  children: ReactNode;
}) {
  if (as === "button") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
        style={{ ...style, cursor: "pointer" }}
      >
        {children}
      </button>
    );
  }
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

function Development({
  houses,
  staged = false,
}: {
  houses: number;
  /** Render the buildings in the orange staged hue (a pending manage target)
   *  rather than their committed colors. */
  staged?: boolean;
}) {
  if (houses === 0) return null;
  const hotelColor = staged ? "var(--mono-orange)" : "var(--mono-red)";
  const houseColor = staged ? "var(--mono-orange)" : "var(--mono-green)";
  if (houses === 5) {
    return (
      <div className="flex w-full items-center justify-center">
        <div
          className="rounded-sm border-2 border-black"
          style={{
            width: "36px",
            height: "24px",
            backgroundColor: hotelColor,
          }}
        />
      </div>
    );
  }
  return (
    <div className="flex w-full items-center px-1.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-1 items-center justify-center"
        >
          {i < houses && (
            <div
              className="rounded-sm border-2 border-black"
              style={{
                width: "12px",
                height: "24px",
                backgroundColor: houseColor,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function SpaceIcon({ space }: { space: Space }) {
  const iconStyle: CSSProperties = {
    height: "1.9rem",
    width: "auto",
  };
  switch (space.kind) {
    case "railroad":
      return (
        <Train
          strokeWidth={1.75}
          style={{ ...iconStyle, color: "var(--mono-rail)" }}
        />
      );
    case "utility": {
      const Icon = space.name === "Electric Company" ? Zap : Droplets;
      return (
        <Icon
          strokeWidth={1.75}
          style={{ ...iconStyle, color: "var(--mono-utility)" }}
        />
      );
    }
    case "community-chest":
      return (
        <Package
          strokeWidth={1.5}
          style={{ ...iconStyle, color: "var(--mono-dark-blue)" }}
        />
      );
    case "chance":
      return (
        <span
          className="font-extrabold italic leading-none"
          style={{ color: "var(--mono-dark-blue)", fontSize: "1.9rem" }}
        >
          ?
        </span>
      );
    case "tax":
      return (
        <Diamond
          fill="currentColor"
          strokeWidth={1.5}
          style={{ ...iconStyle, color: "var(--mono-yellow)" }}
        />
      );
    case "go":
      return (
        <span
          className="text-lg font-bold"
          style={{ color: "var(--mono-red)" }}
        >
          GO
        </span>
      );
    case "jail":
      return (
        <span
          className="text-lg font-bold"
          style={{ color: "var(--mono-orange)" }}
        >
          JAIL
        </span>
      );
    case "free-parking":
      return (
        <span
          className="text-lg font-bold"
          style={{ color: "var(--mono-red)" }}
        >
          FREE
        </span>
      );
    case "go-to-jail":
      return (
        <span
          className="text-lg font-bold"
          style={{ color: "var(--mono-orange)" }}
        >
          JAIL→
        </span>
      );
    case "property":
      return null;
  }
}

function NameCell({
  space,
  mortgaged,
}: {
  space: Space;
  mortgaged: boolean;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-1.5 overflow-hidden"
      style={{ width: "150px" }}
    >
      <span
        className={`truncate text-xs font-semibold${
          mortgaged ? " line-through opacity-50" : ""
        }`}
      >
        {displayName(space)}
      </span>
    </div>
  );
}

function displayName(space: Space): string {
  switch (space.kind) {
    case "go":
      return "Go";
    case "jail":
      return "Jail";
    case "free-parking":
      return "Free Parking";
    case "go-to-jail":
      return "Go to Jail";
    case "chance":
      return "Chance";
    case "community-chest":
      return "Community Chest";
    case "tax":
      return space.name;
    case "railroad":
      return space.name;
    case "utility":
      return space.name;
    case "property":
      return space.name;
  }
}

function TokenStrip({
  tokens,
  order,
  pitch,
  activePlayerId,
}: {
  tokens: readonly Player[];
  order: readonly string[];
  pitch: number;
  activePlayerId: string;
}) {
  // Every player owns a fixed lane (their seat index), so a token sits at the
  // same x on every square — whether alone or sharing — and lines up with its
  // sliding overlay token. The pitch (lane spacing) is published by Squares
  // from the measured board width; when it's tight, tokens overlap and the
  // leftmost-on-top z-index turns the row into a left-to-right avatar pile.
  //
  // Tokens are positioned absolutely within the strip, so the strip stays
  // flex-1 to absorb leftover width and keep the cost cell pinned to the right
  // regardless of how the lanes fall. See `lanes.ts`.
  return (
    <div className="relative flex h-full min-w-0 flex-1 items-center overflow-hidden">
      {tokens.map((p) => {
        const seat = order.indexOf(p.id);
        return (
          <div
            key={p.id}
            className="absolute flex h-full items-center"
            style={{ left: laneOffset(seat, pitch), zIndex: order.length - seat }}
          >
            {p.inJail ? (
              <JailedToken player={p} active={p.id === activePlayerId} />
            ) : (
              <PlayerToken
                player={p}
                className="aspect-square h-[70%]"
                active={p.id === activePlayerId}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function JailedToken({
  player,
  active,
}: {
  player: Player;
  active: boolean;
}) {
  return (
    <div className="relative aspect-square h-[70%]">
      <PlayerToken player={player} className="h-full w-full" active={active} />
      {/* Four prison bars clipped to the token's circular outline. */}
      <div className="pointer-events-none absolute inset-0 flex justify-evenly overflow-hidden rounded-full">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{ width: "2px", backgroundColor: "var(--mono-frame)" }}
          />
        ))}
      </div>
      <JailTurnChip turns={player.jailTurns} />
    </div>
  );
}

function JailTurnChip({ turns }: { turns: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 -top-1 flex h-3 items-center justify-evenly rounded-full border"
      style={{
        backgroundColor: "var(--mono-frame)",
        borderColor: "var(--mono-ink)",
      }}
    >
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className="h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor:
              turns >= n
                ? "var(--mono-ink)"
                : "color-mix(in srgb, var(--mono-ink) 30%, transparent)",
          }}
        />
      ))}
    </div>
  );
}

function CostCell({
  space,
  mortgaged,
  rent,
}: {
  space: Space;
  mortgaged: boolean;
  rent: RentDisplay | null;
}) {
  const content = costContent(space, rent);
  // Squares without a cost (Go, Jail, Chance, etc.) render no cell at all
  // so the token strip can absorb the freed width — useful for crowded
  // squares like Jail where many tokens can pile up.
  if (!content) return null;
  return (
    <div
      className={`shrink-0 text-right font-mono text-xs font-semibold${
        mortgaged ? " opacity-50" : ""
      }`}
      style={{ minWidth: "60px" }}
    >
      {content}
    </div>
  );
}

function costContent(space: Space, rent: RentDisplay | null): ReactNode {
  if (rent) {
    if (rent.kind === "dollars") {
      return `$${rent.amount.toLocaleString("en-US")}`;
    }
    return (
      <span className="inline-flex items-center justify-end gap-0.5">
        <span>×{rent.multiplier}</span>
        <Dice5 className="h-3 w-3" strokeWidth={2} />
      </span>
    );
  }
  if (
    space.kind === "property" ||
    space.kind === "railroad" ||
    space.kind === "utility"
  ) {
    return `$${space.price.toLocaleString("en-US")}`;
  }
  if (space.kind === "tax") {
    return `$${space.amount.toLocaleString("en-US")}`;
  }
  return null;
}
