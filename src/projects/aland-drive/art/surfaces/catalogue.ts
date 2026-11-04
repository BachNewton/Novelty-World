import type { ArtModel } from "../catalogue";
import { signPost } from "./signs";

/**
 * The kit's one model a test can build: the rest is shaders over the ground, roads and walls. A sign's plate is one
 * flat fan cut from the sign sheet, which takes a canvas to draw, and one fan has no faces to fight.
 */
export const artModels = (): ArtModel[] => [{ name: "sign post", geometries: { post: signPost(2.4, [1.6, 2.2]) } }];
