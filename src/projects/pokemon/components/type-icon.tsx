"use client";

interface TypeIconProps {
  type: string;
  size?: number;
  className?: string;
}

/**
 * Renders one of the 18 modern Pokemon type icons from /public/pokemon-types/.
 * Uses a plain <img> because these are tiny static SVGs served straight from
 * the public folder — next/Image's optimizer would require enabling
 * dangerouslyAllowSVG across the whole app, which is not worth it here.
 */
export function TypeIcon({ type, size = 48, className }: TypeIconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local static SVG, no optimization needed
    <img
      src={`/pokemon-types/${type}.svg`}
      alt={type}
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  );
}
