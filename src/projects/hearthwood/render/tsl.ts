import { Color, Vector3, type Node, type UniformNode } from "three/webgpu";
import { attribute, uniform, uniformArray, vec3 } from "three/tsl";

/*
 * Where three's TSL typings and its nodes part ways, mended in one place.
 * A colour is a vec3 in every shader, but the typings give a colour uniform
 * a "color" type no vector function accepts, and an attribute's type is
 * only known if it is named. These say what each is to the compiler; at run
 * time they are exactly what three makes.
 */

export type Float = Node<"float">;
export type Vec2 = Node<"vec2">;
export type Vec3 = Node<"vec3">;
export type Vec4 = Node<"vec4">;

/** A colour uniform, typed as the vec3 it is in the shader; `.value` is the Color to set. */
export function colourUniform(colour: Color = new Color()): UniformNode<"vec3", Color> {
  return uniform(colour) as unknown as UniformNode<"vec3", Color>;
}

/** A colour fixed in the shader. */
export function colourOf(colour: Color): Vec3 {
  return vec3(colour.r, colour.g, colour.b);
}

/** Colours to index in the shader by a node, as vec3s. */
export function colourArray(colours: readonly Color[]) {
  return uniformArray<"vec3">(
    colours.map((c) => new Vector3(c.r, c.g, c.b)),
    "vec3",
  );
}

/** Numbers to index in the shader by a node. */
export function floatArray(values: readonly number[]) {
  return uniformArray<"float">([...values], "float");
}

export const floatAttribute = (name: string) => attribute<"float">(name, "float");
export const vec3Attribute = (name: string) => attribute<"vec3">(name, "vec3");
export const vec4Attribute = (name: string) => attribute<"vec4">(name, "vec4");
