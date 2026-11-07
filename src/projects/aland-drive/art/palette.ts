import { uniformArray } from "three/tsl";
import type { Vector3 } from "three/webgpu";

type Linear = (name: string) => Vector3;
type Palette = ReturnType<typeof uniformArray>;

const made = new WeakMap<Linear, Map<string, Palette>>();

/**
 * A kit's palette, made once for the page's colours, however many materials of the kit there are. A shader names a
 * uniform array by the node it is, so two materials alike in all but their own copy of the palette are two shaders,
 * and each compiles a pipeline of its own; reading the same array, they come out the same and three builds one.
 */
export function kitPalette(linear: Linear, kit: string, colours: () => Vector3[]): Palette {
  const kits = made.get(linear) ?? new Map<string, Palette>();
  made.set(linear, kits);
  const palette = kits.get(kit) ?? uniformArray(colours());
  kits.set(kit, palette);
  return palette;
}
