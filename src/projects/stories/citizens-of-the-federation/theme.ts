import { Antonio } from "next/font/google";
import type { StoryTheme } from "../guide/story-theme";

/** Tall condensed capitals, in the spirit of a starship's console, for dates and small labels. */
const LABEL_FONT = Antonio({ subsets: ["latin"], weight: ["400", "600"], variable: "--story-label" });

/**
 * The guide's look, from the book's cover (book/cover.svg) and its arc. Down the timeline the
 * ground moves through the century: the sepia of old photographs, the blue-grey of now, the night
 * of the wars, and after First Contact the stars, reaching the cover's Federation blue at its
 * founding. The kinds wear Starfleet's division colours: canon command gold, real history
 * sciences blue, and the story operations red, the colour of the ordinary crew. Chapters are the
 * cover's laurel white. The title is the cover's serif.
 */
export const THEME: StoryTheme = {
  className: LABEL_FONT.variable,
  vars: {
    "--story-night": "#0b0f1c",
    "--story-band": "rgb(243 246 255 / 0.035)",
    "--story-ink": "#f3f6ff",
    "--story-ink-soft": "#a9b8dc",
    "--story-line": "#3a4d78",
    "--story-real": "#6cb6ec",
    "--story-canon": "#f2c94c",
    "--story-own": "#ef5a4f",
    "--story-chapter": "#f3f6ff",
    "--story-display": 'Georgia, "Times New Roman", serif',
  },
  /** The ground down the timeline, by year. */
  eras: [
    { year: 1900, color: "#18130e" },
    { year: 2015, color: "#131a27" },
    { year: 2030, color: "#0e121d" },
    { year: 2045, color: "#07080e" },
    { year: 2063.3, color: "#090d1d" },
    { year: 2100, color: "#122a5c" },
    { year: 2161, color: "#2a5fb8" },
  ],
  /** Stars appear from the first warp flight. */
  starsFrom: 2063.27,
};
