// Each heritage's flag, drawn by the heritage badges. The fills are each
// flag's official colors: they are data about the country, not UI theme
// colors, so they live here as literal values rather than as design-system
// tokens. Every heritage in heritages.ts needs an entry here.

import type { HeritageCode } from "./heritages";

export interface FlagShape {
  d: string;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface Flag {
  // In the flag's official proportions.
  viewBox: string;
  shapes: readonly FlagShape[];
}

function rect(x: number, y: number, w: number, h: number, fill: string): FlagShape {
  return { d: `M${x} ${y}h${w}v${h}h${-w}z`, fill };
}

const WELSH_RED = "#D30731";

export const FLAGS: Record<HeritageCode, Flag> = {
  FI: {
    viewBox: "0 0 18 11",
    shapes: [rect(0, 0, 18, 11, "#FFFFFF"), rect(5, 0, 3, 11, "#002F6C"), rect(0, 4, 18, 3, "#002F6C")],
  },
  IT: {
    viewBox: "0 0 3 2",
    shapes: [rect(0, 0, 1, 2, "#009246"), rect(1, 0, 1, 2, "#F1F2F1"), rect(2, 0, 1, 2, "#CE2B37")],
  },
  // The whole island, Northern Ireland included.
  IE: {
    viewBox: "0 0 6 3",
    shapes: [rect(0, 0, 2, 3, "#169B62"), rect(2, 0, 2, 3, "#FFFFFF"), rect(4, 0, 2, 3, "#FF883E")],
  },
  "GB-ENG": {
    viewBox: "0 0 50 30",
    shapes: [rect(0, 0, 50, 30, "#FFFFFF"), rect(22, 0, 6, 30, "#CE1124"), rect(0, 12, 50, 6, "#CE1124")],
  },
  "GB-SCT": {
    viewBox: "0 0 5 3",
    shapes: [
      rect(0, 0, 5, 3, "#005EB8"),
      { d: "M0 0L5 3M5 0L0 3", fill: "none", stroke: "#FFFFFF", strokeWidth: 0.6 },
    ],
  },
  "GB-WLS": {
    viewBox: "0 0 50 30",
    // A simplified dragon passant: it only has to read at medallion size.
    shapes: [
      rect(0, 0, 50, 15, "#FFFFFF"),
      rect(0, 15, 50, 15, "#00B140"),
      { d: "M19 12.5L20 5L23 7.5L25 3.5L27 7L30 5L29 12.5Z", fill: WELSH_RED },
      { d: "M15 13C20 11 29 11 34 13C35 16 34 19 31 19L18 19C15 19 14 16 15 13Z", fill: WELSH_RED },
      { d: "M15 14L13 10L11 8L7 8.5L6 9.5L9 10L8 11L11 11L13 15Z", fill: WELSH_RED },
      { d: "M11 8L12.5 6L12.5 8.5Z", fill: WELSH_RED },
      { d: "M16 15L12 17L10.5 16L11 18L13 18.5L17 17.5Z", fill: WELSH_RED },
      { d: "M17 18L16 25L19 25L19.5 18Z", fill: WELSH_RED },
      { d: "M29 18L30 25L33 25L32 18Z", fill: WELSH_RED },
      { d: "M33 15C38 15 41 12 40 8C39.5 6 37 6 37 8", fill: "none", stroke: WELSH_RED, strokeWidth: 1.6 },
      { d: "M36 9.5L35.5 6.5L38.5 7.8Z", fill: WELSH_RED },
    ],
  },
  DE: {
    viewBox: "0 0 5 3",
    shapes: [rect(0, 0, 5, 1, "#000000"), rect(0, 1, 5, 1, "#DD0000"), rect(0, 2, 5, 1, "#FFCE00")],
  },
  SE: {
    viewBox: "0 0 16 10",
    shapes: [rect(0, 0, 16, 10, "#006AA7"), rect(5, 0, 2, 10, "#FECC02"), rect(0, 4, 16, 2, "#FECC02")],
  },
  PL: {
    viewBox: "0 0 8 5",
    shapes: [rect(0, 0, 8, 5, "#FFFFFF"), rect(0, 2.5, 8, 2.5, "#DC143C")],
  },
  NL: {
    viewBox: "0 0 9 6",
    shapes: [rect(0, 0, 9, 2, "#AE1C28"), rect(0, 2, 9, 2, "#FFFFFF"), rect(0, 4, 9, 2, "#21468B")],
  },
  FR: {
    viewBox: "0 0 3 2",
    shapes: [rect(0, 0, 1, 2, "#002654"), rect(1, 0, 1, 2, "#FFFFFF"), rect(2, 0, 1, 2, "#CE1126")],
  },
  NO: {
    viewBox: "0 0 22 16",
    shapes: [
      rect(0, 0, 22, 16, "#BA0C2F"),
      rect(6, 0, 4, 16, "#FFFFFF"),
      rect(0, 6, 22, 4, "#FFFFFF"),
      rect(7, 0, 2, 16, "#00205B"),
      rect(0, 7, 22, 2, "#00205B"),
    ],
  },
  HU: {
    viewBox: "0 0 6 3",
    shapes: [rect(0, 0, 6, 1, "#CD2A3E"), rect(0, 1, 6, 1, "#FFFFFF"), rect(0, 2, 6, 1, "#436F4D")],
  },
  UA: {
    viewBox: "0 0 3 2",
    shapes: [rect(0, 0, 3, 1, "#0057B7"), rect(0, 1, 3, 1, "#FFD700")],
  },
  LB: {
    viewBox: "0 0 24 16",
    // A simplified cedar: it only has to read at medallion size.
    shapes: [
      rect(0, 0, 24, 16, "#EE161F"),
      rect(0, 4, 24, 8, "#FFFFFF"),
      {
        d: "M12 4.2L14 6.4H13.2L15.2 8.6H14.2L16.4 11L12.6 10.6V11.8H11.4V10.6L7.6 11L9.8 8.6H8.8L10.8 6.4H10Z",
        fill: "#00A651",
      },
    ],
  },
};
