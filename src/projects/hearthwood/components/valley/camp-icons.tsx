/*
 * Camp drawn for the overlay, in the camp's own colours: the bedroll it
 * packs into, rolled and strapped, and a camp pitched, its fire in a ring of
 * stones with the bedroll beside it.
 */

const BEDROLL = "var(--color-hearthwood-valley-witch-bedroll)";
const STRAP = "var(--color-hearthwood-valley-witch-strap)";
const END = "var(--color-hearthwood-valley-witch-scarf)";
const STONE = "var(--color-hearthwood-valley-rock)";
const LOG = "var(--color-hearthwood-valley-log)";
const FLAME = "var(--color-hearthwood-valley-fire-flame)";
const CORE = "var(--color-hearthwood-valley-fire-core)";

/** Camp packed up: the bedroll, rolled and strapped, seen end on so its roll shows. */
export function BedrollIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <path d="M10 8.5 H25 A6.5 7.5 0 0 1 25 23.5 H10 Z" fill={BEDROLL} />
      <rect x="15" y="7.6" width="2.4" height="16.8" rx="0.8" fill={STRAP} />
      <rect x="21.5" y="7.6" width="2.4" height="16.8" rx="0.8" fill={STRAP} />
      <ellipse cx="10" cy="16" rx="6.5" ry="7.5" fill={BEDROLL} stroke={END} strokeWidth="1.2" />
      <path d="M10 16 m0 -1.6 a1.6 1.6 0 1 1 -1.6 1.6 a3.2 3.4 0 0 1 3.2 -3.4 a4.8 5 0 0 1 4.6 5.2 a6 6.4 0 0 1 -6.2 6.1" fill="none" stroke={END} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Camp pitched: the fire in its ring of stones, its logs crossed, the bedroll beside it. */
export function CampIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <path d="M7 24 L19 19 M7 19 L19 24" stroke={LOG} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M13 6 C16 10 18 12 17.5 16 C17.2 19 15 21 13 21 C10.6 21 8.6 19 8.6 16.3 C8.6 13.6 10.6 12.6 11 10.2 C12.2 11.4 12.5 12.6 12.4 13.8 C13.8 12 14 9 13 6 Z" fill={FLAME} />
      <path d="M13 13.5 C14.6 15.4 15 17 14.6 18.4 C14.2 19.6 13.4 20.2 12.8 20.2 C11.7 20.2 11 19.3 11 18.2 C11 16.8 12.4 15.8 13 13.5 Z" fill={CORE} />
      {[4.5, 9, 13, 17, 21.5].map((x) => (
        <ellipse key={x} cx={x} cy={26} rx="2.3" ry="1.5" fill={STONE} />
      ))}
      <rect x="22" y="20" width="8" height="5" rx="2.5" fill={BEDROLL} />
      <rect x="24.6" y="19.7" width="1.2" height="5.6" fill={STRAP} />
    </svg>
  );
}
