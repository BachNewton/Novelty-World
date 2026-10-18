import { useId } from "react";
import type { Portrait } from "../../art/portrait";

/*
 * A companion's face, small: a cat's, a dog's (its ears pricked, folded or
 * dropped), a fox's or a hedgehog's head in its own coat's colours, from its portrait, so each
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

/** A fox's head: big dark-backed ears, broad white cheeks narrowing to a long muzzle. */
function FoxHead({ p }: { p: Portrait }) {
  const line = { stroke: RIM, strokeWidth: 0.9, strokeLinejoin: "round" as const };
  return (
    <>
      <path d="M4 2 13 10 6 15Z M28 2 19 10 26 15Z" fill={v(p.cap ?? p.coat)} {...line} />
      <path d="M6.5 6 11 10 7.5 12.5Z M25.5 6 21 10 24.5 12.5Z" fill={v(p.muzzle ?? p.coat)} opacity={0.85} />
      <path d="M16 8c6 0 10.5 3.5 11 8.5L16 29 5 16.5C5.5 11.5 10 8 16 8Z" fill={v(p.coat)} {...line} />
      {p.muzzle && <path d="M5.8 17.5 16 29l10.2-11.5c-3 1.2-6 1.8-10.2 1.8S8.8 18.7 5.8 17.5Z" fill={v(p.muzzle)} />}
      {[11.5, 20.5].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={15} rx={1.9} ry={1.6} fill={v(p.eye)} />
          <ellipse cx={x} cy={15} rx={0.5} ry={1.4} fill="var(--color-hearthwood-fox-pupil)" />
        </g>
      ))}
      <ellipse cx={16} cy={27.4} rx={1.8} ry={1.3} fill={v(p.nose)} />
    </>
  );
}

/** A hedgehog's head: a pointed pale face under a bristling dark cap of spines, a black button nose. */
function HedgehogHead({ p }: { p: Portrait }) {
  const line = { stroke: RIM, strokeWidth: 0.9, strokeLinejoin: "round" as const };
  const spikes = "M2 20 4 13 3 9 7 9 8 4 12 6 15 2 18 6 22 3 24 8 28 7 28 12 30 15 29 20 24 16 16 14 8 16Z";
  return (
    <>
      <path d={spikes} fill={v(p.cap ?? p.coat)} {...line} />
      {p.stripes && <path d="M7 10 9 13M12 7 13 11M17 6 17 10M22 7 21 11M26 11 24 13" stroke={v(p.stripes)} strokeWidth={1.1} strokeLinecap="round" />}
      <path d="M8 16c2-2 5-3 8-3s6 1 8 3c1 3 0 6-3 8l-5 6-5-6c-3-2-4-5-3-8Z" fill={v(p.coat)} {...line} />
      {p.muzzle && <path d="M10 17.5c1.5-1.2 3-1.5 4-1M22 17.5c-1.5-1.2-3-1.5-4-1" stroke={v(p.muzzle)} strokeWidth={2.4} strokeLinecap="round" fill="none" />}
      {[12, 20].map((x) => (
        <g key={x}>
          <circle cx={x} cy={18.5} r={1.5} fill={v(p.eye)} />
          <circle cx={x - 0.4} cy={18} r={0.4} fill="var(--color-hearthwood-hedgehog-glint)" />
        </g>
      ))}
      <circle cx={16} cy={28.6} r={1.9} fill={v(p.nose)} />
    </>
  );
}

/** A red squirrel's head: round, with tufted ears and a cream chin. */
function SquirrelHead({ p }: { p: Portrait }) {
  const line = { stroke: RIM, strokeWidth: 0.9, strokeLinejoin: "round" as const };
  return (
    <>
      <path d="M8 13 9 4 13 10Z M24 13 23 4 19 10Z" fill={v(p.coat)} {...line} />
      <path d="M9 4 8.5 0.8 10.5 3.5Z M23 4 23.5 0.8 21.5 3.5Z" fill={v(p.cap ?? p.coat)} {...line} />
      <ellipse cx={16} cy={18} rx={10} ry={9.5} fill={v(p.coat)} {...line} />
      {p.muzzle && <ellipse cx={16} cy={23.5} rx={5.5} ry={4} fill={v(p.muzzle)} />}
      {[11.5, 20.5].map((x) => (
        <g key={x}>
          <circle cx={x} cy={16.5} r={2.6} fill={v(p.muzzle ?? p.coat)} />
          <circle cx={x} cy={16.5} r={2} fill={v(p.eye)} />
          <circle cx={x - 0.6} cy={15.8} r={0.55} fill="var(--color-hearthwood-squirrel-glint)" />
        </g>
      ))}
      <ellipse cx={16} cy={21.5} rx={1.4} ry={1} fill={v(p.nose)} />
    </>
  );
}

/** A mountain hare's head: tall black-tipped ears, a soft muzzle, big eyes at the sides. */
function HareHead({ p }: { p: Portrait }) {
  const line = { stroke: RIM, strokeWidth: 0.9, strokeLinejoin: "round" as const };
  return (
    <>
      <path d="M10 14C7 8 7 2 9.5 0.5 12 2 13 8 13.5 13Z M22 14C25 8 25 2 22.5 0.5 20 2 19 8 18.5 13Z" fill={v(p.coat)} {...line} />
      <path d="M8.3 3.5C8.6 1.8 9 0.8 9.5 0.5 10.4 1 11 2.2 11.3 3.6Z M23.7 3.5C23.4 1.8 23 0.8 22.5 0.5 21.6 1 21 2.2 20.7 3.6Z" fill={v(p.cap ?? p.coat)} />
      <ellipse cx={16} cy={20} rx={10} ry={9} fill={v(p.coat)} {...line} />
      {p.muzzle && <ellipse cx={16} cy={25} rx={4.6} ry={3.4} fill={v(p.muzzle)} />}
      {[9.5, 22.5].map((x) => (
        <g key={x}>
          <circle cx={x} cy={18} r={2.2} fill={v(p.eye)} />
          <circle cx={x} cy={18} r={1.1} fill="var(--color-hearthwood-hare-tips)" />
        </g>
      ))}
      <path d="M14.6 23h2.8L16 24.6Z" fill={v(p.nose)} />
    </>
  );
}

/** A roe deer's head: big ears out to the sides, a long face down to a black nose ringed with white, and a buck's antlers. */
function DeerHead({ p }: { p: Portrait }) {
  const line = { stroke: RIM, strokeWidth: 0.9, strokeLinejoin: "round" as const };
  return (
    <>
      {p.patch && <path d="M13 8 12 1.5M12.3 4.5 10 3M12.6 2.5 14 0.8M19 8 20 1.5M19.7 4.5 22 3M19.4 2.5 18 0.8" stroke={v(p.patch)} strokeWidth={1.4} strokeLinecap="round" fill="none" />}
      <path d="M11 10 2 7 4 12.5 10.5 13Z M21 10 30 7 28 12.5 21.5 13Z" fill={v(p.coat)} {...line} />
      <path d="M16 7c4.5 0 7 3 7 7 0 5-3 12-7 15-4-3-7-10-7-15 0-4 2.5-7 7-7Z" fill={v(p.coat)} {...line} />
      {p.muzzle && <ellipse cx={16} cy={26} rx={3.6} ry={2.6} fill={v(p.muzzle)} />}
      <ellipse cx={16} cy={27.4} rx={2.4} ry={1.6} fill={v(p.nose)} />
      {[12, 20].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={14.5} rx={1.6} ry={1.8} fill={v(p.eye)} />
          <circle cx={x - 0.4} cy={14} r={0.45} fill="var(--color-hearthwood-deer-glint)" />
        </g>
      ))}
    </>
  );
}

function Head({ portrait, clip }: { portrait: Portrait; clip: string }) {
  switch (portrait.species) {
    case "cat":
      return <CatHead p={portrait} clip={clip} />;
    case "dog":
      return <DogHead p={portrait} clip={clip} />;
    case "fox":
      return <FoxHead p={portrait} />;
    case "hedgehog":
      return <HedgehogHead p={portrait} />;
    case "squirrel":
      return <SquirrelHead p={portrait} />;
    case "hare":
      return <HareHead p={portrait} />;
    case "deer":
      return <DeerHead p={portrait} />;
  }
}

export function CompanionPortrait({ portrait, className = "size-8" }: { portrait: Portrait; className?: string }) {
  const clip = `portrait-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={`shrink-0 ${className}`}>
      <Head portrait={portrait} clip={clip} />
    </svg>
  );
}
