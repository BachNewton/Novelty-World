import * as THREE from "three";
import type { PlatePose } from "./item";

/*
 * `FACE_UP` lies a model thin through z on its flat, but either way up; a
 * model with a front (a cover, a board's letters, a medallion's face) lies
 * with that front, its +z, to the sky.
 */

/** Face up, its front (+z) to the sky: a book's cover, a spirit board's letters. */
export const FRONT_UP: PlatePose = { lie: new THREE.Euler(-Math.PI / 2, 0, 0), spin: 0.7 };
