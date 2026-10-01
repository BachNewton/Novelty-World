// The world's paints: the sky, the land, the road and its furniture, and the
// two structures. Each is a design token in `globals.css`, read in Three
// through `themeColor`. None is one of the fleet's saturated body paints, so
// nothing beside the road can be mistaken for traffic.
export const WORLD_PAINTS = [
  "sky-zenith",
  "sky-horizon",
  "sun",
  "sun-halo",
  "cloud",
  "meadow",
  "meadow-deep",
  "ridge",
  "ridge-high",
  "peak",
  "rock",
  "rock-dark",
  "snow",
  "leaf",
  "leaf-light",
  "pine",
  "trunk",
  "shrub",
  "asphalt",
  "lane-dash",
  "edge-line",
  "shoulder",
  "lay-by",
  "kerb",
  "kerb-dark",
  "finish-light",
  "finish-dark",
  "spring-pad",
  "spring-arrow",
  "rail",
  "post",
  "post-white",
  "reflector",
  "sign",
  "sign-ink",
  "cone",
  "mailbox",
  "mailbox-flag",
  "bridge",
  "bridge-dark",
] as const;

export type WorldPaint = (typeof WORLD_PAINTS)[number];

export function worldToken(paint: WorldPaint): string {
  return `--color-frogmino-world-${paint}`;
}
