"use client";

import type { CSSProperties, ReactNode } from "react";
import { Diamond, Dice5, Droplets, Package, Train, Zap } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { SPACES } from "../data";
import { rentAt, type RentDisplay } from "../logic";
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
  const ownerColor = useMonopolyStore((s) => {
    const id = s.state.ownership[position];
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
  // While a token is sliding to this square on the overlay, drop it here so it
  // isn't drawn twice. The position-keyed selector keeps every other row's
  // result at null, so only this row re-renders when the animation flips.
  const hiddenId = useTokenAnim((s) => (s.hidePos === position ? s.hideId : null));
  const visibleTokens = hiddenId
    ? tokens.filter((p) => p.id !== hiddenId)
    : tokens;
  const rent = useMonopolyStore(useShallow((s) => rentAt(s.state, position)));

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

  return (
    <div
      className="flex h-11 shrink-0 overflow-hidden"
      style={{ color: "var(--mono-ink)" }}
    >
      <div
        className="relative flex shrink-0 items-center justify-center"
        style={leftStyle}
      >
        {isProperty ? (
          <Development houses={houses} />
        ) : (
          <SpaceIcon space={space} />
        )}
        {mortgaged && <MortgageMarker strokeWidth={2} />}
      </div>
      <div
        className="flex min-w-0 flex-1 items-center overflow-hidden px-2"
        style={{ background: contextTint, boxShadow: dividerShadow }}
      >
        <NameCell space={space} mortgaged={mortgaged} />
        <TokenStrip tokens={visibleTokens} />
        <CostCell space={space} mortgaged={mortgaged} rent={rent} />
      </div>
    </div>
  );
}

function Development({ houses }: { houses: number }) {
  if (houses === 0) return null;
  if (houses === 5) {
    return (
      <div className="flex w-full items-center justify-center">
        <div
          className="rounded-sm border-2 border-black"
          style={{
            width: "36px",
            height: "24px",
            backgroundColor: "var(--mono-red)",
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
                backgroundColor: "var(--mono-green)",
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

function TokenStrip({ tokens }: { tokens: readonly Player[] }) {
  const n = tokens.length;
  // Each token occupies a "slot" whose width is the horizontal pitch
  // between consecutive tokens. The token itself is always 1.925rem wide
  // (70% of the 2.75rem row); when slots are narrower than that, each
  // token bleeds rightward into the next slot and the leftmost-on-top
  // z-index turns the row into a left-to-right avatar pile.
  //
  // The pitch is (strip width - token width) / (n - 1), so the rightmost
  // token's right edge lands at the strip's right edge — the whole pile
  // fits no matter how crowded the row gets. Capped at 2.3rem (token
  // width + 0.375rem of breathing room) so tokens don't spread apart
  // arbitrarily when there's slack but still get visible gaps when room
  // allows. Always rendered (even empty) so the strip absorbs leftover
  // width and keeps the cost cell pinned to the right.
  const slotWidth =
    n <= 1
      ? "1.925rem"
      : `clamp(0px, calc((100% - 1.925rem) / ${n - 1}), 2.3rem)`;
  return (
    <div className="flex h-full min-w-0 flex-1 items-center overflow-hidden">
      {tokens.map((p, i) => (
        <div
          key={p.id}
          className="relative flex h-full items-center"
          style={{ width: slotWidth, zIndex: n - i }}
        >
          {p.inJail ? (
            <JailedToken player={p} />
          ) : (
            <PlayerToken player={p} className="aspect-square h-[70%]" />
          )}
        </div>
      ))}
    </div>
  );
}

function JailedToken({ player }: { player: Player }) {
  return (
    <div className="relative aspect-square h-[70%]">
      <PlayerToken player={player} className="h-full w-full" />
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
