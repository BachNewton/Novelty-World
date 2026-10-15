import type { Seat } from "../contract";

/*
 * How each seat shows: a colour and, for players who can't tell colours apart, a shape of its
 * own (on its army markers, its name and its hand) and a hatching on its territories. A seat is
 * named by its colour, so every cue says the same thing.
 */

export type SeatShape = "circle" | "square" | "triangle" | "diamond" | "hexagon" | "star";

export interface SeatLook {
  name: string;
  shape: SeatShape;
  /** The hatching over its territories, from `<pattern>`s the board defines. */
  hatch: "none" | "diagonal" | "dots" | "horizontal" | "cross" | "vertical";
}

export const SEAT_LOOKS: readonly SeatLook[] = [
  { name: "Crimson", shape: "circle", hatch: "none" },
  { name: "Cobalt", shape: "square", hatch: "diagonal" },
  { name: "Ochre", shape: "triangle", hatch: "dots" },
  { name: "Forest", shape: "diamond", hatch: "horizontal" },
  { name: "Violet", shape: "hexagon", hatch: "cross" },
  { name: "Iron", shape: "star", hatch: "vertical" },
];

export function seatName(seat: Seat): string {
  return SEAT_LOOKS[seat].name;
}

/** A seat's colour token, as a CSS value. */
export function seatColour(seat: Seat): string {
  return `var(--rk-seat-${seat})`;
}

/** A shape's outline as an SVG path, centred on (0, 0) and filling a box `size` across, each
 *  drawn to look about as large as the others. */
export function shapePath(shape: SeatShape, size: number): string {
  const r = size / 2;
  const polygon = (sides: number, radius: number, turn: number) =>
    Array.from({ length: sides }, (_, i) => {
      const angle = turn + (i * 2 * Math.PI) / sides;
      return `${i === 0 ? "M" : "L"}${(radius * Math.cos(angle)).toFixed(2)} ${(radius * Math.sin(angle)).toFixed(2)}`;
    }).join("") + "Z";
  switch (shape) {
    case "circle":
      return `M${-r} 0a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    case "square":
      return polygon(4, r * 1.2, Math.PI / 4);
    case "triangle":
      return polygon(3, r * 1.32, -Math.PI / 2);
    case "diamond":
      return polygon(4, r * 1.22, 0);
    case "hexagon":
      return polygon(6, r * 1.08, 0);
    case "star": {
      const points = Array.from({ length: 10 }, (_, i) => {
        const radius = i % 2 === 0 ? r * 1.3 : r * 0.78;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        return `${i === 0 ? "M" : "L"}${(radius * Math.cos(angle)).toFixed(2)} ${(radius * Math.sin(angle)).toFixed(2)}`;
      });
      return points.join("") + "Z";
    }
  }
}
