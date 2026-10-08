import { SPACES } from "../../../../data";
import type { GameState, Player, PropertyColor } from "../../../../types";

/** Resolve a player id (or null for the bank) to the name the model reads. */
export type NameOf = (id: string | null) => string;

export const COLOR_LABEL: Readonly<Record<PropertyColor, string>> = {
  brown: "Brown",
  "light-blue": "Light blue",
  pink: "Pink",
  orange: "Orange",
  red: "Red",
  yellow: "Yellow",
  green: "Green",
  "dark-blue": "Dark blue",
};

/** The color sets in board order. */
export const COLORS = Object.keys(COLOR_LABEL) as readonly PropertyColor[];

export function playerById(state: GameState, id: string): Player {
  const player = state.players.find((p) => p.id === id);
  if (!player) throw new Error(`no player ${id}`);
  return player;
}

/** "$1,500"-style money, with a minus sign for debt. */
export function money(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toLocaleString("en-US")}`;
}

/** Every square by its real name: the model reads "rolls to Chance", never
 *  "that space". */
export function squareName(position: number): string {
  const space = SPACES[position];
  switch (space.kind) {
    case "go":
      return "GO";
    case "jail":
      return "Jail (just visiting)";
    case "free-parking":
      return "Free Parking";
    case "go-to-jail":
      return "Go to Jail";
    case "chance":
      return "Chance";
    case "community-chest":
      return "Community Chest";
    default:
      return space.name;
  }
}

/** A square as the model refers to it: its number and name. */
export function squareLabel(position: number): string {
  return `#${String(position)} ${squareName(position)}`;
}

/** Names from the seat's point of view: itself as "you". */
export function seatNames(state: GameState, seat: string): NameOf {
  return (id) => {
    if (id === null) return "the bank";
    if (id === seat) return "you";
    return state.players.find((p) => p.id === id)?.name ?? id;
  };
}

/** Names as the whole table reads them. */
export function tableNames(state: GameState): NameOf {
  return (id) => (id === null ? "the bank" : (state.players.find((p) => p.id === id)?.name ?? id));
}
