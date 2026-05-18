import type { CSSProperties, ReactNode } from "react";
import { Diamond, Dice5, Droplets, Package, Train, Zap } from "lucide-react";
import { SPACES } from "../data";
import { rentAt, type RentDisplay } from "../logic";
import { PLAYER_COLOR_VAR, PROPERTY_COLOR_VAR } from "../theme";
import type { GameState, Player, Space } from "../types";
import { PlayerToken } from "./player-token";

interface Props {
  state: GameState;
  position: number;
}

export function SquareRow({ state, position }: Props) {
  const space = SPACES[position];
  const ownerId = state.ownership[position];
  const owner = ownerId
    ? state.players.find((p) => p.id === ownerId)
    : undefined;
  const mortgaged = state.mortgaged[position] ?? false;
  const houses = state.houses[position] ?? 0;
  const tokens = state.players.filter((p) => p.position === position);
  const rent = rentAt(state, position);

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
  const contextTint = owner
    ? `color-mix(in srgb, ${PLAYER_COLOR_VAR[owner.color]} 28%, var(--mono-card))`
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
        {mortgaged && <MortgageMarker />}
      </div>
      <div
        className="flex min-w-0 flex-1 items-center overflow-hidden px-2"
        style={{ background: contextTint, boxShadow: dividerShadow }}
      >
        <NameCell space={space} mortgaged={mortgaged} />
        <TokenStrip tokens={tokens} />
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
          style={{ ...iconStyle, color: "var(--mono-pink)" }}
        />
      );
    case "utility": {
      const Icon = space.name === "Electric Company" ? Zap : Droplets;
      return (
        <Icon
          strokeWidth={1.75}
          style={{ ...iconStyle, color: "var(--mono-green)" }}
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

function MortgageMarker() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line
        x1="0"
        y1="0"
        x2="100"
        y2="100"
        stroke="white"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="100"
        y1="0"
        x2="0"
        y2="100"
        stroke="white"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
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
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, var(--mono-frame) 0 1.5px, transparent 1.5px 4px)",
        }}
      />
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
