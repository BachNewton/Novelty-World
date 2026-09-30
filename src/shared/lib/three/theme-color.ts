import { Color } from "three";

// A design token from globals.css as a Three.js colour, so 3D scenes draw from
// the same palette as the rest of the site. Reads the live stylesheet, so it
// only works in the browser.
export function themeColor(token: string): Color {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  if (value === "") throw new Error(`Theme token ${token} is not defined`);
  return new Color(value);
}
