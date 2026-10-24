import { featureGroup } from "./group";

/** The air and the weather: mist, rain, snow, clouds and what they do to the light. */
export const ATMOSPHERE_AND_WEATHER_FEATURES = featureGroup("atmosphere-and-weather", [
  {
    id: "fog",
    name: "Fog",
    description:
      "The air between the eye and the land: a blue haze that deepens with distance, a bright glow towards the sun, and mist pooling in the valleys, each as thick as the weather says. Off, the plain haze stays.",
  },
  {
    id: "clouds",
    name: "Clouds",
    description: "Heaped clouds low down and thin veils high up, as many as the weather says, drifting with the wind, lit by the sun or the moon with silver edges.",
  },
  {
    id: "cloudShadows",
    name: "Cloud shadows",
    description: "The clouds' shadows drift over the land out to the horizon. A small map of the clouds as the sun sees them, drawn before the scene.",
  },
  {
    id: "rain",
    name: "Rain",
    description: "Rain falls round the camera when the weather rains, slanted by the wind and lit by the light of the hour.",
  },
  {
    id: "snow",
    name: "Snow",
    description: "Snow drifts down round the camera when the weather snows, softly, swaying in the wind.",
  },
  {
    id: "wetGround",
    name: "Wet ground and puddles",
    description: "Open, level ground darkens in and after rain, puddles gather in its hollows with rings where the rain falls, and both dry out over time.",
  },
  {
    id: "lightning",
    name: "Lightning",
    description: "Rare flashes in a storm light up the land and the clouds.",
  },
  {
    id: "sunGlow",
    name: "Glow in the air",
    description: "The air glows round the sun, the moon and the fire as much as it is thick: a low sun pours its light through mist, and the fire glows through rain. In every material's air.",
  },
]);
