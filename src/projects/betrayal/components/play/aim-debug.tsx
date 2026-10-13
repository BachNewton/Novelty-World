"use client";

import { useEffect, useState } from "react";
import type { AimReading, HouseScene } from "../../art/house-scene";
import type { ReticleWeighing } from "../../input/navigate";

/*
 * The controller's aim, drawn over the house (`?aim=debug`, or the backquote
 * key): the reticle at the centre, every target's catch area and outline as
 * the reticle's rule weighs them, the target it would catch fresh and the one
 * focused, the held one's release ring, each target's numbers, and one line
 * saying why. Everything comes from the scene's own reading of the rule, so
 * it can't drift from what the reticle does. Off, it reads nothing.
 *
 * Colours: ink for the reticle and the focused target, door brass for the
 * fresh catch, muted for the rest; none of the house's meaning colours.
 */

/** The key that turns the view on and off: free in the control map, and a debug console's key by habit. */
const TOGGLE_KEY = "Backquote";
/** The candidates listed, the best first. */
const ROWS = 8;
/** Fewer on a phone, where the panel shares the screen with the house. */
const PHONE_ROWS = 2;

/** Anything the screen names by id: a choice's label, a thing's name. */
export interface Named {
  id: string;
  label?: string;
  name?: string;
}

const asked = () => new URLSearchParams(window.location.search).get("aim") === "debug";
const typing = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;

const px = (value: number) => `${Math.round(value)} px`;
const scoreText = (score: number | null) => (score === null ? "out" : score.toFixed(2));

/** The best first: in reach by score, then the rest by distance. */
function ranked(weighed: readonly ReticleWeighing[]): ReticleWeighing[] {
  return [...weighed].sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity) || a.distance - b.distance);
}

/** The aim's state in plain words. */
export function aimStory(reading: AimReading, nameOf: (id: string) => string): string {
  if (!reading.active) return "Reticle off: it selects only with a controller. Touch the pad to aim.";
  if (reading.pinned !== null) return `Holding ${nameOf(reading.pinned)}: a d-pad jump went to it, held until the left stick pans`;
  const { picked, fresh, dismissed } = reading;
  if (picked !== null && picked === dismissed) return `Passing over ${nameOf(picked)}: backed out of with B, skipped until the centre leaves it`;
  if (picked === null) {
    const nearest = ranked(reading.weighed)[0] as ReticleWeighing | undefined;
    if (!nearest) return "Nothing: no target on the screen";
    return `Nothing: no target within reach (nearest ${nameOf(nearest.target.id)}, ${px(nearest.distance)} from the centre, beyond its ${px(nearest.reach)} area)`;
  }
  const chosen = reading.weighed.find((weighing) => weighing.target.id === picked);
  if (!chosen) throw new Error(`The reticle picked ${picked}, which it never weighed`);
  const name = nameOf(picked);
  if (picked === fresh) {
    const why = chosen.over ? "the centre is over its outline" : `${px(chosen.distance)} into its ${px(chosen.reach)} area`;
    const rivals = reading.weighed.filter((weighing) => weighing.score !== null).length - 1;
    return `Caught ${name}: ${why}${rivals > 0 ? `, nearest for its size of ${rivals + 1} in reach` : ""} (score ${scoreText(chosen.score)})`;
  }
  if (fresh === null) {
    return `Holding ${name}: centre past its ${px(chosen.reach)} area but inside its release ring (${Math.round(chosen.distance)} of ${px(chosen.holdsTo)})`;
  }
  const rival = reading.weighed.find((weighing) => weighing.target.id === fresh);
  const stretch = chosen.holdsTo / chosen.reach;
  const unheld = chosen.score === null ? null : chosen.score * stretch;
  return `Holding ${name} over ${nameOf(fresh)}: held, it counts ${Number(stretch.toFixed(2))}× nearer (score ${scoreText(chosen.score)}, ${scoreText(unheld)} unheld, against ${scoreText(rival?.score ?? null)})`;
}

export function AimDebug({ scene, named }: { scene: HouseScene; named: readonly Named[] }) {
  const [on, setOn] = useState(asked);
  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if (event.code !== TOGGLE_KEY || event.repeat || typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      setOn((was) => !was);
    };
    window.addEventListener("keydown", toggle);
    return () => {
      window.removeEventListener("keydown", toggle);
    };
  }, []);
  return on ? <AimView scene={scene} named={named} /> : null;
}

function AimView({ scene, named }: { scene: HouseScene; named: readonly Named[] }) {
  const [reading, setReading] = useState<AimReading | null>(null);
  // A live view: read once a frame, as the reticle itself is.
  useEffect(() => {
    let frame = requestAnimationFrame(function read() {
      setReading(scene.aimReading());
      frame = requestAnimationFrame(read);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [scene]);
  if (!reading) return null;

  const names = new Map(named.map((item) => [item.id, item.label ?? item.name ?? item.id]));
  const nameOf = (id: string) => names.get(id) ?? id;
  const focused = reading.pinned ?? reading.focused;
  const { centre } = reading;
  const marked = (id: string) => id === focused || id === reading.fresh;
  const stroke = (id: string) => (id === focused ? "stroke-(--bt-ink)" : id === reading.fresh ? "stroke-(--bt-door)" : "stroke-(--bt-muted)");
  const fill = (id: string) => (id === focused ? "fill-(--bt-ink)" : id === reading.fresh ? "fill-(--bt-door)" : "fill-(--bt-muted)");
  const text = (id: string) => (id === focused ? "text-(--bt-ink)" : id === reading.fresh ? "text-(--bt-door)" : "text-(--bt-muted)");
  const picked = reading.weighed.find((weighing) => weighing.target.id === (reading.pinned ?? reading.picked));
  // Each target keeps its number while it shows, so the house and the table can be matched up.
  const numbers = new Map(reading.weighed.map((weighing, index) => [weighing.target.id, index + 1]));

  return (
    <div aria-label="Aim debug" className="pointer-events-none absolute inset-0 z-10">
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        {reading.weighed.map(({ target, reach, holdsTo, held }) => (
          <g key={target.id} className={stroke(target.id)} fill="none">
            <polygon points={target.outline.map((point) => `${point.x},${point.y}`).join(" ")} strokeWidth={1} strokeOpacity={0.5} />
            <circle cx={target.anchor.x} cy={target.anchor.y} r={reach} strokeWidth={marked(target.id) ? 2 : 1} strokeDasharray={marked(target.id) ? undefined : "3 5"} />
            {held && <circle cx={target.anchor.x} cy={target.anchor.y} r={holdsTo} strokeWidth={1.5} strokeDasharray="10 6" />}
            <circle cx={target.anchor.x} cy={target.anchor.y} r={3} className={fill(target.id)} />
            <text
              x={target.anchor.x + 6}
              y={target.anchor.y - 6}
              className={`${fill(target.id)} stroke-(--bt-bg) font-mono text-[10px] sm:text-xs`}
              strokeWidth={3}
              paintOrder="stroke"
            >
              #{numbers.get(target.id)} · {px(reach)}
              {held ? ` · release ${px(holdsTo)}` : ""}
            </text>
          </g>
        ))}
        {picked && <line x1={centre.x} y1={centre.y} x2={picked.target.anchor.x} y2={picked.target.anchor.y} className="stroke-(--bt-ink)" strokeWidth={1} />}
        <g className="stroke-(--bt-ink)" strokeWidth={1.5}>
          <circle cx={centre.x} cy={centre.y} r={reading.snap} fill="none" strokeOpacity={0.4} strokeDasharray="2 4" />
          <line x1={centre.x - 10} y1={centre.y} x2={centre.x + 10} y2={centre.y} />
          <line x1={centre.x} y1={centre.y - 10} x2={centre.x} y2={centre.y + 10} />
        </g>
      </svg>
      <section className="absolute top-40 left-2 flex w-[min(30rem,calc(100%-1rem))] flex-col gap-1 rounded border border-(--bt-line) bg-(--bt-panel)/90 p-2 font-mono text-[10px] leading-tight text-(--bt-ink) sm:top-16 sm:text-xs">
        <p data-aim-state className="font-sans text-xs font-semibold sm:text-sm">
          {aimStory(reading, nameOf)}
        </p>
        <p className="hidden text-(--bt-muted) sm:block">
          <span className="text-(--bt-ink)">focused</span> · <span className="text-(--bt-door)">fresh catch</span> · dotted ring: the {px(reading.snap)} least snap · ` hides
        </p>
        <table>
          <thead className="text-left text-(--bt-muted)">
            <tr>
              <th className="w-full font-normal">target</th>
              <th className="px-1 text-right font-normal">dist</th>
              <th className="px-1 text-right font-normal">area</th>
              <th className="px-1 text-right font-normal">÷</th>
              <th className="pl-1 text-right font-normal">score</th>
            </tr>
          </thead>
          <tbody>
            {ranked(reading.weighed)
              .slice(0, ROWS)
              .map(({ target, distance, reach, holdsTo, held, over, scale, score }, row) => (
                <tr key={target.id} className={`${text(target.id)} ${row >= PHONE_ROWS ? "hidden sm:table-row" : ""}`}>
                  <td className="py-px">
                    #{numbers.get(target.id)} {nameOf(target.id)}
                    {over ? " ◉" : ""}
                  </td>
                  <td className="px-1 text-right">{Math.round(distance)}</td>
                  <td className="px-1 text-right whitespace-nowrap">
                    {Math.round(reach)}
                    {held ? `→${Math.round(holdsTo)}` : ""}
                  </td>
                  <td className="px-1 text-right">{Math.round(scale)}</td>
                  <td className="pl-1 text-right">{scoreText(score)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <p className="hidden text-(--bt-muted) sm:block">◉ centre over its outline · score = dist ÷ (÷ column: its area, capped at 2 × least snap), ÷ the hold&apos;s stretch when held · lowest in reach wins</p>
      </section>
    </div>
  );
}
