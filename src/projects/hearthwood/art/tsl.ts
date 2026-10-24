import { Color } from "three";
import { uniform } from "three/tsl";
import type { Node, UniformNode } from "three/webgpu";

/*
 * Where three's TSL typings and its nodes part ways, mended in one place.
 * A colour uniform is a vec3 in every shader, but the typings give it a
 * "color" type that no vector function accepts; and the nodes three hands to
 * a lighting model or returns from its BRDFs are typed as bare nodes. Both
 * are the right types at run time: these only say so to the compiler.
 */

/** A colour uniform, typed as the vec3 it is in the shader; `.value` is the Color to set. */
export function colourUniform(colour: Color = new Color()): UniformNode<"vec3", Color> {
  return uniform(colour) as unknown as UniformNode<"vec3", Color>;
}

/** A node three types loosely, as the type it is in the shader. */
export function typed<T extends string>(node: Node | Node<string>): Node<T> {
  return node as unknown as Node<T>;
}
