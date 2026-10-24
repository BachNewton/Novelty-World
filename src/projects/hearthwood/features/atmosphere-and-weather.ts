import { featureGroup } from "./group";

/** The air and the weather: mist, rain, snow, clouds and what they do to the light. */
export const ATMOSPHERE_AND_WEATHER_FEATURES = featureGroup("atmosphere-and-weather", [
  {
    id: "fog",
    name: "Fog",
    description:
      "The weather's air between the eye and the land: clear air that turns far land blue and then into the horizon's colour, mist pooling in the valleys, and the grey veil of rain or snow, each as thick as the weather says. Off, the plain haze stays.",
  },
  {
    id: "clouds",
    name: "Clouds",
    description: "Clouds painted on the sky, heaped or layered and as many as the weather says, drifting with the wind, with silver edges towards the sun or the moon, and a thin high veil above them.",
  },
  {
    id: "cloudShadows",
    name: "Cloud shadows",
    description: "The clouds' shadows drift over the land, each under its own cloud, dimming the sun's or the moon's light but never the fire's.",
  },
  {
    id: "rain",
    name: "Rain",
    description: "Rain falls round the camera when the weather rains, in streaks slanted by the wind and lit by the light of the hour.",
  },
  {
    id: "snow",
    name: "Snow",
    description: "Snow drifts down round the camera when the weather snows, in soft flakes swaying in the wind.",
  },
  {
    id: "wetGround",
    name: "Wet ground and puddles",
    description: "Open, level ground darkens in and after rain, puddles gather in its hollows mirroring the sky, with rings where the rain falls, and both dry out over time.",
  },
  {
    id: "lightning",
    name: "Lightning",
    description: "Rare flashes in a storm light up the land, the sky, the clouds and the rain.",
  },
  {
    id: "sunGlow",
    name: "Glow in the air",
    description: "The air glows round the sun, the moon and the fire as much as it is thick: a low sun pours its light through mist, the moon wears a halo on a damp night, and the fire glows through rain.",
  },
]);
