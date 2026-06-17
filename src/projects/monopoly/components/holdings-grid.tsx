import { Droplets, KeyRound, Train, Zap, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { SPACES } from "../data";
import { PROPERTY_COLOR_VAR } from "../theme";
import type { Player, PropertyColor } from "../types";
import { MortgageMarker } from "./mortgage-marker";
import { PlayerToken } from "./player-token";

type ChipSlot =
  | { kind: "property"; position: number; color: PropertyColor }
  | { kind: "railroad"; position: number }
  | { kind: "utility"; position: number; icon: LucideIcon }
  | { kind: "gojf"; source: "chance" | "communityChest" };

/** A slot that maps to a board position — every `ChipSlot` except GOJF, which
 *  is a held card with no square. The unit a `Chip` actually renders. */
type BoardChipSlot = Exclude<ChipSlot, { kind: "gojf" }>;

/** Per-chip appearance, resolved by each `ChipSet` caller for its own meaning of
 *  "filled": owned-by-this-row (header) vs is-the-auctioned-lot (auction). */
interface ChipState {
  owned: boolean;
  mortgaged: boolean;
  visible: boolean;
  emphasized: boolean;
}

const COLOR_ORDER: readonly PropertyColor[] = [
  "brown",
  "light-blue",
  "pink",
  "orange",
  "red",
  "yellow",
  "green",
  "dark-blue",
];

/** Fixed slot order: properties grouped by color set (board order within each
 *  set), then railroads, utilities, and the two GOJF cards. Every player row
 *  renders every slot — owned slots fill, unowned slots show their outline
 *  only (or hold invisible space). Identical column positions across rows let
 *  players scan vertically to see who controls a given set. */
const ALL_SLOTS: readonly ChipSlot[] = (() => {
  const byColor: Record<PropertyColor, ChipSlot[]> = {
    brown: [],
    "light-blue": [],
    pink: [],
    orange: [],
    red: [],
    yellow: [],
    green: [],
    "dark-blue": [],
  };
  const railroads: ChipSlot[] = [];
  const utilities: ChipSlot[] = [];
  SPACES.forEach((space, position) => {
    if (space.kind === "property") {
      byColor[space.color].push({
        kind: "property",
        position,
        color: space.color,
      });
    } else if (space.kind === "railroad") {
      railroads.push({ kind: "railroad", position });
    } else if (space.kind === "utility") {
      utilities.push({
        kind: "utility",
        position,
        icon: space.name === "Electric Company" ? Zap : Droplets,
      });
    }
  });
  return [
    ...COLOR_ORDER.flatMap((c) => byColor[c]),
    ...railroads,
    ...utilities,
    { kind: "gojf", source: "chance" },
    { kind: "gojf", source: "communityChest" },
  ];
})();

export interface SlotGroup {
  key: string;
  slots: readonly ChipSlot[];
}

/** Pre-chunked slot list: contiguous slots that share a set key form one
 *  flush sub-strip with no internal gap. */
export const SLOT_GROUPS: readonly SlotGroup[] = (() => {
  const groups: { key: string; slots: ChipSlot[] }[] = [];
  let current: { key: string; slots: ChipSlot[] } | null = null;
  for (const slot of ALL_SLOTS) {
    const key = slotSetKey(slot);
    if (!current || current.key !== key) {
      current = { key, slots: [] };
      groups.push(current);
    }
    current.slots.push(slot);
  }
  return groups;
})();

/** A point-in-time view of who owns what — the board's `ownership` /
 *  `mortgaged` / `jailFreeCards`, or a projected (e.g. post-trade) version of
 *  them. */
export interface OwnershipView {
  ownership: Readonly<Record<number, string>>;
  mortgaged: Readonly<Record<number, boolean>>;
  jailFreeCards: Readonly<{ chance?: string; communityChest?: string }>;
}

interface HoldingsGridProps extends OwnershipView {
  /** Rows to render, in order. */
  players: readonly Player[];
  /** Set-grouped columns to render. The header passes every group; the trade
   *  panel passes only the groups a trade touches. */
  groups: readonly SlotGroup[];
  /** The token-side cell for each row (name + cash, etc.). */
  renderMeta: (player: Player) => ReactNode;
  /** Board positions whose owner changed in this view, drawn with a bright
   *  frame so the eye lands on what moved (trade panel's after-view). */
  changed?: ReadonlySet<number>;
  /** Width reserved for the meta column. Wider in the trade panel to fit the
   *  resulting balance + mortgage-interest note. */
  metaMinWidth?: string;
  /** Whose turn it is — that player's row token pulses. The header passes it;
   *  the trade panel's after-view leaves it unset (no active emphasis there). */
  activePlayerId?: string;
}

/** The set-grouped ownership grid shared by the persistent header (every
 *  player, every set, current ownership) and the trade panel's after-view
 *  (named parties, affected sets, projected ownership). Rendering the result
 *  of a trade in the same grammar players already read in the header lets them
 *  diff "before" (header) against "after" (panel) at a glance. */
export function HoldingsGrid({
  players,
  groups,
  ownership,
  mortgaged,
  jailFreeCards,
  renderMeta,
  changed,
  metaMinWidth,
  activePlayerId,
}: HoldingsGridProps) {
  return (
    // Rows are flush — no gap between them — with the inset bottom border as the
    // divider, exactly like the header. The wrapper keeps them flush even inside
    // a gapped parent like the trade panel's scroll column.
    <div className="flex flex-col">
      {players.map((player) => (
        <div
          key={player.id}
          className="flex min-h-11 shrink-0 items-center gap-2 px-1.5 py-1"
          style={ROW_STYLE}
        >
          <PlayerToken
            player={player}
            className="h-7 w-7"
            active={player.id === activePlayerId}
          />
          <div
            className="flex shrink-0 flex-col leading-tight"
            style={{ minWidth: metaMinWidth ?? "3.5rem" }}
          >
            {renderMeta(player)}
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {groups.map((group) => {
              // GOJF is special-cased: the card has no notion of a "set" the
              // way properties / rails / utilities do, so we just render an
              // orange key for each card the player actually holds.
              if (group.key === "gojf") {
                const ownedKeys = group.slots.filter((slot) =>
                  isOwnedBy(slot, player.id, ownership, jailFreeCards),
                );
                if (ownedKeys.length === 0) return null;
                return (
                  <div key={group.key} className="flex">
                    {ownedKeys.map((slot) => (
                      <GojfIcon key={slotKey(slot)} />
                    ))}
                  </div>
                );
              }
              // Property / railroad / utility sets: only render the set's chips
              // if the player owns at least one member; otherwise the slots
              // stay invisible but still hold their physical space so each
              // column lines up across player rows.
              const setRelevant = group.slots.some((slot) =>
                isOwnedBy(slot, player.id, ownership, jailFreeCards),
              );
              return (
                <ChipSet
                  key={group.key}
                  slots={group.slots}
                  chipState={(slot) => ({
                    owned: isOwnedBy(slot, player.id, ownership, jailFreeCards),
                    mortgaged: mortgaged[slot.position] ?? false,
                    visible: setRelevant,
                    emphasized: changed?.has(slot.position) ?? false,
                  })}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const ROW_STYLE: CSSProperties = {
  backgroundColor: "var(--mono-board)",
  color: "var(--mono-ink)",
  boxShadow: "inset 0 -1px 0 var(--mono-frame)",
};

function slotSetKey(slot: ChipSlot): string {
  if (slot.kind === "property") return `color:${slot.color}`;
  return slot.kind;
}

function slotKey(slot: ChipSlot): string {
  return slot.kind === "gojf" ? `gojf:${slot.source}` : `pos:${slot.position}`;
}

function isOwnedBy(
  slot: ChipSlot,
  playerId: string,
  ownership: Readonly<Record<number, string>>,
  jailFreeCards: Readonly<{ chance?: string; communityChest?: string }>,
): boolean {
  if (slot.kind === "gojf") {
    return jailFreeCards[slot.source] === playerId;
  }
  return ownership[slot.position] === playerId;
}

function Chip({
  slot,
  owned,
  mortgaged,
  visible,
  emphasized,
}: {
  slot: BoardChipSlot;
  owned: boolean;
  mortgaged: boolean;
  visible: boolean;
  emphasized: boolean;
}) {
  const baseClasses =
    "relative flex h-4 w-4 shrink-0 items-center justify-center rounded-sm";

  if (!visible) return <div className={baseClasses} />;

  // An owned chip that changed hands in this view gets a thicker frame that
  // pulses between white and its normal border, so the eye is drawn to what
  // moved even on the lighter chips a static white ring is easy to lose on.
  // It's an inset border, so it never overlaps the flush neighbours in its set
  // the way an outer ring would.
  const ownedFrame: CSSProperties = emphasized
    ? {
        boxShadow: "inset 0 0 0 1.5px var(--mono-ink)",
        animation: "mono-chip-pulse 1.1s ease-in-out infinite",
      }
    : { boxShadow: "inset 0 0 0 1px var(--mono-frame)" };

  if (slot.kind === "property") {
    const color = PROPERTY_COLOR_VAR[slot.color];
    return (
      <div
        className={baseClasses}
        style={
          owned
            ? { backgroundColor: color, ...ownedFrame }
            : { boxShadow: `inset 0 0 0 1px ${color}` }
        }
      >
        {owned && mortgaged && <MortgageMarker strokeWidth={1.5} />}
      </div>
    );
  }

  const { Icon, chipColor, iconColor } = iconChipPalette(slot);
  return (
    <div
      className={baseClasses}
      style={
        owned
          ? { backgroundColor: chipColor, ...ownedFrame }
          : { boxShadow: `inset 0 0 0 1px ${chipColor}` }
      }
    >
      <Icon
        strokeWidth={2}
        style={{
          width: "70%",
          height: "70%",
          color: owned ? iconColor : "rgba(255, 255, 255, 0.35)",
        }}
      />
      {owned && mortgaged && <MortgageMarker strokeWidth={1.5} />}
    </div>
  );
}

/** One set rendered as a flush strip of chips — the shared unit behind the
 *  header row's per-set group and the auction panel's lot-in-context strip.
 *  `ChipSet` owns the layout and iteration; each chip's appearance is resolved
 *  per slot by `chipState`, so the same strip serves "this player's holdings in
 *  the set" (header) and "this lot within its set" (auction). GOJF slots carry
 *  no board square, so they're skipped — the header renders held cards through
 *  `GojfIcon` instead. */
export function ChipSet({
  slots,
  chipState,
}: {
  slots: readonly ChipSlot[];
  chipState: (slot: BoardChipSlot) => ChipState;
}) {
  return (
    <div className="flex">
      {slots.map((slot) => {
        if (slot.kind === "gojf") return null;
        const { owned, mortgaged, visible, emphasized } = chipState(slot);
        return (
          <Chip
            key={slotKey(slot)}
            slot={slot}
            owned={owned}
            mortgaged={mortgaged}
            visible={visible}
            emphasized={emphasized}
          />
        );
      })}
    </div>
  );
}

/** One property shown in its set context — the set strip with this position
 *  filled (the header's "owned" look) and its set-mates as faint outlines, so
 *  the eye reads it by color + position-in-set ("orange, first of three"). A
 *  thin wrapper over `ChipSet` for the recurring "name one property" surfaces
 *  outside the header: the buy prompt, the auction lot, and the event log. This
 *  is identity, not ownership — it says nothing about who owns the set-mates.
 *  Renders nothing for a non-ownable position. */
export function SetContextChips({
  position,
  mortgaged = false,
}: {
  position: number;
  mortgaged?: boolean;
}) {
  const group = SLOT_GROUPS.find((g) =>
    g.slots.some((slot) => slot.kind !== "gojf" && slot.position === position),
  );
  if (!group) return null;
  return (
    <ChipSet
      slots={group.slots}
      chipState={(slot) => {
        const isLot = slot.position === position;
        return {
          owned: isLot,
          mortgaged: isLot && mortgaged,
          visible: true,
          emphasized: false,
        };
      }}
    />
  );
}

function GojfIcon() {
  return (
    <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
      <KeyRound
        strokeWidth={2}
        style={{
          width: "70%",
          height: "70%",
          color: "var(--mono-orange)",
        }}
      />
    </div>
  );
}

function iconChipPalette(
  slot: Extract<ChipSlot, { kind: "railroad" | "utility" }>,
): { Icon: LucideIcon; chipColor: string; iconColor: string } {
  if (slot.kind === "railroad") {
    return {
      Icon: Train,
      chipColor: "var(--mono-rail)",
      iconColor: "white",
    };
  }
  return {
    Icon: slot.icon,
    chipColor: "var(--mono-utility)",
    iconColor: "white",
  };
}
