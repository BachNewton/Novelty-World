import type { ReactNode } from "react";
import type { ForageKind } from "../../engine/regions";

/*
 * A little picture of each thing to pick, for the basket and the prompt to
 * pick it, drawn in the forage tokens so the icon and the thing in the
 * forest are the same colours.
 */

export const FORAGE_NAMES: Record<ForageKind, string> = {
  bilberry: "Bilberries",
  lingonberry: "Lingonberries",
  "wild-strawberry": "Wild strawberries",
  raspberry: "Raspberries",
  cloudberry: "Cloudberries",
  chanterelle: "Chanterelles",
  porcini: "Porcini",
  "funnel-chanterelle": "Funnel chanterelles",
  "fly-agaric": "Fly agaric (for brewing)",
};

const c = (name: string) => `var(--color-hearthwood-forage-${name})`;
const RIM = "var(--color-hearthwood-valley-ui-shade)";

/** Round berries in a cluster. */
function berries(fill: string, at: readonly (readonly [number, number, number])[]): ReactNode {
  return at.map(([x, y, r], i) => (
    <g key={i}>
      <circle cx={x} cy={y} r={r} fill={fill} stroke={RIM} strokeWidth={0.8} />
      <circle cx={x - r * 0.35} cy={y - r * 0.35} r={r * 0.28} fill="var(--color-hearthwood-valley-ui-ink)" opacity={0.55} />
    </g>
  ));
}

function leaf(x: number, y: number, rx: number, ry: number, turn: number, fill: string): ReactNode {
  return <ellipse cx={x} cy={y} rx={rx} ry={ry} transform={`rotate(${turn} ${x} ${y})`} fill={fill} stroke={RIM} strokeWidth={0.8} />;
}

const DRAWINGS: Record<ForageKind, ReactNode> = {
  bilberry: (
    <>
      {leaf(15, 6.5, 5, 2.6, -30, c("bilberry-leaf"))}
      {berries(c("bilberry"), [[8.5, 13, 4.2], [15.5, 14, 4.2], [11.5, 19.2, 4.2]])}
    </>
  ),
  lingonberry: (
    <>
      {leaf(7, 7, 4.6, 2.4, 25, c("lingonberry-leaf"))}
      {leaf(17, 7, 4.6, 2.4, -25, c("lingonberry-leaf"))}
      {berries(c("lingonberry"), [[8, 14, 3.2], [14, 13, 3.2], [11, 18.6, 3.2], [17, 18.2, 3.2], [5.8, 19.2, 2.8]])}
    </>
  ),
  "wild-strawberry": (
    <>
      <path d="M12 21.5 C6.5 17 5.5 12.5 7.5 10 C9.5 8.2 14.5 8.2 16.5 10 C18.5 12.5 17.5 17 12 21.5 Z" fill={c("strawberry")} stroke={RIM} strokeWidth={0.8} />
      {[[10, 13], [14, 13], [12, 16], [9.6, 16.4], [14.4, 16.4], [12, 19]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={0.6} fill={c("cut")} />
      ))}
      {leaf(9.2, 7.6, 3, 1.6, -30, c("strawberry-leaf"))}
      {leaf(14.8, 7.6, 3, 1.6, 30, c("strawberry-leaf"))}
      {leaf(12, 6.4, 1.5, 3, 0, c("strawberry-leaf"))}
    </>
  ),
  raspberry: (
    <>
      {leaf(12, 5.5, 4.5, 2.2, 0, c("raspberry-leaf"))}
      {berries(c("raspberry"), [[9, 11, 2.7], [15, 11, 2.7], [12, 10.4, 2.7], [8.5, 15.5, 2.7], [12, 15, 2.7], [15.5, 15.5, 2.7], [10, 19.4, 2.6], [14, 19.4, 2.6]])}
    </>
  ),
  cloudberry: (
    <>
      {leaf(6.5, 19, 4, 2, 30, c("cloudberry-leaf"))}
      {leaf(17.5, 19, 4, 2, -30, c("cloudberry-leaf"))}
      {berries(c("cloudberry"), [[9.5, 8.5, 2.9], [14.5, 8.5, 2.9], [12, 7, 2.6], [8.5, 13, 2.9], [12, 12.5, 2.9], [15.5, 13, 2.9], [12, 17, 2.9]])}
    </>
  ),
  chanterelle: (
    <path d="M3 7.5 C6 9.5 18 9.5 21 7.5 C20 11 15 12.5 13.6 14 L14.6 21.5 L9.4 21.5 L10.4 14 C9 12.5 4 11 3 7.5 Z" fill={c("chanterelle")} stroke={RIM} strokeWidth={0.9} strokeLinejoin="round" />
  ),
  porcini: (
    <>
      <path d="M8 13 C7.2 17 7 20 8.5 21.8 L15.5 21.8 C17 20 16.8 17 16 13 Z" fill={c("porcini-stem")} stroke={RIM} strokeWidth={0.9} />
      <path d="M2.5 13.5 C2.5 6 7 3 12 3 C17 3 21.5 6 21.5 13.5 Z" fill={c("porcini-cap")} stroke={RIM} strokeWidth={0.9} />
    </>
  ),
  "funnel-chanterelle": (
    <>
      <path d="M6.5 11 L7.6 21.5 M16.5 9 L15.4 21.5" stroke={c("funnel-stem")} strokeWidth={2.4} strokeLinecap="round" />
      <path d="M2.5 9.5 C4.5 11 9 11 10.5 9.5 C10 12.4 7.6 13 6.6 13 C5.4 13 3 12.4 2.5 9.5 Z" fill={c("funnel-cap")} stroke={RIM} strokeWidth={0.8} />
      <path d="M12.5 7.5 C14.5 9 19 9 21 7.5 C20.5 10.4 18 11 16.8 11 C15.6 11 13 10.4 12.5 7.5 Z" fill={c("funnel-cap")} stroke={RIM} strokeWidth={0.8} />
    </>
  ),
  "fly-agaric": (
    <>
      <path d="M10 13 L9.2 21.8 L14.8 21.8 L14 13 Z" fill={c("fly-agaric-stem")} stroke={RIM} strokeWidth={0.9} />
      <path d="M2.5 14 C2.5 6.5 7 3 12 3 C17 3 21.5 6.5 21.5 14 Z" fill={c("fly-agaric-cap")} stroke={RIM} strokeWidth={0.9} />
      {[[7, 10, 1.3], [12, 6.2, 1.4], [16.8, 9.6, 1.3], [10, 11.6, 1], [14.4, 12, 1], [5, 13, 0.8], [19, 13, 0.8]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={c("fly-agaric-spot")} />
      ))}
    </>
  ),
};

export function ForageIcon({ kind, className = "size-7" }: { kind: ForageKind; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={FORAGE_NAMES[kind]}>
      <title>{FORAGE_NAMES[kind]}</title>
      {DRAWINGS[kind]}
    </svg>
  );
}
