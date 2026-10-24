import { featureGroup } from "./group";

/** The sky, the sun and moon, and the light and grade over the whole frame. */
export const SKY_AND_LIGHT_FEATURES = featureGroup("sky-and-light", [
  {
    id: "sunLight",
    name: "Sunlight",
    description: "The sun's colour as the air leaves it, white overhead and reddening as it sinks, with rose-gold tints in the morning and evening, at a brightness set by hand per height. Off, the palette's own sun colour for the moment.",
  },
  {
    id: "handover",
    name: "Sun to moon",
    description: "The sun's light fades out as it crosses the horizon and the moon's fades in only once the twilight has deepened, so the key light changes body in the dark, and the sky's light lifts a little in early night.",
  },
  {
    id: "moonlight",
    name: "Moonlight",
    description: "The moon's own cool silver light, as bright as its phase and height allow: a full moon lights the valley, a new moon leaves it dark.",
  },
  {
    id: "moon",
    name: "The moon",
    description: "A lit sphere showing its real phase, rising and setting as the calendar says, with its seas, earthshine on a thin crescent and a soft halo in haze.",
  },
  {
    id: "stars",
    name: "Stars",
    description: "A still field of stars that turns with the night, the brightest coming out first as dusk deepens.",
  },
  {
    id: "milkyWay",
    name: "Milky Way",
    description: "The Milky Way where it really lies, faint across the sky on dark, moonless nights.",
  },
  {
    id: "aurora",
    name: "Northern lights",
    description: "Curtains of green with violet edges on some nights, mostly in autumn and winter, drifting and rippling, lighting the land faintly green.",
  },
  {
    id: "rainbow",
    name: "Rainbows",
    description: "The primary bow at 42° and a fainter secondary at 51°, with the darker band between, opposite the sun while it rains in sunshine, on the sky and in the rain before the far land.",
  },
  {
    id: "toneMapping",
    name: "Storybook tone curve",
    description: "Hearthwood's own curve from the scene's light to the screen's: it keeps hues true and rolls the highlights off softly, so a sunset or firelight stays coloured rather than bleaching to white. Off, the light is only exposed and clipped.",
  },
  {
    id: "bloom",
    name: "Bloom",
    description: "The brightest lights glow softly into what is round them: the campfire, the sun, and the moon and its halo.",
  },
  {
    id: "colourGrade",
    name: "Colour grade",
    description: "Brightness, contrast, saturation, white balance and the oranges, teals and greens graded by season and blended through the year, the shadows leaning to the moment's own colour, and the night cooling what is dim towards moonlit blue while firelight stays warm.",
  },
  {
    id: "vignette",
    name: "Vignette",
    description: "The frame's corners darken softly, like an old storybook's plate.",
  },
  {
    id: "inkEdges",
    name: "Ink edges",
    description: "A soft line in the moment's shadow colour where a near form stands against what is behind it, as a storybook's ink outlines its shapes, thinning and fading with distance.",
  },
]);
