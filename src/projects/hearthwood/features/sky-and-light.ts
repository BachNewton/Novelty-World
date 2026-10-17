import { featureGroup } from "./group";

/** The sky, the sun and moon, and the light and grade over the whole frame. */
export const SKY_AND_LIGHT_FEATURES = featureGroup("sky-and-light", [
  {
    id: "skyScattering",
    name: "Physical sky",
    description: "The sky drawn from how the air scatters light (Rayleigh, Mie and ozone), through dawn, day, sunset, the blue hour and night, a little more colourful than life. GLSL in the sky.",
  },
  {
    id: "sunLight",
    name: "Sunlight",
    description: "The sun's colour as the air leaves it, white overhead and reddening as it sinks, with rose-gold tints in the morning and evening, at a brightness set by hand per height. Worked out on the CPU each frame.",
  },
  {
    id: "handover",
    name: "Sun to moon",
    description: "The sun's light fades out as it crosses the horizon and the moon's fades in once the twilight deepens, from no lower than a little above the horizon so shadows never stretch, and the sky's light lifts a little in early night. CPU.",
  },
  {
    id: "moonlight",
    name: "Moonlight",
    description: "The moon's own cool light, as bright as its phase and height allow: a full moon lights the valley, a new moon leaves it dark. CPU.",
  },
  {
    id: "skyAmbient",
    name: "Sky light all round",
    description: "The light from the sky and the ground taken from the live sky in every direction (spherical harmonics), so shade under a blue sky is bluish and a sunset's light comes from its side. A light probe in place of the plain sky-and-ground light.",
  },
  {
    id: "moon",
    name: "The moon",
    description: "A lit sphere showing its real phase, rising and setting as the calendar says, with earthshine on a thin crescent and a soft halo in haze. GLSL in the sky.",
  },
  {
    id: "stars",
    name: "Stars",
    description: "A still field of stars that turns with the night, the brightest coming out first as dusk deepens. GLSL in the sky.",
  },
  {
    id: "milkyWay",
    name: "Milky Way",
    description: "The Milky Way, faint across the sky on dark, moonless nights. GLSL in the sky.",
  },
  {
    id: "aurora",
    name: "Northern lights",
    description: "Curtains of green with violet edges on some clear nights, mostly in autumn and winter, lighting the land faintly. GLSL in the sky, and a little light on the land.",
  },
  {
    id: "noctilucent",
    name: "Noctilucent clouds",
    description: "Rare thin clouds glowing electric blue low in the north on summer nights, lit by the sun from below the horizon. GLSL in the sky.",
  },
  {
    id: "rainbow",
    name: "Rainbows",
    description: "The primary bow at 42° and a fainter secondary at 51°, with the darker band between, opposite the sun while it rains in sunshine. GLSL in every material.",
  },
  {
    id: "nightVision",
    name: "Night vision",
    description: "At night colours drain and shift towards blue as human eyes see in the dark, but not in firelight: the woods turn moonlit blue and the campfire stays warm. GLSL in every material.",
  },
  {
    id: "toneMapping",
    name: "Storybook tone curve",
    description: "Tone mapping that keeps hues true and rolls the highlights off softly, so a sunset or firelight stays coloured rather than bleaching to white. Off, the plain Khronos neutral curve.",
  },
  {
    id: "bloom",
    name: "Bloom",
    description: "The brightest lights glow softly into what is round them: the campfire, the sun and the moon's halo. A pass over the finished frame.",
  },
  {
    id: "colourGrade",
    name: "Colour grade",
    description: "Brightness, contrast, saturation, white balance and the oranges, teals and greens graded by season and blended through the year, with the shadows leaning to the moment's own colour. A pass over the finished frame.",
  },
  {
    id: "vignette",
    name: "Vignette",
    description: "The frame's corners darken softly, like an old storybook's plate. A pass over the finished frame.",
  },
]);
