import { useId } from "react";
import type { Portrait } from "../../art/portrait";

/*
 * A companion's face, small: a cat's or a dog's head (a dog's ears pricked,
 * folded or dropped) in its own coat's colours, from its portrait, so each
 * companion in the corner is known at a glance by its coat.
 */

const v = (token: string) => `var(${token})`;
const RIM = "var(--color-hearthwood-valley-ui-shade)";
const WHITE_CAT = "var(--color-hearthwood-cat-white)";
const WHITE_DOG = "var(--color-hearthwood-dog-white)";

function CatHead({ p, clip }: { p: Portrait; clip: string }) {
  const ears = p.cap ?? p.coat;
  return (
    <>
      <path d="M5 3.5 13.5 10 5.5 15Z M27 3.5 18.5 10 26.5 15Z" fill={v(ears)} stroke={RIM} strokeWidth={0.9} strokeLinejoin="round" />
      <path d="M6.6 6.5 11 10.2 7 12.6Z M25.4 6.5 21 10.2 25 12.6Z" fill="var(--color-hearthwood-cat-inner-ear)" />
      <clipPath id={clip}>
        <ellipse cx={16} cy={18.5} rx={11.5} ry={10} />
      </clipPath>
      <ellipse cx={16} cy={18.5} rx={11.5} ry={10} fill={v(p.coat)} />
      <g clipPath={`url(#${clip})`}>
        {p.patch && <path d="M3 9h11c-1 4 1 6-2 9-3 2-5 5-9 4Z M24 21c3-1 5 1 6 4v6h-9c0-4 1-8 3-10Z" fill={v(p.patch)} />}
        {p.stripes && <path d="M13 9.5 14 13.5M16 9 16 13.5M19 9.5 18 13.5M5 17.5 9 18.5M5 20.5 9 20.5M27 17.5 23 18.5M27 20.5 23 20.5" stroke={v(p.stripes)} strokeWidth={1.4} strokeLinecap="round" />}
        {p.muzzle && <ellipse cx={16} cy={22} rx={7} ry={5.5} fill={v(p.muzzle)} opacity={0.85} />}
        {p.white > 0.15 && <path d={`M${16 - 1.5 - p.white * 3} 28.5 16 ${21 - p.white * 10} ${16 + 1.5 + p.white * 3} 28.5Z`} fill={WHITE_CAT} />}
        {p.white > 0.3 && <ellipse cx={16} cy={24.5} rx={3 + p.white * 4} ry={2.6 + p.white * 2} fill={WHITE_CAT} />}
      </g>
      <ellipse cx={16} cy={18.5} rx={11.5} ry={10} fill="none" stroke={RIM} strokeWidth={0.9} />
      {[11, 21].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={17.5} rx={2.4} ry={2.2} fill={v(p.eye)} />
          <ellipse cx={x} cy={17.5} rx={0.65} ry={1.9} fill="var(--color-hearthwood-cat-pupil)" />
        </g>
      ))}
      <path d="M14.6 21.6h2.8L16 23.2Z" fill={v(p.nose)} />
    </>
  );
}

function DogEars({ p }: { p: Portrait }) {
  const fill = v(p.cap ?? p.coat);
  const line = { stroke: RIM, strokeWidth: 0.9, strokeLinejoin: "round" as const };
  if (p.ears === "prick") return <path d="M6 2.5 13 9.5 5 13.5Z M26 2.5 19 9.5 27 13.5Z" fill={fill} {...line} />;
  if (p.ears === "fold") return <path d="M6 6 13.5 8.5 6.5 14 3.5 9.5Z M26 6 18.5 8.5 25.5 14 28.5 9.5Z" fill={fill} {...line} />;
  return <path d="M8 6.5C3 7 1.5 14 3 20c1.5 2 4 1 4.5-1L10 9Z M24 6.5c5 .5 6.5 7.5 5 13.5-1.5 2-4 1-4.5-1L22 9Z" fill={fill} {...line} />;
}

function DogHead({ p, clip }: { p: Portrait; clip: string }) {
  return (
    <>
      {p.ears !== "drop" && <DogEars p={p} />}
      <clipPath id={clip}>
        <path d="M16 6c6 0 10 4 10 10 0 3-1 5-2.5 6.5L22 28H10l-1.5-5.5C7 21 6 19 6 16c0-6 4-10 10-10Z" />
      </clipPath>
      <path d="M16 6c6 0 10 4 10 10 0 3-1 5-2.5 6.5L22 28H10l-1.5-5.5C7 21 6 19 6 16c0-6 4-10 10-10Z" fill={v(p.coat)} />
      <g clipPath={`url(#${clip})`}>
        {p.cap && <path d="M4 4h24v10c-3-2-7-3-12-3S7 12 4 14Z" fill={v(p.cap)} />}
        {p.patch && <path d="M4 10h8c0 4-2 6-5 7l-3 1Z M21 16c3-1 6 0 7 3v10h-6c0-5-2-9-1-13Z" fill={v(p.patch)} />}
        {p.muzzle && (
          <>
            <ellipse cx={16} cy={23} rx={6.5} ry={5.5} fill={v(p.muzzle)} />
            <circle cx={12} cy={13.6} r={1.2} fill={v(p.muzzle)} />
            <circle cx={20} cy={13.6} r={1.2} fill={v(p.muzzle)} />
          </>
        )}
        {p.white > 0.15 && <path d={`M${16 - 1 - p.white * 2.5} 28 16 ${20 - p.white * 13} ${16 + 1 + p.white * 2.5} 28Z`} fill={WHITE_DOG} />}
        {p.white > 0.35 && <ellipse cx={16} cy={24} rx={3 + p.white * 4} ry={3 + p.white * 2} fill={WHITE_DOG} />}
      </g>
      <path d="M16 6c6 0 10 4 10 10 0 3-1 5-2.5 6.5L22 28H10l-1.5-5.5C7 21 6 19 6 16c0-6 4-10 10-10Z" fill="none" stroke={RIM} strokeWidth={0.9} />
      {p.ears === "drop" && <DogEars p={p} />}
      {[12, 20].map((x) => (
        <g key={x}>
          <circle cx={x} cy={16} r={1.9} fill={v(p.eye)} />
          <circle cx={x} cy={16} r={1.1} fill="var(--color-hearthwood-dog-pupil)" />
          <circle cx={x - 0.5} cy={15.4} r={0.45} fill="var(--color-hearthwood-dog-glint)" />
        </g>
      ))}
      <ellipse cx={16} cy={22.3} rx={2.3} ry={1.6} fill={v(p.nose)} />
      <path d="M16 23.8v1.6M13.8 26c1.2.8 3.2.8 4.4 0" stroke="var(--color-hearthwood-dog-mouth)" strokeWidth={0.8} fill="none" strokeLinecap="round" />
    </>
  );
}

export function CompanionPortrait({ portrait, className = "size-8" }: { portrait: Portrait; className?: string }) {
  const clip = `portrait-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={`shrink-0 ${className}`}>
      {portrait.species === "cat" ? <CatHead p={portrait} clip={clip} /> : <DogHead p={portrait} clip={clip} />}
    </svg>
  );
}
