import * as THREE from "three";
import type { Physics, VoxelHit } from "./physics";

/**
 * The first-person voxel builder — the Minecraft-style place/break loop on top of the Rapier voxel
 * bodies (see physics.ts). While the sailor holds first-person control (pointer locked), each frame we
 * cast a ray from the eye at the voxel bodies. A click edits the aimed voxel:
 *
 *  - LEFT click  → break the aimed voxel (physics.removeVoxel; may split the ship into two bodies).
 *  - RIGHT click → place a voxel on the aimed face (physics.placeVoxel), extending that build with a
 *    voxel of the same material/density. Silently refused if it would land inside the sailor.
 *  - Q           → drop a fresh, unconnected voxel just ahead (physics.dropVoxel), carrying the
 *    player's momentum — a seed you can then build a whole new raft onto.
 *
 * Aiming uses a single world-space cue instead of an always-on crosshair: an AIM DOT sphere sat at the
 * exact point the ray strikes, shown ONLY when you're pointed at a buildable voxel (nothing appears
 * over open sea), so it doubles as a "you can build here" reticle.
 *
 * All the world mutation lives in physics.ts (it owns the Rapier world + the collider↔voxel map); this
 * module is just input + the aim dot, so it stays free of physics detail. Creative mode: blocks are
 * unlimited, no inventory yet (that arrives with resource gathering — roadmap #8).
 */

const VOXEL = 0.5; // metres — the standard building voxel (matches physics.ts)
const REACH = 5; // metres the sailor can place/break at
const AIM_DOT_RADIUS = 0.02; // metres — the world-space reticle sphere at the ray hit point

// Player capsule (mirror of player.ts HEIGHT/RADIUS) for the anti-suffocation guard, so a placed
// voxel can't land inside the sailor. Kept in step with player.ts — the camera in first person sits
// EYE_FROM_CENTER above the capsule centre, so the body centre is the eye minus that.
const PLAYER_EYE_FROM_CENTER = 0.8;
const PLAYER_CYLINDER_HALF = 0.6;
const PLAYER_RADIUS = 0.3;
const VOXEL_HALF = VOXEL / 2;

export interface Builder {
  /** The aim-dot object — add to the scene once. */
  object: THREE.Object3D;
  /** Per frame (after the camera is posed): re-aim the dot. No-op / hidden when not in first person. */
  update: () => void;
  dispose: () => void;
}

export function createBuilder(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
  physics: Physics,
  isActive: () => boolean,
  playerVelocity: () => THREE.Vector3,
): Builder {
  // The "physical crosshair": a small sphere sat at the exact ray hit point. depthTest off + a high
  // render order so it always reads crisply on the surface it's touching instead of z-fighting it.
  const aimGeometry = new THREE.SphereGeometry(AIM_DOT_RADIUS, 12, 12);
  const aimMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.9,
  });
  const aimDot = new THREE.Mesh(aimGeometry, aimMaterial);
  aimDot.renderOrder = 1000;
  aimDot.frustumCulled = false;
  aimDot.visible = false;

  const forward = new THREE.Vector3();
  const probe = new THREE.Object3D(); // scratch, posed to the place cell for the suffocation check
  let currentHit: VoxelHit | null = null;
  let canPlace = false; // is the current place cell a legal spot (not inside the sailor)?

  // Would a voxel centred at `p` (world) overlap the sailor's capsule? Distance from the point to the
  // vertical capsule segment vs the capsule radius plus the voxel's half-extent.
  const wouldHitPlayer = (p: THREE.Vector3): boolean => {
    const bodyCenterY = camera.position.y - PLAYER_EYE_FROM_CENTER;
    const dxz = Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
    const clampedY = THREE.MathUtils.clamp(
      p.y,
      bodyCenterY - PLAYER_CYLINDER_HALF,
      bodyCenterY + PLAYER_CYLINDER_HALF,
    );
    const dist = Math.hypot(dxz, p.y - clampedY);
    return dist < PLAYER_RADIUS + VOXEL_HALF;
  };

  const onMouseDown = (e: MouseEvent) => {
    if (!isActive() || !currentHit) return;
    if (e.button === 0) {
      physics.removeVoxel(currentHit);
      currentHit = null; // its cell may be gone; re-aim next frame
    } else if (e.button === 2 && canPlace) {
      physics.placeVoxel(currentHit);
      currentHit = null;
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!isActive() || e.code !== "KeyQ") return;
    camera.getWorldDirection(forward);
    physics.dropVoxel(camera.position, forward, playerVelocity());
  };

  // Right-click is the place button, so suppress the browser context menu over the canvas.
  const onContextMenu = (e: Event) => e.preventDefault();

  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("keydown", onKeyDown);
  domElement.addEventListener("contextmenu", onContextMenu);

  return {
    object: aimDot,
    update: () => {
      if (!isActive()) {
        aimDot.visible = false;
        currentHit = null;
        canPlace = false;
        return;
      }
      camera.getWorldDirection(forward);
      currentHit = physics.raycastVoxel(camera.position, forward, REACH);
      if (currentHit) {
        aimDot.position.copy(currentHit.point); // the physical crosshair, on the aimed surface
        aimDot.visible = true;
        physics.poseVoxel(probe, currentHit.visual, currentHit.placeCell);
        canPlace = !wouldHitPlayer(probe.position);
      } else {
        aimDot.visible = false; // nothing buildable under the crosshair (e.g. open sea)
        canPlace = false;
      }
    },
    dispose: () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      domElement.removeEventListener("contextmenu", onContextMenu);
      aimGeometry.dispose();
      aimMaterial.dispose();
    },
  };
}
