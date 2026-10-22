import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import type { Rank } from "../online/seat-bots";
import { RISK_THEME } from "./theme";

// The brass the insignia are struck in, from Risk's palette, so they read the same in the
// site-styled lobby as on the war room's panels.
const INKS = Object.fromEntries(Object.entries(RISK_THEME).filter(([name]) => name.startsWith("--rk-brass") || name === "--rk-ink")) as CSSProperties;

const BRASS = "var(--rk-brass)";
const BRIGHT = "var(--rk-brass-bright)";
const INK = "var(--rk-ink)";

// Every insignia is drawn in a 24-unit square, centred on (12, 12).
const STRIPE = 2.5;
const PITCH = 3.8;
const CHEVRON_RISE = 5.5;
const ROCKER_SAG = 3.5;

const chevron = (y: number) => `M2 ${y + CHEVRON_RISE}L12 ${y}L22 ${y + CHEVRON_RISE}V${y + CHEVRON_RISE + STRIPE}L12 ${y + STRIPE}L2 ${y + CHEVRON_RISE + STRIPE}Z`;
const rocker = (y: number) => `M2 ${y}Q12 ${y + 2 * ROCKER_SAG} 22 ${y}V${y + STRIPE}Q12 ${y + 2 * ROCKER_SAG + STRIPE} 2 ${y + STRIPE}Z`;

/** A five-pointed star of outer radius `r`. */
function star(cx: number, cy: number, r: number): string {
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.42;
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    return `${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`;
  });
  return `M${points.join("L")}Z`;
}

const lozenge = (cx: number, cy: number) => `M${cx} ${cy - 3}L${cx + 2.3} ${cy}L${cx} ${cy + 3}L${cx - 2.3} ${cy}Z`;

/** The enlisted ranks' stripes: chevrons point up, rockers curve under them and close the
 *  patch, and the senior ranks carry a device in the space between. */
function Stripes({ chevrons, rockers = 0, device, hollow }: { chevrons: number; rockers?: number; device?: "lozenge" | "star"; hollow?: boolean }) {
  const lastChevron = (chevrons - 1) * PITCH;
  const rockerTop = (i: number) => lastChevron + CHEVRON_RISE + i * PITCH;
  const bottom = rockers > 0 ? rockerTop(rockers - 1) + ROCKER_SAG + STRIPE : lastChevron + CHEVRON_RISE + STRIPE;
  const deviceY = (lastChevron + STRIPE + rockerTop(0) + ROCKER_SAG) / 2;
  return (
    <g transform={`translate(0 ${(12 - bottom / 2).toFixed(2)})`}>
      {Array.from({ length: chevrons }, (_, i) => (
        <path key={`c${i.toString()}`} d={chevron(i * PITCH)} fill={hollow ? "none" : BRASS} stroke={hollow ? BRASS : "none"} strokeWidth={1.3} strokeLinejoin="round" />
      ))}
      {Array.from({ length: rockers }, (_, i) => (
        <path key={`r${i.toString()}`} d={rocker(rockerTop(i))} fill={BRASS} />
      ))}
      {device === "lozenge" && <path d={lozenge(12, deviceY)} fill={BRIGHT} />}
      {device === "star" && <path d={star(12, deviceY, 3.4)} fill={BRIGHT} />}
    </g>
  );
}

/** The company officers' bars, side by side. */
function Bars({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <rect key={i} x={12 - 2.3 + (i - (count - 1) / 2) * 7.4} y={3} width={4.6} height={18} rx={0.9} fill={BRASS} />
      ))}
    </>
  );
}

const LEAF = "M12 2Q16.6 4 15 7.2Q19.2 9 16.6 12.2Q18.8 15.6 13 18.6L12.7 21.6H11.3L11 18.6Q5.2 15.6 7.4 12.2Q4.8 9 9 7.2Q7.4 4 12 2Z";

function Leaf({ transform }: { transform?: string }) {
  return (
    <g transform={transform}>
      <path d={LEAF} fill={BRASS} />
      <path d="M12 5V18" stroke={INK} strokeWidth={0.9} />
    </g>
  );
}

const WING = "M10.6 9.4Q6 5.2 1 4.6Q2.6 6.6 2 7.4Q4.2 8.4 3.2 9.6Q5.6 10.4 5 11.6Q7.4 12 7.2 13Q9.2 13.2 10.6 13.6Z";

function Wings() {
  return (
    <>
      <path d={WING} fill={BRASS} />
      <path d={WING} fill={BRASS} transform="matrix(-1 0 0 1 24 0)" />
      <path d="M12 6.2A1.9 1.9 0 1 1 11.99 6.2ZM9.9 10Q12 8.2 14.1 10L13.4 15.4L15 19.6H9L10.6 15.4Z" fill={BRASS} />
    </>
  );
}

/** The general officers' stars, gathered so each stays large: one, a pair, a pyramid, a square. */
const STARS: Record<number, [number, number, number][]> = {
  1: [[12, 12.6, 10]],
  2: [[6.3, 12.6, 6.2], [17.7, 12.6, 6.2]],
  3: [[12, 6.4, 5.6], [6.4, 16.8, 5.6], [17.6, 16.8, 5.6]],
  4: [[6.4, 6.6, 5.4], [17.6, 6.6, 5.4], [6.4, 17.6, 5.4], [17.6, 17.6, 5.4]],
};

function Stars({ count }: { count: number }) {
  return (
    <>
      {STARS[count].map(([x, y, r], i) => (
        <path key={i} d={star(x, y, r)} fill={BRIGHT} />
      ))}
    </>
  );
}

function Batons() {
  const leaves = [0.18, 0.36, 0.54, 0.72].map((t) => {
    const angle = Math.PI * (0.62 + t);
    return [12 + 10 * Math.cos(angle), 12.4 + 10 * Math.sin(angle), (angle * 180) / Math.PI] as const;
  });
  return (
    <>
      {[1, -1].map((side) => (
        <g key={side} transform={side === 1 ? undefined : "matrix(-1 0 0 1 24 0)"}>
          <path d="M10.6 22.2A10 10 0 0 1 4.6 4.8" fill="none" stroke={BRASS} strokeWidth={1.5} />
          {leaves.map(([x, y, deg], i) => (
            <ellipse key={i} cx={x} cy={y} rx={1.3} ry={2.6} transform={`rotate(${(deg - 90 + 25).toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})`} fill={BRASS} />
          ))}
        </g>
      ))}
      <path d="M6.5 17.5L17.5 6.5M6.5 6.5L17.5 17.5" stroke={BRIGHT} strokeWidth={3} strokeLinecap="round" />
    </>
  );
}

/** Each rank's insignia, our own drawing loosely in the tradition of real ones: stripes for the
 *  enlisted ranks, a warrant's bar, bars, leaves and wings for the officers, stars for the
 *  generals, and crossed batons in a wreath for the field marshal. */
const INSIGNIA: Record<Rank, ReactNode> = {
  Recruit: <Stripes chevrons={1} hollow />,
  Private: <Stripes chevrons={1} />,
  Corporal: <Stripes chevrons={2} />,
  Sergeant: <Stripes chevrons={3} />,
  "Staff Sergeant": <Stripes chevrons={3} rockers={1} />,
  "Sergeant First Class": <Stripes chevrons={3} rockers={2} />,
  "Master Sergeant": <Stripes chevrons={3} rockers={2} device="lozenge" />,
  "Sergeant Major": <Stripes chevrons={3} rockers={2} device="star" />,
  "Warrant Officer": (
    <>
      <rect x={2.5} y={8.5} width={19} height={7} rx={1.2} fill={BRASS} />
      <rect x={6} y={10.5} width={3} height={3} fill={INK} />
      <rect x={15} y={10.5} width={3} height={3} fill={INK} />
    </>
  ),
  "Second Lieutenant": <Bars count={1} />,
  "First Lieutenant": <Bars count={2} />,
  Captain: <Bars count={3} />,
  Major: <Leaf />,
  "Lieutenant Colonel": (
    <>
      <Leaf transform="translate(-3 3.6) scale(0.75)" />
      <Leaf transform="translate(9 3.6) scale(0.75)" />
    </>
  ),
  Colonel: <Wings />,
  "Brigadier General": <Stars count={1} />,
  "Major General": <Stars count={2} />,
  "Lieutenant General": <Stars count={3} />,
  General: <Stars count={4} />,
  "Field Marshal": <Batons />,
};

/** A rank's insignia at text size, the rank's name its accessible name and tooltip. Its title
 *  is spelled out beside it when asked: `"wide"` spells it only while the nearest `@container`
 *  is at least 16rem wide, so a row shows the insignia alone when narrow. */
export function RankInsignia({ rank, title = "never", className }: { rank: Rank; title?: "never" | "always" | "wide"; className?: string }) {
  const glyph = (
    <svg viewBox="0 0 24 24" width="1.25em" height="1.25em" aria-hidden className="shrink-0" style={INKS}>
      {INSIGNIA[rank]}
    </svg>
  );
  return (
    <span role="img" aria-label={rank} title={rank} className={cn("inline-flex min-w-0 items-center gap-[0.35em]", className)}>
      {glyph}
      {title !== "never" && <span className={cn("min-w-0", title === "wide" && "hidden @min-[16rem]:inline")}>{rank}</span>}
    </span>
  );
}
