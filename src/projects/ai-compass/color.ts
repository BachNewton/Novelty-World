import type { Point } from "./compass";

/** Every place on the plane blends the four corners' colours by its position,
 *  so no corner reads as the better one. */
export function colorAt({ scope, ownership }: Point): string {
  const x = Math.round(scope * 100);
  const top = `color-mix(in oklab, var(--color-compass-delegate-steered) ${x}%, var(--color-compass-ask-steered))`;
  const bottom = `color-mix(in oklab, var(--color-compass-delegate-accepted) ${x}%, var(--color-compass-ask-accepted))`;
  return `color-mix(in oklab, ${top} ${Math.round(ownership * 100)}%, ${bottom})`;
}
