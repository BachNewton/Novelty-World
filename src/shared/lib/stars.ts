/**
 * Shared star shape generation used by the homepage, favicon, and OG image.
 */

export const STAR_GLOW_RATIO = 0.6;
export const STAR_GLOW_OPACITY = 0.15;

/** Calculate 5-point star polygon points centered at (cx, cy) with given outer radius. */
export function starPoints(cx: number, cy: number, outerRadius: number): string {
  const innerRadius = outerRadius * 0.38;
  const points = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return points.join(" ");
}

/** Generate SVG markup string for a star with glow circle (for use in raw SVG contexts). */
export function starSvgMarkup(
  cx: number,
  cy: number,
  outerRadius: number,
  fill: string,
): string {
  const glowR = outerRadius * STAR_GLOW_RATIO;
  return `
    <circle cx="${cx}" cy="${cy}" r="${glowR}" fill="${fill}" opacity="0.15"/>
    <polygon points="${starPoints(cx, cy, outerRadius)}" fill="${fill}"/>
  `;
}
