import * as THREE from "three/webgpu";
import type { TownTexture } from "../fantasy-town";
import type { KitPiece } from "../kit";
import { Snapshots } from "./snapshot";

/** The lens the pictures are taken with. */
const FOV = 30;
/** The way it looks from: above a front corner, where a town wall shows its outside, and the top of a tile or a roof shows too. */
const FROM = new THREE.Vector3(-1.3, 0.95, 0.85).normalize();
/** How much of the frame a piece's bounding sphere fills. */
const FILL = 1;

/**
 * A picture of every kit piece, as the game draws it (fitted to the world, the
 * Nature Kit in Adventure's own colours), in the kit's own colours or another
 * of the town kit's: each drawn the first time it is asked for, once a
 * palette's row comes into view, and kept for the page's life. So the pictures
 * are always the pieces as they are drawn now, and the editor pays only for
 * those it shows.
 */
export class Thumbnails {
  private readonly snapshots: Snapshots;
  private readonly asked = new Map<string, Promise<string>>();
  private readonly made = new Map<string, string>();

  constructor(
    renderer: THREE.WebGPURenderer,
    private readonly pieceOf: (piece: KitPiece, texture?: TownTexture) => Promise<THREE.Object3D>,
  ) {
    this.snapshots = new Snapshots(renderer, FOV);
  }

  /** A piece's picture, if it is made. */
  ready(piece: KitPiece, texture?: TownTexture): string | undefined {
    return this.made.get(nameOf(piece, texture));
  }

  /** A piece's picture, made the first time it is asked for. */
  of(piece: KitPiece, texture?: TownTexture): Promise<string> {
    const name = nameOf(piece, texture);
    let asked = this.asked.get(name);
    if (asked === undefined) {
      asked = this.pieceOf(piece, texture).then((root) =>
        this.snapshots.take(root, (camera) => {
          const sphere = new THREE.Box3().setFromObject(root).getBoundingSphere(new THREE.Sphere());
          const distance = sphere.radius / FILL / Math.sin(THREE.MathUtils.degToRad(FOV) / 2);
          camera.position.copy(sphere.center).addScaledVector(FROM, distance);
          camera.lookAt(sphere.center);
        }),
      );
      asked.then((url) => this.made.set(name, url), () => undefined);
      this.asked.set(name, asked);
    }
    return asked;
  }

  dispose(): void {
    this.snapshots.dispose();
  }
}

const nameOf = (piece: KitPiece, texture: TownTexture | undefined): string => (texture === undefined ? piece : `${piece} ${texture}`);
